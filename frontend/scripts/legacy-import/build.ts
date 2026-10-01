// Turns parsed legacy rows into a typed ImportSet. Pure: every business rule
// of the legacy import (dedup, status, re-pointing) lives here so it is
// unit-testable without a database.
import { PROPERTY_TYPE_LABEL } from '../../src/lib/listings';
import {
  COUNTRY_BY_CODE,
  COUNTRY_BY_ID,
  DIAL_BY_COUNTRY,
  int,
  mapPropertyType,
  mapRequestTransaction,
  mapTransactionType,
  normalizeEmail,
  normalizePhone,
  parseLegacyDate,
  parsePrice,
  str,
} from './mappers';
import type { SqlRow } from './parse-dump';

export const LEGACY_TABLES: ReadonlySet<string> = new Set([
  'tbldemarcheur',
  'tblclient',
  'tblannonce',
  'tblgalerie',
  'tblville',
  'tblannonce_vu',
  'tblalertesecteur',
  'tbldemandes',
  'tblportefeuille',
]);

const STALE_REQUEST_MS = 90 * 24 * 3600 * 1000;

export interface UserRecord {
  legacyId: string;
  email: string;
  phone: string | null;
  name: string | null;
  bio: string | null;
  country: string | null;
  accountType: 'OWNER_AGENT' | 'TENANT_BUYER';
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface ListingRecord {
  legacyId: string;
  ownerLegacyId: string;
  title: string;
  city: string;
  country: string;
  propertyType: string;
  transactionType: string;
  price: number;
  status: 'VERIFIED' | 'DRAFT';
  description: string | null;
  landmark: string | null;
  surfaceM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  kitchens: number | null;
  viewCount: number;
  createdAt: Date;
}

export interface PhotoRecord {
  legacyId: string;
  listingLegacyId: string;
  legacyListingId: number;
  idgal: number;
  filename: string;
  isPrimary: boolean;
  position: number;
}

export interface AlertRecord {
  legacyId: string;
  ownerLegacyId: string;
  name: string;
  transactionType: 'VENTE' | 'LOCATION';
  propertyTypes: string[];
  country: string;
  cities: string[];
  notifWhatsapp: boolean;
  notifEmail: boolean;
  active: boolean;
  createdAt: Date;
}

export interface RequestRecord {
  legacyId: string;
  transactionType: string;
  propertyType: string;
  country: string;
  city: string;
  bedrooms: string | null;
  salons: string | null;
  surfaceM2: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  clientPhone: string;
  clientEmail: string | null;
  notes: string | null;
  status: 'EN_ATTENTE' | 'CLOTUREE';
  createdAt: Date;
}

export interface WalletRecord {
  ownerLegacyId: string;
  balance: number;
}

export interface ImportSet {
  users: UserRecord[];
  listings: ListingRecord[];
  photos: PhotoRecord[];
  alerts: AlertRecord[];
  requests: RequestRecord[];
  wallets: WalletRecord[];
  skipped: Record<string, number>;
}

const fullName = (r: SqlRow): string | null =>
  [str(r.prenom), str(r.nom)].filter(Boolean).join(' ') || null;

const plural = (n: number | null, word: string): string | null =>
  n ? `${n} ${word}${n > 1 ? 's' : ''}` : null;

export function buildImportSet(d: Record<string, SqlRow[]>, now: Date = new Date()): ImportSet {
  const rows = (t: string): SqlRow[] => d[t] ?? [];
  const skipped: Record<string, number> = {};
  const skip = (k: string): void => {
    skipped[k] = (skipped[k] ?? 0) + 1;
  };

  // ── Agents: group by email, keep etat='1' first then most recent ──────────
  const agents = [...rows('tbldemarcheur')].sort((a, b) => {
    const active = Number(str(b.etat) === '1') - Number(str(a.etat) === '1');
    return active !== 0 ? active : str(b.datesave).localeCompare(str(a.datesave));
  });
  const keptByEmail = new Map<string, number>();
  const ownerOf = new Map<number, string>(); // legacy iddem → kept user legacyId
  const agentUsers: UserRecord[] = [];

  for (const r of agents) {
    const iddem = Number(r.iddem);
    const email = normalizeEmail(r.mail);
    const kept = email ? keptByEmail.get(email) : undefined;
    if (kept !== undefined) {
      ownerOf.set(iddem, `dem:${kept}`);
      skip('agentsMerged');
      continue;
    }
    if (email) keptByEmail.set(email, iddem);
    ownerOf.set(iddem, `dem:${iddem}`);
    const country = COUNTRY_BY_CODE[str(r.codepays)] ?? null;
    const createdAt = parseLegacyDate(r.datesave) ?? now;
    // A non-numeric etat is a pending e-mail verification code.
    const verified = email !== null && /^\d+$/.test(str(r.etat));
    agentUsers.push({
      legacyId: `dem:${iddem}`,
      email: email ?? `legacy-dem-${iddem}@import.habitat-afrik.invalid`,
      phone: normalizePhone(r.tel, country ? DIAL_BY_COUNTRY[country] : null),
      name: fullName(r),
      bio: str(r.apropos) || null,
      country,
      accountType: 'OWNER_AGENT',
      emailVerifiedAt: verified ? createdAt : null,
      createdAt,
    });
  }
  // Stable order (by legacy id) so the "first user keeps a shared phone" rule
  // and the output are deterministic across runs.
  agentUsers.sort((a, b) => Number(a.legacyId.slice(4)) - Number(b.legacyId.slice(4)));
  const usedPhones = new Set<string>();
  for (const u of agentUsers) {
    if (u.phone && usedPhones.has(u.phone)) {
      u.phone = null;
      skip('phonesDuplicated');
    }
    if (u.phone) usedPhones.add(u.phone);
  }
  const users: UserRecord[] = [...agentUsers];

  // ── Clients: valid email not already taken ────────────────────────────────
  const takenEmails = new Set(users.map((u) => u.email));
  for (const r of rows('tblclient')) {
    const email = normalizeEmail(r.mail);
    if (!email || takenEmails.has(email)) {
      skip('clientsWithoutUsableEmail');
      continue;
    }
    takenEmails.add(email);
    const createdAt = parseLegacyDate(r.datesave) ?? now;
    users.push({
      legacyId: `cli:${Number(r.idcli)}`,
      email,
      phone: null,
      name: fullName(r),
      bio: str(r.apropos) || null,
      country: null,
      accountType: 'TENANT_BUYER',
      emailVerifiedAt: createdAt,
      createdAt,
    });
  }

  // ── Listings ──────────────────────────────────────────────────────────────
  const villes = new Map(rows('tblville').map((v) => [Number(v.idville), v]));
  const views = new Map<number, number>();
  for (const v of rows('tblannonce_vu')) {
    const id = Number(v.idannonce);
    views.set(id, (views.get(id) ?? 0) + (Number(v.nbrevu) || 0));
  }
  const listings: ListingRecord[] = [];
  const listingIds = new Set<number>();
  for (const r of rows('tblannonce')) {
    const id = Number(r.idannonce);
    const owner = ownerOf.get(Number(r.iddem));
    const ville = villes.get(Number(r.idville));
    const country = ville ? COUNTRY_BY_ID[Number(ville.idpays)] : undefined;
    if (!owner || !ville || !country) {
      skip('listingsWithoutOwnerOrCity');
      continue;
    }
    const price = parsePrice(r.prix);
    const propertyType = mapPropertyType(r.idtype);
    const transactionType = mapTransactionType(r.type);
    const publishable =
      Number(r.confid) === 1 && price !== null && propertyType !== null && transactionType !== null;
    const idtype = Number(r.idtype);
    const landTitle =
      idtype === 13 ? 'Titre foncier : oui' : idtype === 8 ? 'Titre foncier : non' : null;
    listingIds.add(id);
    listings.push({
      legacyId: `ann:${id}`,
      ownerLegacyId: owner,
      title: str(r.titre) || 'Annonce',
      city: str(ville.libville),
      country,
      propertyType: propertyType ?? 'MAISON',
      transactionType: transactionType ?? 'VENTE',
      price: price ?? 0,
      status: publishable ? 'VERIFIED' : 'DRAFT',
      description: [str(r.description), landTitle].filter(Boolean).join('\n\n') || null,
      landmark: [str(r.quartier), str(r.repere)].filter(Boolean).join(' — ') || null,
      surfaceM2: int(r.superficie),
      bedrooms: int(r.chambre),
      bathrooms: int(r.douche),
      kitchens: int(r.cuisine),
      viewCount: views.get(id) ?? 0,
      createdAt: parseLegacyDate(r.datesave) ?? now,
    });
  }

  // ── Photos: per listing, ordered by idgal, first etat=1 is primary ────────
  const byListing = new Map<number, SqlRow[]>();
  for (const g of rows('tblgalerie')) {
    const lid = Number(g.idannonce);
    if (!listingIds.has(lid)) {
      skip('photosOrphan');
      continue;
    }
    if (!str(g.urltof)) {
      skip('photosWithoutFile');
      continue;
    }
    const list = byListing.get(lid) ?? [];
    list.push(g);
    byListing.set(lid, list);
  }
  const photos: PhotoRecord[] = [];
  for (const [lid, gs] of [...byListing].sort((a, b) => a[0] - b[0])) {
    gs.sort((a, b) => Number(a.idgal) - Number(b.idgal));
    const primary = gs.find((g) => Number(g.etat) === 1) ?? gs[0];
    gs.forEach((g, position) =>
      photos.push({
        legacyId: `gal:${Number(g.idgal)}`,
        listingLegacyId: `ann:${lid}`,
        legacyListingId: lid,
        idgal: Number(g.idgal),
        filename: str(g.urltof),
        isPrimary: g === primary,
        position,
      }),
    );
  }

  // ── Sector alerts: legacy alerts cover every type → one per transaction ──
  const allTypes = Object.keys(PROPERTY_TYPE_LABEL);
  const alerts: AlertRecord[] = [];
  for (const r of rows('tblalertesecteur')) {
    const owner = ownerOf.get(Number(r.iddem));
    const idpays = Number(r.idpays);
    const country = COUNTRY_BY_ID[idpays];
    if (!owner || !country) {
      skip('alertsWithoutOwnerOrCountry');
      continue;
    }
    const cities = str(r.ville)
      .split('/')
      .map((id) => villes.get(Number(id)))
      .filter((v): v is SqlRow => v !== undefined && Number(v.idpays) === idpays)
      .map((v) => str(v.libville));
    const expires = parseLegacyDate(r.dateexpire);
    for (const tx of ['VENTE', 'LOCATION'] as const) {
      alerts.push({
        legacyId: `alerte:${Number(r.idalerte)}:${tx}`,
        ownerLegacyId: owner,
        name: `Alerte secteur — ${tx === 'VENTE' ? 'Vente' : 'Location'}`,
        transactionType: tx,
        propertyTypes: allTypes,
        country,
        cities,
        notifWhatsapp: str(r.tel_alerte) !== '',
        notifEmail: normalizeEmail(r.mail_alerte) !== null,
        active: expires !== null && expires > now,
        createdAt: parseLegacyDate(r.datesave) ?? now,
      });
    }
  }

  // ── Public property requests ─────────────────────────────────────────────
  const requests: RequestRecord[] = [];
  for (const r of rows('tbldemandes')) {
    const transactionType = mapRequestTransaction(r.action);
    const propertyType = mapPropertyType(r.idtype);
    const ville = villes.get(Number(r.idville));
    const country = COUNTRY_BY_ID[Number(r.idpays)];
    if (!transactionType || !propertyType || !ville || !country) {
      skip('requestsUnmappable');
      continue;
    }
    const createdAt = parseLegacyDate(r.datesave) ?? now;
    requests.push({
      legacyId: `demande:${Number(r.iddemandes)}`,
      transactionType,
      propertyType,
      country,
      city: str(ville.libville),
      bedrooms: plural(int(r.chambre), 'chambre'),
      salons: plural(int(r.salon), 'salon'),
      surfaceM2: int(r.superficie),
      budgetMin: int(r.bmin),
      budgetMax: int(r.bmax),
      clientPhone: normalizePhone(r.teldemande, DIAL_BY_COUNTRY[country]) ?? '',
      clientEmail: normalizeEmail(r.maildemande),
      notes: str(r.note) || null,
      status: now.getTime() - createdAt.getTime() > STALE_REQUEST_MS ? 'CLOTUREE' : 'EN_ATTENTE',
      createdAt,
    });
  }

  // ── Token wallets ────────────────────────────────────────────────────────
  const balances = new Map<string, number>();
  for (const r of rows('tblportefeuille')) {
    const owner = ownerOf.get(Number(r.iddem));
    const solde = int(r.solde);
    if (owner && solde) balances.set(owner, (balances.get(owner) ?? 0) + solde);
  }
  const wallets = [...balances].map(([ownerLegacyId, balance]) => ({ ownerLegacyId, balance }));

  return { users, listings, photos, alerts, requests, wallets, skipped };
}
