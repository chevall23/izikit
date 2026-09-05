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
} from 'lucide-react';
import { AdminAuthCard } from '@/components/admin/AdminAuthCard';
import { AdminField } from '@/components/admin/AdminField';
import { cn } from '@/lib/utils';

// UI mockup only — no submit handler, no API wiring this pass.
export default function AdminInscriptionPage() {
  const [manager, setManager] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(true);

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
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Inscription administrateur
          </div>
          <h1 className="font-sora text-2xl leading-[1.15] font-bold tracking-[-0.03em] text-neutral-900 md:text-[30px]">
            Créer un compte pour le tableau de bord administration
          </h1>
        </header>

        {/* Form */}
        <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
          <AdminField
            label="Nom du responsable"
            name="manager"
            icon={<User className="h-4 w-4" aria-hidden />}
            meta="Principal"
            placeholder="Prénom et nom complet"
            autoComplete="name"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
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
          />

          <AdminField
            label="Créer un mot de passe"
            name="password"
            type={showPassword ? 'text' : 'password'}
            icon={<Lock className="h-4 w-4" aria-hidden />}
            placeholder="Minimum 12 caractères"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            labelSlot={
              <button type="button" className="text-[13px] font-semibold text-brand">
                Exigences de sécurité
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

          <AdminField
            label="Confirmer le mot de passe"
            name="confirm"
            type={showConfirm ? 'text' : 'password'}
            icon={<Shield className="h-4 w-4" aria-hidden />}
            placeholder="Ressaisissez votre mot de passe"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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

          {/* Consent + already-a-member */}
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
            <button type="button" className="text-[13px] font-semibold text-brand">
              Déjà un compte ?
            </button>
          </div>

          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
            Demander la création du compte
          </button>
        </form>
      </div>
    </AdminAuthCard>
  );
}
