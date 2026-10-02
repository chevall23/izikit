// Legal identity of the publisher, shown on /mentions-legales,
// /confidentialite and /cgu. Source: DAA GROUP's own legal notice
// (daagroupsarl.com, updated 8 September 2026).
export const COMPANY = {
  name: 'DAA GROUP',
  rccm: 'RB/COT/20 B 26668',
  ifu: '3202011378095',
  address: 'Parcelle L, Maison Damien Comlan, Cotonou, Bénin',
  phone: '+229 60 12 12 70',
  website: 'https://daagroupsarl.com',
} as const;

export const PLATFORM_CONTACT_EMAIL = 'contact@habitat-afrik.com';

export const HOST = {
  name: 'PlanetHoster International Inc.',
  address: '4416 Louis B. Mayer, Laval, Québec, H7P 0G1, Canada',
  phone: '+1 855 774 4678',
  website: 'https://www.planethoster.com',
} as const;

export const LEGAL_LAST_UPDATED = '2 octobre 2026';

export const LEGAL_PAGES = [
  { href: '/a-propos', label: 'À propos' },
  { href: '/cgu', label: "Conditions d'utilisation" },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/mentions-legales', label: 'Mentions légales' },
] as const;
