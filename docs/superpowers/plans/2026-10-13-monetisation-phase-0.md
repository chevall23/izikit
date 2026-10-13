# Monétisation phase 0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boucher les fuites de revenu : prix contrôlés côté serveur, quotas d'annonces appliqués, cycle de vie d'abonnement (rappels, grâce, expiration, masquage), prix de jeton unique, tarifs éditables en base.

**Architecture:** Une ligne `PricingConfig` (JSON validé par zod, cache 60 s, repli sur les constantes du code) alimente tous les prix et quotas. Des helpers serveur purs (plan effectif, quota, masquage/réactivation) sont appelés par les routes et par un nouveau cron horaire `subscription-lifecycle`. Le serveur recalcule et fige les prix dans `Order.metadata` à la création ; le crédit se fait sur ce qui a été payé.

**Tech Stack:** Next.js 16 (App Router Route Handlers), Prisma 5 + PostgreSQL, zod 4, Vitest 4 + `vitest-mock-extended`, pnpm workspace.

**Spec:** [docs/superpowers/specs/2026-10-13-monetisation-phase-0-design.md](../specs/2026-10-13-monetisation-phase-0-design.md)

## Global Constraints

- Tout Route Handler : `export const runtime = 'nodejs'` ; mutation : `verifyCsrf(req)` en premier puis `requireAuth` / `requireSuperadmin`.
- Montants en **entiers**, plus petite unité (FCFA, pas de décimales).
- Notifications **uniquement** via `createNotification(prisma, input)` avec `dedupeKey` déterministe.
- Mutation admin = `logAdminAction(prisma, {...})` (`frontend/src/lib/server/admin/audit.ts`, protégé, ne pas modifier).
- Fichiers protégés à ne pas modifier : `auth.ts`, `webhook/handler.ts`, `outbox/dispatcher.ts`, `admin/audit.ts`, `middleware/*`, `lib/api.ts`, `observability/request-context.ts`.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` : pas de `any`, pas de `!` inutile.
- Prisma CLI : toujours avec `DATABASE_URL` explicite pointant la base locale `localhost:5433` (Neon dépasse son quota).
- Commandes depuis la racine du dépôt ; tests : `pnpm --filter frontend exec vitest run <chemin relatif à frontend/>`.
- **Ne pas pousser ni déployer** : commits locaux seulement quand l'utilisateur l'autorise ; aucun push, aucune migration en prod sans demande explicite.
- Prix par défaut : base jeton 300 F ; packs STARTER 50 j −10 % (13 500 F), STANDARD 150 j −20 % (36 000 F), PRO 350 j −28 % (75 600 F) ; plans FREE 0 F / 3 annonces, PRO_AGENT 29 900 F / 30, AGENCY_PREMIUM 89 900 F / illimité (`null`).
- Grâce : 7 jours (`GRACE_PERIOD_MS`). Statut d'annonce masquée par expiration : `HIDDEN`.

## Écarts assumés par rapport au spec

1. **Quota appliqué à la publication, pas à la création.** `POST /api/listings` ne crée qu'un brouillon vide ; la publication se fait par `PATCH /api/listings/[id]` avec `publish: true`. C'est là que le quota est vérifié.
2. **Rappels = notification in-app dédupliquée** (`createNotification`), pas d'événement outbox ni d'email en phase 0 (les emails de relance viendront en phase 1).
3. **Renouvellement :** les jours restants ne sont reportés que si le **même plan** est repayé. Un changement de plan repart de `now` (sinon une montée en gamme offrirait du temps au tarif supérieur).
4. **Faille trouvée à la lecture du code (hors audit) :** `POST /api/orders` fait confiance à `amount` et `metadata` envoyés par le client. Un client peut payer 1 F pour `PRO_AGENT` ou pour `tokens: 1000000`. La tâche 5 la corrige ; c'est la priorité n°1 de la phase.
5. Paliers de remise des packs (10/20/28 %) = valeurs proposées, modifiables ensuite depuis l'admin.

## Review Focus

- Commande avec `kind` de tarification mais montant falsifié (1 F pour un plan ou des jetons) ou `tokens` fractionnaire / négatif / énorme : doit être refusée (400), jamais créditée. → tâche 5.
- Ligne `PricingConfig` corrompue ou base indisponible : l'app continue avec les prix par défaut et journalise un avertissement. → tâche 3.
- Propriétaire pile au quota qui **modifie** une annonce déjà publiée : autorisé ; qui en publie une nouvelle : refusé ; à `limit − 1` : autorisé. → tâche 6.
- Rétrogradation volontaire vers FREE avec plus de 3 annonces : l'excédent est masqué comme à l'expiration. → tâche 8.
- Cron relancé deux fois, ou abonnement payant avec `currentPeriodEnd` nul (octroi manuel) : aucun doublon de notification, aucun masquage, aucun plantage. → tâche 7.

## File Structure

| Fichier | Responsabilité |
|---|---|
| `frontend/src/lib/pricing.ts` (créer) | Types + schéma zod `PricingData`, `DEFAULT_PRICING`, fonctions de prix pures (client-safe) |
| `frontend/src/lib/token-packs.ts`, `subscription-plans.ts` (modifier) | Valeurs par défaut (base 300 F, remises, quotas) |
| `frontend/src/lib/use-pricing.ts` (créer) | Hook client : `GET /api/pricing`, repli sur défauts |
| `frontend/prisma/schema.prisma` + migration (modifier/créer) | Modèle `PricingConfig` |
| `frontend/src/lib/server/pricing/index.ts` (créer) | `getPricing`, `savePricing`, cache |
| `frontend/src/lib/server/pricing/order-pricing.ts` (créer) | Validation serveur des commandes, gel des prix |
| `frontend/src/app/api/pricing/route.ts` (créer) | Lecture publique des tarifs |
| `frontend/src/app/api/admin/pricing/route.ts` (créer) | Écriture SUPERADMIN + audit |
| `frontend/src/lib/server/subscriptions/effective-plan.ts` (créer) | Plan effectif (grâce, annulation, expiration) |
| `frontend/src/lib/server/listings/quota.ts` (créer) | Quota, masquage, réactivation |
| `frontend/src/lib/server/subscriptions/lifecycle.ts` (créer) | Rappels, GRACE, EXPIRED |
| `frontend/src/app/api/cron/subscription-lifecycle/route.ts` (créer) | Cron horaire |
| `frontend/src/components/admin/PricingEditor.tsx` (créer) | Formulaire d'édition des tarifs |

---

### Task 1: Cœur de tarification (pur) et valeurs par défaut

**Files:**
- Create: `frontend/src/lib/pricing.ts`
- Create: `frontend/src/lib/pricing.test.ts`
- Modify: `frontend/src/lib/token-packs.ts`
- Modify: `frontend/src/lib/subscription-plans.ts`
- Modify: `frontend/src/lib/token-packs.test.ts`

**Interfaces:**
- Produces (dans `@/lib/pricing`) :
  - `PricingDataSchema` (zod), `type PricingData`, `DEFAULT_PRICING: PricingData`
  - `planPriceFcfa(p: PricingData, key: PlanKey): number`
  - `planMaxListings(p: PricingData, key: PlanKey): number | null`
  - `tokenPackTokens(p: PricingData, key: TokenPackKey): number`
  - `tokenPackPriceFcfa(p: PricingData, key: TokenPackKey): number`
  - `customTokenPriceFcfa(p: PricingData, tokens: number): number`
- Produces (dans `@/lib/token-packs`) : `DEFAULT_TOKEN_BASE_FCFA = 300`, `MAX_CUSTOM_TOKENS = 1000`, `packPriceFcfa(tokens, baseFcfa, discountPct)`, `DEFAULT_TOKEN_PACKS` ; `CUSTOM_TOKEN_PRICE_FCFA` reste exporté (= 300).
- Produces (dans `@/lib/subscription-plans`) : `PlanDefinition.maxActiveListings: number | null`.

- [ ] **Step 1: Écrire les tests qui échouent**

`frontend/src/lib/pricing.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRICING,
  PricingDataSchema,
  customTokenPriceFcfa,
  planMaxListings,
  planPriceFcfa,
  tokenPackPriceFcfa,
  tokenPackTokens,
} from './pricing';

describe('DEFAULT_PRICING', () => {
  it('has the agreed plan prices and quotas', () => {
    expect(planPriceFcfa(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planPriceFcfa(DEFAULT_PRICING, 'PRO_AGENT')).toBe(29_900);
    expect(planPriceFcfa(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(89_900);
    expect(planMaxListings(DEFAULT_PRICING, 'FREE')).toBe(3);
    expect(planMaxListings(DEFAULT_PRICING, 'PRO_AGENT')).toBe(30);
    expect(planMaxListings(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBeNull();
  });

  it('derives pack prices from the 300 F base with volume discounts', () => {
    expect(tokenPackTokens(DEFAULT_PRICING, 'STARTER')).toBe(50);
    expect(tokenPackPriceFcfa(DEFAULT_PRICING, 'STARTER')).toBe(13_500);
    expect(tokenPackPriceFcfa(DEFAULT_PRICING, 'STANDARD')).toBe(36_000);
    expect(tokenPackPriceFcfa(DEFAULT_PRICING, 'PRO')).toBe(75_600);
  });

  it('prices a custom top-up at the base rate', () => {
    expect(customTokenPriceFcfa(DEFAULT_PRICING, 7)).toBe(2_100);
  });

  it('parses against its own schema', () => {
    expect(PricingDataSchema.safeParse(DEFAULT_PRICING).success).toBe(true);
  });
});

describe('PricingDataSchema', () => {
  const clone = () => structuredClone(DEFAULT_PRICING);

  it('rejects a non-zero FREE price', () => {
    const bad = clone();
    (bad.plans.FREE as { priceFcfa: number }).priceFcfa = 100;
    expect(PricingDataSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative prices, fractional quotas and discounts above 90', () => {
    const a = clone();
    a.plans.PRO_AGENT.priceFcfa = -1;
    expect(PricingDataSchema.safeParse(a).success).toBe(false);
    const b = clone();
    b.plans.PRO_AGENT.maxActiveListings = 2.5;
    expect(PricingDataSchema.safeParse(b).success).toBe(false);
    const c = clone();
    c.token.packs.PRO.discountPct = 95;
    expect(PricingDataSchema.safeParse(c).success).toBe(false);
  });

  it('rejects a missing pack and a non-positive token base', () => {
    const a = clone() as unknown as { token: { packs: Record<string, unknown> } };
    delete a.token.packs.STARTER;
    expect(PricingDataSchema.safeParse(a).success).toBe(false);
    const b = clone();
    b.token.baseFcfa = 0;
    expect(PricingDataSchema.safeParse(b).success).toBe(false);
  });

  it('accepts unlimited (null) quotas', () => {
    const ok = clone();
    ok.plans.PRO_AGENT.maxActiveListings = null;
    expect(PricingDataSchema.safeParse(ok).success).toBe(true);
  });
});
```

Dans `frontend/src/lib/token-packs.test.ts`, ajouter à la fin :

```ts
import { CUSTOM_TOKEN_PRICE_FCFA, customTokenPurchasePriceFcfa, packPriceFcfa } from './token-packs';

describe('token pricing defaults', () => {
  it('uses a single 300 F base rate for custom top-ups', () => {
    expect(CUSTOM_TOKEN_PRICE_FCFA).toBe(300);
    expect(customTokenPurchasePriceFcfa(10)).toBe(3_000);
  });

  it('packs are never more expensive per token than the base rate', () => {
    for (const key of TOKEN_PACK_KEYS) {
      const pack = TOKEN_PACK_CATALOG[key];
      expect(pack.priceFcfa / pack.tokens).toBeLessThan(CUSTOM_TOKEN_PRICE_FCFA);
    }
  });

  it('packPriceFcfa rounds to an integer', () => {
    expect(packPriceFcfa(50, 300, 10)).toBe(13_500);
    expect(Number.isInteger(packPriceFcfa(3, 333, 7))).toBe(true);
  });
});
```

(Fusionner l'import avec la ligne d'import existante en tête de fichier.)

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `pnpm --filter frontend exec vitest run src/lib/pricing.test.ts src/lib/token-packs.test.ts`
Expected: FAIL (`./pricing` introuvable, `packPriceFcfa` non exporté).

- [ ] **Step 3: Implémenter**

`frontend/src/lib/token-packs.ts` — remplacer le contenu par :

```ts
// Single source of truth for the token packs (Banani "Jetons & visites
// virtuelles" screen). These are the DEFAULTS: the live values come from
// PricingConfig (see lib/pricing.ts + lib/server/pricing). Shared between the
// purchase button (client) and the webhook (server). No secrets here — safe to
// import from client components. Mirrors frontend/src/lib/subscription-plans.ts.

export const TOKEN_PACK_KEYS = ['STARTER', 'STANDARD', 'PRO'] as const;
export type TokenPackKey = (typeof TOKEN_PACK_KEYS)[number];

export interface TokenPackDefinition {
  key: TokenPackKey;
  label: string;
  tokens: number;
  priceFcfa: number; // smallest currency unit; XOF has no decimals
}

export const TOKEN_PURCHASE_CURRENCY = 'XOF';

// One base rate; every pack price is derived from it by a volume discount.
export const DEFAULT_TOKEN_BASE_FCFA = 300;

// Hard cap on a custom top-up, so a forged request cannot ask for millions.
export const MAX_CUSTOM_TOKENS = 1000;

export function packPriceFcfa(tokens: number, baseFcfa: number, discountPct: number): number {
  return Math.round(tokens * baseFcfa * (1 - discountPct / 100));
}

export const DEFAULT_TOKEN_PACKS: Record<TokenPackKey, { tokens: number; discountPct: number }> = {
  STARTER: { tokens: 50, discountPct: 10 },
  STANDARD: { tokens: 150, discountPct: 20 },
  PRO: { tokens: 350, discountPct: 28 },
};

const LABELS: Record<TokenPackKey, string> = {
  STARTER: 'Starter',
  STANDARD: 'Standard',
  PRO: 'Pro',
};

function defaultPack(key: TokenPackKey): TokenPackDefinition {
  const { tokens, discountPct } = DEFAULT_TOKEN_PACKS[key];
  return {
    key,
    label: LABELS[key],
    tokens,
    priceFcfa: packPriceFcfa(tokens, DEFAULT_TOKEN_BASE_FCFA, discountPct),
  };
}

export const TOKEN_PACK_CATALOG: Record<TokenPackKey, TokenPackDefinition> = {
  STARTER: defaultPack('STARTER'),
  STANDARD: defaultPack('STANDARD'),
  PRO: defaultPack('PRO'),
};

export function isTokenPackKey(value: unknown): value is TokenPackKey {
  return typeof value === 'string' && (TOKEN_PACK_KEYS as readonly string[]).includes(value);
}

// Default per-token rate for a custom top-up — a custom purchase of N tokens
// costs exactly N * this.
export const CUSTOM_TOKEN_PRICE_FCFA = DEFAULT_TOKEN_BASE_FCFA;

export function customTokenPurchasePriceFcfa(tokens: number): number {
  return tokens * CUSTOM_TOKEN_PRICE_FCFA;
}
```

`frontend/src/lib/subscription-plans.ts` : ajouter `maxActiveListings: number | null; // null = unlimited` dans `PlanDefinition`, puis `maxActiveListings: 3` (FREE), `30` (PRO_AGENT), `null` (AGENCY_PREMIUM) dans `PLAN_CATALOG`.

`frontend/src/lib/pricing.ts` :

```ts
// Live pricing shape + pure price helpers. Client-safe (no server-only): the
// server reads the row from PricingConfig (lib/server/pricing), the browser
// reads GET /api/pricing; both fall back to DEFAULT_PRICING.
import { z } from 'zod';
import { PLAN_CATALOG, type PlanKey } from './subscription-plans';
import {
  DEFAULT_TOKEN_BASE_FCFA,
  DEFAULT_TOKEN_PACKS,
  packPriceFcfa,
  type TokenPackKey,
} from './token-packs';

const quota = z.number().int().nonnegative().nullable(); // null = unlimited
const paidPlan = z.object({
  priceFcfa: z.number().int().nonnegative().max(10_000_000),
  maxActiveListings: quota,
});
const pack = z.object({
  tokens: z.number().int().positive().max(100_000),
  discountPct: z.number().min(0).max(90),
});

export const PricingDataSchema = z.object({
  plans: z.object({
    FREE: z.object({ priceFcfa: z.literal(0), maxActiveListings: quota }),
    PRO_AGENT: paidPlan,
    AGENCY_PREMIUM: paidPlan,
  }),
  token: z.object({
    baseFcfa: z.number().int().positive().max(100_000),
    packs: z.object({ STARTER: pack, STANDARD: pack, PRO: pack }),
  }),
});

export type PricingData = z.infer<typeof PricingDataSchema>;

export const DEFAULT_PRICING: PricingData = {
  plans: {
    FREE: { priceFcfa: 0, maxActiveListings: PLAN_CATALOG.FREE.maxActiveListings },
    PRO_AGENT: {
      priceFcfa: PLAN_CATALOG.PRO_AGENT.priceFcfa,
      maxActiveListings: PLAN_CATALOG.PRO_AGENT.maxActiveListings,
    },
    AGENCY_PREMIUM: {
      priceFcfa: PLAN_CATALOG.AGENCY_PREMIUM.priceFcfa,
      maxActiveListings: PLAN_CATALOG.AGENCY_PREMIUM.maxActiveListings,
    },
  },
  token: {
    baseFcfa: DEFAULT_TOKEN_BASE_FCFA,
    packs: {
      STARTER: { ...DEFAULT_TOKEN_PACKS.STARTER },
      STANDARD: { ...DEFAULT_TOKEN_PACKS.STANDARD },
      PRO: { ...DEFAULT_TOKEN_PACKS.PRO },
    },
  },
};

export function planPriceFcfa(p: PricingData, key: PlanKey): number {
  return p.plans[key].priceFcfa;
}

export function planMaxListings(p: PricingData, key: PlanKey): number | null {
  return p.plans[key].maxActiveListings;
}

export function tokenPackTokens(p: PricingData, key: TokenPackKey): number {
  return p.token.packs[key].tokens;
}

export function tokenPackPriceFcfa(p: PricingData, key: TokenPackKey): number {
  const cfg = p.token.packs[key];
  return packPriceFcfa(cfg.tokens, p.token.baseFcfa, cfg.discountPct);
}

export function customTokenPriceFcfa(p: PricingData, tokens: number): number {
  return tokens * p.token.baseFcfa;
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `pnpm --filter frontend exec vitest run src/lib/pricing.test.ts src/lib/token-packs.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck et commit**

Run: `pnpm typecheck` — Expected: OK (les consommateurs existants de `PLAN_CATALOG` / `TOKEN_PACK_CATALOG` n'ont pas changé de forme).

```bash
git add frontend/src/lib/pricing.ts frontend/src/lib/pricing.test.ts frontend/src/lib/token-packs.ts frontend/src/lib/token-packs.test.ts frontend/src/lib/subscription-plans.ts
git commit -m "feat(pricing): pricing core with 300 F token base and volume-discount packs"
```

---

### Task 2: Modèle `PricingConfig` et migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (ajout du modèle ; commentaires de `Subscription.status` ligne ~374 et `Listing.status` ligne ~575)
- Create: `frontend/prisma/migrations/20261013120000_pricing_config/migration.sql`

**Interfaces:**
- Produces : `prisma.pricingConfig` (`id String @id`, `data Json`, `updatedById String?`, `updatedAt DateTime @updatedAt`).

- [ ] **Step 1: Modifier le schéma**

Ajouter après le modèle `Subscription` :

```prisma
// Live pricing (plans, quotas, token base rate, pack discounts). One row,
// id = "default". `data` is validated by PricingDataSchema (lib/pricing.ts);
// an absent/invalid row falls back to DEFAULT_PRICING in code.
model PricingConfig {
  id          String   @id
  data        Json
  updatedById String?
  updatedAt   DateTime @updatedAt
}
```

Mettre à jour les commentaires : `Subscription.status` → `// ACTIVE | GRACE | EXPIRED | CANCELED`, `Listing.status` → `// DRAFT | PENDING | VERIFIED | REJECTED | SOLD | HIDDEN` (HIDDEN = masquée à l'expiration de l'abonnement, jamais supprimée).

- [ ] **Step 2: Écrire la migration**

`frontend/prisma/migrations/20261013120000_pricing_config/migration.sql` :

```sql
-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 3: Générer le client et appliquer sur la base locale**

Run (PowerShell, remplacer l'URL par celle de `frontend/.env.local` pour `localhost:5433`) :

```powershell
$env:DATABASE_URL = "<URL locale localhost:5433>"
pnpm --filter frontend exec prisma generate
pnpm --filter frontend exec prisma migrate deploy
pnpm --filter frontend exec prisma migrate status
```
Expected: migration appliquée, « Database schema is up to date ».

- [ ] **Step 4: Typecheck et commit**

Run: `pnpm typecheck` — Expected: OK.

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/20261013120000_pricing_config
git commit -m "feat(db): add PricingConfig model"
```

---

### Task 3: Service serveur `getPricing` / `savePricing`

**Files:**
- Create: `frontend/src/lib/server/pricing/index.ts`
- Create: `frontend/src/lib/server/pricing/index.test.ts`

**Interfaces:**
- Consumes : `PricingDataSchema`, `DEFAULT_PRICING`, `PricingData` (tâche 1) ; `prisma.pricingConfig` (tâche 2).
- Produces :
  - `getPricing(nowMs?: number): Promise<PricingData>` — jamais d'exception.
  - `savePricing(data: PricingData, updatedById: string): Promise<void>`
  - `invalidatePricingCache(): void`

- [ ] **Step 1: Écrire les tests qui échouent**

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_PRICING, type PricingData } from '@/lib/pricing';
import { getPricing, invalidatePricingCache, savePricing } from './index';

const custom = (): PricingData => {
  const p = structuredClone(DEFAULT_PRICING);
  p.plans.PRO_AGENT.priceFcfa = 19_900;
  return p;
};

beforeEach(() => {
  invalidatePricingCache();
});

describe('getPricing', () => {
  it('returns defaults when no row exists', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
  });

  it('returns the stored config when valid', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue({
      id: 'default',
      data: custom(),
      updatedById: null,
      updatedAt: new Date(),
    } as never);
    expect((await getPricing()).plans.PRO_AGENT.priceFcfa).toBe(19_900);
  });

  it('falls back to defaults on a corrupt row', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue({
      id: 'default',
      data: { plans: 'nope' },
      updatedById: null,
      updatedAt: new Date(),
    } as never);
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
  });

  it('falls back to defaults when the database throws', async () => {
    prismaMock.pricingConfig.findUnique.mockRejectedValue(new Error('db down'));
    expect(await getPricing()).toEqual(DEFAULT_PRICING);
  });

  it('caches for 60 s then re-reads', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    await getPricing(1_000);
    await getPricing(30_000);
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(1);
    await getPricing(62_000);
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('savePricing', () => {
  it('upserts the default row and invalidates the cache', async () => {
    prismaMock.pricingConfig.findUnique.mockResolvedValue(null);
    await getPricing(1_000);
    prismaMock.pricingConfig.upsert.mockResolvedValue({} as never);
    await savePricing(custom(), 'admin-1');
    expect(prismaMock.pricingConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'default' },
        create: expect.objectContaining({ id: 'default', updatedById: 'admin-1' }),
      }),
    );
    await getPricing(2_000);
    expect(prismaMock.pricingConfig.findUnique).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `pnpm --filter frontend exec vitest run src/lib/server/pricing/index.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
// Live pricing reader/writer. One PricingConfig row (id "default"); an absent,
// corrupt or unreachable row falls back to DEFAULT_PRICING so a bad edit or a
// DB blip can never take checkout down. Cached 60 s per instance.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { DEFAULT_PRICING, PricingDataSchema, type PricingData } from '@/lib/pricing';
import { createLogger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/prisma';

const log = createLogger();
const ROW_ID = 'default';
const CACHE_TTL_MS = 60_000;

let cache: { value: PricingData; expiresAt: number } | null = null;

export function invalidatePricingCache(): void {
  cache = null;
}

export async function getPricing(nowMs: number = Date.now()): Promise<PricingData> {
  if (cache && cache.expiresAt > nowMs) return cache.value;

  let value: PricingData = DEFAULT_PRICING;
  try {
    const row = await prisma.pricingConfig.findUnique({ where: { id: ROW_ID } });
    if (row) {
      const parsed = PricingDataSchema.safeParse(row.data);
      if (parsed.success) {
        value = parsed.data;
      } else {
        log.warn('PricingConfig row is invalid — using defaults', {
          issues: parsed.error.issues.length,
        });
      }
    }
  } catch (err) {
    log.warn('PricingConfig read failed — using defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
    return DEFAULT_PRICING; // do not cache a failure
  }

  cache = { value, expiresAt: nowMs + CACHE_TTL_MS };
  return value;
}

export async function savePricing(data: PricingData, updatedById: string): Promise<void> {
  const json = data as unknown as Prisma.InputJsonValue;
  await prisma.pricingConfig.upsert({
    where: { id: ROW_ID },
    create: { id: ROW_ID, data: json, updatedById },
    update: { data: json, updatedById },
  });
  invalidatePricingCache();
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `pnpm --filter frontend exec vitest run src/lib/server/pricing/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/pricing
git commit -m "feat(pricing): cached PricingConfig reader with safe defaults"
```

---

### Task 4: `GET /api/pricing`, hook client, pages branchées

**Files:**
- Create: `frontend/src/app/api/pricing/route.ts`
- Create: `frontend/src/app/api/pricing/route.test.ts`
- Create: `frontend/src/lib/use-pricing.ts`
- Modify: `frontend/src/app/jetons/page.tsx` (lignes ~95-125, ~207-210, ~271-274)
- Modify: `frontend/src/components/settings/SubscriptionCard.tsx` (lignes ~45, ~64-71, ~112-157, ~186)

**Interfaces:**
- Consumes : `getPricing` (tâche 3), helpers de `@/lib/pricing` (tâche 1).
- Produces : `GET /api/pricing` → `{ pricing: PricingData }` ; hook `usePricing(): PricingData` (défauts tant que la requête n'a pas répondu).

- [ ] **Step 1: Test de la route qui échoue**

`frontend/src/app/api/pricing/route.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_PRICING } from '@/lib/pricing';

vi.mock('@/lib/server/pricing', () => ({ getPricing: vi.fn(async () => DEFAULT_PRICING) }));

import { GET } from './route';

describe('GET /api/pricing', () => {
  it('is public and returns the live pricing', async () => {
    const res = await GET(new NextRequest('http://test/api/pricing'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pricing: typeof DEFAULT_PRICING };
    expect(body.pricing.token.baseFcfa).toBe(300);
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/app/api/pricing/route.test.ts` — Expected: FAIL (route absente).

- [ ] **Step 2: Implémenter la route**

```ts
// GET /api/pricing — public. Live plan prices, listing quotas and token rates
// so the UI never hard-codes numbers the server may have changed.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getPricing } from '@/lib/server/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const pricing = await getPricing();
    return NextResponse.json({ pricing }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

Run le test — Expected: PASS.

- [ ] **Step 3: Hook client**

`frontend/src/lib/use-pricing.ts` :

```ts
'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PRICING, PricingDataSchema, type PricingData } from './pricing';

// Defaults first (instant render), then the live values from the server.
export function usePricing(): PricingData {
  const [pricing, setPricing] = useState<PricingData>(DEFAULT_PRICING);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { pricing?: unknown } | null) => {
        if (cancelled || !body) return;
        const parsed = PricingDataSchema.safeParse(body.pricing);
        if (parsed.success) setPricing(parsed.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return pricing;
}
```

- [ ] **Step 4: Brancher la page jetons**

Dans `frontend/src/app/jetons/page.tsx` : importer `usePricing` (`@/lib/use-pricing`) et `tokenPackPriceFcfa`, `tokenPackTokens`, `customTokenPriceFcfa` (`@/lib/pricing`) ; retirer les imports `CUSTOM_TOKEN_PRICE_FCFA` et `customTokenPurchasePriceFcfa` s'ils deviennent inutiles. Dans le composant : `const pricing = usePricing();` puis :
  - `buyTokens` : `amount: tokenPackPriceFcfa(pricing, selectedPack)` (le `packKey` reste dans `metadata`) ;
  - `buyCustomTokens` : `amount: customTokenPriceFcfa(pricing, customTokensNum)` ;
  - rendu des packs (≈ l.207-210) : `const price = tokenPackPriceFcfa(pricing, key); const tokens = tokenPackTokens(pricing, key);` pour le libellé de prix, le nombre de jetons et `Math.round(price / tokens)` par jeton ;
  - recharge libre (≈ l.271-274) : `customTokenPriceFcfa(pricing, customTokensNum)` et `pricing.token.baseFcfa` pour le « FCFA/jeton ». Ajouter `customTokensNum <= MAX_CUSTOM_TOKENS` à `customTokensValid` (import depuis `@/lib/token-packs`).

- [ ] **Step 5: Brancher SubscriptionCard**

Dans `frontend/src/components/settings/SubscriptionCard.tsx` : `const pricing = usePricing();` ; remplacer tout `plan.priceFcfa` / `currentPlan.priceFcfa` par `planPriceFcfa(pricing, plan.key)` / `planPriceFcfa(pricing, currentPlan.key)`, y compris le montant envoyé dans `upgradeTo` (`amount: planPriceFcfa(pricing, planKey)`) et les tests `=== 0` / `> 0`.

- [ ] **Step 6: Vérifier**

Run: `pnpm typecheck && pnpm lint` — Expected: OK. Run: `pnpm --filter frontend exec vitest run src/app/jetons src/components/settings` (les tests existants éventuels doivent rester verts ; s'il n'y en a pas, la commande ne trouve rien, c'est normal).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/pricing frontend/src/lib/use-pricing.ts frontend/src/app/jetons/page.tsx frontend/src/components/settings/SubscriptionCard.tsx
git commit -m "feat(pricing): public pricing endpoint and live prices in the UI"
```

---

### Task 5: Prix contrôlés côté serveur (faille de la commande)

**Files:**
- Create: `frontend/src/lib/server/pricing/order-pricing.ts`
- Create: `frontend/src/lib/server/pricing/order-pricing.test.ts`
- Modify: `frontend/src/app/api/orders/route.ts` (après la branche de rejeu, avant l'étape 6 « Lazy provider init », et l'étape 7 `mergedMetadata`)
- Modify: `frontend/src/app/api/orders/route.test.ts` (nouveaux cas)
- Modify: `frontend/src/lib/server/payments/fulfill-order.ts` (crédit du pack)
- Modify: `frontend/src/lib/server/payments/fulfill-order.test.ts`

**Interfaces:**
- Consumes : `getPricing` (tâche 3), `PricingData` + helpers (tâche 1), `MAX_CUSTOM_TOKENS`.
- Produces :
  - `isPricedOrderKind(kind: unknown): boolean` — vrai pour `subscription_plan_change`, `token_purchase`, `token_purchase_custom`.
  - `resolveOrderPricing(pricing: PricingData, input: { amount: number; currency: string; metadata?: Record<string, unknown> | undefined }): OrderPricingResult` où `OrderPricingResult = { ok: true; metadata: Record<string, unknown> } | { ok: false; code: 'AMOUNT_MISMATCH' | 'INVALID_ORDER_METADATA'; message: string }`. En cas de succès, `metadata` contient `priceFcfa` et (jetons) `tokens` recalculés par le serveur.

- [ ] **Step 1: Tests de `resolveOrderPricing` qui échouent**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { isPricedOrderKind, resolveOrderPricing } from './order-pricing';

const P = DEFAULT_PRICING;

describe('isPricedOrderKind', () => {
  it('knows the three priced kinds only', () => {
    expect(isPricedOrderKind('subscription_plan_change')).toBe(true);
    expect(isPricedOrderKind('token_purchase')).toBe(true);
    expect(isPricedOrderKind('token_purchase_custom')).toBe(true);
    expect(isPricedOrderKind('anything_else')).toBe(false);
    expect(isPricedOrderKind(undefined)).toBe(false);
  });
});

describe('resolveOrderPricing', () => {
  it('passes untyped orders through untouched', () => {
    const r = resolveOrderPricing(P, { amount: 1000, currency: 'XOF' });
    expect(r).toEqual({ ok: true, metadata: {} });
  });

  it('accepts a plan at its exact price and freezes it', () => {
    const r = resolveOrderPricing(P, {
      amount: 29_900,
      currency: 'XOF',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(r).toEqual({
      ok: true,
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT', priceFcfa: 29_900 },
    });
  });

  it('rejects a forged plan amount (1 F for PRO_AGENT)', () => {
    const r = resolveOrderPricing(P, {
      amount: 1,
      currency: 'XOF',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });

  it('rejects FREE, unknown plans and a non-XOF currency', () => {
    for (const planKey of ['FREE', 'GOLD', undefined]) {
      const r = resolveOrderPricing(P, {
        amount: 0 + 1,
        currency: 'XOF',
        metadata: { kind: 'subscription_plan_change', planKey },
      });
      expect(r).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
    }
    const usd = resolveOrderPricing(P, {
      amount: 29_900,
      currency: 'USD',
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(usd).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
  });

  it('freezes pack tokens from the server, ignoring client-supplied tokens', () => {
    const r = resolveOrderPricing(P, {
      amount: 36_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 999_999 },
    });
    expect(r).toEqual({
      ok: true,
      metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 150, priceFcfa: 36_000 },
    });
  });

  it('rejects a pack with the wrong amount or an unknown pack', () => {
    expect(
      resolveOrderPricing(P, {
        amount: 100,
        currency: 'XOF',
        metadata: { kind: 'token_purchase', packKey: 'PRO' },
      }),
    ).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
    expect(
      resolveOrderPricing(P, {
        amount: 100,
        currency: 'XOF',
        metadata: { kind: 'token_purchase', packKey: 'NOPE' },
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
  });

  it('prices a custom top-up at the base rate and freezes the count', () => {
    const r = resolveOrderPricing(P, {
      amount: 3_000,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 10 },
    });
    expect(r).toEqual({
      ok: true,
      metadata: { kind: 'token_purchase_custom', tokens: 10, priceFcfa: 3_000 },
    });
  });

  it('rejects custom counts that are fractional, negative, zero, huge or not numbers', () => {
    for (const tokens of [1.5, -5, 0, 1001, 1_000_000, '10', null]) {
      const r = resolveOrderPricing(P, {
        amount: 300,
        currency: 'XOF',
        metadata: { kind: 'token_purchase_custom', tokens },
      });
      expect(r, String(tokens)).toMatchObject({ ok: false, code: 'INVALID_ORDER_METADATA' });
    }
  });

  it('rejects a custom top-up paid below the base rate', () => {
    const r = resolveOrderPricing(P, {
      amount: 10,
      currency: 'XOF',
      metadata: { kind: 'token_purchase_custom', tokens: 1000 },
    });
    expect(r).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/pricing/order-pricing.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implémenter `order-pricing.ts`**

```ts
// Server-side authority over what an order costs. The client sends `amount`
// and `metadata`, but for the three priced kinds we recompute the price from
// the live pricing and reject any mismatch, then freeze `priceFcfa` (and the
// token count) into the metadata the webhook will later credit from.
import 'server-only';
import {
  customTokenPriceFcfa,
  planPriceFcfa,
  tokenPackPriceFcfa,
  tokenPackTokens,
  type PricingData,
} from '@/lib/pricing';
import { isPlanKey, SUBSCRIPTION_CURRENCY } from '@/lib/subscription-plans';
import { isTokenPackKey, MAX_CUSTOM_TOKENS, TOKEN_PURCHASE_CURRENCY } from '@/lib/token-packs';

const PRICED_KINDS = new Set(['subscription_plan_change', 'token_purchase', 'token_purchase_custom']);

export function isPricedOrderKind(kind: unknown): boolean {
  return typeof kind === 'string' && PRICED_KINDS.has(kind);
}

export type OrderPricingResult =
  | { ok: true; metadata: Record<string, unknown> }
  | { ok: false; code: 'AMOUNT_MISMATCH' | 'INVALID_ORDER_METADATA'; message: string };

interface OrderPricingInput {
  amount: number;
  currency: string;
  metadata?: Record<string, unknown> | undefined;
}

const invalid = (message: string): OrderPricingResult => ({
  ok: false,
  code: 'INVALID_ORDER_METADATA',
  message,
});
const mismatch = (): OrderPricingResult => ({
  ok: false,
  code: 'AMOUNT_MISMATCH',
  message: 'The amount does not match the current price.',
});

export function resolveOrderPricing(
  pricing: PricingData,
  input: OrderPricingInput,
): OrderPricingResult {
  const meta = input.metadata ?? {};
  const kind = meta.kind;
  if (!isPricedOrderKind(kind)) return { ok: true, metadata: meta };

  if (kind === 'subscription_plan_change') {
    if (!isPlanKey(meta.planKey) || meta.planKey === 'FREE') {
      return invalid('Unknown or non-purchasable plan.');
    }
    if (input.currency !== SUBSCRIPTION_CURRENCY) return invalid('Unsupported currency.');
    const expected = planPriceFcfa(pricing, meta.planKey);
    if (input.amount !== expected) return mismatch();
    return { ok: true, metadata: { ...meta, priceFcfa: expected } };
  }

  if (kind === 'token_purchase') {
    if (!isTokenPackKey(meta.packKey)) return invalid('Unknown token pack.');
    if (input.currency !== TOKEN_PURCHASE_CURRENCY) return invalid('Unsupported currency.');
    const expected = tokenPackPriceFcfa(pricing, meta.packKey);
    if (input.amount !== expected) return mismatch();
    return {
      ok: true,
      metadata: { ...meta, tokens: tokenPackTokens(pricing, meta.packKey), priceFcfa: expected },
    };
  }

  // token_purchase_custom
  const tokens = meta.tokens;
  if (
    typeof tokens !== 'number' ||
    !Number.isInteger(tokens) ||
    tokens < 1 ||
    tokens > MAX_CUSTOM_TOKENS
  ) {
    return invalid(`tokens must be an integer between 1 and ${MAX_CUSTOM_TOKENS}.`);
  }
  if (input.currency !== TOKEN_PURCHASE_CURRENCY) return invalid('Unsupported currency.');
  const expected = customTokenPriceFcfa(pricing, tokens);
  if (input.amount !== expected) return mismatch();
  return { ok: true, metadata: { ...meta, tokens, priceFcfa: expected } };
}
```

Run le test — Expected: PASS.

- [ ] **Step 3: Tests de la route qui échouent**

Ajouter dans `frontend/src/app/api/orders/route.test.ts` (le fichier mocke déjà `prismaMock`, `requireAuth`, le provider ; `prismaMock.pricingConfig.findUnique` renvoie `undefined` → défauts) :

```ts
describe('POST /api/orders — server-side pricing', () => {
  it('rejects a forged plan amount with 400 AMOUNT_MISMATCH and creates nothing', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null as never);
    const res = await POST(
      makePost(
        {
          amount: 1,
          currency: 'XOF',
          metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
        },
        { idempotencyKey: 'idem-price-1' },
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('AMOUNT_MISMATCH');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range custom token count with 400 INVALID_ORDER_METADATA', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null as never);
    const res = await POST(
      makePost(
        {
          amount: 300,
          currency: 'XOF',
          metadata: { kind: 'token_purchase_custom', tokens: 1_000_000 },
        },
        { idempotencyKey: 'idem-price-2' },
      ),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('INVALID_ORDER_METADATA');
  });

  it('freezes server-computed tokens into the stored metadata', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null as never);
    prismaMock.order.create.mockResolvedValue(seededOrder() as never);
    prismaMock.order.update.mockResolvedValue(seededOrder() as never);
    const res = await POST(
      makePost(
        {
          amount: 36_000,
          currency: 'XOF',
          metadata: { kind: 'token_purchase', packKey: 'STANDARD', tokens: 999_999 },
        },
        { idempotencyKey: 'idem-price-3' },
      ),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.order.create.mock.calls[0]?.[0]?.data as {
      metadata: { tokens: number; priceFcfa: number };
    };
    expect(data.metadata.tokens).toBe(150);
    expect(data.metadata.priceFcfa).toBe(36_000);
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/app/api/orders/route.test.ts` — Expected: les 3 nouveaux tests FAIL, les anciens PASS.

- [ ] **Step 4: Brancher dans `POST /api/orders`**

Dans `route.ts` : importer `getPricing` (`@/lib/server/pricing`) et `isPricedOrderKind`, `resolveOrderPricing` (`@/lib/server/pricing/order-pricing`). Juste **après** le bloc `if (existing) { … }` (rejeu) et **avant** `// 6. Lazy provider init`, insérer :

```ts
    // 5b. Server-side price authority — for subscription / token orders the
    // client's `amount` and metadata are only a claim: recompute from the live
    // pricing, reject mismatches, and freeze priceFcfa/tokens for the webhook.
    let pricedMetadata: Record<string, unknown> = parsed.data.metadata ?? {};
    if (isPricedOrderKind(pricedMetadata.kind)) {
      const priced = resolveOrderPricing(await getPricing(), {
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        metadata: parsed.data.metadata,
      });
      if (!priced.ok) {
        return NextResponse.json(
          { error: priced.code, message: priced.message },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      pricedMetadata = priced.metadata;
    }
```

Puis remplacer `...(parsed.data.metadata ?? {}),` dans `mergedMetadata` par `...pricedMetadata,`.

Run: `pnpm --filter frontend exec vitest run src/app/api/orders/route.test.ts` — Expected: tout PASS.

- [ ] **Step 5: `fulfill-order` crédite le nombre de jetons figé**

Test à ajouter dans `fulfill-order.test.ts` (reprendre le style de fabrication de `tx` du fichier) : une commande `{ kind: 'token_purchase', packKey: 'STANDARD', tokens: 150 }` crédite **150** ; une commande ancienne `{ kind: 'token_purchase', packKey: 'STANDARD' }` (sans `tokens`) crédite encore le défaut du catalogue (150) ; une commande avec `tokens: 40` crédite 40 (le gel prime sur le catalogue).

Dans `fulfill-order.ts`, bloc `token_purchase` :

```ts
  if (order.userId && meta?.kind === 'token_purchase' && isTokenPackKey(meta.packKey)) {
    const pack = TOKEN_PACK_CATALOG[meta.packKey];
    // Prefer the count frozen at order creation (server-computed) over the
    // code default, so a later price/pack edit never changes what was paid for.
    const tokens =
      typeof meta.tokens === 'number' && Number.isInteger(meta.tokens) && meta.tokens > 0
        ? meta.tokens
        : pack.tokens;
    await creditTokenWallet(tx, order.userId, tokens, `Achat pack ${pack.label}`, order.id);
  }
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments src/app/api/webhooks` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/pricing frontend/src/app/api/orders frontend/src/lib/server/payments/fulfill-order.ts frontend/src/lib/server/payments/fulfill-order.test.ts
git commit -m "fix(orders): recompute and freeze prices server-side, reject forged amounts"
```

---

### Task 6: Plan effectif, quota d'annonces, statut `HIDDEN`

**Files:**
- Create: `frontend/src/lib/server/subscriptions/effective-plan.ts` + `effective-plan.test.ts`
- Create: `frontend/src/lib/server/listings/quota.ts` + `quota.test.ts`
- Modify: `frontend/src/lib/server/listings/editable.ts` (ajouter `HIDDEN`)
- Modify: `frontend/src/app/api/listings/[id]/route.ts` (PATCH, bloc `if (publish)`)
- Modify: `frontend/src/app/api/listings/[id]/route.test.ts`
- Modify: `frontend/src/app/api/listings/route.ts` (GET : compteur `hidden`)

**Interfaces:**
- Consumes : `planMaxListings`, `PricingData` (tâche 1), `getPricing` (tâche 3).
- Produces :
  - `GRACE_PERIOD_MS`, `getEffectivePlanKey(sub: { planKey: string; status: string; currentPeriodEnd: Date | null } | null, now: Date): PlanKey`
  - `PUBLISHED_STATUSES` (`['VERIFIED', 'PENDING']`)
  - `checkListingQuota(db: Pick<PrismaClient, 'subscription' | 'listing'>, userId: string, pricing: PricingData, opts?: { now?: Date; excludeListingId?: string }): Promise<{ allowed: boolean; planKey: PlanKey; limit: number | null; used: number }>`
  - `hideExcessListings(db: Pick<PrismaClient, 'listing'>, userId: string, limit: number | null): Promise<number>`
  - `reactivateHiddenListings(db: Pick<PrismaClient, 'listing'>, userId: string, limit: number | null): Promise<number>`

- [ ] **Step 1: Tests du plan effectif qui échouent**

```ts
import { describe, it, expect } from 'vitest';
import { GRACE_PERIOD_MS, getEffectivePlanKey } from './effective-plan';

const now = new Date('2026-11-01T12:00:00Z');
const end = (offsetMs: number) => new Date(now.getTime() + offsetMs);
const DAY = 86_400_000;

describe('getEffectivePlanKey', () => {
  it('is FREE without a subscription row or on the FREE plan', () => {
    expect(getEffectivePlanKey(null, now)).toBe('FREE');
    expect(getEffectivePlanKey({ planKey: 'FREE', status: 'ACTIVE', currentPeriodEnd: null }, now)).toBe('FREE');
  });

  it('keeps a paid plan during the paid period and during the grace window', () => {
    const base = { planKey: 'PRO_AGENT' };
    expect(getEffectivePlanKey({ ...base, status: 'ACTIVE', currentPeriodEnd: end(DAY) }, now)).toBe('PRO_AGENT');
    expect(getEffectivePlanKey({ ...base, status: 'GRACE', currentPeriodEnd: end(-3 * DAY) }, now)).toBe('PRO_AGENT');
    expect(
      getEffectivePlanKey({ ...base, status: 'ACTIVE', currentPeriodEnd: end(-GRACE_PERIOD_MS + 1) }, now),
    ).toBe('PRO_AGENT');
  });

  it('drops to FREE once the grace window is over, even if the cron has not run', () => {
    expect(
      getEffectivePlanKey({ planKey: 'PRO_AGENT', status: 'GRACE', currentPeriodEnd: end(-GRACE_PERIOD_MS - 1) }, now),
    ).toBe('FREE');
  });

  it('treats EXPIRED as FREE', () => {
    expect(getEffectivePlanKey({ planKey: 'PRO_AGENT', status: 'EXPIRED', currentPeriodEnd: end(DAY) }, now)).toBe('FREE');
  });

  it('keeps a CANCELED plan until the period end, with no grace', () => {
    expect(getEffectivePlanKey({ planKey: 'PRO_AGENT', status: 'CANCELED', currentPeriodEnd: end(DAY) }, now)).toBe('PRO_AGENT');
    expect(getEffectivePlanKey({ planKey: 'PRO_AGENT', status: 'CANCELED', currentPeriodEnd: end(-1) }, now)).toBe('FREE');
  });

  it('keeps a paid plan with no period end (manual grant)', () => {
    expect(getEffectivePlanKey({ planKey: 'AGENCY_PREMIUM', status: 'ACTIVE', currentPeriodEnd: null }, now)).toBe('AGENCY_PREMIUM');
  });

  it('treats an unknown plan key as FREE', () => {
    expect(getEffectivePlanKey({ planKey: 'GOLD', status: 'ACTIVE', currentPeriodEnd: end(DAY) }, now)).toBe('FREE');
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/subscriptions/effective-plan.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implémenter `effective-plan.ts`**

```ts
// What plan does this user effectively have RIGHT NOW? Derived from the row
// and the clock, so quotas are correct even if the lifecycle cron is late.
import 'server-only';
import { isPlanKey, type PlanKey } from '@/lib/subscription-plans';

export const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export interface SubscriptionLike {
  planKey: string;
  status: string;
  currentPeriodEnd: Date | null;
}

export function getEffectivePlanKey(sub: SubscriptionLike | null, now: Date): PlanKey {
  if (!sub || !isPlanKey(sub.planKey) || sub.planKey === 'FREE') return 'FREE';
  if (sub.status === 'EXPIRED') return 'FREE';
  const end = sub.currentPeriodEnd;
  if (!end) return sub.planKey; // no period (manual grant): never lapses by itself
  if (sub.status === 'CANCELED') return now.getTime() <= end.getTime() ? sub.planKey : 'FREE';
  // ACTIVE | GRACE: paid period + grace window
  return now.getTime() <= end.getTime() + GRACE_PERIOD_MS ? sub.planKey : 'FREE';
}
```

Run le test — Expected: PASS.

- [ ] **Step 3: Tests du quota qui échouent**

`quota.test.ts` (avec `prismaMock`) :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { checkListingQuota, hideExcessListings, reactivateHiddenListings } from './quota';

const now = new Date('2026-11-01T12:00:00Z');
const noSub = () => prismaMock.subscription.findUnique.mockResolvedValue(null);

describe('checkListingQuota', () => {
  it('allows below the FREE limit and refuses at it', async () => {
    noSub();
    prismaMock.listing.count.mockResolvedValue(2);
    expect(await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: true, planKey: 'FREE', limit: 3, used: 2,
    });
    prismaMock.listing.count.mockResolvedValue(3);
    expect(await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false, limit: 3, used: 3,
    });
  });

  it('is unlimited on a plan with a null quota, without counting', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'AGENCY_PREMIUM', status: 'ACTIVE', currentPeriodEnd: new Date('2026-12-01'),
    } as never);
    const r = await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now });
    expect(r).toMatchObject({ allowed: true, planKey: 'AGENCY_PREMIUM', limit: null });
    expect(prismaMock.listing.count).not.toHaveBeenCalled();
  });

  it('uses the effective plan: a lapsed PRO is limited like FREE', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT', status: 'ACTIVE', currentPeriodEnd: new Date('2026-10-01'),
    } as never);
    prismaMock.listing.count.mockResolvedValue(3);
    expect(await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false, planKey: 'FREE',
    });
  });

  it('excludes the listing being edited from the count', async () => {
    noSub();
    prismaMock.listing.count.mockResolvedValue(0);
    await checkListingQuota(prismaMock, 'u1', DEFAULT_PRICING, { now, excludeListingId: 'l9' });
    expect(prismaMock.listing.count).toHaveBeenCalledWith({
      where: { userId: 'u1', status: { in: ['VERIFIED', 'PENDING'] }, id: { not: 'l9' } },
    });
  });
});

describe('hideExcessListings', () => {
  it('keeps the newest N published and hides only older VERIFIED ones', async () => {
    prismaMock.listing.findMany.mockResolvedValue([
      { id: 'a', status: 'VERIFIED' }, { id: 'b', status: 'VERIFIED' },
      { id: 'c', status: 'VERIFIED' }, { id: 'd', status: 'PENDING' }, { id: 'e', status: 'VERIFIED' },
    ] as never);
    prismaMock.listing.updateMany.mockResolvedValue({ count: 1 });
    expect(await hideExcessListings(prismaMock, 'u1', 3)).toBe(1);
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['e'] }, status: 'VERIFIED' },
      data: { status: 'HIDDEN' },
    });
  });

  it('does nothing for an unlimited plan or when under the limit', async () => {
    expect(await hideExcessListings(prismaMock, 'u1', null)).toBe(0);
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'a', status: 'VERIFIED' }] as never);
    expect(await hideExcessListings(prismaMock, 'u1', 3)).toBe(0);
    expect(prismaMock.listing.updateMany).not.toHaveBeenCalled();
  });
});

describe('reactivateHiddenListings', () => {
  it('restores the newest hidden listings up to the free slots', async () => {
    prismaMock.listing.count.mockResolvedValue(28);
    prismaMock.listing.findMany.mockResolvedValue([{ id: 'x' }, { id: 'y' }] as never);
    prismaMock.listing.updateMany.mockResolvedValue({ count: 2 });
    expect(await reactivateHiddenListings(prismaMock, 'u1', 30)).toBe(2);
    expect(prismaMock.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', status: 'HIDDEN' }, take: 2 }),
    );
    expect(prismaMock.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['x', 'y'] }, status: 'HIDDEN' },
      data: { status: 'VERIFIED' },
    });
  });

  it('restores nothing when the quota is already full', async () => {
    prismaMock.listing.count.mockResolvedValue(30);
    expect(await reactivateHiddenListings(prismaMock, 'u1', 30)).toBe(0);
    expect(prismaMock.listing.findMany).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/listings/quota.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implémenter `quota.ts`**

```ts
// Listing quota per effective plan + the hide/restore helpers shared by the
// lifecycle cron, the voluntary downgrade route and the renewal webhook.
// HIDDEN = hidden because the subscription lapsed; never deleted, and only
// VERIFIED listings are ever hidden (PENDING ones are not public anyway).
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planMaxListings, type PricingData } from '@/lib/pricing';
import type { PlanKey } from '@/lib/subscription-plans';
import { getEffectivePlanKey } from '../subscriptions/effective-plan';

export const PUBLISHED_STATUSES = ['VERIFIED', 'PENDING'] as const;

type ListingDb = Pick<PrismaClient, 'listing'>;

export interface QuotaCheck {
  allowed: boolean;
  planKey: PlanKey;
  limit: number | null;
  used: number;
}

export async function checkListingQuota(
  db: Pick<PrismaClient, 'subscription' | 'listing'>,
  userId: string,
  pricing: PricingData,
  opts: { now?: Date; excludeListingId?: string } = {},
): Promise<QuotaCheck> {
  const now = opts.now ?? new Date();
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  const planKey = getEffectivePlanKey(sub, now);
  const limit = planMaxListings(pricing, planKey);
  if (limit === null) return { allowed: true, planKey, limit, used: 0 };

  const used = await db.listing.count({
    where: {
      userId,
      status: { in: [...PUBLISHED_STATUSES] },
      ...(opts.excludeListingId ? { id: { not: opts.excludeListingId } } : {}),
    },
  });
  return { allowed: used < limit, planKey, limit, used };
}

export async function hideExcessListings(
  db: ListingDb,
  userId: string,
  limit: number | null,
): Promise<number> {
  if (limit === null) return 0;
  const published = await db.listing.findMany({
    where: { userId, status: { in: [...PUBLISHED_STATUSES] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, status: true },
  });
  const toHide = published
    .slice(limit)
    .filter((l) => l.status === 'VERIFIED')
    .map((l) => l.id);
  if (toHide.length === 0) return 0;
  const res = await db.listing.updateMany({
    where: { id: { in: toHide }, status: 'VERIFIED' },
    data: { status: 'HIDDEN' },
  });
  return res.count;
}

export async function reactivateHiddenListings(
  db: ListingDb,
  userId: string,
  limit: number | null,
): Promise<number> {
  const used = await db.listing.count({
    where: { userId, status: { in: [...PUBLISHED_STATUSES] } },
  });
  const slots = limit === null ? 1000 : Math.min(1000, Math.max(0, limit - used));
  if (slots === 0) return 0;
  const hidden = await db.listing.findMany({
    where: { userId, status: 'HIDDEN' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: slots,
    select: { id: true },
  });
  if (hidden.length === 0) return 0;
  const res = await db.listing.updateMany({
    where: { id: { in: hidden.map((l) => l.id) }, status: 'HIDDEN' },
    data: { status: 'VERIFIED' },
  });
  return res.count;
}
```

Run le test — Expected: PASS.

- [ ] **Step 5: Tests de la route PATCH qui échouent**

Dans `[id]/route.test.ts`, ajouter (en réutilisant les helpers de requête/annonce du fichier ; si une annonce complète publiable n'existe pas déjà, la construire à partir du test « publish » existant) :
  - publier un `DRAFT` avec `listing.count → 3` et aucun abonnement → **403** `LISTING_QUOTA_REACHED` avec `limit: 3, planKey: 'FREE'`, `listing.update` non appelé ;
  - publier un `DRAFT` avec `listing.count → 2` → 200 ;
  - re-publier (modifier) une annonce déjà `VERIFIED` avec `listing.count → 3` → 200 (déjà comptée, pas de contrôle) ;
  - publier une annonce `HIDDEN` avec `listing.count → 3` → 403 ; avec `→ 2` → 200 et statut `VERIFIED`.
Mettre aussi `prismaMock.listing.count.mockResolvedValue(0 as never)` et `prismaMock.subscription.findUnique.mockResolvedValue(null)` dans le setup des tests de publication déjà existants (sinon `used` est `undefined` et le quota bloque).

Run: `pnpm --filter frontend exec vitest run "src/app/api/listings/[id]/route.test.ts"` — Expected: nouveaux tests FAIL.

- [ ] **Step 6: Implémenter dans la route PATCH**

`editable.ts` : `new Set(['DRAFT', 'PENDING', 'VERIFIED', 'REJECTED', 'HIDDEN'])`.

`[id]/route.ts` : importer `getPricing` (`@/lib/server/pricing`), `checkListingQuota` et `PUBLISHED_STATUSES` (`@/lib/server/listings/quota`). Dans `if (publish) { … }`, juste après le bloc `if (missing.length > 0) { … }`, ajouter :

```ts
      // Quota: an already-published listing (VERIFIED/PENDING) is already
      // counted, so editing it never needs a free slot. DRAFT / REJECTED /
      // HIDDEN listings do — they would become published.
      if (!(PUBLISHED_STATUSES as readonly string[]).includes(existing.status)) {
        const quota = await checkListingQuota(prisma, auth.user.sub, await getPricing(), {
          excludeListingId: id,
        });
        if (!quota.allowed) {
          return NextResponse.json(
            {
              error: 'LISTING_QUOTA_REACHED',
              message: 'Listing limit reached for your plan.',
              planKey: quota.planKey,
              limit: quota.limit,
            },
            { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
          );
        }
      }
```

Dans `api/listings/route.ts` (GET) : ajouter `prisma.listing.count({ where: { userId: auth.user.sub, status: 'HIDDEN' } })` au `Promise.all`, la variable `hidden`, et `hidden` dans `counts`. Compléter le test du GET existant si une assertion vérifie la forme exacte de `counts`.

- [ ] **Step 7: Vérifier et commit**

Run: `pnpm --filter frontend exec vitest run src/app/api/listings src/lib/server/listings src/lib/server/subscriptions && pnpm typecheck` — Expected: PASS.

```bash
git add frontend/src/lib/server/subscriptions frontend/src/lib/server/listings frontend/src/app/api/listings
git commit -m "feat(listings): enforce plan quota at publication, add HIDDEN status"
```

---

### Task 7: Cycle de vie de l'abonnement (service) et renouvellement

**Files:**
- Modify: `frontend/src/lib/server/notifications/templates.ts` (3 wrappers)
- Create: `frontend/src/lib/server/subscriptions/lifecycle.ts` + `lifecycle.test.ts`
- Modify: `frontend/src/lib/server/payments/fulfill-order.ts` (période, réactivation)
- Modify: `frontend/src/lib/server/payments/fulfill-order.test.ts`

**Interfaces:**
- Consumes : `hideExcessListings`, `reactivateHiddenListings` (tâche 6), `GRACE_PERIOD_MS` (tâche 6), `createNotification`, `getPricing`, `planMaxListings`.
- Produces :
  - `subscriptionReminderNotification(userId: string, daysLeft: 7 | 3, periodEnd: Date): CreateNotificationInput`
  - `subscriptionGraceNotification(userId: string, periodEnd: Date): CreateNotificationInput`
  - `subscriptionExpiredNotification(userId: string, hiddenCount: number, periodEnd: Date): CreateNotificationInput`
  - `runSubscriptionLifecycle(opts: { prisma: PrismaClient; pricing: PricingData; now?: Date }): Promise<{ reminded: number; graced: number; expired: number; hidden: number }>`
  - `fulfillPaidOrder(tx, order)` : renouvellement du même plan = report des jours restants ; réactivation des annonces masquées.

- [ ] **Step 1: Wrappers de notification**

Ajouter à `templates.ts` (le `dedupeKey` inclut la fin de période pour qu'un nouveau cycle puisse renotifier) :

```ts
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export function subscriptionReminderNotification(
  userId: string,
  daysLeft: 7 | 3,
  periodEnd: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_REMINDER',
    title: `Votre abonnement expire dans ${daysLeft} jours`,
    body: `Renouvelez avant le ${isoDay(periodEnd)} pour garder toutes vos annonces en ligne.`,
    data: { daysLeft, periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-reminder:${userId}:${periodEnd.toISOString()}:${daysLeft}`,
  };
}

export function subscriptionGraceNotification(userId: string, periodEnd: Date): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_GRACE',
    title: 'Votre abonnement a expiré',
    body: 'Vous avez 7 jours pour renouveler avant le masquage de vos annonces au-delà de 3.',
    data: { periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-grace:${userId}:${periodEnd.toISOString()}`,
  };
}

export function subscriptionExpiredNotification(
  userId: string,
  hiddenCount: number,
  periodEnd: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUBSCRIPTION_EXPIRED',
    title: 'Abonnement terminé',
    body:
      hiddenCount > 0
        ? `${hiddenCount} annonce(s) ont été masquées. Elles reviendront dès le renouvellement.`
        : 'Votre compte repasse au plan Gratuit.',
    data: { hiddenCount, periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-expired:${userId}:${periodEnd.toISOString()}`,
  };
}
```

- [ ] **Step 2: Tests du lifecycle qui échouent**

`lifecycle.test.ts` (`prismaMock` ; `$transaction` exécute le callback sur `prismaMock`) :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';

vi.mock('@/lib/server/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/server/listings/quota', () => ({ hideExcessListings: vi.fn() }));

import { createNotification } from '@/lib/server/notifications';
import { hideExcessListings } from '@/lib/server/listings/quota';
import { runSubscriptionLifecycle } from './lifecycle';

const DAY = 86_400_000;
const now = new Date('2026-11-10T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * DAY);
const mockNotify = vi.mocked(createNotification);
const mockHide = vi.mocked(hideExcessListings);

beforeEach(() => {
  prismaMock.$transaction.mockImplementation(async (fn: unknown) =>
    (fn as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock),
  );
  mockNotify.mockResolvedValue({} as never);
  mockHide.mockResolvedValue(0);
  prismaMock.subscription.findMany.mockResolvedValue([]);
});

const run = () => runSubscriptionLifecycle({ prisma: prismaMock, pricing: DEFAULT_PRICING, now });

describe('reminders', () => {
  it('sends the J-3 reminder when 3 days or fewer remain, J-7 otherwise', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([
        { userId: 'a', currentPeriodEnd: at(2.5) },
        { userId: 'b', currentPeriodEnd: at(6) },
      ] as never)
      .mockResolvedValue([]);
    const r = await run();
    expect(r.reminded).toBe(2);
    expect(mockNotify.mock.calls.map((c) => c[1].dedupeKey)).toEqual([
      `sub-reminder:a:${at(2.5).toISOString()}:3`,
      `sub-reminder:b:${at(6).toISOString()}:7`,
    ]);
  });

  it('does not count a notification that was already sent (deduplicated)', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(2) }] as never)
      .mockResolvedValue([]);
    mockNotify.mockResolvedValue(null);
    expect((await run()).reminded).toBe(0);
  });
});

describe('grace', () => {
  it('moves a lapsed ACTIVE subscription to GRACE and notifies once', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-1) }] as never) // lapsed
      .mockResolvedValue([]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    const r = await run();
    expect(r.graced).toBe(1);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'a', status: 'ACTIVE' },
      data: { status: 'GRACE' },
    });
  });

  it('skips the notification when another run already moved it', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-1) }] as never)
      .mockResolvedValue([]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    expect((await run()).graced).toBe(0);
  });
});

describe('expiry', () => {
  it('expires after the grace window: FREE, EXPIRED, hides the excess, notifies', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([]) // lapsed
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never); // to expire
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockHide.mockResolvedValue(4);
    const r = await run();
    expect(r).toMatchObject({ expired: 1, hidden: 4 });
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'a', planKey: { not: 'FREE' }, status: { in: ['GRACE', 'CANCELED'] } },
      data: { planKey: 'FREE', status: 'EXPIRED' },
    });
    expect(mockHide).toHaveBeenCalledWith(prismaMock, 'a', 3);
    expect(mockNotify.mock.calls.at(-1)?.[1]).toMatchObject({ type: 'SUBSCRIPTION_EXPIRED' });
  });

  it('is idempotent: a row another run already expired is not hidden or notified again', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const r = await run();
    expect(r.expired).toBe(0);
    expect(mockHide).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('robustness', () => {
  it('does nothing when there are no subscriptions (including null period ends)', async () => {
    expect(await run()).toEqual({ reminded: 0, graced: 0, expired: 0, hidden: 0 });
  });

  it('keeps processing the other users when one fails', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([
        { userId: 'bad', currentPeriodEnd: at(2) },
        { userId: 'ok', currentPeriodEnd: at(2) },
      ] as never)
      .mockResolvedValue([]);
    mockNotify.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({} as never);
    expect((await run()).reminded).toBe(1);
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/subscriptions/lifecycle.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implémenter `lifecycle.ts`**

```ts
// Subscription lifecycle, driven by the hourly cron. State-based and
// idempotent: every transition is a guarded updateMany and every notification
// is deduplicated, so a re-run (or two overlapping ones) changes nothing twice.
//   ACTIVE ──(period end)──► GRACE ──(+7 d)──► EXPIRED (plan FREE, excess hidden)
//   CANCELED ──(period end)──► EXPIRED (no grace: the user chose to leave)
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planMaxListings, type PricingData } from '@/lib/pricing';
import { createLogger } from '@/lib/server/logger';
import { hideExcessListings } from '../listings/quota';
import { createNotification } from '../notifications';
import {
  subscriptionExpiredNotification,
  subscriptionGraceNotification,
  subscriptionReminderNotification,
} from '../notifications/templates';
import { GRACE_PERIOD_MS } from './effective-plan';

const log = createLogger();
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

export interface LifecycleResult {
  reminded: number;
  graced: number;
  expired: number;
  hidden: number;
}

export async function runSubscriptionLifecycle(opts: {
  prisma: PrismaClient;
  pricing: PricingData;
  now?: Date;
}): Promise<LifecycleResult> {
  const { prisma, pricing } = opts;
  const now = opts.now ?? new Date();
  const result: LifecycleResult = { reminded: 0, graced: 0, expired: 0, hidden: 0 };

  // 1. Reminders (J-7, then J-3) for ACTIVE subscriptions ending within a week.
  const upcoming = await prisma.subscription.findMany({
    where: {
      planKey: { not: 'FREE' },
      status: 'ACTIVE',
      currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) },
    },
    select: { userId: true, currentPeriodEnd: true },
    take: BATCH,
  });
  for (const sub of upcoming) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const daysLeft: 7 | 3 = (end.getTime() - now.getTime()) / DAY_MS <= 3 ? 3 : 7;
      const created = await createNotification(
        prisma,
        subscriptionReminderNotification(sub.userId, daysLeft, end),
      );
      if (created) result.reminded++;
    } catch (err) {
      log.warn('subscription reminder failed', { userId: sub.userId, error: String(err) });
    }
  }

  // 2. ACTIVE past the period end → GRACE.
  const lapsed = await prisma.subscription.findMany({
    where: { planKey: { not: 'FREE' }, status: 'ACTIVE', currentPeriodEnd: { lte: now } },
    select: { userId: true, currentPeriodEnd: true },
    take: BATCH,
  });
  for (const sub of lapsed) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const moved = await prisma.subscription.updateMany({
        where: { userId: sub.userId, status: 'ACTIVE' },
        data: { status: 'GRACE' },
      });
      if (moved.count > 0) {
        await createNotification(prisma, subscriptionGraceNotification(sub.userId, end));
        result.graced++;
      }
    } catch (err) {
      log.warn('subscription grace transition failed', { userId: sub.userId, error: String(err) });
    }
  }

  // 3. GRACE past the window, or CANCELED past the period end → EXPIRED + hide.
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);
  const toExpire = await prisma.subscription.findMany({
    where: {
      planKey: { not: 'FREE' },
      OR: [
        { status: 'GRACE', currentPeriodEnd: { lte: graceCutoff } },
        { status: 'CANCELED', currentPeriodEnd: { lte: now } },
      ],
    },
    select: { userId: true, currentPeriodEnd: true },
    take: BATCH,
  });
  const freeLimit = planMaxListings(pricing, 'FREE');
  for (const sub of toExpire) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const moved = await tx.subscription.updateMany({
          where: {
            userId: sub.userId,
            planKey: { not: 'FREE' },
            status: { in: ['GRACE', 'CANCELED'] },
          },
          data: { planKey: 'FREE', status: 'EXPIRED' },
        });
        if (moved.count === 0) return null;
        return { hidden: await hideExcessListings(tx, sub.userId, freeLimit) };
      });
      if (outcome) {
        await createNotification(
          prisma,
          subscriptionExpiredNotification(sub.userId, outcome.hidden, end),
        );
        result.expired++;
        result.hidden += outcome.hidden;
      }
    } catch (err) {
      log.warn('subscription expiry failed', { userId: sub.userId, error: String(err) });
    }
  }

  return result;
}
```

Run le test — Expected: PASS. (Si un `findMany` mock séquentiel ne correspond pas à l'ordre des appels, ajuster l'ordre des `mockResolvedValueOnce`, jamais l'implémentation : l'ordre reminders → lapsed → toExpire est voulu.)

- [ ] **Step 4: Tests `fulfill-order` qui échouent**

Ajouter dans `fulfill-order.test.ts` (reprendre la fabrication du `tx` mock du fichier ; ajouter `subscription.findUnique` et `listing.*` au mock) :
  - **Renouvellement du même plan** : abonnement existant `PRO_AGENT`, `ACTIVE`, `currentPeriodEnd = now + 10 j` → nouvelle fin = `now + 40 j` ; statut `ACTIVE`.
  - **Changement de plan** : existant `PRO_AGENT` valide 10 j, paiement `AGENCY_PREMIUM` → fin = `now + 30 j` (pas de report).
  - **Réabonnement après grâce** : existant `GRACE`, fin dépassée → fin = `now + 30 j`, `canceledAt: null`.
  - **Réactivation** : après l'upsert, `reactivateHiddenListings` est appelé avec le quota du plan payé (`30` pour `PRO_AGENT`, `null` pour `AGENCY_PREMIUM`) ; vérifier via `vi.mock('@/lib/server/listings/quota')` et `vi.mock('@/lib/server/pricing')` (`getPricing` → `DEFAULT_PRICING`).
  - Utiliser `vi.useFakeTimers(); vi.setSystemTime(...)` pour figer `now`.

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments/fulfill-order.test.ts` — Expected: nouveaux tests FAIL.

- [ ] **Step 5: Implémenter dans `fulfill-order.ts`**

Imports : `getPricing` (`../pricing`), `planMaxListings` (`@/lib/pricing`), `reactivateHiddenListings` (`../listings/quota`). Remplacer le bloc `subscription_plan_change` par :

```ts
  if (order.userId && meta?.kind === 'subscription_plan_change' && isPlanKey(meta.planKey)) {
    const now = Date.now();
    const existing = await tx.subscription.findUnique({
      where: { userId: order.userId },
      select: { planKey: true, status: true, currentPeriodEnd: true },
    });
    // Renewing the SAME plan while it is still running carries the remaining
    // days over; any other case (upgrade, lapsed, grace) starts from now, so
    // switching plans never gifts time at the higher tier.
    const carriesOver =
      existing !== null &&
      existing.planKey === meta.planKey &&
      (existing.status === 'ACTIVE' || existing.status === 'CANCELED') &&
      existing.currentPeriodEnd !== null &&
      existing.currentPeriodEnd.getTime() > now;
    const base = carriesOver && existing?.currentPeriodEnd ? existing.currentPeriodEnd.getTime() : now;
    const currentPeriodEnd = new Date(base + SUBSCRIPTION_PERIOD_MS);

    await tx.subscription.upsert({
      where: { userId: order.userId },
      create: { userId: order.userId, planKey: meta.planKey, status: 'ACTIVE', currentPeriodEnd },
      update: { planKey: meta.planKey, status: 'ACTIVE', currentPeriodEnd, canceledAt: null },
    });

    // Bring back listings hidden by a previous expiry, within the new quota.
    await reactivateHiddenListings(
      tx,
      order.userId,
      planMaxListings(await getPricing(), meta.planKey),
    );
  }
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments src/app/api/webhooks` — Expected: PASS (les anciens tests de webhook doivent mocker `subscription.findUnique` → `undefined` ⇒ `existing` doit être traité comme absent : si le test existant échoue sur `existing !== null`, remplacer par `existing != null`… n'utiliser `!= null` que dans ce cas, et le noter en commentaire).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/subscriptions frontend/src/lib/server/notifications/templates.ts frontend/src/lib/server/payments/fulfill-order.ts frontend/src/lib/server/payments/fulfill-order.test.ts
git commit -m "feat(subscriptions): lifecycle service, same-plan renewal carry-over, listing reactivation"
```

---

### Task 8: Cron `subscription-lifecycle`, documentation, rétrogradation volontaire

**Files:**
- Create: `frontend/src/app/api/cron/subscription-lifecycle/route.ts` + `route.test.ts`
- Modify: `docs/deploy/n0c-crons.md`
- Modify: `frontend/src/lib/server/observability/n0c-crons-shape.test.ts`
- Modify: `frontend/src/app/api/subscriptions/change-plan/route.ts` + `route.test.ts`
- Modify: `frontend/src/app/api/subscriptions/cancel/route.ts` (commentaire d'en-tête uniquement)
- Modify: `CLAUDE.md` (liste des crons)

**Interfaces:**
- Consumes : `runSubscriptionLifecycle` (tâche 7), `getPricing`, `hideExcessListings`, `planMaxListings`.

- [ ] **Step 1: Test du cron (calqué sur `order-expiration/route.test.ts`)**

Lire `frontend/src/app/api/cron/order-expiration/route.test.ts` et créer `subscription-lifecycle/route.test.ts` sur le même modèle : (a) sans `Authorization: Bearer ${CRON_SECRET}` → 401/403 comme les autres crons, `runSubscriptionLifecycle` non appelé ; (b) avec le secret → 200 `{ ok: true, reminded, graced, expired, hidden }` ; mocker `@/lib/server/subscriptions/lifecycle`, `@/lib/server/pricing` et `@/lib/server/leader-lease` (`withLease` exécute directement son callback).

Run: `pnpm --filter frontend exec vitest run src/app/api/cron/subscription-lifecycle/route.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implémenter la route**

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPricing } from '@/lib/server/pricing';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import {
  runSubscriptionLifecycle,
  type LifecycleResult,
} from '@/lib/server/subscriptions/lifecycle';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result: LifecycleResult = { reminded: 0, graced: 0, expired: 0, hidden: 0 };

    await withLease(redis ?? undefined, 'subscription-lifecycle', LEASE_TTL_MS, async () => {
      result = await runSubscriptionLifecycle({ prisma, pricing: await getPricing() });
      log.info('subscription-lifecycle tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json({ ok: true, ...result }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export const GET = POST;
```

Run le test — Expected: PASS. Le test `runtime-enforcement` couvre déjà la nouvelle route.

- [ ] **Step 3: Documentation et tripwire**

`docs/deploy/n0c-crons.md` : ajouter la ligne de tableau `| subscription-lifecycle | \`0 * * * *\` | /api/cron/subscription-lifecycle |` (même alignement que les autres), la ligne `curl` correspondante (modèle des lignes 21-26), et la ligne de crontab de prod `13 * * * * /home/habiwpes/bin/habitatafrik-cron.sh subscription-lifecycle >/dev/null 2>&1` (modèle des lignes 66-71).

`n0c-crons-shape.test.ts` : ajouter `'subscription-lifecycle'` à `CANONICAL` et remplacer « exactement les 6 crons canoniques » par « exactement les 7 crons canoniques » (titre du test et commentaire d'en-tête).

`CLAUDE.md` (section « Cron strategy ») : ajouter `subscription-lifecycle` (hourly — rappels J-7/J-3, grâce 7 j, expiration + masquage des annonces) à la liste des cibles.

Run: `pnpm --filter frontend exec vitest run src/lib/server/observability` — Expected: PASS.

- [ ] **Step 4: Rétrogradation volontaire vers FREE (test d'abord)**

Dans `change-plan/route.test.ts`, ajouter : passer à FREE appelle `hideExcessListings(prismaMock, userId, 3)` (mocker `@/lib/server/listings/quota` et `@/lib/server/pricing` → `DEFAULT_PRICING`) et la réponse reste 200 avec la subscription ; en cas d'échec de `hideExcessListings` la route renvoie 500 plutôt que de laisser un compte FREE avec plus de 3 annonces publiques (ne pas avaler l'erreur). Run — Expected: FAIL.

Dans `change-plan/route.ts` : importer `getPricing`, `planMaxListings`, `hideExcessListings` ; remplacer `PLAN_CATALOG[...]` pour le prix par `planPriceFcfa(await getPricing(), parsed.data.planKey)` (garde `> 0` → `UPGRADE_REQUIRES_PAYMENT`), et envelopper l'upsert FREE + masquage dans une transaction :

```ts
    const pricing = await getPricing();
    const subscription = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.upsert({
        where: { userId: auth.user.sub },
        create: { userId: auth.user.sub, planKey: 'FREE', status: 'ACTIVE' },
        update: { planKey: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, canceledAt: null },
        select: { planKey: true, status: true, currentPeriodEnd: true, canceledAt: true },
      });
      await hideExcessListings(tx, auth.user.sub, planMaxListings(pricing, 'FREE'));
      return sub;
    });
```

Mettre à jour le test existant pour que `$transaction` exécute son callback sur `prismaMock`. Run: `pnpm --filter frontend exec vitest run src/app/api/subscriptions` — Expected: PASS.

`cancel/route.ts` : remplacer le commentaire d'en-tête par : « Flips an active paid subscription to CANCELED. The plan stays effective until currentPeriodEnd (see lib/server/subscriptions/effective-plan.ts); the subscription-lifecycle cron then expires it without a grace period. »

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/cron/subscription-lifecycle frontend/src/app/api/subscriptions docs/deploy/n0c-crons.md frontend/src/lib/server/observability/n0c-crons-shape.test.ts CLAUDE.md
git commit -m "feat(subscriptions): hourly lifecycle cron, hide excess on voluntary downgrade"
```

---

### Task 9: Administration des tarifs (API SUPERADMIN + formulaire)

**Files:**
- Create: `frontend/src/app/api/admin/pricing/route.ts` + `route.test.ts`
- Create: `frontend/src/components/admin/PricingEditor.tsx`
- Modify: `frontend/src/app/admin/(protected)/parametres/tarification/page.tsx`

**Interfaces:**
- Consumes : `PricingDataSchema`, `getPricing`, `savePricing`, `logAdminAction`.
- Produces : `PUT /api/admin/pricing` (body = `PricingData`) → 200 `{ pricing }` ; erreurs 400 `VALIDATION_FAILED`, 401/403 selon `requireSuperadmin`.

- [ ] **Step 1: Tests de la route qui échouent**

Modèle : `frontend/src/app/api/admin/users/[id]/role/route.test.ts` (mêmes mocks de `requireSuperadmin`, `enforceAdminRateLimit`, CSRF). Cas :
  - non-SUPERADMIN → la réponse de `requireSuperadmin` est renvoyée, `savePricing` non appelé ;
  - CSRF absent → 403 ;
  - corps invalide (prix FREE ≠ 0, remise 95, quota 2.5) → 400 `VALIDATION_FAILED`, rien d'enregistré ;
  - corps valide → `savePricing(data, adminId)` appelé, `logAdminAction` appelé avec `action: 'PRICING_UPDATED'`, `targetType: 'PricingConfig'`, `targetId: 'default'` et `metadata: { before, after }` ; réponse 200.

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/pricing/route.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implémenter la route**

```ts
// PUT /api/admin/pricing — SUPERADMIN only. Replaces the live pricing config
// (plan prices + quotas, token base rate, pack discounts). Every change is
// audited with the before/after snapshot.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { PricingDataSchema } from '@/lib/pricing';
import { logAdminAction } from '@/lib/server/admin/audit';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPricing, savePricing } from '@/lib/server/pricing';
import { prisma } from '@/lib/server/prisma';

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = PricingDataSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid pricing', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const before = await getPricing();
    await savePricing(parsed.data, auth.admin.id);
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'PRICING_UPDATED',
      targetType: 'PricingConfig',
      targetId: 'default',
      metadata: { before, after: parsed.data },
    });

    return NextResponse.json(
      { pricing: parsed.data },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

Run le test — Expected: PASS.

- [ ] **Step 3: Formulaire**

`frontend/src/components/admin/PricingEditor.tsx` — composant client (`'use client'`) :
  - charge la config avec `usePricing()` (copie locale dans un `useState`, resynchronisée à l'arrivée de la valeur serveur) ;
  - champs numériques : par plan (prix ; quota avec case « illimité » = `null`, FREE sans champ prix), `token.baseFcfa`, et par pack (`tokens`, `discountPct`) avec le **prix calculé affiché en lecture seule** (`tokenPackPriceFcfa`) ;
  - validation locale par `PricingDataSchema.safeParse` avant envoi, erreurs affichées sous le formulaire ;
  - envoi : `api('/api/admin/pricing', { method: 'PUT', body: data })` (`@/lib/api` — gère le CSRF), toast succès/erreur via le `ToastProvider` comme dans `jetons/page.tsx` ;
  - réutiliser `AdminSettingsSection` / `AdminSettingsButton` pour rester cohérent avec la page.

Dans `tarification/page.tsx` : supprimer la constante `TOKEN_PRICING` (fausses données par pays) et son bloc JSX (≈ l.211), insérer `<PricingEditor />` à sa place. Laisser `COMMISSIONS` et `BOOST_PACKS` (maquettes des phases suivantes) tels quels.

- [ ] **Step 4: Vérifier et commit**

Run: `pnpm typecheck && pnpm lint` — Expected: OK. Vérification visuelle : lancer `pnpm dev` (arrêter tout autre `tsc`/`vitest` en parallèle), se connecter en SUPERADMIN (`pnpm db:make-superadmin <email>` sur la base locale), ouvrir `/admin/parametres/tarification`, modifier le prix de PRO_AGENT, enregistrer, recharger puis vérifier que `/settings` affiche le nouveau prix et qu'une ligne `PRICING_UPDATED` existe dans `/api/admin/audit-log`.

```bash
git add frontend/src/app/api/admin/pricing frontend/src/components/admin/PricingEditor.tsx "frontend/src/app/admin/(protected)/parametres/tarification/page.tsx"
git commit -m "feat(admin): editable pricing with audit trail"
```

---

### Task 10: Vérification finale

**Files:** aucun (ou corrections de formatage).

- [ ] **Step 1: Arrêter tout `pnpm dev` / `tsc` en cours** (les timeouts bcrypt apparaissent sous charge).

- [ ] **Step 2: Portail complet**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: tout vert. Un test qui échoue par timeout bcrypt sous charge se relance seul : `pnpm --filter frontend exec vitest run <fichier>`.

- [ ] **Step 3: Build** (≈ 14 min : lancer détaché, ne pas attendre au premier plan ; un code 143 = timeout outil, pas un échec)

Run: `pnpm build`
Expected: succès.

- [ ] **Step 4: Parcours manuel local**

Base locale `localhost:5433`, `pnpm dev` : (1) avec un compte FREE, publier 3 annonces puis tenter la 4ᵉ → refus `LISTING_QUOTA_REACHED` ; (2) `POST /api/orders` avec `amount: 1` et `planKey: PRO_AGENT` → 400 `AMOUNT_MISMATCH` ; (3) passer en base un abonnement `ACTIVE` avec `currentPeriodEnd` dans le passé, appeler `GET /api/cron/subscription-lifecycle` avec `Authorization: Bearer $CRON_SECRET` → statut `GRACE` et notification ; antidater de 8 jours, rappeler → `EXPIRED`, `FREE`, annonces excédentaires `HIDDEN` ; rappeler une 3ᵉ fois → aucun changement.

- [ ] **Step 5: Résumé et arrêt**

Lister les commits et rappeler : migration `20261013120000_pricing_config` à appliquer en prod via `pnpm db:migrate:deploy`, ligne de crontab `subscription-lifecycle` à créer dans le panel N0C. **Ne rien pousser ni déployer sans demande explicite de l'utilisateur.**
