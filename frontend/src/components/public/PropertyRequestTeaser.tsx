'use client';

// Home page "Vous ne trouvez pas ?" section: a fill-in-the-blanks sentence
// ("Je cherche une villa à Cotonou pour acheter, budget …") plus a WhatsApp
// number. A property request needs more than this (name, financing, delay),
// so submitting opens the full /demande-immobiliere/nouvelle form prefilled
// with these answers rather than publishing a half-empty request.
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Send } from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { flagCodeForCountryName } from '@/components/ui/PhoneCountrySelect';
import { PhoneInput } from '@/components/ui/PhoneInput';

const PROPERTY_OPTIONS: { value: string; label: string }[] = [
  { value: 'VILLA', label: 'une villa' },
  { value: 'APPARTEMENT', label: 'un appartement' },
  { value: 'MAISON', label: 'une maison' },
  { value: 'PARCELLE', label: 'un terrain' },
  { value: 'BUREAU', label: 'un bureau' },
  { value: 'BOUTIQUE', label: 'une boutique' },
  { value: 'IMMEUBLE', label: 'un immeuble' },
  { value: 'DOMAINE', label: 'un domaine' },
  { value: 'SALLE_FETE', label: 'une salle de fête' },
  { value: 'SALLE_CONFERENCE', label: 'une salle de conférence' },
];

const TRANSACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'VENTE', label: 'acheter' },
  { value: 'LOCATION', label: 'louer' },
  { value: 'SEJOUR', label: 'un séjour' },
];

const PERKS = ['Gratuit', 'Sans engagement', 'Agents vérifiés uniquement'];

// Inline "blank" of the sentence: underlined brand-coloured text.
const BLANK =
  'border-0 border-b-2 border-dashed border-brand/40 bg-transparent px-0.5 font-semibold text-brand outline-none focus:border-brand';

/**
 * A select that is exactly as wide as its current label: the label is shown
 * as text and a transparent native <select> sits on top of it (a styled
 * <select> would size itself to its longest option and leave a gap).
 */
function SentenceSelect({
  label,
  value,
  display,
  onChange,
  children,
}: {
  label: string;
  value: string;
  /** Text shown in the sentence for the current value. */
  display: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-block focus-within:[&>span]:border-brand">
      <span aria-hidden className={`${BLANK} inline-flex items-center gap-0.5`}>
        {display}
        <ChevronDown className="h-4 w-4 opacity-60" />
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {children}
      </select>
    </span>
  );
}

function labelOf(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function countryOfCity(city: string): string {
  return COUNTRIES.find((c) => c.cities.includes(city))?.name ?? 'Bénin';
}

/** Picks a sentence city from a free-text city and/or a country filter. */
function initialCity(city: string | undefined, country: string | undefined): string {
  const wanted = city?.trim().toLowerCase();
  if (wanted) {
    for (const c of COUNTRIES) {
      const match = c.cities.find((ci) => ci.toLowerCase() === wanted);
      if (match) return match;
    }
  }
  return COUNTRIES.find((c) => c.name === country)?.cities[0] ?? 'Cotonou';
}

function pick(options: { value: string }[], value: string | undefined, fallback: string): string {
  return options.some((o) => o.value === value) ? value! : fallback;
}

export interface PropertyRequestTeaserDefaults {
  propertyType?: string;
  transactionType?: string;
  country?: string;
  city?: string;
  budget?: string;
}

/**
 * `defaults` seeds the sentence (e.g. from the /annonces search filters);
 * values the sentence cannot express are ignored. Read once on mount — pass a
 * changing `key` to reseed.
 */
export function PropertyRequestTeaser({
  defaults = {},
}: {
  defaults?: PropertyRequestTeaserDefaults;
}) {
  const router = useRouter();
  const [propertyType, setPropertyType] = useState(() =>
    pick(PROPERTY_OPTIONS, defaults.propertyType, 'VILLA'),
  );
  const [city, setCity] = useState(() => initialCity(defaults.city, defaults.country));
  const [transactionType, setTransactionType] = useState(() =>
    pick(TRANSACTION_OPTIONS, defaults.transactionType, 'VENTE'),
  );
  const [budget, setBudget] = useState(() => (defaults.budget ?? '').replace(/[^\d\s]/g, ''));
  const [phone, setPhone] = useState('');

  const country = countryOfCity(city);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams({ propertyType, transactionType, country, city });
    const budgetNum = Number(budget.replace(/\s/g, ''));
    if (Number.isFinite(budgetNum) && budgetNum > 0) {
      params.set('budgetMax', String(Math.round(budgetNum)));
    }
    if (phone.trim()) params.set('phone', phone.trim());
    router.push(`/demande-immobiliere/nouvelle?${params.toString()}`);
  }

  return (
    <section id="demande" className="scroll-mt-24 px-4 py-9 lg:px-7">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-8 rounded-[28px] bg-neutral-900 px-6 py-10 text-white lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:px-14 lg:py-14">
        <div>
          <p className="mb-3 text-xs font-bold tracking-[0.16em] text-sky-400 uppercase">
            Demandes immobilières
          </p>
          <h2 className="font-sora mb-4 text-[28px] leading-tight font-extrabold tracking-[-0.04em] lg:text-[40px]">
            Vous ne trouvez pas ? Laissez les agents venir à vous.
          </h2>
          <p className="mb-6 max-w-[520px] text-[15px] leading-relaxed text-white/75">
            Décrivez votre besoin en 30 secondes. Les agents certifiés de votre ville vous proposent
            des biens correspondants, directement sur WhatsApp ou par e-mail.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2.5">
            {PERKS.map((perk) => (
              <li key={perk} className="flex items-center gap-2 text-sm text-white/85">
                <Check className="h-4 w-4 flex-shrink-0 text-sky-400" aria-hidden />
                {perk}
              </li>
            ))}
          </ul>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[20px] bg-white p-6 text-neutral-900 shadow-[0_20px_40px_rgba(0,0,0,0.25)] lg:p-8"
        >
          <p className="font-sora mb-6 text-[20px] leading-[1.9] lg:text-[22px]">
            Je cherche{' '}
            <SentenceSelect
              label="Type de bien"
              value={propertyType}
              display={labelOf(PROPERTY_OPTIONS, propertyType)}
              onChange={setPropertyType}
            >
              {PROPERTY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SentenceSelect>{' '}
            à{' '}
            <SentenceSelect label="Ville" value={city} display={city} onChange={setCity}>
              {COUNTRIES.map((c) => (
                <optgroup key={c.name} label={c.name}>
                  {c.cities.map((ci) => (
                    <option key={ci} value={ci}>
                      {ci}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SentenceSelect>{' '}
            pour{' '}
            <SentenceSelect
              label="Transaction"
              value={transactionType}
              display={labelOf(TRANSACTION_OPTIONS, transactionType)}
              onChange={setTransactionType}
            >
              {TRANSACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SentenceSelect>
            , budget{' '}
            <span className="whitespace-nowrap">
              <input
                aria-label="Budget maximum en FCFA"
                inputMode="numeric"
                placeholder="votre budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d\s]/g, ''))}
                className={`${BLANK} w-[10rem] cursor-text placeholder:text-brand/60`}
              />
              <span className="text-[15px] text-gray-500"> FCFA</span>
            </span>
          </p>

          <label
            className="mb-1.5 block text-xs font-semibold text-gray-500"
            htmlFor="teaser-phone"
          >
            Numéro WhatsApp
          </label>
          <div className="mb-5">
            <PhoneInput
              id="teaser-phone"
              value={phone}
              onChange={setPhone}
              defaultCountry={flagCodeForCountryName(country) ?? 'BJ'}
              placeholder="01 23 45 67"
              boxClassName="rounded-xl"
              inputClassName="px-3.5 py-3 text-sm"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            <Send className="h-4 w-4" aria-hidden />
            Publier ma demande
          </button>
        </form>
      </div>
    </section>
  );
}
