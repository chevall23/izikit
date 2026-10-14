# Monétisation phase 1C — Leads acheteurs contre jetons — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un agent parcourt les demandes immobilières publiques sans voir les coordonnées, paie des jetons pour les révéler (3 acheteurs max par demande) et est remboursé automatiquement si le numéro est invalide.

**Architecture:** Nouveau modèle `LeadPurchase` ; module serveur `lib/server/leads/` (règles pures + helpers) ; 4 routes sous `app/api/leads/` ; achat et remboursement dans une transaction avec verrou consultatif par demande (modèle : `listings/[id]/boost` et `agents/[id]/unlock-contact`) ; page agent `/leads` à deux onglets.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 / PostgreSQL, zod 4, Vitest 4 (`prismaMock`), React client components.

**Spec:** `docs/superpowers/specs/2026-10-14-monetisation-phase-1c-leads-design.md`

## Global Constraints

- Chaque Route Handler : `export const runtime = 'nodejs'` ; mutations : `verifyCsrf(req)` puis `requireAuth()`.
- Réservé aux comptes `accountType = 'OWNER_AGENT'`, sinon 403 `AGENT_ONLY`.
- Vendable = `userId IS NULL` ET `trustStatus = 'TRUSTED'` ET `status <> 'CLOTUREE'`.
- Prix : 3 jetons, 5 si `priority = 'Urgent'` (éditables dans l'admin, bloc `lead` de `PricingConfig`).
- Maximum 3 acheteurs `ACTIVE` par demande ; achat définitif, jamais re-facturé.
- Remboursement automatique : fenêtre 72 h, plafond 2 remboursements par agent sur 30 jours glissants.
- Montants entiers. Le portefeuille se débite par `{ decrement }` puis `assertBalanceNotNegative` ; 422 `INSUFFICIENT_TOKENS` avec `required`.
- Notes libres, nom, téléphone, e-mail, type de client : jamais exposés avant achat.
- Ne pas modifier les fichiers protégés de CLAUDE.md. Ne pas réécrire de fichier avec PowerShell 5.1.
- Tout texte visible en français.

## Review Focus

- Dernière place disputée par deux agents : un seul achète, l'autre `LEAD_FULL` sans débit (T5, test de séquence ; verrou par demande).
- Double clic sur « Signaler » : un seul remboursement (T7, `updateMany … count`).
- Deux signalements simultanés sur deux demandes différentes du même agent : le plafond de 2 tient (T7, second verrou `leadrefund:<agentId>`).
- Demande devenue `REVIEW`/`CLOTUREE` pendant la consultation : achat refusé sans débit, acheteurs déjà servis gardent l'accès (T5, T6).
- Remboursé : les coordonnées ne sont plus renvoyées par `/api/leads/purchased` (T6).

## File Structure

- Modify `frontend/src/lib/pricing.ts` — bloc `lead`, `leadTokenCost`.
- Modify `frontend/src/components/admin/PricingEditor.tsx` — deux champs.
- Modify `frontend/prisma/schema.prisma` + create `frontend/prisma/migrations/20261014140000_lead_purchases/migration.sql`.
- Create `frontend/src/lib/server/leads/index.ts` (+ `index.test.ts`) — constantes, `sellableWhere`, `isSellable`, `previewOf`, `contactOf`, `isAgent`.
- Create `frontend/src/app/api/leads/route.ts` (+ test) — liste.
- Create `frontend/src/app/api/leads/[id]/purchase/route.ts` (+ test).
- Create `frontend/src/app/api/leads/purchased/route.ts` (+ test).
- Create `frontend/src/app/api/leads/[id]/report/route.ts` (+ test).
- Create `frontend/src/app/leads/page.tsx`, `frontend/src/components/leads/LeadPurchaseModal.tsx`.
- Modify `frontend/src/components/dashboard/nav-config.ts` — entrée « Leads acheteurs ».
- Modify `frontend/src/app/jetons/page.tsx` — type `REFUND`.
- Modify consentement : `app/demande-immobiliere/nouvelle/page.tsx`, `app/demande-immobiliere/page.tsx` (FAQ), `app/confidentialite/page.tsx`.

---

### Task 1: Tarification — bloc `lead`

**Files:**
- Modify: `frontend/src/lib/pricing.ts` (près de `DEFAULT_BOOST`, `PricingDataSchema`, `DEFAULT_PRICING`, helpers)
- Modify: `frontend/src/components/admin/PricingEditor.tsx`
- Test: `frontend/src/lib/pricing.test.ts`

**Interfaces:**
- Produces: `PricingData.lead: { tokensStandard: number; tokensUrgent: number }` ; `leadTokenCost(p: PricingData, priority: string): number`.

- [ ] **Step 1: Write the failing test** — ajouter à `pricing.test.ts` (importer `leadTokenCost`, `DEFAULT_PRICING`, `PricingDataSchema`) :

```ts
describe('lead pricing', () => {
  it('defaults to 3 standard / 5 urgent', () => {
    expect(DEFAULT_PRICING.lead).toEqual({ tokensStandard: 3, tokensUrgent: 5 });
  });

  it('fills the block for rows stored before 1C', () => {
    const { lead: _omit, ...stored } = DEFAULT_PRICING;
    const parsed = PricingDataSchema.parse(stored);
    expect(parsed.lead).toEqual({ tokensStandard: 3, tokensUrgent: 5 });
  });

  it('charges urgent only for the Urgent priority', () => {
    expect(leadTokenCost(DEFAULT_PRICING, 'Urgent')).toBe(5);
    expect(leadTokenCost(DEFAULT_PRICING, 'Normale')).toBe(3);
    expect(leadTokenCost(DEFAULT_PRICING, 'Basse')).toBe(3);
    expect(leadTokenCost(DEFAULT_PRICING, 'n’importe quoi')).toBe(3);
  });

  it('rejects non-positive or non-integer prices', () => {
    for (const bad of [0, -1, 1.5]) {
      expect(
        PricingDataSchema.safeParse({ ...DEFAULT_PRICING, lead: { tokensStandard: bad, tokensUrgent: 5 } })
          .success,
      ).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/pricing.test.ts` — Expected: FAIL (`leadTokenCost` / `lead` absents).

- [ ] **Step 3: Implement** dans `pricing.ts` :

```ts
const DEFAULT_LEAD = { tokensStandard: 3, tokensUrgent: 5 };
const leadPrices = z.object({
  tokensStandard: z.number().int().positive().max(100_000),
  tokensUrgent: z.number().int().positive().max(100_000),
});
```
Dans `PricingDataSchema`, après `boost` : `lead: leadPrices.default(DEFAULT_LEAD),`. Dans `DEFAULT_PRICING` : `lead: { ...DEFAULT_LEAD },`. Helper :

```ts
export function leadTokenCost(p: PricingData, priority: string): number {
  return priority === 'Urgent' ? p.lead.tokensUrgent : p.lead.tokensStandard;
}
```
Dans `PricingEditor.tsx`, sur le modèle exact des trois champs boost (`setBoost`), ajouter une section « Leads acheteurs (jetons) » avec deux champs numériques `tokensStandard` (« Demande standard ») et `tokensUrgent` (« Demande urgente ») et un setter `setLead(field, value)` qui met à jour `draft.lead`. Les tests existants du PricingEditor (s'il y en a) doivent continuer à passer ; si le composant a un test de sérialisation, y ajouter `lead`.

- [ ] **Step 4: Run** `pnpm --filter frontend exec vitest run src/lib/pricing.test.ts src/lib/server/pricing` — Expected: PASS ; puis `pnpm typecheck` — Expected: 0 erreur (les fixtures `PricingData` du dépôt qui n'ont pas `lead` doivent être complétées).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pricing.ts frontend/src/lib/pricing.test.ts frontend/src/components/admin/PricingEditor.tsx
git commit -m "feat(pricing): price of buyer leads in tokens"
```

---

### Task 2: Modèle `LeadPurchase` + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (modèles `PropertyRequest`, `User`, `TokenTransaction`)
- Create: `frontend/prisma/migrations/20261014140000_lead_purchases/migration.sql`

**Interfaces:**
- Produces: `prisma.leadPurchase` (champs `id, requestId, agentId, tokensSpent, status 'ACTIVE'|'REFUNDED', reportedAt?, reportReason?, refundedAt?, createdAt`) ; relations `PropertyRequest.leadPurchases`, `User.leadPurchases`.

- [ ] **Step 1: Schéma.** Ajouter dans `schema.prisma` :

```prisma
// Achat des coordonnées d'une demande immobilière publique par un agent
// (jetons). Au plus 3 ACTIVE par demande ; REFUNDED libère la place.
model LeadPurchase {
  id          String            @id @default(cuid())
  requestId   String
  request     PropertyRequest   @relation(fields: [requestId], references: [id], onDelete: Cascade)
  agentId     String
  agent       User              @relation("LeadBuyer", fields: [agentId], references: [id], onDelete: Cascade)
  tokensSpent Int
  status      String            @default("ACTIVE") // ACTIVE | REFUNDED
  reportedAt   DateTime?
  reportReason String?
  refundedAt   DateTime?
  createdAt   DateTime          @default(now())

  @@unique([requestId, agentId])
  @@index([requestId, status])
  @@index([agentId, createdAt])
}
```
Ajouter `leadPurchases LeadPurchase[]` dans `PropertyRequest` (après `matchedByAlerts`) et `leadPurchases LeadPurchase[] @relation("LeadBuyer")` dans `User` (près des autres relations). Mettre à jour le commentaire de `TokenTransaction.type` : `// PURCHASE | USAGE | BONUS | REFUND` et celui de `amount` : « +tokens (purchase/bonus/refund) ».

- [ ] **Step 2: Migration** `migration.sql` :

```sql
-- CreateTable
CREATE TABLE "LeadPurchase" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokensSpent" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reportedAt" TIMESTAMP(3),
    "reportReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadPurchase_requestId_agentId_key" ON "LeadPurchase"("requestId", "agentId");

-- CreateIndex
CREATE INDEX "LeadPurchase_requestId_status_idx" ON "LeadPurchase"("requestId", "status");

-- CreateIndex
CREATE INDEX "LeadPurchase_agentId_createdAt_idx" ON "LeadPurchase"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadPurchase" ADD CONSTRAINT "LeadPurchase_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PropertyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPurchase" ADD CONSTRAINT "LeadPurchase_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Appliquer en local.** Arrêter le serveur de dev (sinon `prisma generate` échoue en EPERM), puis depuis `frontend/` : `pnpm exec prisma migrate deploy` puis `pnpm exec prisma generate`. Expected: « 1 migration applied » ; puis `pnpm exec prisma migrate status` → « Database schema is up to date » (si Prisma signale une dérive entre le schéma et la migration, corriger le SQL pour qu'il soit identique à ce que `prisma migrate diff` produit).

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/20261014140000_lead_purchases
git commit -m "feat(leads): LeadPurchase model and migration"
```

---

### Task 3: Module serveur `lib/server/leads`

**Files:**
- Create: `frontend/src/lib/server/leads/index.ts`
- Test: `frontend/src/lib/server/leads/index.test.ts`

**Interfaces:**
- Consumes: `leadTokenCost` (T1), `prisma.leadPurchase` (T2).
- Produces:
  - `MAX_BUYERS = 3`, `REPORT_WINDOW_MS = 72 * 3_600_000`, `REFUND_CAP = 2`, `REFUND_WINDOW_MS = 30 * 86_400_000`, `LEAD_REPORTED_FLAG = 'LEAD_REPORTED_INVALID_NUMBER'`
  - `sellableWhere(): Prisma.PropertyRequestWhereInput`
  - `isSellable(r: { userId: string | null; trustStatus: string; status: string }): boolean`
  - `PREVIEW_SELECT` (Prisma select des champs visibles avant achat)
  - `previewOf(row, pricing, activeCount, purchased)` → `LeadPreview`
  - `contactOf(row)` → `{ clientName, clientPhone, clientEmail, clientType, notes }`
  - `isAgent(userId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test** `index.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { contactOf, isAgent, isSellable, previewOf, sellableWhere, MAX_BUYERS } from './index';

const row = {
  id: 'r1',
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  country: 'Bénin',
  city: 'Cotonou',
  landmark: 'Fidjrossè',
  budgetMin: 1,
  budgetMax: 2,
  priority: 'Urgent',
  delay: 'Immédiat',
  financing: 'Comptant',
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

describe('sellable rule', () => {
  it('only unowned, trusted, not closed requests', () => {
    expect(sellableWhere()).toEqual({
      userId: null,
      trustStatus: 'TRUSTED',
      status: { not: 'CLOTUREE' },
    });
    expect(isSellable({ userId: null, trustStatus: 'TRUSTED', status: 'EN_ATTENTE' })).toBe(true);
    expect(isSellable({ userId: 'a', trustStatus: 'TRUSTED', status: 'EN_ATTENTE' })).toBe(false);
    expect(isSellable({ userId: null, trustStatus: 'REVIEW', status: 'EN_ATTENTE' })).toBe(false);
    expect(isSellable({ userId: null, trustStatus: 'REJECTED', status: 'EN_ATTENTE' })).toBe(false);
    expect(isSellable({ userId: null, trustStatus: 'TRUSTED', status: 'CLOTUREE' })).toBe(false);
  });
});

describe('previewOf', () => {
  it('prices by priority and counts the remaining slots', () => {
    const p = previewOf(row, DEFAULT_PRICING, 1, false);
    expect(p).toMatchObject({ id: 'r1', price: 5, slotsLeft: MAX_BUYERS - 1, purchased: false });
  });

  it('never carries a contact field or the notes', () => {
    const p = previewOf(
      { ...row, clientName: 'X', clientPhone: '+229', clientEmail: 'a@b.c', notes: 'tel 97' } as never,
      DEFAULT_PRICING,
      0,
      false,
    );
    for (const k of ['clientName', 'clientPhone', 'clientEmail', 'clientType', 'notes']) {
      expect(p).not.toHaveProperty(k);
    }
  });

  it('never reports a negative number of slots', () => {
    expect(previewOf(row, DEFAULT_PRICING, 5, true).slotsLeft).toBe(0);
  });
});

describe('contactOf', () => {
  it('returns exactly the revealed fields', () => {
    expect(
      contactOf({ clientName: 'A', clientPhone: 'B', clientEmail: null, clientType: 'Particulier', notes: 'n', extra: 1 } as never),
    ).toEqual({ clientName: 'A', clientPhone: 'B', clientEmail: null, clientType: 'Particulier', notes: 'n' });
  });
});

describe('isAgent', () => {
  it('is true only for OWNER_AGENT accounts', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'OWNER_AGENT' } as never);
    expect(await isAgent('u1')).toBe(true);
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    expect(await isAgent('u2')).toBe(false);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(await isAgent('u3')).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/leads/index.test.ts` — Expected: FAIL (module absent).

- [ ] **Step 3: Implement** `index.ts` :

```ts
// Buyer leads: public property requests whose contact details agents buy with
// tokens. Rules shared by the /api/leads routes. See the 1C spec.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { leadTokenCost, type PricingData } from '@/lib/pricing';

export const MAX_BUYERS = 3;
export const REPORT_WINDOW_MS = 72 * 3_600_000;
export const REFUND_CAP = 2;
export const REFUND_WINDOW_MS = 30 * 86_400_000;
export const LEAD_REPORTED_FLAG = 'LEAD_REPORTED_INVALID_NUMBER';

export function sellableWhere(): Prisma.PropertyRequestWhereInput {
  return { userId: null, trustStatus: 'TRUSTED', status: { not: 'CLOTUREE' } };
}

export function isSellable(r: { userId: string | null; trustStatus: string; status: string }) {
  return r.userId === null && r.trustStatus === 'TRUSTED' && r.status !== 'CLOTUREE';
}

// Fields visible BEFORE buying. No name, phone, e-mail, client type or notes.
export const PREVIEW_SELECT = {
  id: true,
  propertyType: true,
  transactionType: true,
  country: true,
  city: true,
  landmark: true,
  budgetMin: true,
  budgetMax: true,
  priority: true,
  delay: true,
  financing: true,
  createdAt: true,
} satisfies Prisma.PropertyRequestSelect;

export type PreviewRow = Prisma.PropertyRequestGetPayload<{ select: typeof PREVIEW_SELECT }>;

export interface LeadPreview extends PreviewRow {
  price: number;
  slotsLeft: number;
  purchased: boolean;
}

export function previewOf(
  row: PreviewRow,
  pricing: PricingData,
  activeCount: number,
  purchased: boolean,
): LeadPreview {
  return {
    id: row.id,
    propertyType: row.propertyType,
    transactionType: row.transactionType,
    country: row.country,
    city: row.city,
    landmark: row.landmark,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    priority: row.priority,
    delay: row.delay,
    financing: row.financing,
    createdAt: row.createdAt,
    price: leadTokenCost(pricing, row.priority),
    slotsLeft: Math.max(0, MAX_BUYERS - activeCount),
    purchased,
  };
}

export function contactOf(r: {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  notes: string | null;
}) {
  return {
    clientName: r.clientName,
    clientPhone: r.clientPhone,
    clientEmail: r.clientEmail,
    clientType: r.clientType,
    notes: r.notes,
  };
}

export async function isAgent(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  return u?.accountType === 'OWNER_AGENT';
}

export const AGENT_ONLY_BODY = {
  error: 'AGENT_ONLY',
  message: 'Réservé aux comptes agent.',
} as const;
```

- [ ] **Step 4: Run** le fichier de test — Expected: PASS ; `pnpm typecheck` — 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/leads
git commit -m "feat(leads): shared rules for sellable requests, previews and contacts"
```

---

### Task 4: `GET /api/leads` — opportunités

**Files:**
- Create: `frontend/src/app/api/leads/route.ts`
- Test: `frontend/src/app/api/leads/route.test.ts`

**Interfaces:**
- Consumes: `sellableWhere`, `PREVIEW_SELECT`, `previewOf`, `isAgent`, `AGENT_ONLY_BODY` (T3) ; `getPricing` ; `cursorWhere/clampLimit/decodeCursor/buildPage` de `@/lib/server/pagination/paginate`.
- Produces: `GET → { items: LeadPreview[], nextCursor: string | null }`.

Choix : les demandes complètes que l'agent n'a pas achetées sont retirées de la page **en mémoire** (le curseur reste celui de la page brute, une page peut donc être plus courte que `limit`).

- [ ] **Step 1: Write the failing test** :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn(async () => DEFAULT_PRICING) };
});

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

const base = {
  propertyType: 'VILLA', transactionType: 'VENTE', country: 'Bénin', city: 'Cotonou',
  landmark: null, budgetMin: 1, budgetMax: 2, priority: 'Normale', delay: 'Immédiat',
  financing: 'Comptant',
};
const row = (id: string, active: number, mine = false, at = '2026-10-01T00:00:00Z') => ({
  ...base,
  id,
  createdAt: new Date(at),
  _count: { leadPurchases: active },
  leadPurchases: mine ? [{ id: 'p' }] : [],
});

const get = (qs = '') => GET(new NextRequest(`http://test/api/leads${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.propertyRequest.findMany.mockResolvedValue([] as never);
});

describe('GET /api/leads', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await get()).status).toBe(401);
  });

  it('403 AGENT_ONLY for a non-agent', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    const res = await get();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('AGENT_ONLY');
  });

  it('queries only sellable requests, with the country/city filters', async () => {
    await get('?country=Bénin&city=Cotonou');
    const arg = prismaMock.propertyRequest.findMany.mock.calls[0]![0]!;
    expect(arg.where).toMatchObject({
      userId: null,
      trustStatus: 'TRUSTED',
      status: { not: 'CLOTUREE' },
      country: 'Bénin',
      city: 'Cotonou',
    });
  });

  it('exposes price, slots left and no contact data', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([row('r1', 1)] as never);
    const body = await (await get()).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 'r1', price: 3, slotsLeft: 2, purchased: false });
    const json = JSON.stringify(body);
    for (const k of ['clientName', 'clientPhone', 'clientEmail', 'notes']) {
      expect(json).not.toContain(k);
    }
  });

  it('hides full requests the agent has not bought, keeps the ones they bought', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([
      row('full', 3),
      row('mine', 3, true),
    ] as never);
    const body = await (await get()).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['mine']);
    expect(body.items[0].purchased).toBe(true);
  });

  it('paginates with a cursor', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([
      row('a', 0, false, '2026-10-03T00:00:00Z'),
      row('b', 0, false, '2026-10-02T00:00:00Z'),
    ] as never);
    const body = await (await get('?limit=1')).json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeTruthy();
    expect(prismaMock.propertyRequest.findMany.mock.calls[0]![0]!.take).toBe(2);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/app/api/leads/route.test.ts` — Expected: FAIL (route absente).

- [ ] **Step 3: Implement** `route.ts` :

```ts
// LEADS-01 — GET /api/leads
//
// Marketplace of public property requests (no account behind them) that agents
// can buy with tokens. Returns only what is visible BEFORE buying — never the
// contact details nor the free-text notes. Requests whose 3 slots are taken
// are hidden unless the agent already bought them.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  buildPage,
  clampLimit,
  cursorWhere,
  decodeCursor,
} from '@/lib/server/pagination/paginate';
import {
  AGENT_ONLY_BODY,
  MAX_BUYERS,
  PREVIEW_SELECT,
  isAgent,
  previewOf,
  sellableWhere,
} from '@/lib/server/leads';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const agentId = auth.user.sub;
    if (!(await isAgent(agentId))) {
      return NextResponse.json(AGENT_ONLY_BODY, { status: 403, headers });
    }

    const url = new URL(req.url);
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const country = url.searchParams.get('country')?.trim();
    const city = url.searchParams.get('city')?.trim();

    const rows = await prisma.propertyRequest.findMany({
      where: {
        ...sellableWhere(),
        ...(country ? { country } : {}),
        ...(city ? { city } : {}),
        ...cursorWhere(cursor),
      },
      select: {
        ...PREVIEW_SELECT,
        _count: { select: { leadPurchases: { where: { status: 'ACTIVE' } } } },
        leadPurchases: { where: { agentId, status: 'ACTIVE' }, select: { id: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const pricing = await getPricing();
    const page = buildPage(rows, limit);
    const items = page.items
      .map((r) => ({
        row: r,
        active: r._count.leadPurchases,
        purchased: r.leadPurchases.length > 0,
      }))
      .filter((x) => x.purchased || x.active < MAX_BUYERS)
      .map((x) => previewOf(x.row, pricing, x.active, x.purchased));

    return NextResponse.json({ items, nextCursor: page.nextCursor }, { headers });
  });
}
```

Si `previewOf` reçoit la ligne avec `_count`/`leadPurchases`, elle ne les recopie pas (construction champ par champ — déjà le cas en T3).

- [ ] **Step 4: Run** le test de la route — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/leads/route.ts frontend/src/app/api/leads/route.test.ts
git commit -m "feat(leads): GET /api/leads marketplace without contact data"
```

---

### Task 5: `POST /api/leads/[id]/purchase`

**Files:**
- Create: `frontend/src/app/api/leads/[id]/purchase/route.ts`
- Test: `frontend/src/app/api/leads/[id]/purchase/route.test.ts`

**Interfaces:**
- Consumes: T3 (`isAgent`, `isSellable`, `contactOf`, `MAX_BUYERS`, `AGENT_ONLY_BODY`), `leadTokenCost`, `getPricing`, `assertBalanceNotNegative`, `InsufficientTokensError`.
- Produces: `POST → 201 { contact, tokenBalance, charged: true }` ; `200 { contact, tokenBalance, charged: false }` si déjà acheté ; erreurs `AGENT_ONLY` 403, `LEAD_UNAVAILABLE` 409, `LEAD_FULL` 409, `INSUFFICIENT_TOKENS` 422 (`required`, `balance`).

Ordre dans la transaction (verrou `lead:<requestId>`) : lire la demande ; lire l'achat existant de l'agent — s'il est `ACTIVE`, renvoyer les coordonnées sans débit (même si la demande n'est plus vendable) ; sinon exiger `isSellable` (`LEAD_UNAVAILABLE`) ; compter les `ACTIVE` (`LEAD_FULL` si ≥ 3) ; débiter ; créer. Un achat `REFUNDED` existant du même agent bloque la re-création (contrainte unique) : on le traite comme `LEAD_UNAVAILABLE` (un agent remboursé ne rachète pas la même demande).

- [ ] **Step 1: Write the failing test** (tx = `prismaMock`, mêmes mocks que le test du boost : `requireAuth`, `verifyCsrf`, `$transaction`, `$executeRawUnsafe`, `getPricing`) :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn(async () => DEFAULT_PRICING) };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1', userId: null, trustStatus: 'TRUSTED', status: 'EN_ATTENTE', priority: 'Normale', city: 'Cotonou',
  clientName: 'Awa', clientPhone: '+22997000000', clientEmail: 'a@b.c', clientType: 'Particulier', notes: 'rappeler',
  ...over,
});
const call = () =>
  POST(
    new NextRequest('http://test/api/leads/r1/purchase', {
      method: 'POST',
      headers: { 'x-csrf-token': 't' },
    }),
    { params: Promise.resolve({ id: 'r1' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
  prismaMock.propertyRequest.findUnique.mockResolvedValue(request() as never);
  prismaMock.leadPurchase.findUnique.mockResolvedValue(null);
  prismaMock.leadPurchase.count.mockResolvedValue(0);
  prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 10 } as never);
  prismaMock.tokenWallet.update.mockResolvedValue({ balance: 7 } as never);
  prismaMock.tokenTransaction.create.mockResolvedValue({} as never);
  prismaMock.leadPurchase.create.mockResolvedValue({ id: 'p1' } as never);
});

describe('POST /api/leads/[id]/purchase', () => {
  it('rejects CSRF failures and anonymous callers', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await call()).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await call()).status).toBe(401);
  });

  it('403 AGENT_ONLY for a non-agent, no debit', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    const res = await call();
    expect(res.status).toBe(403);
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('charges 3 tokens, reveals the contact, writes a USAGE transaction', async () => {
    const res = await call();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      charged: true,
      tokenBalance: 7,
      contact: { clientName: 'Awa', clientPhone: '+22997000000', notes: 'rappeler' },
    });
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 3 } } }),
    );
    expect(prismaMock.tokenTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'agent-1', type: 'USAGE', amount: -3, balanceAfter: 7,
        description: 'Achat de lead — Cotonou',
      }),
    });
    expect(prismaMock.leadPurchase.create).toHaveBeenCalledWith({
      data: { requestId: 'r1', agentId: 'agent-1', tokensSpent: 3 },
    });
  });

  it('charges 5 tokens for an Urgent request', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(request({ priority: 'Urgent' }) as never);
    prismaMock.tokenWallet.update.mockResolvedValue({ balance: 5 } as never);
    await call();
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 5 } } }),
    );
  });

  it('422 INSUFFICIENT_TOKENS with required/balance, nothing written', async () => {
    prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 2 } as never);
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_TOKENS', required: 3, balance: 2 });
    expect(prismaMock.leadPurchase.create).not.toHaveBeenCalled();
  });

  it('422 when a concurrent spend drives the balance negative inside the tx', async () => {
    prismaMock.tokenWallet.update.mockResolvedValue({ balance: -1 } as never);
    const res = await call();
    expect(res.status).toBe(422);
    expect(prismaMock.leadPurchase.create).not.toHaveBeenCalled();
  });

  it('409 LEAD_FULL on the 4th buyer, no debit', async () => {
    prismaMock.leadPurchase.count.mockResolvedValue(3);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LEAD_FULL');
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it.each([
    ['REVIEW', { trustStatus: 'REVIEW' }],
    ['CLOTUREE', { status: 'CLOTUREE' }],
    ['agent-owned', { userId: 'someone' }],
  ])('409 LEAD_UNAVAILABLE for a %s request, no debit', async (_n, over) => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(request(over) as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LEAD_UNAVAILABLE');
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('409 LEAD_UNAVAILABLE for a missing request', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(409);
  });

  it('re-buying is free and returns the contact (even if the request is no longer sellable)', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({ status: 'ACTIVE' } as never);
    prismaMock.propertyRequest.findUnique.mockResolvedValue(request({ trustStatus: 'REVIEW' }) as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ charged: false, contact: { clientName: 'Awa' } });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
    expect(prismaMock.leadPurchase.create).not.toHaveBeenCalled();
  });

  it('a refunded agent cannot buy the same request again', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({ status: 'REFUNDED' } as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LEAD_UNAVAILABLE');
  });

  it('takes the per-request advisory lock before reading', async () => {
    await call();
    expect(prismaMock.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      'lead:r1',
    );
    const lockOrder = prismaMock.$executeRawUnsafe.mock.invocationCallOrder.at(-1)!;
    const readOrder = prismaMock.propertyRequest.findUnique.mock.invocationCallOrder.at(-1)!;
    expect(lockOrder).toBeLessThan(readOrder);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run "src/app/api/leads/\[id\]/purchase"` — Expected: FAIL (route absente).

- [ ] **Step 3: Implement** `route.ts` :

```ts
// LEADS-02 — POST /api/leads/[id]/purchase
//
// Buys the contact details of a public property request with tokens. One
// transaction under a per-request advisory lock so that the last free slot
// goes to a single agent. Modelled on POST /api/agents/[id]/unlock-contact.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { InsufficientTokensError, assertBalanceNotNegative } from '@/lib/server/token-wallet';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { leadTokenCost } from '@/lib/pricing';
import {
  AGENT_ONLY_BODY,
  MAX_BUYERS,
  contactOf,
  isAgent,
  isSellable,
} from '@/lib/server/leads';

class LeadRefusal extends Error {
  constructor(
    readonly code: 'LEAD_UNAVAILABLE' | 'LEAD_FULL',
    readonly httpMessage: string,
  ) {
    super(code);
  }
}

class NotEnoughTokens extends Error {
  constructor(
    readonly required: number,
    readonly balance: number,
  ) {
    super('INSUFFICIENT_TOKENS');
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const agentId = auth.user.sub;
    if (!(await isAgent(agentId))) {
      return NextResponse.json(AGENT_ONLY_BODY, { status: 403, headers });
    }

    const { id } = await ctx.params;
    const pricing = await getPricing();

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `lead:${id}`);

        const request = await tx.propertyRequest.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            trustStatus: true,
            status: true,
            priority: true,
            city: true,
            clientName: true,
            clientPhone: true,
            clientEmail: true,
            clientType: true,
            notes: true,
          },
        });
        if (!request) {
          throw new LeadRefusal('LEAD_UNAVAILABLE', 'Cette demande n’est plus disponible.');
        }

        const existing = await tx.leadPurchase.findUnique({
          where: { requestId_agentId: { requestId: id, agentId } },
          select: { status: true },
        });
        if (existing?.status === 'ACTIVE') {
          const wallet = await tx.tokenWallet.findUnique({
            where: { userId: agentId },
            select: { balance: true },
          });
          return { contact: contactOf(request), tokenBalance: wallet?.balance ?? 0, charged: false };
        }
        if (existing || !isSellable(request)) {
          throw new LeadRefusal('LEAD_UNAVAILABLE', 'Cette demande n’est plus disponible.');
        }

        const active = await tx.leadPurchase.count({
          where: { requestId: id, status: 'ACTIVE' },
        });
        if (active >= MAX_BUYERS) {
          throw new LeadRefusal('LEAD_FULL', 'Cette demande a déjà trouvé ses 3 agents.');
        }

        const cost = leadTokenCost(pricing, request.priority);
        const before = await tx.tokenWallet.findUnique({
          where: { userId: agentId },
          select: { balance: true },
        });
        if (!before || before.balance < cost) {
          throw new NotEnoughTokens(cost, before?.balance ?? 0);
        }

        const wallet = await tx.tokenWallet.update({
          where: { userId: agentId },
          data: { balance: { decrement: cost } },
          select: { balance: true },
        });
        assertBalanceNotNegative(wallet);
        await tx.tokenTransaction.create({
          data: {
            userId: agentId,
            type: 'USAGE',
            amount: -cost,
            balanceAfter: wallet.balance,
            description: `Achat de lead — ${request.city}`,
          },
        });
        await tx.leadPurchase.create({
          data: { requestId: id, agentId, tokensSpent: cost },
        });

        return { contact: contactOf(request), tokenBalance: wallet.balance, charged: true };
      });

      return NextResponse.json(result, { status: result.charged ? 201 : 200, headers });
    } catch (err) {
      if (err instanceof NotEnoughTokens) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Pas assez de jetons pour acheter ce lead.',
            required: err.required,
            balance: err.balance,
          },
          { status: 422, headers },
        );
      }
      if (err instanceof InsufficientTokensError) {
        return NextResponse.json(
          { error: 'INSUFFICIENT_TOKENS', message: 'Pas assez de jetons pour acheter ce lead.' },
          { status: 422, headers },
        );
      }
      if (err instanceof LeadRefusal) {
        return NextResponse.json(
          { error: err.code, message: err.httpMessage },
          { status: 409, headers },
        );
      }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Run** le test de la route — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/leads/[id]/purchase"
git commit -m "feat(leads): buy a buyer lead with tokens"
```

---

### Task 6: `GET /api/leads/purchased`

**Files:**
- Create: `frontend/src/app/api/leads/purchased/route.ts`
- Test: `frontend/src/app/api/leads/purchased/route.test.ts`

**Interfaces:**
- Consumes: T3.
- Produces: `GET → { items: PurchasedLead[] }` avec `PurchasedLead = { purchaseId, requestId, purchasedAt, tokensSpent, refunded: boolean, canReport: boolean, request: PreviewFields, contact?: {…} }` — `contact` absent quand `refunded`. `canReport` = `ACTIVE` et achat de moins de 72 h.

- [ ] **Step 1: Write the failing test** (mêmes mocks `requireAuth`, cookies ; pas de CSRF pour un GET) :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const NOW = new Date('2026-10-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const req = (over: Record<string, unknown> = {}) => ({
  id: 'r1', propertyType: 'VILLA', transactionType: 'VENTE', country: 'Bénin', city: 'Cotonou',
  landmark: null, budgetMin: 1, budgetMax: 2, priority: 'Normale', delay: 'Immédiat', financing: 'Comptant',
  createdAt: hoursAgo(100), clientName: 'Awa', clientPhone: '+229', clientEmail: null,
  clientType: 'Particulier', notes: 'n', ...over,
});
const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'p1', requestId: 'r1', status: 'ACTIVE', tokensSpent: 3, createdAt: hoursAgo(1), request: req(), ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.leadPurchase.findMany.mockResolvedValue([purchase()] as never);
});
afterEach(() => vi.useRealTimers());

const get = () => GET(new NextRequest('http://test/api/leads/purchased'));

describe('GET /api/leads/purchased', () => {
  it('401 anonymous / 403 non-agent', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await get()).status).toBe(401);
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    expect((await get()).status).toBe(403);
  });

  it('only reads the caller’s purchases, newest first', async () => {
    await get();
    expect(prismaMock.leadPurchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: 'agent-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('returns the contact of an active purchase and allows a report inside 72h', async () => {
    const [item] = (await (await get()).json()).items;
    expect(item).toMatchObject({
      purchaseId: 'p1', refunded: false, canReport: true,
      contact: { clientName: 'Awa', clientPhone: '+229', notes: 'n' },
    });
  });

  it('closes the report window after 72h', async () => {
    prismaMock.leadPurchase.findMany.mockResolvedValue([purchase({ createdAt: hoursAgo(73) })] as never);
    expect((await (await get()).json()).items[0].canReport).toBe(false);
  });

  it('hides the contact of a refunded purchase', async () => {
    prismaMock.leadPurchase.findMany.mockResolvedValue([purchase({ status: 'REFUNDED' })] as never);
    const [item] = (await (await get()).json()).items;
    expect(item.refunded).toBe(true);
    expect(item.canReport).toBe(false);
    expect(item).not.toHaveProperty('contact');
    expect(JSON.stringify(item)).not.toContain('+229');
    expect(JSON.stringify(item)).not.toContain('Awa');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/app/api/leads/purchased` — Expected: FAIL.

- [ ] **Step 3: Implement** :

```ts
// LEADS-03 — GET /api/leads/purchased
//
// The agent's purchased leads, with the contact details for the active ones.
// Refunded purchases are listed without any contact data.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  AGENT_ONLY_BODY,
  PREVIEW_SELECT,
  REPORT_WINDOW_MS,
  contactOf,
  isAgent,
} from '@/lib/server/leads';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const agentId = auth.user.sub;
    if (!(await isAgent(agentId))) {
      return NextResponse.json(AGENT_ONLY_BODY, { status: 403, headers });
    }

    const purchases = await prisma.leadPurchase.findMany({
      where: { agentId },
      select: {
        id: true,
        requestId: true,
        status: true,
        tokensSpent: true,
        createdAt: true,
        request: {
          select: {
            ...PREVIEW_SELECT,
            clientName: true,
            clientPhone: true,
            clientEmail: true,
            clientType: true,
            notes: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    const now = Date.now();
    const items = purchases.map((p) => {
      const refunded = p.status === 'REFUNDED';
      const { clientName, clientPhone, clientEmail, clientType, notes, ...preview } = p.request;
      return {
        purchaseId: p.id,
        requestId: p.requestId,
        purchasedAt: p.createdAt,
        tokensSpent: p.tokensSpent,
        refunded,
        canReport: !refunded && now - p.createdAt.getTime() <= REPORT_WINDOW_MS,
        request: preview,
        ...(refunded
          ? {}
          : { contact: contactOf({ clientName, clientPhone, clientEmail, clientType, notes }) }),
      };
    });

    return NextResponse.json({ items }, { headers });
  });
}
```

- [ ] **Step 4: Run** le test — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/leads/purchased
git commit -m "feat(leads): list purchased leads with contact details"
```

---

### Task 7: `POST /api/leads/[id]/report` — remboursement automatique

**Files:**
- Create: `frontend/src/app/api/leads/[id]/report/route.ts`
- Test: `frontend/src/app/api/leads/[id]/report/route.test.ts`

**Interfaces:**
- Consumes: T3 (`REPORT_WINDOW_MS`, `REFUND_CAP`, `REFUND_WINDOW_MS`, `LEAD_REPORTED_FLAG`, `isAgent`, `AGENT_ONLY_BODY`).
- Produces: `POST { reason: 'INVALID_NUMBER' } → 200 { refunded: true, tokensRefunded, tokenBalance }` ; idempotent `200 { refunded: true, alreadyRefunded: true }` ; 404 `PURCHASE_NOT_FOUND` ; 409 `REPORT_WINDOW_CLOSED` ; 409 `REFUND_LIMIT` ; 400 `VALIDATION_FAILED`.

Verrous : `lead:<requestId>` puis `leadrefund:<agentId>` (le second sérialise le plafond d'un même agent entre demandes différentes).

- [ ] **Step 1: Write the failing test** :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const NOW = new Date('2026-10-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const call = (body: unknown = { reason: 'INVALID_NUMBER' }) =>
  POST(
    new NextRequest('http://test/api/leads/r1/report', {
      method: 'POST',
      headers: { 'x-csrf-token': 't', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'r1' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  __cookieStore.clear();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'agent-1', email: 'a@x.io' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
  prismaMock.leadPurchase.findUnique.mockResolvedValue({
    id: 'p1', status: 'ACTIVE', tokensSpent: 3, createdAt: hoursAgo(2),
  } as never);
  prismaMock.leadPurchase.count.mockResolvedValue(0);
  prismaMock.leadPurchase.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.tokenWallet.update.mockResolvedValue({ balance: 13 } as never);
  prismaMock.tokenTransaction.create.mockResolvedValue({} as never);
  prismaMock.propertyRequest.findUnique.mockResolvedValue({
    trustStatus: 'TRUSTED', trustFlags: ['SOME_FLAG'],
  } as never);
  prismaMock.propertyRequest.update.mockResolvedValue({} as never);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/leads/[id]/report', () => {
  it('guards: csrf, auth, agent-only, body', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await call()).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await call()).status).toBe(401);
    prismaMock.user.findUnique.mockResolvedValueOnce({ accountType: 'TENANT_BUYER' } as never);
    expect((await call()).status).toBe(403);
    expect((await call({ reason: 'AUTRE' })).status).toBe(400);
  });

  it('refunds the exact amount, frees the slot, writes a REFUND transaction', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: true, tokensRefunded: 3, tokenBalance: 13 });
    expect(prismaMock.leadPurchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'ACTIVE' },
      data: expect.objectContaining({
        status: 'REFUNDED', reportReason: 'INVALID_NUMBER',
        reportedAt: NOW, refundedAt: NOW,
      }),
    });
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { increment: 3 } } }),
    );
    expect(prismaMock.tokenTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'agent-1', type: 'REFUND', amount: 3, balanceAfter: 13,
        description: 'Remboursement de lead',
      }),
    });
  });

  it('moves a TRUSTED request to REVIEW and appends the signal', async () => {
    await call();
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { trustStatus: 'REVIEW', trustFlags: ['SOME_FLAG', 'LEAD_REPORTED_INVALID_NUMBER'] },
    });
  });

  it('leaves an already non-trusted request untouched', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({ trustStatus: 'REJECTED', trustFlags: [] } as never);
    await call();
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('is idempotent: a refunded purchase is not refunded twice', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({
      id: 'p1', status: 'REFUNDED', tokensSpent: 3, createdAt: hoursAgo(2),
    } as never);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ refunded: true, alreadyRefunded: true });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('is idempotent under a concurrent double submit (updateMany count 0)', async () => {
    prismaMock.leadPurchase.updateMany.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyRefunded: true });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
    expect(prismaMock.tokenTransaction.create).not.toHaveBeenCalled();
  });

  it('404 PURCHASE_NOT_FOUND without a purchase', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('PURCHASE_NOT_FOUND');
  });

  it('409 REPORT_WINDOW_CLOSED after 72h, no refund', async () => {
    prismaMock.leadPurchase.findUnique.mockResolvedValue({
      id: 'p1', status: 'ACTIVE', tokensSpent: 3, createdAt: hoursAgo(73),
    } as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('REPORT_WINDOW_CLOSED');
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('409 REFUND_LIMIT after 2 refunds in the last 30 days', async () => {
    prismaMock.leadPurchase.count.mockResolvedValue(2);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('REFUND_LIMIT');
    expect(prismaMock.leadPurchase.count).toHaveBeenCalledWith({
      where: {
        agentId: 'agent-1',
        status: 'REFUNDED',
        refundedAt: { gte: new Date(NOW.getTime() - 30 * 86_400_000) },
      },
    });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it('takes the request lock, then the per-agent refund lock', async () => {
    await call();
    expect(prismaMock.$executeRawUnsafe.mock.calls.map((c) => c[1])).toEqual([
      'lead:r1',
      'leadrefund:agent-1',
    ]);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run "src/app/api/leads/\[id\]/report"` — Expected: FAIL.

- [ ] **Step 3: Implement** :

```ts
// LEADS-04 — POST /api/leads/[id]/report
//
// "Numéro invalide" report. Refunds the purchase automatically when it is
// within 72h and the agent has fewer than 2 refunds over the last 30 days,
// frees the slot and sends the request back to admin review. Idempotent.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  AGENT_ONLY_BODY,
  LEAD_REPORTED_FLAG,
  REFUND_CAP,
  REFUND_WINDOW_MS,
  REPORT_WINDOW_MS,
  isAgent,
} from '@/lib/server/leads';

const Body = z.object({ reason: z.literal('INVALID_NUMBER') });

class ReportRefusal extends Error {
  constructor(
    readonly code: 'PURCHASE_NOT_FOUND' | 'REPORT_WINDOW_CLOSED' | 'REFUND_LIMIT',
    readonly status: number,
    readonly httpMessage: string,
  ) {
    super(code);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const headers = { 'x-request-id': reqCtx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const agentId = auth.user.sub;
    if (!(await isAgent(agentId))) {
      return NextResponse.json(AGENT_ONLY_BODY, { status: 403, headers });
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Motif de signalement invalide.' },
        { status: 400, headers },
      );
    }

    const { id } = await ctx.params;

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `lead:${id}`);
        // Serialises the 30-day cap of one agent across different requests.
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `leadrefund:${agentId}`,
        );

        const purchase = await tx.leadPurchase.findUnique({
          where: { requestId_agentId: { requestId: id, agentId } },
          select: { id: true, status: true, tokensSpent: true, createdAt: true },
        });
        if (!purchase) {
          throw new ReportRefusal('PURCHASE_NOT_FOUND', 404, 'Achat introuvable.');
        }
        if (purchase.status === 'REFUNDED') {
          return { alreadyRefunded: true as const };
        }

        const now = new Date();
        if (now.getTime() - purchase.createdAt.getTime() > REPORT_WINDOW_MS) {
          throw new ReportRefusal(
            'REPORT_WINDOW_CLOSED',
            409,
            'Le délai de signalement de 72 h est dépassé.',
          );
        }
        const recent = await tx.leadPurchase.count({
          where: {
            agentId,
            status: 'REFUNDED',
            refundedAt: { gte: new Date(now.getTime() - REFUND_WINDOW_MS) },
          },
        });
        if (recent >= REFUND_CAP) {
          throw new ReportRefusal(
            'REFUND_LIMIT',
            409,
            `Limite de ${REFUND_CAP} remboursements sur 30 jours atteinte.`,
          );
        }

        const flipped = await tx.leadPurchase.updateMany({
          where: { id: purchase.id, status: 'ACTIVE' },
          data: {
            status: 'REFUNDED',
            reportReason: 'INVALID_NUMBER',
            reportedAt: now,
            refundedAt: now,
          },
        });
        if (flipped.count === 0) return { alreadyRefunded: true as const };

        const wallet = await tx.tokenWallet.update({
          where: { userId: agentId },
          data: { balance: { increment: purchase.tokensSpent } },
          select: { balance: true },
        });
        await tx.tokenTransaction.create({
          data: {
            userId: agentId,
            type: 'REFUND',
            amount: purchase.tokensSpent,
            balanceAfter: wallet.balance,
            description: 'Remboursement de lead',
          },
        });

        const request = await tx.propertyRequest.findUnique({
          where: { id },
          select: { trustStatus: true, trustFlags: true },
        });
        if (request?.trustStatus === 'TRUSTED') {
          const flags = Array.isArray(request.trustFlags)
            ? request.trustFlags.filter((f): f is string => typeof f === 'string')
            : [];
          await tx.propertyRequest.update({
            where: { id },
            data: {
              trustStatus: 'REVIEW',
              trustFlags: flags.includes(LEAD_REPORTED_FLAG) ? flags : [...flags, LEAD_REPORTED_FLAG],
            },
          });
        }

        return {
          alreadyRefunded: false as const,
          tokensRefunded: purchase.tokensSpent,
          tokenBalance: wallet.balance,
        };
      });

      return NextResponse.json(
        result.alreadyRefunded
          ? { refunded: true, alreadyRefunded: true }
          : {
              refunded: true,
              tokensRefunded: result.tokensRefunded,
              tokenBalance: result.tokenBalance,
            },
        { headers },
      );
    } catch (err) {
      if (err instanceof ReportRefusal) {
        return NextResponse.json(
          { error: err.code, message: err.httpMessage },
          { status: err.status, headers },
        );
      }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Run** le test — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/leads/[id]/report"
git commit -m "feat(leads): automatic refund of an invalid-number lead"
```

---

### Task 8: Interface agent (`/leads`), navigation, historique des jetons

**Files:**
- Create: `frontend/src/components/leads/LeadPurchaseModal.tsx`
- Create: `frontend/src/app/leads/page.tsx`
- Modify: `frontend/src/components/dashboard/nav-config.ts` (groupe « Outils », après `tokens`)
- Modify: `frontend/src/app/jetons/page.tsx` (type `REFUND`)

**Interfaces:**
- Consumes: `GET /api/leads`, `POST /api/leads/[id]/purchase`, `GET /api/leads/purchased`, `POST /api/leads/[id]/report`, `GET /api/tokens/wallet`, `api`/`ApiError`, `Button`, `DashboardShell`, `useToast`.

Pas de test unitaire de composant (le dépôt n'en a pas pour les pages agent) ; la couverture vient des routes (T4–T7), de `pnpm typecheck`/`lint` et du parcours scripté. Les libellés suivent la maquette existante (Sora titres, Tailwind comme `BoostModal`).

- [ ] **Step 1: Navigation.** Dans `nav-config.ts`, importer `Handshake` (ou `Users` si `Handshake` n'existe pas dans la version de lucide-react installée) et ajouter dans `Outils` : `{ key: 'leads', label: 'Leads acheteurs', icon: Handshake, href: '/leads' },` ; étendre le type de clé (union ou `string`) s'il est fermé. Vérifier par `pnpm typecheck`.

- [ ] **Step 2: Historique des jetons.** Dans `jetons/page.tsx` : `type TxType = 'achat' | 'utilisation' | 'bonus' | 'remboursement';`, dans `mapTxType` ajouter `if (apiType === 'REFUND') return 'remboursement';` avant le `return 'bonus'`, et dans `TX_STYLE` : `remboursement: { label: 'Remboursement', className: 'bg-emerald-50 text-emerald-700', icon: ArrowUpRight },`.

- [ ] **Step 3: Modale** `LeadPurchaseModal.tsx` (calquée sur `BoostModal`) :

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';

export interface LeadContact {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  notes: string | null;
}

interface Props {
  requestId: string;
  summary: string;
  price: number;
  onClose: () => void;
  onPurchased: (contact: LeadContact, tokenBalance: number) => void;
}

export function LeadPurchaseModal({ requestId, summary, price, onClose, onPurchased }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ balance: number }>('/api/tokens/wallet')
      .then((res) => {
        if (!cancelled) setBalance(res.balance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const notEnough = balance !== null && balance < price;

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ contact: LeadContact; tokenBalance: number }>(
        `/api/leads/${requestId}/purchase`,
        { method: 'POST' },
      );
      onPurchased(res.contact, res.tokenBalance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-sora text-base font-semibold text-neutral-900">Acheter ce lead</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-[13.5px] text-gray-600">{summary}</p>
        <p className="mb-2 text-[13px] text-neutral-700">
          Coût : {price} jetons{balance !== null ? ` · Solde : ${balance}` : ''}
        </p>
        <p className="mb-4 text-[12.5px] text-gray-500">
          Paiement définitif. Remboursable uniquement si le numéro est invalide, signalé dans les 72
          h suivant l’achat.
        </p>
        {notEnough && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            Solde insuffisant : rechargez vos jetons dans « Jetons & visites VR ».
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" disabled={submitting || notEnough} onClick={() => void confirm()}>
            {submitting ? 'Achat en cours…' : `Acheter pour ${price} jetons`}
          </Button>
          <Button type="button" variant="social" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Page** `app/leads/page.tsx` — client component dans `<DashboardShell active="leads" searchPlaceholder="Rechercher une annonce, un contact…">`, titre « Leads acheteurs », deux onglets (état `tab: 'opportunities' | 'mine'`) :
  - **Opportunités** : `api<{ items: Opp[]; nextCursor: string | null }>('/api/leads')` ; carte par item : `propertyType` + `transactionType`, `city` (+ `landmark`), budget (`budgetMin`–`budgetMax` formaté `fr-FR` avec « FCFA »), badge `priority` (rouge si `Urgent`), `delay`, `financing`, « N place(s) restante(s) », `price` jetons ; bouton « Acheter » (désactivé si `purchased`, libellé « Déjà acheté ») qui ouvre `LeadPurchaseModal` ; bouton « Charger plus » tant que `nextCursor`.
  - **Mes leads** : `api<{ items: Purchased[] }>('/api/leads/purchased')` ; pour chaque achat : résumé du bien, date d'achat, coordonnées avec `<a href={`tel:${phone}`}>` et lien WhatsApp `https://wa.me/${phone.replace(/\D/g, '')}`, e-mail et notes si présents ; si `canReport` bouton « Signaler un numéro invalide » → confirmation `window.confirm('Signaler ce numéro comme invalide et être remboursé ?')` → `POST /api/leads/${requestId}/report` `{ reason: 'INVALID_NUMBER' }` → toast « Lead remboursé » puis rechargement de la liste ; si `refunded` badge « Remboursé » sans coordonnées. Les erreurs `REPORT_WINDOW_CLOSED`/`REFUND_LIMIT` s'affichent via `toast` avec `err.message`.
  - Après un achat réussi (`onPurchased`) : fermer la modale, toast « Lead acheté », basculer sur l'onglet « Mes leads » et le recharger.
  - Erreur 403 `AGENT_ONLY` : afficher « Cette page est réservée aux comptes agent. »

Écrire le fichier complet avec le même style que `jetons/page.tsx` (hooks `useEffect` avec drapeau `cancelled`, `useToast`).

- [ ] **Step 5: Verify** `pnpm typecheck` (0 erreur), `pnpm lint` (0 erreur), `pnpm exec prettier --write` sur les fichiers touchés. Démarrer `pnpm dev`, ouvrir `/leads` connecté en agent (compte jetable) : la page s'affiche sans erreur console.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/leads frontend/src/app/leads frontend/src/components/dashboard/nav-config.ts frontend/src/app/jetons/page.tsx
git commit -m "feat(leads): agent leads page, purchase modal and refund history"
```

---

### Task 9: Consentement, FAQ, confidentialité et vérification finale

**Files:**
- Modify: `frontend/src/app/demande-immobiliere/nouvelle/page.tsx` (case de consentement, dernière étape, ~ligne 936)
- Modify: `frontend/src/app/demande-immobiliere/page.tsx` (réponse FAQ « Vos informations de contact restent privées… », ~ligne 59)
- Modify: `frontend/src/app/confidentialite/page.tsx` (paragraphe sur les demandes, ~ligne 64)

**Interfaces:** aucune. **Ces textes engagent juridiquement la revente de données personnelles : l'utilisateur doit les relire avant tout déploiement.**

- [ ] **Step 1: Case de consentement.** Remplacer « J'accepte la politique de confidentialité et le traitement de mes données personnelles. » par : « J'accepte la politique de confidentialité et le traitement de mes données personnelles. Je comprends que mes coordonnées (nom, téléphone, e-mail) peuvent être transmises à 3 agents immobiliers au maximum afin qu'ils me contactent au sujet de ma demande. » (garder la même structure JSX et les liens existants).

- [ ] **Step 2: FAQ.** Remplacer la réponse « Vos informations de contact restent privées. Les agents certifiés n'y accèdent qu'après confirmation de votre intérêt. Vos données ne sont jamais partagées publiquement. » par : « Vos coordonnées ne sont jamais affichées publiquement. Elles ne sont transmises qu'à 3 agents immobiliers au maximum, qui les obtiennent pour vous recontacter au sujet de votre demande. »

- [ ] **Step 3: Confidentialité.** Dans le paragraphe qui décrit le traitement des demandes immobilières, ajouter : « Les coordonnées que vous laissez dans une demande immobilière peuvent être communiquées à 3 agents immobiliers au maximum, qui les obtiennent via la plateforme pour vous contacter au sujet de cette demande. Elles ne sont jamais rendues publiques. » Rechercher aussi par grep toute autre phrase du dépôt affirmant que les agents ne voient pas les coordonnées (`grep -rn "confirmation de votre intérêt\|jamais partagées" frontend/src`) et l'aligner.

- [ ] **Step 4: Vérification complète.** Arrêter le serveur de dev (bcrypt sous charge), puis depuis la racine : `pnpm format && pnpm lint && pnpm typecheck && pnpm test`. Expected: tout vert (≈ 1805 tests existants + les nouveaux de T1, T3–T7 ; si un test bcrypt expire, relancer le fichier seul — cf. mémoire « tests en échec sous charge »).

- [ ] **Step 5: Parcours local scripté** (script jetable dans le scratchpad, sur le modèle de `phase1b-check.cjs`, refusant toute base non locale, avec nettoyage) : créer 5 agents jetables avec jetons + 1 demande publique `TRUSTED` ; vérifier : `GET /api/leads` sans coordonnées ni notes ; achats 1–3 OK (3 jetons débités, 5 si `Urgent`) ; 4ᵉ agent `LEAD_FULL` sans débit ; ré-achat gratuit ; `GET /api/leads/purchased` avec coordonnées ; signalement → remboursement exact, `REFUND` dans `/api/tokens/transactions`, demande en `REVIEW` avec le signal, place libérée mais demande plus vendable (4ᵉ agent `LEAD_UNAVAILABLE`) ; second signalement idempotent ; plafond : 3 signalements d'un même agent sur 3 demandes → le 3ᵉ `REFUND_LIMIT` ; non-agent `AGENT_ONLY`. Expected: toutes les assertions passent, puis nettoyage des données jetables.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/demande-immobiliere frontend/src/app/confidentialite
git commit -m "docs(leads): consent, FAQ and privacy copy for lead sharing"
```

---

## Notes de déploiement (hors exécution)

Migrations à appliquer dans l'ordre : `20261013120000_pricing_config`, `20261014100000_token_grant_key`, `20261014120000_listing_boosts`, puis `20261014140000_lead_purchases`. Aucun nouveau cron. Aucun push/déploiement sans autorisation explicite de l'utilisateur.
