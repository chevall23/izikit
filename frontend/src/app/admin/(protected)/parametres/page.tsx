'use client';

import { useState } from 'react';
import { UploadCloud, Image as ImageIcon, Save } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminSettingsTabs } from '@/components/admin/AdminSettingsTabs';
import { AdminSettingsSection, AdminSettingsButton } from '@/components/admin/AdminSettingsSection';
import { AdminSettingsField, AdminUploadBox } from '@/components/admin/AdminSettingsField';
import { Toggle } from '@/components/ui/Toggle';

const SOCIAL_LINKS = [
  {
    key: 'facebook',
    label: 'Facebook',
    icon: FacebookGlyph,
    value: 'https://facebook.com/habitatafrik',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: InstagramGlyph,
    value: 'https://instagram.com/habitatafrik',
  },
  { key: 'twitter', label: 'Twitter / X', icon: TwitterGlyph, value: '' },
  { key: 'linkedin', label: 'LinkedIn', icon: LinkedinGlyph, value: '' },
];

// UI mockup only — no submit handlers, no API wiring this pass.
export default function AdminParametresPage() {
  const [maintenance, setMaintenance] = useState(false);
  const [signupOpen, setSignupOpen] = useState(true);
  const [kycRequired, setKycRequired] = useState(true);

  return (
    <AdminShell
      active="settings"
      searchPlaceholder="Rechercher une annonce, un utilisateur, un paiement…"
    >
      <div>
        <p className="text-[12px] font-semibold text-brand">Administration · Multi-pays agrégée</p>
        <h1 className="font-sora mt-1 text-2xl leading-tight font-bold text-neutral-900">
          Paramètres
        </h1>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <AdminSettingsTabs active="general" />

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* Identité de la plateforme */}
          <AdminSettingsSection
            title="Identité de la plateforme"
            description="Informations générales affichées sur la plateforme"
            footer={
              <>
                <AdminSettingsButton>Annuler</AdminSettingsButton>
                <AdminSettingsButton
                  variant="primary"
                  icon={<Save className="h-3.5 w-3.5" aria-hidden />}
                >
                  Enregistrer les modifications
                </AdminSettingsButton>
              </>
            }
          >
            <AdminSettingsField
              label="Nom de la plateforme"
              name="platformName"
              defaultValue="Habitat-Afrik"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-neutral-900">Logo principal</label>
                <AdminUploadBox
                  icon={<UploadCloud className="h-5 w-5 text-gray-400" aria-hidden />}
                  label="Charger un fichier PNG/SVG"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-neutral-900">Favicon</label>
                <AdminUploadBox
                  icon={<ImageIcon className="h-5 w-5 text-gray-400" aria-hidden />}
                  label="Charger un fichier ICO/PNG"
                />
              </div>
            </div>

            <AdminSettingsField
              label="Email de contact"
              name="contactEmail"
              type="email"
              defaultValue="contact@habitat-afrik.com"
            />
            <AdminSettingsField
              label="URL du site"
              name="siteUrl"
              defaultValue="https://www.habitat-afrik.com"
            />
          </AdminSettingsSection>

          {/* Réseaux sociaux */}
          <AdminSettingsSection
            title="Réseaux sociaux"
            description="Liens vers les pages officielles de la plateforme"
            footer={
              <>
                <AdminSettingsButton>Annuler</AdminSettingsButton>
                <AdminSettingsButton
                  variant="primary"
                  icon={<Save className="h-3.5 w-3.5" aria-hidden />}
                >
                  Enregistrer les modifications
                </AdminSettingsButton>
              </>
            }
          >
            {SOCIAL_LINKS.map((s) => (
              <div key={s.key} className="flex items-center gap-2.5">
                <span className="flex w-[104px] flex-shrink-0 items-center gap-1.5 text-[13px] font-medium text-gray-400">
                  <s.icon />
                  {s.label}
                </span>
                <input
                  defaultValue={s.value}
                  placeholder="Non renseigné"
                  className="h-10 flex-1 rounded-[10px] border border-black/[0.08] bg-gray-50 px-3 text-[13px] text-neutral-900 outline-none placeholder:text-gray-400 focus:border-brand"
                />
              </div>
            ))}
          </AdminSettingsSection>

          {/* Mode maintenance & accès */}
          <AdminSettingsSection
            title="Mode maintenance & accès"
            description="Contrôlez l'état public de la plateforme"
            footer={
              <AdminSettingsButton
                variant="primary"
                icon={<Save className="h-3.5 w-3.5" aria-hidden />}
              >
                Enregistrer les modifications
              </AdminSettingsButton>
            }
          >
            <ToggleRow
              label="Mode maintenance"
              hint="La plateforme sera inaccessible aux utilisateurs publics"
              checked={maintenance}
              onChange={setMaintenance}
            />
            <ToggleRow
              label="Inscription ouverte"
              hint="Autoriser les nouveaux utilisateurs à créer un compte"
              checked={signupOpen}
              onChange={setSignupOpen}
            />
            <ToggleRow
              label="Vérification KYC obligatoire pour les agences"
              hint="Les agences doivent soumettre leurs documents avant de publier"
              checked={kycRequired}
              onChange={setKycRequired}
            />
          </AdminSettingsSection>
        </div>
      </div>
    </AdminShell>
  );
}

// lucide-react ships no brand marks — small inline glyphs, matching the
// GoogleIcon/FacebookIcon pattern already used in login/signup pages.
function FacebookGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="flex-shrink-0">
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.099 4.388 23.094 10.125 24V15.563H7.078V12.073h3.047V9.413c0-3.026 1.792-4.698 4.533-4.698 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.955.931-1.955 1.886v2.264h3.328l-.532 3.49H13.875V24C19.612 23.094 24 18.099 24 12.073Z"
      />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="flex-shrink-0">
      <defs>
        <linearGradient id="ig-grad" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.35" stopColor="#D62976" />
          <stop offset="0.7" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#ig-grad)" />
      <rect
        x="6.5"
        y="6.5"
        width="11"
        height="11"
        rx="4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
      />
      <circle cx="18.2" cy="5.8" r="1.1" fill="#fff" />
    </svg>
  );
}

function TwitterGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="flex-shrink-0">
      <path
        fill="#0F1419"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231ZM17.083 19.77h1.833L7.084 4.126H5.117Z"
      />
    </svg>
  );
}

function LinkedinGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="flex-shrink-0">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.12 9.5H4.24V19.5H7.12V9.5ZM5.68 4.5A1.67 1.67 0 1 0 5.68 7.84 1.67 1.67 0 0 0 5.68 4.5ZM19.76 19.5H16.9V14.6C16.9 13.4 16.47 12.6 15.4 12.6C14.58 12.6 14.1 13.15 13.88 13.68C13.8 13.87 13.78 14.13 13.78 14.4V19.5H10.9S10.94 10.3 10.9 9.5H13.78V10.77C14.16 10.19 14.84 9.37 16.45 9.37C18.44 9.37 19.76 10.66 19.76 13.44V19.5Z"
      />
    </svg>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-neutral-900">{label}</div>
        <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
