'use client';

import { useState } from 'react';
import { Building2, Clock, Loader2, Mail, Phone, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { COUNTRY_FLAG } from '@/lib/alerts';

const SUBJECTS: { value: string; label: string }[] = [
  { value: 'GENERAL', label: 'Question générale' },
  { value: 'SUPPORT', label: 'Support technique' },
  { value: 'PARTNERSHIP', label: 'Partenariat' },
  { value: 'AGENT', label: 'Devenir agent' },
  { value: 'PRESS', label: 'Presse' },
  { value: 'OTHER', label: 'Autre' },
];

const COUNTRIES = Object.keys(COUNTRY_FLAG);

export default function ContactPage() {
  const [subject, setSubject] = useState('GENERAL');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await api('/api/public/contact', {
        method: 'POST',
        body: {
          firstName,
          lastName,
          email,
          subject,
          message,
          ...(phone ? { phone } : {}),
          ...(country ? { country } : {}),
        },
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Trop de messages envoyés. Réessayez plus tard.'
          : "Échec de l'envoi. Réessayez.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-[#F5F6F8] text-[#1A1A1A]">
      <PublicNavbar active="contact" />

      {/* HERO */}
      <div className="bg-gradient-to-br from-brand via-sky-600 to-slate-900 px-4 py-14 text-center text-white lg:py-20">
        <span className="mb-3.5 inline-block rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold tracking-[0.06em] uppercase">
          Contactez-nous
        </span>
        <h1 className="font-sora mx-auto max-w-[640px] text-[28px] font-extrabold tracking-[-0.03em] lg:text-[44px]">
          Nous sommes là pour vous aider
        </h1>
        <p className="mx-auto mt-3 max-w-[520px] text-sm text-white/80 lg:text-base">
          Une question, un projet immobilier ou une demande de partenariat ? Notre équipe vous
          répond rapidement.
        </p>
      </div>

      {/* INFO BAR */}
      <div className="border-b border-black/[0.06] bg-white">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-7">
          {[
            { icon: Mail, label: 'Email général', value: 'contact@habitat-afrik.com' },
            { icon: Phone, label: 'Téléphone', value: '+229 0162342867' },
            { icon: Building2, label: 'Siège social', value: 'Abomey-Calavi, Bénin' },
            { icon: Clock, label: 'Horaires', value: '24h/24 · 7j/7' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10">
                <item.icon className="h-[18px] w-[18px] text-brand" aria-hidden />
              </div>
              <div>
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-sm font-semibold">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div className="mx-auto max-w-[1280px] px-4 py-9 pb-[72px] lg:px-7">
        <div className="mx-auto max-w-[720px]">
          {/* FORM CARD */}
          <div className="rounded-2xl bg-white p-6 lg:p-8">
            {sent ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                  <Send className="h-5 w-5 text-emerald-600" aria-hidden />
                </div>
                <p className="text-base font-bold">Message envoyé !</p>
                <p className="max-w-[320px] text-sm text-gray-500">
                  Merci de nous avoir contactés. Notre équipe vous répondra sous 24 à 48 heures.
                </p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <p className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                  Sujet
                </p>
                <div className="mb-5 flex flex-wrap gap-2">
                  {SUBJECTS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSubject(s.value)}
                      className={cn(
                        'rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap',
                        subject === s.value ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                      Prénom
                    </p>
                    <input
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Votre prénom"
                      className="w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                      Nom
                    </p>
                    <input
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Votre nom"
                      className="w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                      Email
                    </p>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.com"
                      className="w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                      Téléphone (facultatif)
                    </p>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+229 · Votre numéro"
                      className="w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>

                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                  Pays (facultatif)
                </p>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none"
                >
                  <option value="">Sélectionner un pays</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {COUNTRY_FLAG[c]} {c}
                    </option>
                  ))}
                </select>

                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                  Message
                </p>
                <textarea
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Votre message…"
                  className="mb-4 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                />

                {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={sending}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-3 py-3.5 text-sm font-bold whitespace-nowrap text-white disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-[15px] w-[15px]" aria-hidden />
                  )}
                  {sending ? 'Envoi…' : 'Envoyer le message'}
                </button>
                <p className="mt-3 text-center text-[11px] text-gray-400">
                  En envoyant ce formulaire, vous acceptez notre politique de confidentialité.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
