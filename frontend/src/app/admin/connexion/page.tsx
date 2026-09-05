'use client';

import { useState, type FormEvent } from 'react';
import {
  LogIn,
  ShieldAlert,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  ArrowRight,
  KeyRound,
  Headset,
  ShieldCheck,
} from 'lucide-react';
import { AdminAuthCard } from '@/components/admin/AdminAuthCard';
import { AdminField } from '@/components/admin/AdminField';
import { AdminSecondaryAction } from '@/components/admin/AdminSecondaryAction';
import { cn } from '@/lib/utils';

// UI mockup only — no submit handler, no API wiring this pass.
export default function AdminConnexionPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSession, setKeepSession] = useState(true);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // no-op — backend not wired yet
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

        {/* Alert */}
        <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand">
            <ShieldAlert className="h-[15px] w-[15px] text-brand-foreground" aria-hidden />
          </span>
          <div>
            <div className="mb-1 text-[13px] font-semibold text-neutral-900">
              Vérification renforcée activée
            </div>
            <p className="text-[13px] leading-snug text-gray-500">
              Après connexion, un code de confirmation peut être demandé selon votre rôle et votre
              niveau d&apos;accès.
            </p>
          </div>
        </div>

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
              <button type="button" className="text-[13px] font-semibold text-brand">
                Mot de passe oublié ?
              </button>
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
            <button type="button" className="text-[13px] font-semibold text-brand">
              Besoin d&apos;un accès administrateur ?
            </button>
          </div>

          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            Se connecter
          </button>
        </form>

        {/* Secondary actions */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdminSecondaryAction
            icon={<KeyRound className="h-4 w-4 text-brand" aria-hidden />}
            title="Réinitialiser l'accès"
            sub="Envoyer un lien sécurisé"
          />
          <AdminSecondaryAction
            icon={<Headset className="h-4 w-4 text-brand" aria-hidden />}
            title="Support interne"
            sub="Assistance technique prioritaire"
          />
        </div>

        {/* Footer meta */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2 text-[12px] text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Connexion chiffrée · Journalisation des activités
          </div>
          <button
            type="button"
            className="rounded-full bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-500"
          >
            Français · FCFA
          </button>
        </div>
      </div>
    </AdminAuthCard>
  );
}
