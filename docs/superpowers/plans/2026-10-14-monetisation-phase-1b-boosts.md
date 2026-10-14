# Monétisation phase 1B — Boosts d'annonces : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Permettre à un agent de booster une annonce `VERIFIED` pendant 7, 15 ou 30 jours (en jetons ou avec un boost inclus de son plan) et épingler jusqu'à 3 annonces boostées en page 1 des résultats publics avec le badge « Sponsorisé ».

**Architecture :** Nouveau modèle `Boost` (historique) + `Listing.boostedUntil` (classement) + `Subscription.boostCredits` (boosts inclus, crédités au paiement avec la garde d'idempotence `grantKey` de 1A). Un helper `boosted.ts` choisit les épinglées (rotation horaire déterministe, max 3) et calcule la fenêtre de pagination ; `searchPublicListings` et `loadLanding` l'utilisent. L'achat est une route transactionnelle verrouillée par utilisateur, modelée sur `unlock-contact`.

**Tech Stack :** Next.js 16 (Route Handlers), Prisma 5 + PostgreSQL, zod 4, Vitest 4 (`prismaMock`), React client components.

**Spec :** `docs/superpowers/specs/2026-10-14-monetisation-phase-1b-boosts-design.md`

## Global Constraints

- Durées autorisées : `7 | 15 | 30` jours. Prix par défaut : 8 / 14 / 24 jetons (`boost: { tokens7, tokens15, tokens30 }` dans `PricingData`, défaut pour les lignes déjà stockées).
- Boost inclus : uniquement pour 7 jours ; `Subscription.boostCredits` décrémenté atomiquement (`updateMany … boostCredits >= 1`). Crédité au paiement, jamais deux fois par commande (`TokenTransaction.grantKey = plan:<orderId>`).
- Seules les annonces `VERIFIED` se boostent ; non-propriétaire → 404 `LISTING_NOT_FOUND`.
- Codes d'erreur stables : `LISTING_NOT_BOOSTABLE` (409), `NO_INCLUDED_BOOST` (409), `BOOST_HORIZON` (409, fin > maintenant + 60 jours), `INSUFFICIENT_TOKENS` (422, même corps que `unlock-contact`), `VALIDATION_FAILED` (400). Messages en français.
- Épinglage : au plus `min(3, limit)` annonces, **page 1 uniquement**, rotation par heure (`floor(now / 3 600 000)`), respect de tous les filtres, `status = 'VERIFIED'` uniquement. Les épinglées sont exclues de la requête normale ; `total` inchangé.
- Frontend `api()` ne réessaie jamais un POST. `api.ts`, `auth.ts`, `middleware/*`, `webhook/handler.ts` ne sont pas modifiés.
- Chaque Route Handler garde `export const runtime = 'nodejs'`, `verifyCsrf(req)` puis `requireAuth()` en tête pour une mutation.
- Entiers uniquement pour les montants. Pas de remboursement de boost.
- Avant chaque commit : lint-staged + `pnpm typecheck` (≈ 2-4 min : timeout long ou arrière-plan). Si `tsc` échoue sur `.next/dev/types/routes.d.ts` (fichier généré par `pnpm dev`, ignoré par git), supprimer les lignes en trop en fin de fichier. Ne rien éditer pendant un commit en cours (lint-staged met les fichiers de côté).
- Messages de commit terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Ne pas pousser, ne pas déployer.
- Les commandes se lancent depuis `frontend/` sauf mention contraire. Travailler sur la branche `feat/monetisation-1b` (créée depuis `main`), sans worktree.

## Review Focus

1. Webhook rejoué : un seul crédit de jetons **et** de boosts, y compris pour un plan à 0 jeton mais avec boosts (Task 5).
2. Pagination avec épinglage : aucune annonce dupliquée ni perdue entre la page 1 et la page 2 ; `total` identique avec ou sans boosts (Tasks 3-4).
3. Annonce boostée mais plus `VERIFIED` (masquée, refusée, vendue) : jamais épinglée (Task 4).
4. `limit` < 3 (ex. `limit=2`) : jamais plus d'épinglées que `limit`, `take` jamais négatif (Task 3).
5. Deux achats simultanés avec un seul boost inclus : un seul réussit (Task 6).
6. Prolongation : boost encore actif → la fin s'ajoute à `boostedUntil` ; boost expiré → repart de maintenant ; plafond 60 jours (Task 6).
7. Ligne `PricingConfig` stockée avant cette phase (sans bloc `boost`) : valide, défauts 8/14/24 (Task 1).

## File Structure

| Fichier | Rôle |
|---|---|
| `src/lib/pricing.ts` | `BOOST_DAYS`, bloc `boost` (schéma + défauts), `boostTokenCost`, libellé de carte |
| `src/components/admin/PricingEditor.tsx` | Édition admin des 3 prix de boost |
| `prisma/schema.prisma` + `prisma/migrations/20261014120000_listing_boosts/` | `Boost`, `Listing.boostedUntil`, `Subscription.boostCredits` |
| `src/lib/server/public/boosted.ts` (nouveau) | Choix des épinglées + fenêtre de pagination |
| `src/lib/server/public/listings.ts`, `landing.ts` | Épinglage + champ `boosted` |
| `src/lib/server/payments/fulfill-order.ts` | `grantPlanPerks` (jetons + boosts) |
| `src/app/api/listings/[id]/boost/route.ts` (nouveau) | Achat d'un boost |
| `src/app/api/subscriptions/me/route.ts`, `src/app/api/listings/route.ts`, `src/lib/listings.ts` | Exposent `boostCredits` / `boostedUntil` |
| `src/components/listings/BoostModal.tsx` (nouveau), `src/app/listings/page.tsx` | Bouton et modale « Booster » |
| `src/components/public/ListingCard.tsx`, `src/app/annonces/AnnoncesClient.tsx`, `src/app/FeaturedListingsSection.tsx` | Badge « Sponsorisé » |
| `src/components/settings/SubscriptionCard.tsx` | Ligne « N boost(s) de 7 jours inclus » |

---

### Task 1 : Tarification des boosts (schéma, défauts, helper, éditeur admin)

**Files :**
- Modify: `src/lib/pricing.ts`
- Modify: `src/components/admin/PricingEditor.tsx`
- Test: `src/lib/pricing.test.ts`

**Interfaces :**
- Produces (Tasks 6 et 8) :
  - `BOOST_DAYS = [7, 15, 30] as const` et `type BoostDays = (typeof BOOST_DAYS)[number]`
  - `PricingData['boost']: { tokens7: number; tokens15: number; tokens30: number }`
  - `boostTokenCost(p: PricingData, days: BoostDays): number`
  - `boostsIncludedLabel(n: number): string | null`

- [ ] **Step 1 : Tests qui échouent**

Ajouter `BOOST_DAYS, boostTokenCost, boostsIncludedLabel` à l'import de `./pricing` dans `src/lib/pricing.test.ts`, puis à la fin du fichier :

```ts
describe('boost pricing', () => {
  it('defaults to 8 / 14 / 24 tokens', () => {
    expect(BOOST_DAYS).toEqual([7, 15, 30]);
    expect(boostTokenCost(DEFAULT_PRICING, 7)).toBe(8);
    expect(boostTokenCost(DEFAULT_PRICING, 15)).toBe(14);
    expect(boostTokenCost(DEFAULT_PRICING, 30)).toBe(24);
  });

  it('keeps a row stored before boosts existed valid and fills the defaults', () => {
    const legacy = {
      plans: DEFAULT_PRICING.plans,
      token: DEFAULT_PRICING.token,
    };
    const parsed = PricingDataSchema.parse(legacy);
    expect(parsed.boost).toEqual({ tokens7: 8, tokens15: 14, tokens30: 24 });
  });

  it('reads edited prices and rejects non-positive ones', () => {
    const edited = structuredClone(DEFAULT_PRICING);
    edited.boost.tokens7 = 10;
    expect(boostTokenCost(PricingDataSchema.parse(edited), 7)).toBe(10);
    edited.boost.tokens15 = 0;
    expect(PricingDataSchema.safeParse(edited).success).toBe(false);
  });

  it('labels the included boosts, hiding zero', () => {
    expect(boostsIncludedLabel(0)).toBeNull();
    expect(boostsIncludedLabel(1)).toBe('1 boost de 7 jours inclus');
    expect(boostsIncludedLabel(4)).toBe('4 boosts de 7 jours inclus');
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/pricing.test.ts`
Expected: FAIL (`boostTokenCost is not a function`).

- [ ] **Step 3 : Implémenter**

Dans `src/lib/pricing.ts`, après la ligne `const pack = z.object({...});` ajouter :

```ts
export const BOOST_DAYS = [7, 15, 30] as const;
export type BoostDays = (typeof BOOST_DAYS)[number];

const DEFAULT_BOOST = { tokens7: 8, tokens15: 14, tokens30: 24 };
const boostPrices = z.object({
  tokens7: z.number().int().positive().max(100_000),
  tokens15: z.number().int().positive().max(100_000),
  tokens30: z.number().int().positive().max(100_000),
});
```

Dans `PricingDataSchema`, après le bloc `token: z.object({...}),` ajouter la clé :

```ts
  boost: boostPrices.default(DEFAULT_BOOST),
```

Dans `DEFAULT_PRICING`, après le bloc `token: {...},` ajouter `boost: { ...DEFAULT_BOOST },`. Ajouter à côté des autres helpers :

```ts
export function boostTokenCost(p: PricingData, days: BoostDays): number {
  return days === 7 ? p.boost.tokens7 : days === 15 ? p.boost.tokens15 : p.boost.tokens30;
}

export function boostsIncludedLabel(n: number): string | null {
  if (n <= 0) return null;
  return `${n} boost${n > 1 ? 's' : ''} de 7 jours inclus`;
}
```

Dans `src/components/admin/PricingEditor.tsx`, ajouter un setter à côté de `setPack` :

```tsx
  function setBoost(key: 'tokens7' | 'tokens15' | 'tokens30', value: number) {
    setDraft((d) => ({ ...d, boost: { ...d.boost, [key]: value } }));
  }
```

et, juste après le `<div className="max-w-xs">…Prix de base du jeton…</div>` (avant le tableau des packs), ajouter :

```tsx
      <div className="grid max-w-xl grid-cols-3 gap-3">
        {(
          [
            ['tokens7', 'Boost 7 jours (jetons)'],
            ['tokens15', 'Boost 15 jours (jetons)'],
            ['tokens30', 'Boost 30 jours (jetons)'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-[12px] font-semibold text-neutral-900">{label}</label>
            <NumberInput label={label} value={draft.boost[key]} onChange={(n) => setBoost(key, n)} />
          </div>
        ))}
      </div>
```

- [ ] **Step 4 : Vérifier**

Run: `pnpm exec prettier --write src/lib/pricing.ts src/lib/pricing.test.ts src/components/admin/PricingEditor.tsx && pnpm exec vitest run src/lib/pricing.test.ts` → PASS.
Run: `pnpm exec eslint src/lib src/components/admin && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre (si un littéral `PricingData` dans un test est signalé, y ajouter `boost: { tokens7: 8, tokens15: 14, tokens30: 24 }`).

- [ ] **Step 5 : Commit**

```bash
git switch -c feat/monetisation-1b
git add src/lib src/components/admin
git commit -m "feat(pricing): boost token prices per duration, editable in admin"
```

---

### Task 2 : Schéma et migration (Boost, boostedUntil, boostCredits)

**Files :**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261014120000_listing_boosts/migration.sql`

**Interfaces :**
- Produces (Tasks 3-8) : `prisma.boost` (champs `id, listingId, userId, startsAt, endsAt, days, source, tokensSpent, createdAt`), `Listing.boostedUntil: Date | null`, `Subscription.boostCredits: number`.

(Pas de test unitaire ; vérification par `prisma validate`, `migrate deploy`, `generate` et `tsc`.)

- [ ] **Step 1 : Modèle**

Dans `prisma/schema.prisma`, ajouter le modèle (après `model Listing { … }`) :

```prisma
// One row per purchased boost (history/audit). The live ranking reads the
// denormalised Listing.boostedUntil; a boost simply stops mattering once it
// is in the past or the listing leaves VERIFIED.
model Boost {
  id          String   @id @default(cuid())
  listingId   String
  listing     Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  startsAt    DateTime
  endsAt      DateTime
  days        Int // 7 | 15 | 30
  source      String // TOKENS | INCLUDED
  tokensSpent Int      @default(0)
  createdAt   DateTime @default(now())

  @@index([listingId, endsAt])
  @@index([userId, createdAt])
}
```

Dans `model Listing`, après `views     ListingView[]` ajouter `boosts    Boost[]`, après `viewCount Int @default(0)` ajouter `boostedUntil DateTime? // end of the latest boost; ranking pins the listing while in the future`, et après `@@index([status, createdAt])` ajouter `@@index([status, boostedUntil])`. Dans `model User`, ajouter une relation `boosts Boost[]` (à côté des autres relations, par exemple près de `tokenWallet`). Dans `model Subscription`, après la ligne `canceledAt` ajouter `boostCredits     Int       @default(0) // included 7-day boosts left, credited on payment`.

- [ ] **Step 2 : Migration SQL**

Créer `prisma/migrations/20261014120000_listing_boosts/migration.sql` :

```sql
-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "boostedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "boostCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Boost" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "tokensSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Boost_listingId_endsAt_idx" ON "Boost"("listingId", "endsAt");

-- CreateIndex
CREATE INDEX "Boost_userId_createdAt_idx" ON "Boost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_boostedUntil_idx" ON "Listing"("status", "boostedUntil");

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3 : Valider, appliquer en local, régénérer**

Run: `pnpm exec prisma validate` → « The schema is valid ».
Run: `pnpm exec prisma migrate deploy && pnpm exec prisma generate` (base locale `localhost:5432`, voir `.env.local`) → « Applying migration `20261014120000_listing_boosts` » puis « Generated Prisma Client ».
Run: `pnpm exec prisma migrate status` → « Database schema is up to date! ».
Run: `pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 4 : Commit**

```bash
git add prisma
git commit -m "feat(db): add Boost model, Listing.boostedUntil and Subscription.boostCredits"
```

---

### Task 3 : Helper d'épinglage (`boosted.ts`)

**Files :**
- Create: `src/lib/server/public/boosted.ts`
- Create: `src/lib/server/public/boosted.test.ts`

**Interfaces :**
- Consumes: `prisma.listing` (Task 2).
- Produces (Task 4) :
  - `MAX_PINNED = 3`
  - `selectPinned(candidateIds: string[], now: Date, max: number): string[]`
  - `pageWindow(page: number, limit: number, pinnedCount: number): { skip: number; take: number }`
  - `pickPinnedIds(where: Prisma.ListingWhereInput, now: Date, limit: number): Promise<string[]>`

- [ ] **Step 1 : Tests qui échouent**

Créer `src/lib/server/public/boosted.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { MAX_PINNED, pageWindow, pickPinnedIds, selectPinned } from './boosted';

const at = (iso: string) => new Date(iso);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`);

describe('selectPinned', () => {
  it('returns every candidate when there are at most `max`', () => {
    expect([...selectPinned(ids(2), at('2026-11-01T10:00:00Z'), 3)].sort()).toEqual(['l1', 'l2']);
    expect(selectPinned([], at('2026-11-01T10:00:00Z'), 3)).toEqual([]);
  });

  it('never returns more than `max` (and never more than the candidates)', () => {
    expect(selectPinned(ids(10), at('2026-11-01T10:00:00Z'), MAX_PINNED)).toHaveLength(3);
    expect(selectPinned(ids(10), at('2026-11-01T10:00:00Z'), 2)).toHaveLength(2);
    expect(selectPinned(ids(10), at('2026-11-01T10:00:00Z'), 0)).toEqual([]);
  });

  it('is stable inside the same hour, whatever the candidate order', () => {
    const a = selectPinned(ids(10), at('2026-11-01T10:05:00Z'), 3);
    const b = selectPinned([...ids(10)].reverse(), at('2026-11-01T10:55:00Z'), 3);
    expect(b).toEqual(a);
  });

  it('rotates when the hour changes', () => {
    const picks = new Set<string>();
    for (let h = 0; h < 12; h++) {
      picks.add(selectPinned(ids(10), at(`2026-11-01T${String(h).padStart(2, '0')}:10:00Z`), 3).join());
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('pageWindow', () => {
  it('page 1 leaves room for the pinned listings', () => {
    expect(pageWindow(1, 18, 3)).toEqual({ skip: 0, take: 15 });
    expect(pageWindow(1, 18, 0)).toEqual({ skip: 0, take: 18 });
  });

  it('later pages are shifted by the pinned count so nothing is lost or duplicated', () => {
    // total slots before page 2 = 18, of which 3 pinned came from outside the rest list
    expect(pageWindow(2, 18, 3)).toEqual({ skip: 15, take: 18 });
    expect(pageWindow(3, 18, 3)).toEqual({ skip: 33, take: 18 });
    expect(pageWindow(2, 18, 0)).toEqual({ skip: 18, take: 18 });
  });

  it('never yields a negative take or skip, even with a tiny limit', () => {
    expect(pageWindow(1, 2, 2)).toEqual({ skip: 0, take: 0 });
    expect(pageWindow(2, 2, 2)).toEqual({ skip: 0, take: 2 });
  });
});

describe('pickPinnedIds', () => {
  it('only looks at listings boosted in the future and keeps the caller filters', async () => {
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }] as never);
    const now = at('2026-11-01T10:00:00Z');
    const out = await pickPinnedIds({ status: 'VERIFIED', city: 'Cotonou' }, now, 18);
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'VERIFIED', city: 'Cotonou', boostedUntil: { gt: now } },
        select: { id: true },
      }),
    );
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  it('caps at the page limit when it is smaller than 3', async () => {
    prismaMock.listing.findMany.mockResolvedValue(ids(5).map((id) => ({ id })) as never);
    expect(await pickPinnedIds({ status: 'VERIFIED' }, at('2026-11-01T10:00:00Z'), 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/server/public/boosted.test.ts`
Expected: FAIL (`Cannot find module './boosted'`).

- [ ] **Step 3 : Implémenter**

Créer `src/lib/server/public/boosted.ts` :

```ts
// Pinning of boosted listings on the public result pages. Boosted listings
// matching the active filters are pinned at the top of PAGE 1 only (a per-page
// cap would break pagination). At most MAX_PINNED are shown; when more are
// boosted they rotate every hour, deterministically, so the page is stable
// (and cacheable) inside the hour and no advertiser is always last.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';

export const MAX_PINNED = 3;
const CANDIDATE_LIMIT = 200;
const HOUR_MS = 3_600_000;

// FNV-1a 32-bit — tiny, deterministic, good enough to shuffle.
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function selectPinned(candidateIds: string[], now: Date, max: number): string[] {
  if (max <= 0 || candidateIds.length === 0) return [];
  const bucket = Math.floor(now.getTime() / HOUR_MS);
  return [...candidateIds]
    .map((id) => ({ id, h: hash(`${id}:${bucket}`) }))
    .sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : 1))
    .slice(0, max)
    .map((x) => x.id);
}

/**
 * Window over the non-pinned list. Page 1 shows `pinned` listings plus the
 * first `limit - pinned` others; page n shows the next `limit` others, shifted
 * by the `pinned` slots page 1 gave away.
 */
export function pageWindow(
  page: number,
  limit: number,
  pinnedCount: number,
): { skip: number; take: number } {
  if (page <= 1) return { skip: 0, take: Math.max(0, limit - pinnedCount) };
  return { skip: Math.max(0, (page - 1) * limit - pinnedCount), take: limit };
}

export async function pickPinnedIds(
  where: Prisma.ListingWhereInput,
  now: Date,
  limit: number,
): Promise<string[]> {
  const max = Math.min(MAX_PINNED, limit);
  if (max <= 0) return [];
  const rows = await prisma.listing.findMany({
    where: { ...where, boostedUntil: { gt: now } },
    select: { id: true },
    take: CANDIDATE_LIMIT,
  });
  return selectPinned(
    rows.map((r) => r.id),
    now,
    max,
  );
}
```

- [ ] **Step 4 : Tests, format, lint**

Run: `pnpm exec prettier --write src/lib/server/public && pnpm exec vitest run src/lib/server/public/boosted.test.ts` → PASS.
Run: `pnpm exec eslint src/lib/server/public && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/server/public/boosted.ts src/lib/server/public/boosted.test.ts
git commit -m "feat(public): pinned-boost selection with hourly rotation and page window"
```

---

### Task 4 : Épinglage dans `/annonces`, l'accueil et les pages ville + champ `boosted`

**Files :**
- Modify: `src/lib/server/public/listings.ts`
- Modify: `src/lib/server/public/landing.ts`
- Modify: `src/app/api/public/listings/route.test.ts` (neutraliser l'épinglage dans les tests existants)
- Create: `src/lib/server/public/listings.pinned.test.ts`

**Interfaces :**
- Consumes: `pickPinnedIds`, `pageWindow` (Task 3).
- Produces (Task 8) : `PublicListingItem.boosted: boolean` (vrai uniquement pour les annonces épinglées).

- [ ] **Step 1 : Test qui échoue**

Créer `src/lib/server/public/listings.pinned.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/public/agent-verification', () => ({
  verifiedAgentIds: vi.fn().mockResolvedValue(new Set<string>()),
}));

import { searchPublicListings, type ListingSearch } from './listings';

const row = (id: string) => ({
  id,
  title: `Annonce ${id}`,
  city: 'Cotonou',
  country: 'Bénin',
  propertyType: 'VILLA',
  transactionType: 'VENTE',
  price: 1_000_000,
  currency: 'XOF',
  bedrooms: null,
  bathrooms: null,
  surfaceM2: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  photos: [],
  _count: { photos: 0 },
  user: { id: 'u1', name: 'Agent', avatarUrl: null },
});

const search = (over: Partial<ListingSearch> = {}): ListingSearch => ({
  page: 1,
  limit: 18,
  sort: 'recent',
  ...over,
});

// Routes the three kinds of findMany by what they ask for.
function mockListings(opts: { boosted: string[]; rest: string[] }) {
  prismaMock.listing.findMany.mockImplementation((async (args: {
    where: { boostedUntil?: unknown; id?: { in?: string[]; notIn?: string[] } };
  }) => {
    if (args.where.boostedUntil) return opts.boosted.map((id) => ({ id }));
    if (args.where.id?.in) return args.where.id.in.map(row);
    return opts.rest.filter((id) => !(args.where.id?.notIn ?? []).includes(id)).map(row);
  }) as never);
  prismaMock.listing.count.mockResolvedValue(opts.rest.length as never);
  prismaMock.listing.groupBy.mockResolvedValue([] as never);
}

beforeEach(() => {
  mockListings({ boosted: [], rest: [] });
});

describe('searchPublicListings — pinned boosts', () => {
  it('puts the pinned listings first on page 1, flagged boosted, and excludes them from the rest', async () => {
    mockListings({ boosted: ['b1', 'b2'], rest: ['r1', 'r2', 'r3', 'b1', 'b2'] });
    const res = await searchPublicListings(search());
    const ids = res.items.map((i) => i.id);
    expect(ids.slice(0, 2).sort()).toEqual(['b1', 'b2']);
    expect(res.items.slice(0, 2).every((i) => i.boosted)).toBe(true);
    expect(res.items.slice(2).every((i) => !i.boosted)).toBe(true);
    expect(ids.filter((id) => id === 'b1')).toHaveLength(1);
    expect(ids).toContain('r1');
  });

  it('keeps the total untouched and shrinks the page-1 take by the pinned count', async () => {
    mockListings({ boosted: ['b1', 'b2'], rest: ['r1', 'r2'] });
    const res = await searchPublicListings(search());
    expect(res.total).toBe(2);
    const restCall = prismaMock.listing.findMany.mock.calls
      .map((c) => c[0] as { where: { id?: { notIn?: string[] } }; skip?: number; take?: number })
      .find((a) => a.where.id?.notIn);
    expect(restCall?.take).toBe(16);
    expect(restCall?.skip).toBe(0);
  });

  it('page 2 shows no pinned listing but still excludes them and shifts the skip', async () => {
    mockListings({ boosted: ['b1', 'b2'], rest: ['r1', 'r2', 'b1', 'b2'] });
    const res = await searchPublicListings(search({ page: 2 }));
    expect(res.items.some((i) => i.boosted)).toBe(false);
    const restCall = prismaMock.listing.findMany.mock.calls
      .map((c) => c[0] as { where: { id?: { notIn?: string[] } }; skip?: number; take?: number })
      .find((a) => a.where.id?.notIn);
    expect(restCall?.where.id?.notIn?.sort()).toEqual(['b1', 'b2']);
    expect(restCall?.skip).toBe(16);
    expect(restCall?.take).toBe(18);
  });

  it('never pins more than 3, nor more than the page limit', async () => {
    mockListings({ boosted: ['b1', 'b2', 'b3', 'b4', 'b5'], rest: ['r1'] });
    expect((await searchPublicListings(search())).items.filter((i) => i.boosted)).toHaveLength(3);
    expect(
      (await searchPublicListings(search({ limit: 2 }))).items.filter((i) => i.boosted),
    ).toHaveLength(2);
  });

  it('does nothing special when no listing is boosted', async () => {
    mockListings({ boosted: [], rest: ['r1', 'r2'] });
    const res = await searchPublicListings(search());
    expect(res.items.map((i) => i.id)).toEqual(['r1', 'r2']);
    expect(res.items.every((i) => !i.boosted)).toBe(true);
  });

  it('only looks for boosted listings among VERIFIED ones matching the filters', async () => {
    mockListings({ boosted: [], rest: [] });
    await searchPublicListings(search({ city: 'Cotonou', propertyType: 'VILLA' }));
    const candidateCall = prismaMock.listing.findMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown> })
      .find((a) => a.where.boostedUntil);
    expect(candidateCall?.where).toMatchObject({
      status: 'VERIFIED',
      propertyType: 'VILLA',
      city: { contains: 'Cotonou', mode: 'insensitive' },
    });
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/server/public/listings.pinned.test.ts`
Expected: FAIL (`items[…].boosted` est `undefined`, aucun épinglage).

- [ ] **Step 3 : Implémenter `listings.ts`**

Dans `src/lib/server/public/listings.ts` : ajouter `import { pageWindow, pickPinnedIds } from '@/lib/server/public/boosted';` ; ajouter à l'interface `PublicListingItem` (après `photoCount`) :

```ts
  /** Pinned at the top of page 1 because the owner boosted the listing. */
  boosted: boolean;
```

Remplacer tout ce qui va de `const baseWhere = buildWhere();` jusqu'à la fin de `const items = rows.map(...)` par :

```ts
  const baseWhere = buildWhere();
  const now = new Date();
  const pinnedIds = await pickPinnedIds(baseWhere, now, limit);
  const win = pageWindow(page, limit, pinnedIds.length);
  const restWhere: Prisma.ListingWhereInput =
    pinnedIds.length > 0 ? { ...baseWhere, id: { notIn: pinnedIds } } : baseWhere;

  const [rows, pinnedRows, total, countryFacet, propertyTypeFacet, transactionTypeFacet] =
    await Promise.all([
      prisma.listing.findMany({
        where: restWhere,
        orderBy: SORT_ORDER_BY[q.sort],
        skip: win.skip,
        take: win.take,
        select: LISTING_SELECT,
      }),
      // Pinned listings only appear on page 1; later pages just exclude them.
      page === 1 && pinnedIds.length > 0
        ? prisma.listing.findMany({
            where: { id: { in: pinnedIds } },
            select: LISTING_SELECT,
          })
        : Promise.resolve([]),
      prisma.listing.count({ where: baseWhere }),
      prisma.listing.groupBy({
        by: ['country'],
        where: buildWhere('country'),
        _count: { _all: true },
        _min: { price: true },
      }),
      prisma.listing.groupBy({
        by: ['propertyType'],
        where: buildWhere('propertyType'),
        _count: { _all: true },
      }),
      prisma.listing.groupBy({
        by: ['transactionType'],
        where: buildWhere('transactionType'),
        _count: { _all: true },
      }),
    ]);

  const pinnedOrdered = pinnedIds
    .map((id) => pinnedRows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  const verifiedAgents = await verifiedAgentIds(
    [...pinnedOrdered, ...rows].map((r) => r.user.id),
  );

  const toItem = (r: (typeof rows)[number], boosted: boolean): PublicListingItem => ({
    id: r.id,
    title: r.title,
    city: r.city,
    country: r.country,
    propertyType: r.propertyType,
    transactionType: r.transactionType,
    price: r.price,
    currency: r.currency,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    surfaceM2: r.surfaceM2,
    createdAt: new Date(r.createdAt).toISOString(),
    primaryPhotoUrl: r.photos[0]?.url ?? null,
    photoCount: r._count.photos,
    boosted,
    agent: {
      name: r.user.name,
      avatarUrl: r.user.avatarUrl,
      seed: r.user.id,
      verified: verifiedAgents.has(r.user.id),
    },
  });
  const items = [...pinnedOrdered.map((r) => toItem(r, true)), ...rows.map((r) => toItem(r, false))];
```

(le reste de la fonction — `toFacet`, `countries`, objet retourné — est inchangé.)

- [ ] **Step 4 : Implémenter `landing.ts`**

Dans `src/lib/server/public/landing.ts` : ajouter `import { pageWindow, pickPinnedIds } from '@/lib/server/public/boosted';`. Dans `loadLanding`, juste après `const w = where(f);` ajouter :

```ts
  const pinnedIds = await pickPinnedIds(w, new Date(), LANDING_PAGE_SIZE);
  const win = pageWindow(page, LANDING_PAGE_SIZE, pinnedIds.length);
  const restWhere: Prisma.ListingWhereInput =
    pinnedIds.length > 0 ? { ...w, id: { notIn: pinnedIds } } : w;
```

et transformer le `Promise.all` : la première requête devient

```ts
    prisma.listing.findMany({
      where: restWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: win.skip,
      take: win.take,
      select: LANDING_SELECT,
    }),
    page === 1 && pinnedIds.length > 0
      ? prisma.listing.findMany({ where: { id: { in: pinnedIds } }, select: LANDING_SELECT })
      : Promise.resolve([]),
```

en extrayant l'objet `select: { id: true, title: true, … user: { select: {…} } }` existant dans une constante de module `const LANDING_SELECT = { …le même objet… } as const;` (déclarée au-dessus de `loadLanding`), et en ajoutant `pinnedRows` à la déstructuration : `const [rows, pinnedRows, total, cities, types, transactions] = await Promise.all([...])`. Le mapping devient :

```ts
  const pinnedOrdered = pinnedIds
    .map((id) => pinnedRows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  const verifiedAgents = await verifiedAgentIds(
    [...pinnedOrdered, ...rows].map((r) => r.user.id),
  );

  const toItem = (r: (typeof rows)[number], boosted: boolean): PublicListingItem => ({
    id: r.id,
    title: r.title,
    city: r.city,
    country: r.country,
    propertyType: r.propertyType,
    transactionType: r.transactionType,
    price: r.price,
    currency: r.currency,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    surfaceM2: r.surfaceM2,
    createdAt: r.createdAt.toISOString(),
    primaryPhotoUrl: r.photos[0]?.url ?? null,
    photoCount: r._count.photos,
    boosted,
    agent: {
      name: r.user.name,
      avatarUrl: r.user.avatarUrl,
      seed: r.user.id,
      verified: verifiedAgents.has(r.user.id),
    },
  });
  const items: PublicListingItem[] = [
    ...pinnedOrdered.map((r) => toItem(r, true)),
    ...rows.map((r) => toItem(r, false)),
  ];
```

- [ ] **Step 5 : Neutraliser l'épinglage dans les tests existants**

Dans `src/app/api/public/listings/route.test.ts`, après les `vi.mock` existants (avant les imports du module testé) ajouter :

```ts
vi.mock('@/lib/server/public/boosted', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/public/boosted')>()),
  pickPinnedIds: vi.fn().mockResolvedValue([]),
}));
```

Run: `pnpm exec vitest run src/app/api/public src/lib/server/public` puis `pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"`. Si un autre test (page d'accueil, landing, `PublicListingItem` en fixture) échoue ou ne compile plus, appliquer la même neutralisation `pickPinnedIds → []` et ajouter `boosted: false` aux fixtures typées `PublicListingItem`.
Expected: PASS, tsc propre.

- [ ] **Step 6 : Format, lint, commit**

Run: `pnpm exec prettier --write src/lib/server/public src/app/api/public && pnpm exec eslint src/lib/server/public src/app/api/public`

```bash
git add src/lib/server/public src/app/api/public
git commit -m "feat(public): pin up to 3 boosted listings on page 1 of listings and landing pages"
```

---

### Task 5 : Crédit des boosts inclus avec les jetons (`grantPlanPerks`)

**Files :**
- Modify: `src/lib/server/payments/fulfill-order.ts`
- Test: `src/lib/server/payments/fulfill-order.test.ts`

**Interfaces :**
- Consumes: `planMonthlyTokens`, `planIncludedBoosts` (`@/lib/pricing`), `Subscription.boostCredits` (Task 2).
- Produces: à chaque paiement d'abonnement dont le prix est gelé, si le plan accorde jetons ou boosts : une ligne `BONUS` `grantKey = plan:<orderId>` et `Subscription.boostCredits += includedBoosts`.

- [ ] **Step 1 : Tests qui échouent**

Dans `fulfill-order.test.ts` : ajouter `const subscriptionUpdate = vi.fn();`, la clé `update: subscriptionUpdate` dans `tx.subscription` (à côté de `findUnique`/`upsert`), et `subscriptionUpdate.mockReset();` dans le `beforeEach` global. Dans le `describe('monthly token grant', …)` existant : **remplacer** le test `'grants nothing when the live pricing sets 0 monthly tokens'` par les deux tests ci-dessous, et ajouter les autres :

```ts
  it('still grants (and keys) the boosts when the plan has 0 monthly tokens', async () => {
    vi.mocked(readStoredPricing).mockResolvedValue({
      ...DEFAULT_PRICING,
      plans: {
        ...DEFAULT_PRICING.plans,
        PRO_AGENT: { ...DEFAULT_PRICING.plans.PRO_AGENT, monthlyTokens: 0 },
      },
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(tokenTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'BONUS', amount: 0, grantKey: 'plan:o1' }),
    });
    expect(subscriptionUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { boostCredits: { increment: 1 } },
    });
  });

  it('writes nothing when the plan grants neither tokens nor boosts', async () => {
    vi.mocked(readStoredPricing).mockResolvedValue({
      ...DEFAULT_PRICING,
      plans: {
        ...DEFAULT_PRICING.plans,
        PRO_AGENT: { ...DEFAULT_PRICING.plans.PRO_AGENT, monthlyTokens: 0, includedBoosts: 0 },
      },
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(tokenTransactionCreate).not.toHaveBeenCalled();
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it('credits the included boosts of the plan (Pro 1, Agence 4) with the tokens', async () => {
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(subscriptionUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { boostCredits: { increment: 1 } },
    });
    subscriptionUpdate.mockReset();
    tokenTransactionCreate.mockReset();
    await fulfillPaidOrder(tx, subOrder('AGENCY_PREMIUM'));
    expect(subscriptionUpdate).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { boostCredits: { increment: 4 } },
    });
  });

  it('does not credit boosts twice when the order was already granted', async () => {
    tokenTransactionFindUnique.mockResolvedValue({ id: 't1' });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(subscriptionUpdate).not.toHaveBeenCalled();
    expect(tokenTransactionCreate).not.toHaveBeenCalled();
  });

  it('grants no boost without the price freeze marker', async () => {
    await fulfillPaidOrder(tx, {
      ...subOrder('PRO_AGENT'),
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/server/payments/fulfill-order.test.ts`
Expected: FAIL (`subscriptionUpdate` jamais appelé ; le test « 0 tokens » attend une ligne amount 0).

- [ ] **Step 3 : Implémenter**

Dans `fulfill-order.ts`, importer `planIncludedBoosts` (à côté de `planMonthlyTokens`), et remplacer **toute** la fonction `grantMonthlyTokens` par :

```ts
// Perks included in the plan (monthly tokens + boosts). One grant per paid
// period: the key is the order, so a replayed delivery cannot credit twice (the
// findUnique guards the transaction; the unique column is the backstop). A
// unique violation inside this Serializable tx would abort it, hence the
// read-first. The BONUS row is written whenever the plan grants anything, even
// at 0 tokens, so it also keys the boost credit.
async function grantPlanPerks(
  tx: PrismaTransactionClient,
  userId: string,
  planKey: PlanKey,
  orderId: string,
  pricing: PricingData,
): Promise<void> {
  const tokens = planMonthlyTokens(pricing, planKey);
  const boosts = planIncludedBoosts(pricing, planKey);
  if (tokens <= 0 && boosts <= 0) return;
  const grantKey = `plan:${orderId}`;
  const done = await tx.tokenTransaction.findUnique({ where: { grantKey }, select: { id: true } });
  if (done) return;
  const wallet = await tx.tokenWallet.upsert({
    where: { userId },
    create: { userId, balance: tokens },
    update: { balance: { increment: tokens } },
  });
  const label = PLAN_CATALOG[planKey].label;
  const description =
    tokens > 0 && boosts > 0
      ? `Jetons et boosts offerts — plan ${label}`
      : tokens > 0
        ? `Jetons offerts — plan ${label}`
        : `Boosts offerts — plan ${label}`;
  await tx.tokenTransaction.create({
    data: {
      userId,
      type: 'BONUS',
      amount: tokens,
      balanceAfter: wallet.balance,
      description,
      grantKey,
    },
  });
  if (boosts > 0) {
    await tx.subscription.update({
      where: { userId },
      data: { boostCredits: { increment: boosts } },
    });
  }
}
```

et dans `grantSubscription` remplacer l'appel `await grantMonthlyTokens(tx, userId, planKey, orderId, pricing);` par `await grantPlanPerks(tx, userId, planKey, orderId, pricing);`.

- [ ] **Step 4 : Tests, typecheck, lint**

Run: `pnpm exec prettier --write src/lib/server/payments && pnpm exec vitest run src/lib/server/payments src/app/api/webhooks` → PASS.
Run: `pnpm exec eslint src/lib/server/payments && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/server/payments
git commit -m "feat(subscriptions): credit the plan's included boosts with the monthly tokens"
```

---

### Task 6 : Route d'achat `POST /api/listings/[id]/boost`

**Files :**
- Create: `src/app/api/listings/[id]/boost/route.ts`
- Create: `src/app/api/listings/[id]/boost/route.test.ts`

**Interfaces :**
- Consumes: `boostTokenCost`, `BOOST_DAYS` (Task 1) ; `prisma.boost`, `Listing.boostedUntil`, `Subscription.boostCredits` (Task 2) ; `getPricing` (`@/lib/server/pricing`) ; `InsufficientTokensError`, `assertBalanceNotNegative` (`@/lib/server/token-wallet`).
- Produces (Task 8) : `POST /api/listings/:id/boost` body `{ days: 7 | 15 | 30, useIncluded?: boolean }` → 201 `{ boost: { id, startsAt, endsAt, days, source, tokensSpent }, boostedUntil: string, tokenBalance: number, boostCredits: number }`.

- [ ] **Step 1 : Tests qui échouent**

Créer `src/app/api/listings/[id]/boost/route.test.ts` :

```ts
// BOOST-01 — POST /api/listings/[id]/boost tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const DAY = 86_400_000;

function makePost(payload: unknown, id = 'l1') {
  const req = new NextRequest(`http://test/api/listings/${id}/boost`, {
    method: 'POST',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

const listing = (over: Record<string, unknown> = {}) =>
  ({ userId: 'user-1', status: 'VERIFIED', boostedUntil: null, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
  prismaMock.listing.findUnique.mockResolvedValue(listing());
  prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 30 } as never);
  prismaMock.tokenWallet.update.mockResolvedValue({ balance: 22 } as never);
  prismaMock.tokenTransaction.create.mockResolvedValue({} as never);
  prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.subscription.findUnique.mockResolvedValue({ boostCredits: 0 } as never);
  prismaMock.boost.create.mockImplementation((async (a: { data: Record<string, unknown> }) => ({
    id: 'b1',
    ...a.data,
  })) as never);
  prismaMock.listing.update.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
});

describe('POST /api/listings/[id]/boost — guards', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'Missing token' }, { status: 401 }));
    const { req, ctx } = makePost({ days: 7 });
    expect((await POST(req, ctx)).status).toBe(401);
  });

  it('400 on an unknown duration', async () => {
    const { req, ctx } = makePost({ days: 10 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('400 when an included boost is requested for another duration than 7 days', async () => {
    const { req, ctx } = makePost({ days: 15, useIncluded: true });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it('404 for a listing the caller does not own', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(listing({ userId: 'someone-else' }));
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('LISTING_NOT_FOUND');
  });

  it.each(['PENDING', 'HIDDEN', 'REJECTED', 'SOLD', 'DRAFT'])(
    '409 LISTING_NOT_BOOSTABLE when the listing is %s',
    async (status) => {
      prismaMock.listing.findUnique.mockResolvedValue(listing({ status }));
      const { req, ctx } = makePost({ days: 7 });
      const res = await POST(req, ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('LISTING_NOT_BOOSTABLE');
      expect(prismaMock.boost.create).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/listings/[id]/boost — paying with tokens', () => {
  it('debits the live price, records a USAGE transaction and a TOKENS boost', async () => {
    const before = Date.now();
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 8 } } }),
    );
    expect(prismaMock.tokenTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', type: 'USAGE', amount: -8, balanceAfter: 22 }),
    });
    const created = prismaMock.boost.create.mock.calls[0]![0].data as {
      source: string;
      tokensSpent: number;
      days: number;
      endsAt: Date;
    };
    expect(created).toMatchObject({ source: 'TOKENS', tokensSpent: 8, days: 7 });
    expect(created.endsAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(prismaMock.listing.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { boostedUntil: created.endsAt },
    });
    const body = await res.json();
    expect(body).toMatchObject({ tokenBalance: 30, boostCredits: 0 });
  });

  it('charges 14 and 24 tokens for 15 and 30 days', async () => {
    const fifteen = makePost({ days: 15 });
    await POST(fifteen.req, fifteen.ctx);
    expect(prismaMock.tokenWallet.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 14 } } }),
    );
    const thirty = makePost({ days: 30 });
    await POST(thirty.req, thirty.ctx);
    expect(prismaMock.tokenWallet.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 24 } } }),
    );
  });

  it('422 INSUFFICIENT_TOKENS (same body shape as unlock-contact) when the balance is too low', async () => {
    prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 3 } as never);
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_TOKENS', required: 8, balance: 3 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('422 when a concurrent spend drains the wallet between the check and the debit', async () => {
    prismaMock.tokenWallet.update.mockResolvedValue({ balance: -2 } as never);
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('INSUFFICIENT_TOKENS');
  });

  it('422 when the user has no wallet at all', async () => {
    prismaMock.tokenWallet.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePost({ days: 7 });
    expect((await POST(req, ctx)).status).toBe(422);
  });
});

describe('POST /api/listings/[id]/boost — included boosts', () => {
  it('consumes one included boost atomically and spends no token', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ boostCredits: 0 } as never);
    const { req, ctx } = makePost({ days: 7, useIncluded: true });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', boostCredits: { gte: 1 } },
      data: { boostCredits: { decrement: 1 } },
    });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
    expect(prismaMock.boost.create.mock.calls[0]![0].data).toMatchObject({
      source: 'INCLUDED',
      tokensSpent: 0,
      days: 7,
    });
  });

  it('409 NO_INCLUDED_BOOST when none is left (the concurrent loser of the last credit)', async () => {
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const { req, ctx } = makePost({ days: 7, useIncluded: true });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NO_INCLUDED_BOOST');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
    expect(prismaMock.listing.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/listings/[id]/boost — extension and horizon', () => {
  it('adds the duration to a boost still running', async () => {
    const until = new Date(Date.now() + 10 * DAY);
    prismaMock.listing.findUnique.mockResolvedValue(listing({ boostedUntil: until }));
    const { req, ctx } = makePost({ days: 15 });
    expect((await POST(req, ctx)).status).toBe(201);
    const created = prismaMock.boost.create.mock.calls[0]![0].data as { startsAt: Date; endsAt: Date };
    expect(created.startsAt.getTime()).toBe(until.getTime());
    expect(created.endsAt.getTime()).toBe(until.getTime() + 15 * DAY);
  });

  it('starts from now when the previous boost already ended', async () => {
    const past = new Date(Date.now() - 3 * DAY);
    prismaMock.listing.findUnique.mockResolvedValue(listing({ boostedUntil: past }));
    const before = Date.now();
    const { req, ctx } = makePost({ days: 7 });
    await POST(req, ctx);
    const created = prismaMock.boost.create.mock.calls[0]![0].data as { startsAt: Date; endsAt: Date };
    expect(created.startsAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(created.endsAt.getTime() - created.startsAt.getTime()).toBe(7 * DAY);
  });

  it('409 BOOST_HORIZON beyond 60 days from now, without spending anything', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(
      listing({ boostedUntil: new Date(Date.now() + 50 * DAY) }),
    );
    const { req, ctx } = makePost({ days: 15 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('BOOST_HORIZON');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
  });

  it('allows exactly 60 days', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(
      listing({ boostedUntil: new Date(Date.now() + 30 * DAY - 1000) }),
    );
    const { req, ctx } = makePost({ days: 30 });
    expect((await POST(req, ctx)).status).toBe(201);
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run "src/app/api/listings/[id]/boost"`
Expected: FAIL (`Cannot find module './route'`).

- [ ] **Step 3 : Implémenter**

Créer `src/app/api/listings/[id]/boost/route.ts` :

```ts
// BOOST-01 — POST /api/listings/[id]/boost
//
// Boosts a VERIFIED listing for 7, 15 or 30 days: it is pinned at the top of
// page 1 of the public results (see lib/server/public/boosted.ts). Paid with
// tokens (priced in PricingConfig) or with one of the plan's included 7-day
// boosts. A boost on a still-running boost extends it, capped 60 days ahead.
// Everything runs in one transaction under a per-user advisory lock, modelled
// on POST /api/agents/[id]/unlock-contact.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { InsufficientTokensError, assertBalanceNotNegative } from '@/lib/server/token-wallet';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { boostTokenCost } from '@/lib/pricing';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HORIZON_MS = 60 * DAY_MS;

const Body = z.object({
  days: z.union([z.literal(7), z.literal(15), z.literal(30)]),
  useIncluded: z.boolean().optional(),
});

class BoostRefusal extends Error {
  constructor(
    readonly code: 'LISTING_NOT_BOOSTABLE' | 'NO_INCLUDED_BOOST' | 'BOOST_HORIZON',
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
    const userId = auth.user.sub;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Durée de boost invalide.' },
        { status: 400, headers },
      );
    }
    const { days } = parsed.data;
    const useIncluded = parsed.data.useIncluded === true;
    if (useIncluded && days !== 7) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Le boost inclus vaut 7 jours.' },
        { status: 400, headers },
      );
    }

    const { id } = await ctx.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { userId: true, status: true, boostedUntil: true },
    });
    if (!listing || listing.userId !== userId) {
      return NextResponse.json(
        { error: 'LISTING_NOT_FOUND', message: 'Annonce introuvable.' },
        { status: 404, headers },
      );
    }
    if (listing.status !== 'VERIFIED') {
      return NextResponse.json(
        {
          error: 'LISTING_NOT_BOOSTABLE',
          message: 'Seule une annonce vérifiée peut être boostée.',
        },
        { status: 409, headers },
      );
    }

    const cost = boostTokenCost(await getPricing(), days);
    if (!useIncluded) {
      const wallet = await prisma.tokenWallet.findUnique({
        where: { userId },
        select: { balance: true },
      });
      if (!wallet || wallet.balance < cost) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Pas assez de jetons pour ce boost.',
            required: cost,
            balance: wallet?.balance ?? 0,
          },
          { status: 422, headers },
        );
      }
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `boost:${userId}`);

        // Re-read under the lock: the listing may have changed since the check above.
        const fresh = await tx.listing.findUnique({
          where: { id },
          select: { status: true, boostedUntil: true },
        });
        if (!fresh || fresh.status !== 'VERIFIED') {
          throw new BoostRefusal(
            'LISTING_NOT_BOOSTABLE',
            'Seule une annonce vérifiée peut être boostée.',
          );
        }
        const now = new Date();
        const startsAt =
          fresh.boostedUntil && fresh.boostedUntil.getTime() > now.getTime()
            ? fresh.boostedUntil
            : now;
        const endsAt = new Date(startsAt.getTime() + days * DAY_MS);
        if (endsAt.getTime() - now.getTime() > MAX_HORIZON_MS) {
          throw new BoostRefusal(
            'BOOST_HORIZON',
            'Un boost ne peut pas dépasser 60 jours à l’avance.',
          );
        }

        let tokensSpent = 0;
        if (useIncluded) {
          const consumed = await tx.subscription.updateMany({
            where: { userId, boostCredits: { gte: 1 } },
            data: { boostCredits: { decrement: 1 } },
          });
          if (consumed.count === 0) {
            throw new BoostRefusal('NO_INCLUDED_BOOST', 'Aucun boost inclus disponible.');
          }
        } else {
          const wallet = await tx.tokenWallet.update({
            where: { userId },
            data: { balance: { decrement: cost } },
            select: { balance: true },
          });
          // A concurrent spend may have passed the up-front check too.
          assertBalanceNotNegative(wallet);
          await tx.tokenTransaction.create({
            data: {
              userId,
              type: 'USAGE',
              amount: -cost,
              balanceAfter: wallet.balance,
              description: `Boost d'annonce — ${days} jours`,
            },
          });
          tokensSpent = cost;
        }

        const boost = await tx.boost.create({
          data: {
            listingId: id,
            userId,
            startsAt,
            endsAt,
            days,
            source: useIncluded ? 'INCLUDED' : 'TOKENS',
            tokensSpent,
          },
        });
        await tx.listing.update({ where: { id }, data: { boostedUntil: endsAt } });

        const walletNow = await tx.tokenWallet.findUnique({
          where: { userId },
          select: { balance: true },
        });
        const subNow = await tx.subscription.findUnique({
          where: { userId },
          select: { boostCredits: true },
        });
        return {
          boost,
          boostedUntil: endsAt,
          tokenBalance: walletNow?.balance ?? 0,
          boostCredits: subNow?.boostCredits ?? 0,
        };
      });

      return NextResponse.json(
        {
          boost: {
            id: result.boost.id,
            startsAt: result.boost.startsAt,
            endsAt: result.boost.endsAt,
            days: result.boost.days,
            source: result.boost.source,
            tokensSpent: result.boost.tokensSpent,
          },
          boostedUntil: result.boostedUntil,
          tokenBalance: result.tokenBalance,
          boostCredits: result.boostCredits,
        },
        { status: 201, headers },
      );
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        return NextResponse.json(
          {
            error: 'INSUFFICIENT_TOKENS',
            message: 'Pas assez de jetons pour ce boost.',
            required: cost,
          },
          { status: 422, headers },
        );
      }
      if (err instanceof BoostRefusal) {
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

- [ ] **Step 4 : Tests, format, lint, typecheck**

Run: `pnpm exec prettier --write "src/app/api/listings/[id]/boost" && pnpm exec vitest run "src/app/api/listings/[id]/boost"` → PASS (tous).
Run: `pnpm exec eslint "src/app/api/listings/[id]/boost" && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.
Run: `pnpm exec vitest run src/lib/server/observability` → PASS (le test d'inventaire exige `runtime = 'nodejs'`).

- [ ] **Step 5 : Commit**

```bash
git add "src/app/api/listings/[id]/boost"
git commit -m "feat(listings): buy a boost with tokens or an included boost"
```

---

### Task 7 : Exposer `boostCredits` et `boostedUntil`

**Files :**
- Modify: `src/app/api/subscriptions/me/route.ts`
- Modify: `src/app/api/listings/route.ts`
- Modify: `src/lib/listings.ts`
- Test: `src/app/api/subscriptions/me/route.test.ts` (créer s'il n'existe pas), `src/app/api/listings/route.test.ts`

**Interfaces :**
- Produces (Task 8) : `GET /api/subscriptions/me` → `subscription.boostCredits: number` (0 par défaut, pour un compte sans ligne) ; `GET /api/listings` items → `boostedUntil: string | null` ; type `Listing.boostedUntil?: string | null`.

- [ ] **Step 1 : Tests qui échouent**

Dans `src/app/api/listings/route.test.ts`, dans `describe('GET /api/listings', …)`, ajouter :

```ts
  it('selects boostedUntil so the owner table can show the boost end date', async () => {
    prismaMock.listing.findMany.mockResolvedValue([] as never);
    await GET(makeGet());
    const args = prismaMock.listing.findMany.mock.calls[0]?.[0];
    expect(args?.select).toMatchObject({ boostedUntil: true });
  });
```

Pour `me` : lister `src/app/api/subscriptions/me/` ; s'il contient déjà un `route.test.ts`, y ajouter les deux tests ci-dessous en adaptant les helpers existants ; sinon créer `route.test.ts` :

```ts
// GET /api/subscriptions/me — boostCredits exposure.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const get = () => GET(new NextRequest('http://test/api/subscriptions/me'));

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
});

describe('GET /api/subscriptions/me', () => {
  it('returns the remaining included boosts', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-12-01'),
      canceledAt: null,
      boostCredits: 2,
    } as never);
    const body = await (await get()).json();
    expect(body.subscription.boostCredits).toBe(2);
  });

  it('defaults to 0 boosts for an account without a subscription row', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const body = await (await get()).json();
    expect(body.subscription).toMatchObject({ planKey: 'FREE', boostCredits: 0 });
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/app/api/subscriptions/me src/app/api/listings/route.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

`subscriptions/me/route.ts` : dans le `select` ajouter `boostCredits: true` ; dans le défaut sans ligne ajouter `boostCredits: 0`. `listings/route.ts` : ajouter `boostedUntil: true,` dans le `select` du `findMany` de la liste (après `createdAt: true,`). `lib/listings.ts` : ajouter à l'interface `Listing` la propriété `boostedUntil?: string | null;`.

- [ ] **Step 4 : Tests, format, lint, typecheck**

Run: `pnpm exec prettier --write src/app/api/subscriptions src/app/api/listings/route.ts src/app/api/listings/route.test.ts src/lib/listings.ts && pnpm exec vitest run src/app/api/subscriptions src/app/api/listings` → PASS.
Run: `pnpm exec eslint src/app/api src/lib && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 5 : Commit**

```bash
git add src/app/api/subscriptions src/app/api/listings/route.ts src/app/api/listings/route.test.ts src/lib/listings.ts
git commit -m "feat(api): expose boostCredits and boostedUntil"
```

---

### Task 8 : Interface — modale « Booster », badges « Sponsorisé », ligne de carte de plan

**Files :**
- Create: `src/components/listings/BoostModal.tsx`
- Modify: `src/app/listings/page.tsx`
- Modify: `src/components/public/ListingCard.tsx`, `src/app/annonces/AnnoncesClient.tsx`, `src/app/FeaturedListingsSection.tsx`
- Modify: `src/components/settings/SubscriptionCard.tsx`

**Interfaces :**
- Consumes: `POST /api/listings/:id/boost` (Task 6), `GET /api/tokens/wallet` → `{ balance }`, `GET /api/subscriptions/me` → `subscription.boostCredits` (Task 7), `BOOST_DAYS`, `boostTokenCost`, `boostsIncludedLabel`, `usePricing` (Task 1), `PublicListingItem.boosted` (Task 4).

(Pas de test automatisé : aucune infrastructure de test de composants dans le projet ; vérifier par `tsc`, `eslint`, puis le contrôle visuel de la Task 9.)

- [ ] **Step 1 : Créer la modale**

Créer `src/components/listings/BoostModal.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { BOOST_DAYS, boostTokenCost, type BoostDays } from '@/lib/pricing';
import { usePricing } from '@/lib/use-pricing';

interface BoostModalProps {
  listingId: string;
  listingTitle: string;
  onClose: () => void;
  onBoosted: (boostedUntil: string) => void;
}

interface BoostResult {
  boostedUntil: string;
  tokenBalance: number;
  boostCredits: number;
}

// Choose a duration, pay with tokens or with an included 7-day boost.
export function BoostModal({ listingId, listingTitle, onClose, onBoosted }: BoostModalProps) {
  const pricing = usePricing();
  const [days, setDays] = useState<BoostDays>(7);
  const [useIncluded, setUseIncluded] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [credits, setCredits] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ balance: number }>('/api/tokens/wallet')
      .then((res) => !cancelled && setBalance(res.balance))
      .catch(() => undefined);
    api<{ subscription: { boostCredits?: number } }>('/api/subscriptions/me')
      .then((res) => {
        if (cancelled) return;
        const n = res.subscription.boostCredits ?? 0;
        setCredits(n);
        if (n > 0) setUseIncluded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // An included boost only covers 7 days.
  const includedAvailable = credits > 0 && days === 7;
  const paysIncluded = useIncluded && includedAvailable;
  const cost = boostTokenCost(pricing, days);
  const notEnough = !paysIncluded && balance !== null && balance < cost;

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<BoostResult>(`/api/listings/${listingId}/boost`, {
        method: 'POST',
        body: { days, useIncluded: paysIncluded },
      });
      onBoosted(res.boostedUntil);
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
          <h3 className="font-sora text-base font-semibold text-neutral-900">Booster l’annonce</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 line-clamp-2 text-[13.5px] text-gray-600">{listingTitle}</p>
        <p className="mb-4 text-[12.5px] text-gray-500">
          Votre annonce passe en tête des résultats avec le badge « Sponsorisé » pendant la durée
          choisie.
        </p>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {BOOST_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={
                d === days
                  ? 'rounded-lg border-2 border-brand bg-brand/5 px-2 py-2.5 text-center'
                  : 'rounded-lg border-2 border-black/[0.08] px-2 py-2.5 text-center hover:bg-gray-50'
              }
            >
              <span className="block text-[14px] font-semibold text-neutral-900">{d} jours</span>
              <span className="block text-[12px] text-gray-500">
                {boostTokenCost(pricing, d)} jetons
              </span>
            </button>
          ))}
        </div>

        {includedAvailable && (
          <label className="mb-4 flex items-center gap-2 text-[13px] text-neutral-800">
            <input
              type="checkbox"
              checked={useIncluded}
              onChange={(e) => setUseIncluded(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand,currentColor)]"
            />
            Utiliser un boost inclus ({credits} restant{credits > 1 ? 's' : ''})
          </label>
        )}

        <p className="mb-4 text-[13px] text-neutral-700">
          {paysIncluded
            ? 'Coût : 1 boost inclus'
            : `Coût : ${cost} jetons${balance !== null ? ` · Solde : ${balance}` : ''}`}
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
            <Zap className="h-4 w-4" aria-hidden />
            {submitting ? 'Boost en cours…' : 'Confirmer le boost'}
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

- [ ] **Step 2 : Bouton dans « Mes annonces »**

Dans `src/app/listings/page.tsx` : importer `Zap` depuis `lucide-react` (dans la liste d'imports existante) et `import { BoostModal } from '@/components/listings/BoostModal';`. Ajouter l'état près des autres `useState` : `const [boostTarget, setBoostTarget] = useState<Listing | null>(null);`. Dans la cellule d'actions, juste avant le bouton de suppression (`<button … title="Supprimer l'annonce" …>`), ajouter :

```tsx
                          {l.status === 'VERIFIED' && (
                            <button
                              type="button"
                              title={
                                l.boostedUntil && new Date(l.boostedUntil) > new Date()
                                  ? `Boostée jusqu'au ${DATE_FORMATTER.format(new Date(l.boostedUntil))}`
                                  : 'Booster l’annonce'
                              }
                              onClick={() => setBoostTarget(l)}
                              className="flex h-[30px] w-[30px] items-center justify-center rounded-md border border-amber-200 text-amber-600 hover:bg-amber-50"
                            >
                              <Zap className="h-[13px] w-[13px]" aria-hidden />
                            </button>
                          )}
```

et, juste avant la fermeture du composant racine (après le tableau/pagination, dans le JSX retourné, à l'intérieur de `<DashboardShell …>`), ajouter :

```tsx
      {boostTarget && (
        <BoostModal
          listingId={boostTarget.id}
          listingTitle={boostTarget.title}
          onClose={() => setBoostTarget(null)}
          onBoosted={(boostedUntil) => {
            setFetchedPages((prev) =>
              prev.map((page) =>
                page.map((row) => (row.id === boostTarget.id ? { ...row, boostedUntil } : row)),
              ),
            );
            toast('Annonce boostée.', 'success');
            setBoostTarget(null);
          }}
        />
      )}
```

(`setFetchedPages`, `toast` et `DATE_FORMATTER` existent déjà dans ce fichier ; si le state des lignes porte un autre nom, utiliser celui qu'utilise `handleDelete`.)

- [ ] **Step 3 : Badges « Sponsorisé »**

Définir le badge identique partout : `<span className="absolute bottom-2.5 left-2.5 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-white">Sponsorisé</span>`.
- `ListingCard.tsx` : dans le `<Link … className="relative block h-[200px] bg-gray-100">`, après le badge de transaction existant, ajouter `{listing.boosted && (<span …>Sponsorisé</span>)}`.
- `AnnoncesClient.tsx` : dans **les deux** `<Link … className="relative block …">` des cartes (variante grille et variante liste), après le bloc `</div>` des badges de type/transaction, ajouter le même `{listing.boosted && …}`.
- `FeaturedListingsSection.tsx` : ajouter `boosted?: boolean;` à l'interface locale `PublicListingItem`, puis, dans le `<div className="relative h-[220px] …">` de la carte, juste après la balise `</Link>` de l'image, ajouter `{listing.boosted && (<span …>Sponsorisé</span>)}`.

- [ ] **Step 4 : Ligne « boosts inclus » sur les cartes de plans**

Dans `SubscriptionCard.tsx`, ajouter `boostsIncludedLabel` et `planIncludedBoosts` à l'import de `@/lib/pricing`, et dans le tableau de lignes de chaque plan (entre `tokensPerMonthLabel(...)` et `alertsQuotaLabel(...)`) ajouter :

```tsx
                  boostsIncludedLabel(planIncludedBoosts(pricing, plan.key)),
```

- [ ] **Step 5 : Vérifier**

Run: `pnpm exec prettier --write src/components src/app && pnpm exec eslint src/components src/app/listings src/app/annonces src/app/FeaturedListingsSection.tsx && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 6 : Commit**

```bash
git add src/components src/app
git commit -m "feat(ui): boost modal, sponsored badges and included-boost line on plan cards"
```

---

### Task 9 : Vérification d'ensemble et parcours local

**Files :** aucun fichier du dépôt ; un script jetable dans le scratchpad de session.

- [ ] **Step 1 : Suite complète**

Run : `pnpm exec prettier --check src && pnpm exec eslint . && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/" ; pnpm exec vitest run`
Expected: tout passe. Un échec isolé sous charge (ex. `admin-access-requests`) : le relancer seul.

- [ ] **Step 2 : Parcours local scripté**

Modèle : `phase1a-check.cjs` de la session précédente (utilisateurs jetables, login `POST /api/auth/login`, cookies + `x-csrf-token`, nettoyage final ; refus si `DATABASE_URL` non locale). Serveur dev relancé après `prisma generate`. Scénarios, chacun doit passer :
  1. Agent avec 20 jetons et 2 annonces `VERIFIED` : `POST /api/listings/:id/boost {days:7}` → 201, solde 12, `boostedUntil` ≈ +7 j ; `GET /api/public/listings` : l'annonce est en position 0 avec `boosted: true`.
  2. Même annonce, `{days:30}` puis encore `{days:30}` : la 2e → 409 `BOOST_HORIZON` (7 + 30 + 30 > 60), solde inchangé par la 2e.
  3. Solde 3 → `{days:7}` → 422 `INSUFFICIENT_TOKENS`.
  4. Abonnement Pro avec `boostCredits = 1` : `{days:7, useIncluded:true}` → 201, `boostCredits` 0, solde inchangé ; seconde tentative → 409 `NO_INCLUDED_BOOST`.
  5. 5 annonces boostées d'agents différents + 20 non boostées : page 1 = 3 boostées en tête puis le reste ; page 2 sans doublon ni annonce perdue (`ids` page 1 ∪ page 2 sans doublon, `total` identique à celui sans boost).
  6. Annonce passée en `HIDDEN` alors qu'elle est boostée : absente de l'API publique ; boost d'une annonce `PENDING` → 409 `LISTING_NOT_BOOSTABLE`.
  7. Boost expiré (`boostedUntil` mis dans le passé en base) : plus épinglée.
  8. `GET /api/subscriptions/me` expose `boostCredits`.
  Nettoyer ensuite : suppression des utilisateurs jetables (cascade).

- [ ] **Step 3 : Contrôle visuel (utilisateur)**

Demander à l'utilisateur d'ouvrir « Mes annonces » (bouton éclair, modale, date de fin au survol), `/annonces` (badge « Sponsorisé »), `/parametres` (ligne « boosts inclus ») et la page admin de tarification (3 champs boost) : aucun test automatisé ne couvre ces écrans.

- [ ] **Step 4 : Mémoire projet**

Mettre à jour `project_monetization_plan.md` : 1B codé et committé sur `feat/monetisation-1b`, migration `20261014120000_listing_boosts` à appliquer en prod après `token_grant_key`, reste 1C-1E.

## Déploiement (hors de ce plan, à demander à l'utilisateur à chaque étape)

Migrations dans l'ordre : `20261013120000_pricing_config`, `20261014100000_token_grant_key`, `20261014120000_listing_boosts` (`pnpm db:migrate:deploy`). Aucun nouveau cron. Une ligne `PricingConfig` déjà saisie en prod reste valide (bloc `boost` absent = 8/14/24).
