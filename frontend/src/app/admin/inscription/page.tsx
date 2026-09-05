'use client';

import { useState, type FormEvent } from 'react';
import {
  UserPlus,
  User,
  Mail,
  Phone,
  Lock,
  Shield,
  Eye,
  EyeOff,
  Check,
  ArrowRight,
  KeyRound,
  MailCheck,
} from 'lucide-react';
import { AdminAuthCard } from '@/components/admin/AdminAuthCard';
import { AdminField } from '@/components/admin/AdminField';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type Step = 'form' | 'code' | 'done';

const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  PASSWORD_BANNED: 'Ce mot de passe est trop courant, choisissez-en un autre.',
  PASSWORD_TOO_SHORT: 'Le mot de passe est trop court.',
  PASSWORD_PWNED: 'Ce mot de passe est apparu dans une fuite de données connue.',
  TOO_MANY_ACCESS_REQUEST_ATTEMPTS: 'Trop de tentatives, réessayez plus tard.',
  VALIDATION_FAILED: 'Merci de vérifier les informations saisies.',
};

const CODE_ERROR_MESSAGES: Record<string, string> = {
  VERIFICATION_CODE_INVALID: 'Code invalide ou expiré.',
  TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives, réessayez plus tard.',
  VALIDATION_FAILED: 'Le code doit contenir 8 caractères.',
};

export default function AdminInscriptionPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('form');
  const [manager, setManager] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast('Les mots de passe ne correspondent pas.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/public/admin-access-requests', {
        method: 'POST',
        body: { name: manager, email, phone, password },
      });
      setStep('code');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (REQUEST_ERROR_MESSAGES[err.code] ?? 'Une erreur est survenue, réessayez.')
          : 'Une erreur est survenue, réessayez.';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/public/admin-access-requests/verify-email', {
        method: 'POST',
        body: { email, code },
      });
      setStep('done');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (CODE_ERROR_MESSAGES[err.code] ?? 'Une erreur est survenue, réessayez.')
          : 'Une erreur est survenue, réessayez.';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminAuthCard>
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-brand">
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Inscription administrateur
          </div>
          <h1 className="font-sora text-2xl leading-[1.15] font-bold tracking-[-0.03em] text-neutral-900 md:text-[30px]">
            {step === 'form' && 'Créer un compte pour le tableau de bord administration'}
            {step === 'code' && 'Vérifiez votre adresse email'}
            {step === 'done' && 'Demande envoyée'}
          </h1>
        </header>

        {step === 'form' && (
          <form onSubmit={onSubmitForm} className="flex flex-col gap-[18px]">
            <AdminField
              label="Nom du responsable"
              name="manager"
              icon={<User className="h-4 w-4" aria-hidden />}
              meta="Principal"
              placeholder="Prénom et nom complet"
              autoComplete="name"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              required
            />

            <AdminField
              label="Adresse email professionnelle"
              name="email"
              type="email"
              icon={<Mail className="h-4 w-4" aria-hidden />}
              meta="Vérifiée"
              placeholder="nom@entreprise.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <AdminField
              label="Téléphone professionnel"
              name="phone"
              type="tel"
              icon={<Phone className="h-4 w-4" aria-hidden />}
              meta="WhatsApp"
              placeholder="+229 00 00 00 00"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            <AdminField
              label="Créer un mot de passe"
              name="password"
              type={showPassword ? 'text' : 'password'}
              icon={<Lock className="h-4 w-4" aria-hidden />}
              placeholder="Minimum 10 caractères"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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

            <AdminField
              label="Confirmer le mot de passe"
              name="confirm"
              type={showConfirm ? 'text' : 'password'}
              icon={<Shield className="h-4 w-4" aria-hidden />}
              placeholder="Ressaisissez votre mot de passe"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="flex items-center focus-visible:outline-none"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAccepted((v) => !v)}
                className="flex items-center gap-2.5 text-left text-[13px] text-gray-500"
                aria-pressed={accepted}
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-sm border-[1.5px] transition-colors',
                    accepted ? 'border-brand bg-brand' : 'border-black/[0.15] bg-white',
                  )}
                >
                  {accepted && <Check className="h-3 w-3 text-brand-foreground" aria-hidden />}
                </span>
                J&apos;accepte la vérification de l&apos;organisation et les conditions d&apos;accès
              </button>
              <a href="/admin/connexion" className="text-[13px] font-semibold text-brand">
                Déjà un compte ?
              </a>
            </div>

            <button
              type="submit"
              disabled={!accepted || submitting}
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              {submitting ? 'Envoi en cours…' : 'Demander la création du compte'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onSubmitCode} className="flex flex-col gap-[18px]">
            <p className="text-[14px] leading-relaxed text-gray-500">
              Un code à 8 caractères a été envoyé à <strong>{email}</strong>. Saisissez-le
              ci-dessous pour finaliser votre demande.
            </p>
            <AdminField
              label="Code de vérification"
              name="code"
              icon={<KeyRound className="h-4 w-4" aria-hidden />}
              placeholder="ABCD1234"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
            <button
              type="submit"
              disabled={submitting || code.length !== 8}
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              {submitting ? 'Vérification…' : 'Vérifier le code'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
              <MailCheck className="h-6 w-6 text-brand" aria-hidden />
            </span>
            <p className="text-[15px] font-semibold text-neutral-900">
              Demande envoyée, en attente de validation
            </p>
            <p className="max-w-[360px] text-[13px] leading-relaxed text-gray-500">
              Un administrateur va examiner votre demande. Vous recevrez un email dès qu&apos;une
              décision sera prise.
            </p>
          </div>
        )}
      </div>
    </AdminAuthCard>
  );
}
