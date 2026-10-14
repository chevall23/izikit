# Monétisation phase 1E — Statistiques par niveau et export — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer côté serveur les niveaux de statistiques de la grille (Gratuit basique, Pro complet, Agence avancé + export CSV) et afficher un aperçu flouté « Passer à Pro » pour les blocs verrouillés.

**Architecture:** Un niveau (`BASIC | FULL | ADVANCED`) déduit du plan effectif de l'utilisateur ; l'API des statistiques refuse les périodes réservées et ne calcule/renvoie pas les blocs verrouillés ; une nouvelle route d'export produit un CSV via un constructeur pur ; l'écran affiche cadenas, aperçu flouté statique et bouton d'export.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Vitest 4 (`prismaMock`), React client component.

**Spec:** `docs/superpowers/specs/2026-10-14-monetisation-phase-1e-statistiques-par-niveau-design.md`

## Global Constraints

- Niveau = celui du **plan effectif** (`getEffectivePlanKey` : essai Pro, grâce et expiration compris). `FREE → BASIC`, `PRO_AGENT → FULL`, `AGENCY_PREMIUM → ADVANCED`.
- BASIC : périodes `7j` et `30j` seulement ; `3m` et `1a` → 403 `PLAN_REQUIRED` sans calcul. Blocs verrouillés pour BASIC : `viewsTimeseries`, `topListings`, `trafficSources` (renvoyés vides, requêtes non exécutées). Les autres blocs restent gratuits (le tableau de bord les utilise).
- Export : niveau ADVANCED seulement, sinon 403 `PLAN_REQUIRED`. CSV : `text/csv; charset=utf-8`, BOM UTF-8, séparateur `;`, fin de ligne `\r\n`, `Cache-Control: no-store`, neutralisation des formules (`=`, `+`, `-`, `@`, tabulation, retour chariot → préfixe `'`).
- Aucune valeur réelle des blocs verrouillés dans la réponse ni dans le DOM pour un compte BASIC.
- Chaque Route Handler : `export const runtime = 'nodejs'`. Pas de migration. Ne pas modifier les fichiers protégés de CLAUDE.md. Textes en français. Ne pas réécrire de fichier avec PowerShell 5.1.

## Review Focus

- Un Gratuit qui force `?period=1a` à la main : 403, et rien n'est calculé (T2).
- Un abonnement expiré mais dont la ligne n'a pas encore été traitée par le cron : le niveau doit déjà être BASIC (T1, via le plan effectif).
- Titre d'annonce `=HYPERLINK(...)` ou commençant par `@` dans l'export : neutralisé (T3).
- Guillemets, points-virgules et sauts de ligne dans un titre : le CSV reste valide (T3).
- Période invalide dans l'export : 400, pas de repli silencieux (T4).

## File Structure

- Modify `frontend/src/lib/subscription-plans.ts` — `statsLevel`.
- Create `frontend/src/lib/server/stats/level.ts` (+ test) — niveau, périodes autorisées, export.
- Create `frontend/src/lib/server/stats/helpers.ts` — `trend`, `dateKey`, `PERIOD_DAYS` partagés.
- Create `frontend/src/lib/server/stats/csv.ts` (+ test) — constructeur CSV pur.
- Modify `frontend/src/app/api/listings/stats/route.ts` (+ test) — niveaux.
- Create `frontend/src/app/api/listings/stats/export/route.ts` (+ test).
- Modify `frontend/src/lib/listing-stats.ts` — `level`, `locked`, `canExport`.
- Modify `frontend/src/app/statistiques/page.tsx`; create `frontend/src/components/stats/LockedBlock.tsx`.
- Modify `frontend/src/app/settings/page.tsx` — onglet via `?tab=`.

---

### Task 1: Niveaux de statistiques

**Files:**
- Modify: `frontend/src/lib/subscription-plans.ts`
- Create: `frontend/src/lib/server/stats/level.ts`, `frontend/src/lib/server/stats/helpers.ts`
- Test: `frontend/src/lib/server/stats/level.test.ts`

**Interfaces:**
- Produces:
  - `PlanDefinition.statsLevel: StatsLevel` ; `type StatsLevel = 'BASIC' | 'FULL' | 'ADVANCED'` (exporté de `subscription-plans.ts`).
  - `level.ts` : `getStatsLevel(db: Pick<PrismaClient, 'subscription'>, userId: string, now?: Date): Promise<StatsLevel>`, `periodAllowed(level: StatsLevel, period: string): boolean`, `canExport(level: StatsLevel): boolean`, `lockedBlocks(level: StatsLevel): string[]`.
  - `helpers.ts` : `PERIOD_DAYS: Record<string, number>`, `trend(current, previous): { trendPct: number; up: boolean }`, `dateKey(d: Date): string`.

- [ ] **Step 1: Write the failing test** `level.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { canExport, getStatsLevel, lockedBlocks, periodAllowed } from './level';

const now = new Date('2026-11-10T12:00:00Z');
const DAY = 86_400_000;
const sub = (over: Record<string, unknown>) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey: 'PRO_AGENT',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(now.getTime() + DAY),
    ...over,
  } as never);

describe('getStatsLevel', () => {
  it('is BASIC without a subscription row', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
  });

  it('follows the paid plan: Pro → FULL, Agence → ADVANCED', async () => {
    sub({});
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('FULL');
    sub({ planKey: 'AGENCY_PREMIUM' });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('ADVANCED');
  });

  it('gives FULL during a trial', async () => {
    sub({ status: 'TRIAL' });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('FULL');
  });

  it('drops to BASIC when the plan lapsed, even if the cron has not run yet', async () => {
    sub({ status: 'ACTIVE', currentPeriodEnd: new Date(now.getTime() - 8 * DAY) });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
    sub({ status: 'TRIAL', currentPeriodEnd: new Date(now.getTime() - 1) });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
    sub({ status: 'EXPIRED' });
    expect(await getStatsLevel(prismaMock, 'u1', now)).toBe('BASIC');
  });
});

describe('capabilities', () => {
  it('BASIC only sees 7 and 30 days', () => {
    expect(periodAllowed('BASIC', '7j')).toBe(true);
    expect(periodAllowed('BASIC', '30j')).toBe(true);
    expect(periodAllowed('BASIC', '3m')).toBe(false);
    expect(periodAllowed('BASIC', '1a')).toBe(false);
  });

  it('FULL and ADVANCED see every period', () => {
    for (const level of ['FULL', 'ADVANCED'] as const) {
      for (const p of ['7j', '30j', '3m', '1a']) expect(periodAllowed(level, p)).toBe(true);
    }
  });

  it('only ADVANCED exports', () => {
    expect(canExport('BASIC')).toBe(false);
    expect(canExport('FULL')).toBe(false);
    expect(canExport('ADVANCED')).toBe(true);
  });

  it('locks three blocks for BASIC and nothing above', () => {
    expect(lockedBlocks('BASIC')).toEqual(['viewsTimeseries', 'topListings', 'trafficSources']);
    expect(lockedBlocks('FULL')).toEqual([]);
    expect(lockedBlocks('ADVANCED')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/stats/level.test.ts` — Expected: FAIL (module absent).

- [ ] **Step 3: Implement.** Dans `subscription-plans.ts` : ajouter après `export type PlanKey…` `export type StatsLevel = 'BASIC' | 'FULL' | 'ADVANCED';`, le champ `statsLevel: StatsLevel; // what /statistiques shows and allows (see lib/server/stats/level.ts)` dans `PlanDefinition`, et `statsLevel: 'BASIC'` (FREE), `'FULL'` (PRO_AGENT), `'ADVANCED'` (AGENCY_PREMIUM) dans le catalogue. Créer `helpers.ts` :

```ts
// Shared by GET /api/listings/stats and its CSV export.
export const PERIOD_DAYS: Record<string, number> = { '7j': 7, '30j': 30, '3m': 90, '1a': 365 };

export function trend(current: number, previous: number): { trendPct: number; up: boolean } {
  if (previous === 0) return { trendPct: current > 0 ? 100 : 0, up: current >= 0 };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { trendPct: pct, up: pct >= 0 };
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```
Créer `level.ts` :

```ts
// What /statistiques shows and allows, by the user's EFFECTIVE plan (trial,
// grace and expiry included — derived from the clock, not from the cron).
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { PLAN_CATALOG, type StatsLevel } from '@/lib/subscription-plans';
import { getEffectivePlanKey } from '../subscriptions/effective-plan';

const BASIC_PERIODS = ['7j', '30j'];
const BASIC_LOCKED = ['viewsTimeseries', 'topListings', 'trafficSources'];

export async function getStatsLevel(
  db: Pick<PrismaClient, 'subscription'>,
  userId: string,
  now: Date = new Date(),
): Promise<StatsLevel> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  return PLAN_CATALOG[getEffectivePlanKey(sub, now)].statsLevel;
}

export function periodAllowed(level: StatsLevel, period: string): boolean {
  return level !== 'BASIC' || BASIC_PERIODS.includes(period);
}

export function canExport(level: StatsLevel): boolean {
  return level === 'ADVANCED';
}

export function lockedBlocks(level: StatsLevel): string[] {
  return level === 'BASIC' ? [...BASIC_LOCKED] : [];
}
```

- [ ] **Step 4: Run** le test — Expected: PASS ; `pnpm typecheck` (compléter toute fixture `PlanDefinition` du dépôt qui n'aurait pas `statsLevel`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/subscription-plans.ts frontend/src/lib/server/stats
git commit -m "feat(stats): statistics level derived from the effective plan"
```

---

### Task 2: API des statistiques par niveau

**Files:**
- Modify: `frontend/src/app/api/listings/stats/route.ts`
- Modify: `frontend/src/lib/listing-stats.ts`
- Test: `frontend/src/app/api/listings/stats/route.test.ts`

**Interfaces:**
- Consumes: `getStatsLevel`, `periodAllowed`, `canExport`, `lockedBlocks` ; `PERIOD_DAYS`, `trend`, `dateKey` (T1).
- Produces: réponse + `level`, `locked`, `canExport` ; 403 `PLAN_REQUIRED` pour période refusée.

- [ ] **Step 1: Write the failing test.** Dans `route.test.ts` : dans `beforeEach`, ajouter par défaut un abonnement Pro actif pour que les tests existants (top annonces, sources de trafic…) continuent de voir leurs blocs :

```ts
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey: 'PRO_AGENT',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  } as never);
```
Ajouter un `describe('levels')` :

```ts
describe('levels', () => {
  const asFree = () => prismaMock.subscription.findUnique.mockResolvedValue(null);
  const asAgency = () =>
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'AGENCY_PREMIUM',
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    } as never);

  it('reports level FULL, nothing locked and no export for a Pro agent', async () => {
    const body = await (await GET(makeGet())).json();
    expect(body).toMatchObject({ level: 'FULL', locked: [], canExport: false });
  });

  it('reports ADVANCED and canExport for an Agence agent', async () => {
    asAgency();
    const body = await (await GET(makeGet('?period=1a'))).json();
    expect(body).toMatchObject({ level: 'ADVANCED', canExport: true });
  });

  it('a free agent gets the basic blocks and empty locked blocks', async () => {
    asFree();
    prismaMock.listingView.findMany.mockResolvedValue([
      { createdAt: new Date(), source: 'ORGANIC' },
    ] as never);
    const body = await (await GET(makeGet('?period=30j'))).json();
    expect(body).toMatchObject({ level: 'BASIC', canExport: false });
    expect(body.locked).toEqual(['viewsTimeseries', 'topListings', 'trafficSources']);
    expect(body.viewsTimeseries).toEqual([]);
    expect(body.topListings).toEqual([]);
    expect(body.trafficSources).toEqual([]);
    expect(body.kpis.views).toBeDefined();
    expect(body.contactsByDay).toHaveLength(7);
    expect(body.documentsProgress).toHaveLength(4);
  });

  it('does not even query the locked data for a free agent', async () => {
    asFree();
    await GET(makeGet());
    expect(prismaMock.listingView.findMany).not.toHaveBeenCalled();
  });

  it.each(['3m', '1a'])('403 PLAN_REQUIRED for a free agent asking %s, nothing computed', async (p) => {
    asFree();
    const res = await GET(makeGet(`?period=${p}`));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_REQUIRED');
    expect(prismaMock.listingView.count).not.toHaveBeenCalled();
  });

  it('a free agent keeps 7j and 30j', async () => {
    asFree();
    expect((await GET(makeGet('?period=7j'))).status).toBe(200);
    expect((await GET(makeGet('?period=30j'))).status).toBe(200);
  });

  it('an unknown period falls back to 30j and is allowed for a free agent', async () => {
    asFree();
    expect((await GET(makeGet('?period=bogus'))).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/app/api/listings/stats/route.test.ts` — Expected: FAIL (les nouveaux cas ; `level` absent).

- [ ] **Step 3: Implement** dans `route.ts` :
  - Supprimer les définitions locales `PERIOD_DAYS`, `trend`, `dateKey` et les importer de `@/lib/server/stats/helpers` ; importer `getStatsLevel, periodAllowed, canExport, lockedBlocks` de `@/lib/server/stats/level`.
  - Après `const userId = …` : 

```ts
    const requested = req.nextUrl.searchParams.get('period') ?? '30j';
    const periodParam = requested in PERIOD_DAYS ? requested : '30j';
    const days = PERIOD_DAYS[periodParam]!;
    const level = await getStatsLevel(prisma, userId);
    if (!periodAllowed(level, periodParam)) {
      return NextResponse.json(
        { error: 'PLAN_REQUIRED', message: 'Cette période est réservée au plan Pro.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const locked = lockedBlocks(level);
    const lockedOut = locked.length > 0;
```
  (remplace les anciennes lignes `periodParam`/`days` ; `period: periodParam` dans la réponse reste la période effective.)
  - Dans le `Promise.all`, rendre conditionnelles les deux requêtes verrouillées : `topListingsRaw` → `lockedOut ? Promise.resolve([] as Awaited<ReturnType<typeof topListingsQuery>>) : topListingsQuery()` en déplaçant la requête `prisma.listing.findMany({... _count … })` dans `const topListingsQuery = () => prisma.listing.findMany({ … });` défini avant le `Promise.all` ; `viewRows` → `lockedOut ? Promise.resolve([] as { createdAt: Date; source: string }[]) : prisma.listingView.findMany({ … })`.
  - Quand `lockedOut`, `viewsTimeseries` doit être `[]` : remplacer la construction par `const viewsTimeseries = lockedOut ? [] : buildSeries()` ou entourer la boucle d'un `if (!lockedOut)` (la boucle existante remplit un tableau déclaré avant). `trafficSources` est déjà vide quand `viewRows` est vide ; `topListings` aussi.
  - Ajouter à la réponse : `level, locked, canExport: canExport(level),`.
  - Dans `listing-stats.ts` : `import type { StatsLevel } from '@/lib/subscription-plans';` et ajouter à `ListingStatsResponse` : `level: StatsLevel; locked: string[]; canExport: boolean;`.

- [ ] **Step 4: Run** le test — Expected: PASS (existants + nouveaux) ; `pnpm typecheck` ; `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/listings/stats frontend/src/lib/listing-stats.ts
git commit -m "feat(stats): enforce statistics levels on the stats API"
```

---

### Task 3: Constructeur CSV

**Files:**
- Create: `frontend/src/lib/server/stats/csv.ts`
- Test: `frontend/src/lib/server/stats/csv.test.ts`

**Interfaces:**
- Produces:
  - `csvCell(value: string | number | null | undefined): string`
  - `buildStatsCsv(data: StatsCsvData): string` avec
    `StatsCsvData = { period: string; kpis: { label: string; value: number; trendPct: number }[]; viewsByDay: { date: string; count: number }[]; listings: { title: string; city: string; country: string; propertyType: string; transactionType: string; status: string; price: number; currency: string; views: number; contacts: number }[] }`.

- [ ] **Step 1: Write the failing test** :

```ts
import { describe, it, expect } from 'vitest';
import { buildStatsCsv, csvCell } from './csv';

describe('csvCell', () => {
  it('leaves plain values alone and renders null as empty', () => {
    expect(csvCell('Villa')).toBe('Villa');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes cells containing ; " or a line break, doubling the quotes', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+33')).toBe("'+33");
    expect(csvCell('-1+1')).toBe("'-1+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
  });

  it('does not touch a negative number given as a number', () => {
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('buildStatsCsv', () => {
  const csv = buildStatsCsv({
    period: '30j',
    kpis: [
      { label: 'Vues', value: 120, trendPct: 10 },
      { label: 'Taux de conversion (%)', value: 2.5, trendPct: -4 },
    ],
    viewsByDay: [
      { date: '2026-11-09', count: 3 },
      { date: '2026-11-10', count: 0 },
    ],
    listings: [
      {
        title: 'Villa; "vue mer"',
        city: 'Cotonou',
        country: 'Bénin',
        propertyType: 'VILLA',
        transactionType: 'VENTE',
        status: 'VERIFIED',
        price: 50_000_000,
        currency: 'XOF',
        views: 7,
        contacts: 2,
      },
    ],
  });

  it('starts with a UTF-8 BOM and uses CRLF line ends', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('has the three sections separated by a blank line', () => {
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Indicateurs (période : 30j)');
    expect(lines).toContain('Vues par jour');
    expect(lines).toContain('Détail par annonce');
    expect(lines.filter((l) => l === '')).toHaveLength(3); // 2 separators + trailing
  });

  it('writes the indicators with their variation', () => {
    expect(csv).toContain('Indicateur;Valeur;Variation (%)\r\nVues;120;10\r\nTaux de conversion (%);2.5;-4');
  });

  it('writes one row per day and one per listing, escaped', () => {
    expect(csv).toContain('2026-11-09;3\r\n2026-11-10;0');
    expect(csv).toContain('"Villa; ""vue mer""";Cotonou;Bénin;VILLA;VENTE;VERIFIED;50000000;XOF;7;2');
  });

  it('is still valid with no listings and no views', () => {
    const empty = buildStatsCsv({ period: '7j', kpis: [], viewsByDay: [], listings: [] });
    expect(empty).toContain('Détail par annonce');
    expect(empty).toContain('Titre;Ville;Pays;Type de bien;Transaction;Statut;Prix;Devise;Vues;Contacts');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/stats/csv.test.ts` — Expected: FAIL (module absent).

- [ ] **Step 3: Implement** `csv.ts` :

```ts
// CSV for the statistics export. Excel-FR friendly (UTF-8 BOM, ';' separator)
// and safe against spreadsheet formula injection: any text cell that would be
// read as a formula gets a leading apostrophe.
import 'server-only';

const EOL = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const row = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(';');

export interface StatsCsvData {
  period: string;
  kpis: { label: string; value: number; trendPct: number }[];
  viewsByDay: { date: string; count: number }[];
  listings: {
    title: string;
    city: string;
    country: string;
    propertyType: string;
    transactionType: string;
    status: string;
    price: number;
    currency: string;
    views: number;
    contacts: number;
  }[];
}

export function buildStatsCsv(data: StatsCsvData): string {
  const lines: string[] = [
    `Indicateurs (période : ${data.period})`,
    'Indicateur;Valeur;Variation (%)',
    ...data.kpis.map((k) => row([k.label, k.value, k.trendPct])),
    '',
    'Vues par jour',
    'Date;Vues',
    ...data.viewsByDay.map((v) => row([v.date, v.count])),
    '',
    'Détail par annonce',
    'Titre;Ville;Pays;Type de bien;Transaction;Statut;Prix;Devise;Vues;Contacts',
    ...data.listings.map((l) =>
      row([
        l.title,
        l.city,
        l.country,
        l.propertyType,
        l.transactionType,
        l.status,
        l.price,
        l.currency,
        l.views,
        l.contacts,
      ]),
    ),
    '',
  ];
  return '﻿' + lines.join(EOL);
}
```
Note : `csvCell` appliqué à un libellé de KPI négatif donné en `number` ne reçoit pas d'apostrophe (cas testé).

- [ ] **Step 4: Run** le test — Expected: PASS ; `pnpm typecheck`. Si l'assertion « 3 lignes vides » échoue à cause de la ligne finale, ajuster le test au comportement réel documenté (2 séparateurs + 1 fin).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/stats/csv.ts frontend/src/lib/server/stats/csv.test.ts
git commit -m "feat(stats): CSV builder with formula-injection protection"
```

---

### Task 4: Route d'export

**Files:**
- Create: `frontend/src/app/api/listings/stats/export/route.ts`
- Test: `frontend/src/app/api/listings/stats/export/route.test.ts`

**Interfaces:**
- Consumes: `getStatsLevel`, `canExport` (T1), `PERIOD_DAYS`, `trend`, `dateKey` (T1), `buildStatsCsv` (T3).
- Produces: `GET /api/listings/stats/export?period=…` → CSV ; 401 ; 403 `PLAN_REQUIRED` ; 400 `VALIDATION_FAILED`.

- [ ] **Step 1: Write the failing test** :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const get = (qs = '') =>
  GET(new NextRequest(`http://test/api/listings/stats/export${qs}`, { method: 'GET' }));
const agency = () =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey: 'AGENCY_PREMIUM',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@x.io' } });
  agency();
  prismaMock.listingView.count.mockResolvedValue(10 as never);
  prismaMock.listingInquiry.count.mockResolvedValue(2 as never);
  prismaMock.visit.count.mockResolvedValue(1 as never);
  prismaMock.listingView.findMany.mockResolvedValue([
    { createdAt: new Date('2026-11-09T10:00:00Z') },
    { createdAt: new Date('2026-11-09T11:00:00Z') },
  ] as never);
  prismaMock.listingView.groupBy.mockResolvedValue([{ listingId: 'l1', _count: { _all: 7 } }] as never);
  prismaMock.listing.findMany.mockResolvedValue([
    {
      id: 'l1', title: '=HYPERLINK("http://evil")', city: 'Cotonou', country: 'Bénin',
      propertyType: 'VILLA', transactionType: 'VENTE', status: 'VERIFIED', price: 5_000_000,
      currency: 'XOF', _count: { inquiries: 3 },
    },
  ] as never);
});

describe('GET /api/listings/stats/export', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await get()).status).toBe(401);
  });

  it('403 PLAN_REQUIRED for a free agent and a Pro agent, no data read', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    let res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('PLAN_REQUIRED');
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT', status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86_400_000),
    } as never);
    res = await get();
    expect(res.status).toBe(403);
    expect(prismaMock.listingView.count).not.toHaveBeenCalled();
  });

  it('400 on an unknown period', async () => {
    const res = await get('?period=bogus');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('serves a CSV download for an Agence agent', async () => {
    const res = await get('?period=7j');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="statistiques-7j-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('Vues;10;');
    expect(text).toContain('2026-11-09;2');
  });

  it('puts per-listing views and contacts in the detail and neutralises formulas', async () => {
    const text = await (await get()).text();
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")";Cotonou;Bénin;VILLA;VENTE;VERIFIED;5000000;XOF;7;3`);
  });

  it('only reads the caller own data', async () => {
    await get();
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
    expect(prismaMock.listingView.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ listing: { userId: 'u1' } }),
      }),
    );
  });

  it('defaults to 30 days', async () => {
    const res = await get();
    expect(res.headers.get('content-disposition')).toContain('statistiques-30j-');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/app/api/listings/stats/export` — Expected: FAIL (route absente).

- [ ] **Step 3: Implement** `export/route.ts` :

```ts
// LISTINGS-STATS-02 — GET /api/listings/stats/export
//
// CSV export of the statistics, Agence plan only. Same perimeter as
// GET /api/listings/stats (the caller's own non-draft listings) with a
// per-listing breakdown of views and contacts over the period.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { canExport, getStatsLevel } from '@/lib/server/stats/level';
import { PERIOD_DAYS, dateKey, trend } from '@/lib/server/stats/helpers';
import { buildStatsCsv } from '@/lib/server/stats/csv';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.sub;

    if (!canExport(await getStatsLevel(prisma, userId))) {
      return NextResponse.json(
        { error: 'PLAN_REQUIRED', message: 'L’export est réservé au plan Agence.' },
        { status: 403, headers },
      );
    }

    const period = req.nextUrl.searchParams.get('period') ?? '30j';
    const days = PERIOD_DAYS[period];
    if (!days) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Période invalide.' },
        { status: 400, headers },
      );
    }

    const now = new Date();
    const start = new Date(now.getTime() - days * 86_400_000);
    const prevStart = new Date(start.getTime() - days * 86_400_000);
    const scope = { listing: { userId } } as const;

    const [
      viewsCur,
      viewsPrev,
      contactsCur,
      contactsPrev,
      visitsCur,
      visitsPrev,
      viewRows,
      viewsPerListing,
      listings,
    ] = await Promise.all([
      prisma.listingView.count({ where: { ...scope, createdAt: { gte: start } } }),
      prisma.listingView.count({ where: { ...scope, createdAt: { gte: prevStart, lt: start } } }),
      prisma.listingInquiry.count({ where: { ...scope, createdAt: { gte: start } } }),
      prisma.listingInquiry.count({
        where: { ...scope, createdAt: { gte: prevStart, lt: start } },
      }),
      prisma.visit.count({
        where: {
          inquiry: { listing: { userId } },
          status: 'CONFIRMEE',
          scheduledAt: { gte: start },
        },
      }),
      prisma.visit.count({
        where: {
          inquiry: { listing: { userId } },
          status: 'CONFIRMEE',
          scheduledAt: { gte: prevStart, lt: start },
        },
      }),
      prisma.listingView.findMany({
        where: { ...scope, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      prisma.listingView.groupBy({
        by: ['listingId'],
        where: { ...scope, createdAt: { gte: start } },
        _count: { _all: true },
      }),
      prisma.listing.findMany({
        where: { userId, status: { not: 'DRAFT' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          city: true,
          country: true,
          propertyType: true,
          transactionType: true,
          status: true,
          price: true,
          currency: true,
          _count: { select: { inquiries: { where: { createdAt: { gte: start } } } } },
        },
      }),
    ]);

    const conversionCur = viewsCur > 0 ? (contactsCur / viewsCur) * 100 : 0;
    const conversionPrev = viewsPrev > 0 ? (contactsPrev / viewsPrev) * 100 : 0;

    const byDay = new Map<string, number>();
    for (const v of viewRows) byDay.set(dateKey(v.createdAt), (byDay.get(dateKey(v.createdAt)) ?? 0) + 1);
    const viewsByDay: { date: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dateKey(new Date(now.getTime() - i * 86_400_000));
      viewsByDay.push({ date: key, count: byDay.get(key) ?? 0 });
    }

    const viewsOf = new Map(viewsPerListing.map((g) => [g.listingId, g._count._all]));

    const csv = buildStatsCsv({
      period,
      kpis: [
        { label: 'Vues', value: viewsCur, trendPct: trend(viewsCur, viewsPrev).trendPct },
        {
          label: 'Contacts reçus',
          value: contactsCur,
          trendPct: trend(contactsCur, contactsPrev).trendPct,
        },
        {
          label: 'Visites confirmées',
          value: visitsCur,
          trendPct: trend(visitsCur, visitsPrev).trendPct,
        },
        {
          label: 'Taux de conversion (%)',
          value: Math.round(conversionCur * 10) / 10,
          trendPct: trend(conversionCur, conversionPrev).trendPct,
        },
      ],
      viewsByDay,
      listings: listings.map((l) => ({
        title: l.title,
        city: l.city,
        country: l.country,
        propertyType: l.propertyType,
        transactionType: l.transactionType,
        status: l.status,
        price: l.price,
        currency: l.currency,
        views: viewsOf.get(l.id) ?? 0,
        contacts: l._count.inquiries,
      })),
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...headers,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="statistiques-${period}-${dateKey(now)}.csv"`,
        'cache-control': 'no-store',
      },
    });
  });
}
```

- [ ] **Step 4: Run** `pnpm --filter frontend exec vitest run src/app/api/listings/stats` — Expected: PASS ; `pnpm typecheck` ; `pnpm lint` ; `pnpm exec prettier --write` sur les fichiers. Le test du runtime (`runtime-enforcement`) doit rester vert.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/listings/stats/export
git commit -m "feat(stats): CSV export of the statistics for the Agence plan"
```

---

### Task 5: Écran `/statistiques` et lien vers l'abonnement

**Files:**
- Create: `frontend/src/components/stats/LockedBlock.tsx`
- Modify: `frontend/src/app/statistiques/page.tsx`
- Modify: `frontend/src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `ListingStatsResponse.level | locked | canExport` (T2), `GET /api/listings/stats/export` (T4).

Pas de test de composant (le dépôt n'en a pas pour les pages) : couverture par les tests d'API, `typecheck`, `lint` et le contrôle visuel de la tâche 6.

- [ ] **Step 1: `LockedBlock`.** Créer :

```tsx
import Link from 'next/link';
import { Lock } from 'lucide-react';

// Decorative, STATIC placeholder behind a blur — never real values. The data of
// a locked block is not even returned by the API for the free plan.
const DECOY_BARS = [38, 62, 45, 80, 55, 92, 70, 48, 66, 84, 52, 74];

export function LockedBlock({ label }: { label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div aria-hidden className="pointer-events-none flex h-[130px] items-end gap-1.5 select-none blur-[6px]">
        {DECOY_BARS.map((h, i) => (
          <span key={i} className="flex-1 rounded-t bg-brand/30" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 text-center">
        <Lock className="h-4 w-4 text-gray-500" aria-hidden />
        <p className="text-[12.5px] font-medium text-neutral-800">{label}</p>
        <Link
          href="/settings?tab=abonnement"
          className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand/90"
        >
          Passer à Pro
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Page `/statistiques`.**
  - Importer `Lock` (lucide), `Link`, `LockedBlock`.
  - État `level`/`locked`/`canExport` déduits de `stats` (`stats?.locked ?? []`, `stats?.canExport ?? false`) ; mémoriser le dernier `level` connu dans un état `known` pour que les boutons de période restent corrects pendant un rechargement : `const [level, setLevel] = useState<'BASIC' | 'FULL' | 'ADVANCED'>('BASIC');` mis à jour dans le `.then` (`setLevel(res.level)`).
  - Boutons de période : pour `level === 'BASIC'` et `p.id` ∈ `{'3m','1a'}` : `disabled`, `title="Plan Pro"`, icône `Lock` à côté du libellé, style grisé ; le clic ne fait rien.
  - Dans le `.catch` du chargement : si `e instanceof ApiError && e.code === 'PLAN_REQUIRED'`, `setPeriod('30j')` et `toast('Cette période est réservée au plan Pro.', 'info')` au lieu du message générique.
  - Cartes « Évolution des vues », « Top annonces » et « Sources de trafic » : si `stats.locked.includes('viewsTimeseries' | 'topListings' | 'trafficSources')`, remplacer le contenu de la carte par `<LockedBlock label="Disponible avec le plan Pro" />` (la carte garde son `ChartCard` et son titre).
  - Bouton « Exporter » : remplacer le bouton désactivé par :

```tsx
          {stats?.canExport ? (
            <a
              href={`/api/listings/stats/export?period=${period}`}
              className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-4 py-2.5 text-[13px] font-medium text-neutral-800 hover:bg-gray-50"
            >
              <Download className="h-[14px] w-[14px]" aria-hidden />
              <span className="hidden lg:inline">Exporter (CSV)</span>
            </a>
          ) : (
            <Link
              href="/settings?tab=abonnement"
              title="Export réservé au plan Agence"
              className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] px-4 py-2.5 text-[13px] font-medium text-gray-400"
            >
              <Lock className="h-[14px] w-[14px]" aria-hidden />
              <span className="hidden lg:inline">Exporter</span>
            </Link>
          )}
```
  (le téléchargement passe par un lien direct : les cookies de session sont envoyés par le navigateur ; aucun CSRF n'est requis pour un GET.)

- [ ] **Step 3: Onglet via l'URL.** Dans `settings/page.tsx`, ajouter un `useEffect` qui lit `new URLSearchParams(window.location.search).get('tab')` et, s'il appartient aux clés valides de `SettingsTabKey` (réutiliser la liste/le type déjà exporté par le composant de navigation latérale ; la valeur `abonnement` doit exister), appelle `setTab(valeur)`. Pas de `useSearchParams` (évite d'exiger un `Suspense`).

- [ ] **Step 4: Verify** : `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --write` sur les fichiers touchés ; `pnpm --filter frontend exec vitest run src/lib src/app/api/listings` — Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/stats frontend/src/app/statistiques frontend/src/app/settings/page.tsx
git commit -m "feat(stats): locked previews, period locks, export button and upgrade deep link"
```

---

### Task 6: Vérification finale et parcours local

**Files:** aucun fichier de production.

- [ ] **Step 1: Suite complète** (serveur de dev arrêté) : `pnpm format && pnpm lint && pnpm typecheck && pnpm test`. Expected: tout vert (≈ 1885 tests existants + les nouveaux ; si un test bcrypt expire, relancer le fichier seul).

- [ ] **Step 2: Parcours local scripté** (script jetable dans le scratchpad sur le modèle de `phase1d-check.cjs` : base locale uniquement, comptes jetables, nettoyage final). Trois agents : Gratuit (aucun abonnement), Pro (`Subscription` PRO_AGENT/ACTIVE), Agence (AGENCY_PREMIUM/ACTIVE), chacun avec 2 annonces VERIFIED, quelques `ListingView` (dont une annonce au titre `=cmd|' /C calc'!A0`) et `ListingInquiry`. Vérifier :
  - Gratuit : `GET /api/listings/stats?period=30j` → 200, `level BASIC`, `locked` à 3 blocs, `viewsTimeseries/topListings/trafficSources` vides, `kpis` présents ; `period=3m` et `period=1a` → 403 `PLAN_REQUIRED` ; `export` → 403.
  - Pro : `period=1a` → 200, `level FULL`, `locked []`, blocs remplis, `canExport false` ; `export` → 403.
  - Agence : `level ADVANCED`, `canExport true` ; `export?period=30j` → 200, `content-type` CSV, `content-disposition` correct, BOM, trois sections, nombre de vues par annonce égal aux `ListingView` insérés, titre malveillant préfixé par une apostrophe ; `export?period=bogus` → 400.
  - Un Gratuit dont l'abonnement Pro est expiré (`EXPIRED`) : niveau BASIC.
  - Un agent en essai (`TRIAL`, fin dans le futur) : niveau FULL.
  - Le tableau de bord d'un Gratuit : `GET /api/listings/stats?period=30j` fournit toujours `contactsByDay` (7 entrées) et `documentsProgress` (4 entrées).

- [ ] **Step 3: Contrôle visuel.** `pnpm dev`, ouvrir `/statistiques` avec un compte Gratuit (cadenas sur 3 mois / 1 an, trois cartes floutées avec « Passer à Pro », « Exporter » avec cadenas menant à l'abonnement), puis avec un compte Agence (tout visible, « Exporter (CSV) » télécharge un fichier qui s'ouvre correctement dans un tableur). Si l'affichage ne peut pas être contrôlé dans un navigateur, le dire explicitement.

- [ ] **Step 4: Commit** d'éventuels correctifs : `fix(stats): …`.

---

## Notes de déploiement (hors exécution)

Aucune migration, aucun cron, aucune variable d'environnement : code seul. Ordre des migrations de la phase 1 inchangé : `20261013120000_pricing_config`, `20261014100000_token_grant_key`, `20261014120000_listing_boosts`, `20261014140000_lead_purchases`, `20261014160000_subscription_trial`. Aucun push ni déploiement sans autorisation explicite de l'utilisateur.
