'use client';

import { useState, type FormEvent } from 'react';
import { LogIn, Mail, Lock, Eye, EyeOff, Check, ArrowRight } from 'lucide-react';
import { AdminAuthCard } from '@/components/admin/AdminAuthCard';
import { AdminField } from '@/components/admin/AdminField';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

// Backend error codes → user-facing French copy. Switch on ApiError.code,
// never on the raw message (see lib/api.ts). Unknown codes fall through to
// the generic line below.
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Adresse email ou mot de passe incorrect.',
  VALIDATION_FAILED: 'Merci de vérifier les informations saisies.',
  LOCKED_OUT: 'Compte temporairement bloqué après plusieurs tentatives. Réessayez plus tard.',
  TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
  EMAIL_NOT_VERIFIED: 'Cette adresse email n’a pas encore été vérifiée.',
  ACCOUNT_SUSPENDED: 'Ce compte a été suspendu. Contactez un administrateur.',
  ADMIN_REQUIRED: 'Ce compte n’a pas accès à l’espace administration.',
};

export default function AdminConnexionPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSession, setKeepSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: { email, password, remember: keepSession },
      });

      // The shared login endpoint doesn't check role. Probe /api/admin/me
      // before entering the back-office; a plain USER gets 403 ADMIN_REQUIRED,
      // in which case we undo the freshly-issued session.
      try {
        await api('/api/admin/me');
      } catch (probeErr) {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
        if (probeErr instanceof ApiError && probeErr.status === 403) {
          throw new ApiError(403, 'admin required', { error: 'ADMIN_REQUIRED' });
        }
        throw probeErr;
      }

      // Full navigation so the (protected) server layout re-runs with the
      // fresh cookies and AuthProvider re-initialises.
      window.location.assign('/admin');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (LOGIN_ERROR_MESSAGES[err.code] ?? 'Une erreur est survenue, réessayez.')
          : 'Une erreur est survenue, réessayez.';
      toast(message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <AdminAuthCard>
      <div className="flex flex-col gap-7">
        {/* Header */}
        <header className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-brand">
            <LogIn className="h-3.5 w-3.5" aria-hidden />
            Connexion administrateur
          </div>
          <h1 className="font-sora text-2xl leading-[1.15] font-bold tracking-[-0.03em] text-neutral-900 md:text-[30px]">
            Accéder au tableau de bord administration
          </h1>
          <p className="text-[14px] leading-relaxed text-gray-500">
            Utilisez votre email professionnel et votre mot de passe pour continuer. L&apos;accès
            est limité aux comptes autorisés.
          </p>
        </header>

        {/* Form */}
        <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
          <AdminField
            label="Adresse email"
            name="email"
            type="email"
            icon={<Mail className="h-4 w-4" aria-hidden />}
            meta="Professionnel"
            placeholder="admin@habitatafrik.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <AdminField
            label="Mot de passe"
            name="password"
            type={showPassword ? 'text' : 'password'}
            icon={<Lock className="h-4 w-4" aria-hidden />}
            placeholder="••••••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            labelSlot={
              <a href="/forgot-password" className="text-[13px] font-semibold text-brand">
                Mot de passe oublié ?
              </a>
            }
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="flex items-center focus-visible:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            }
          />

          {/* Keep-session + request-access */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setKeepSession((v) => !v)}
              className="flex items-center gap-2.5 text-left text-[13px] text-gray-500"
              aria-pressed={keepSession}
            >
              <span
                className={cn(
                  'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-sm border-[1.5px] transition-colors',
                  keepSession ? 'border-brand bg-brand' : 'border-black/[0.15] bg-white',
                )}
              >
                {keepSession && <Check className="h-3 w-3 text-brand-foreground" aria-hidden />}
              </span>
              Maintenir ma session sur cet appareil
            </button>
            <a href="/admin/inscription" className="text-[13px] font-semibold text-brand">
              Besoin d&apos;un accès administrateur ?
            </a>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </AdminAuthCard>
  );
}
