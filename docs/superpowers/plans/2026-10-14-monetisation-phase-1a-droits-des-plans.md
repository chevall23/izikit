# Monétisation phase 1A — Droits des plans : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Rendre réels les jetons offerts par mois et la limite d'alertes secteur de la grille officielle des plans, et stocker les boosts inclus pour le morceau 1B.

**Architecture :** On étend `PricingData` (trois champs par plan, avec valeurs par défaut pour les lignes déjà stockées). Le crédit mensuel de jetons se fait à la validation du paiement, dans la transaction de `fulfill-order.ts`, avec une clé d'idempotence `TokenTransaction.grantKey`. La limite d'alertes suit le modèle de `listings/quota.ts` : verrou consultatif par utilisateur, vérification à la création et à la réactivation, désactivation (jamais suppression) à l'expiration ou au retour volontaire au plan Gratuit.

**Tech Stack :** Next.js 16 (Route Handlers), Prisma 5 + PostgreSQL, zod 4, Vitest 4 (`prismaMock` de `@/test-utils/prisma-mock`).

**Spec :** `docs/superpowers/specs/2026-10-14-monetisation-phase-1a-droits-des-plans-design.md`

## Global Constraints

- Grille officielle (valeurs par défaut du code) : Gratuit `monthlyTokens 0 / includedBoosts 0 / maxAlerts 0` ; Pro Agent (15 000 F) `10 / 1 / 10` ; Agence (35 000 F) `40 / 4 / null (illimité)`.
- Limite d'alertes : uniquement pour `accountType = 'OWNER_AGENT'`. Tout autre compte : plafond fixe `SEEKER_ALERT_CAP = 20` alertes actives.
- Erreur de quota d'alertes : HTTP 403, `error: 'ALERT_QUOTA_REACHED'`, avec `planKey` et `limit`. `message` en français (l'UI affiche `ApiError.message`). `frontend/src/lib/api.ts` est protégé : ne pas le modifier.
- Jetons mensuels : crédités à la validation du paiement d'abonnement, clé `plan:<orderId>`, transaction `BONUS`, aucun nouveau cron, les jetons n'expirent pas.
- Les alertes en trop sont désactivées (`active = false`), jamais supprimées ; les plus anciennes sont conservées.
- Ordre des verrous : `lockUserListingQuota` puis `lockUserAlertQuota`, jamais l'inverse.
- Tout est en entiers (FCFA sans décimales). Chaque Route Handler garde `export const runtime = 'nodejs'`.
- `frontend/src/lib/server/webhook/handler.ts`, `middleware/*`, `auth.ts`, `api.ts` ne sont pas modifiés.
- Avant chaque commit : les hooks lint-staged + `pnpm typecheck` tournent (≈ 2-4 min sur cette machine : lancer `git commit` avec un timeout long ou en arrière-plan). Le fichier généré `.next/dev/types/routes.d.ts` peut être corrompu par `pnpm dev` : s'il fait échouer `tsc`, supprimer les lignes en trop en fin de fichier (il est ignoré par git).
- Messages de commit terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Ne pas pousser, ne pas déployer.
- Les commandes ci-dessous se lancent depuis `frontend/` sauf mention contraire.

## Review Focus

1. Webhook de paiement rejoué ou deux livraisons de la même commande : un seul crédit de jetons (Task 3).
2. Ligne `PricingConfig` enregistrée avant cette phase, donc sans les nouveaux champs : elle doit rester valide et retomber sur la grille, sans repasser aux valeurs par défaut du code pour les prix (Task 1).
3. Commande sans marqueur de gel du prix (`priceFcfa`) : ni abonnement ni jetons offerts (Task 3).
4. Chercheur (compte non agent) sur le plan Gratuit : il doit pouvoir créer des alertes, jusqu'à 20 (Tasks 4 et 5).
5. Réactivation d'une alerte : l'alerte elle-même ne compte pas deux fois ; désactiver n'est jamais bloqué (Task 5).
6. Expiration ou retour volontaire au plan Gratuit : alertes désactivées et non supprimées, second passage du cron sans effet (Task 6).

## File Structure

| Fichier | Rôle |
|---|---|
| `src/lib/subscription-plans.ts` | Constantes de la grille par plan (ajout de 3 champs) |
| `src/lib/pricing.ts` | Schéma zod avec défauts, `DEFAULT_PRICING`, helpers `planMonthlyTokens` / `planIncludedBoosts` / `planMaxAlerts`, libellés de cartes |
| `src/components/admin/PricingEditor.tsx` | Édition admin des 3 champs |
| `prisma/schema.prisma` + `prisma/migrations/20261014100000_token_grant_key/` | Colonne `TokenTransaction.grantKey` |
| `src/lib/server/payments/fulfill-order.ts` | Crédit mensuel idempotent dans la transaction de paiement |
| `src/lib/server/alerts/quota.ts` (nouveau) | Verrou, vérification de quota, désactivation des alertes en trop |
| `src/app/api/alerts/route.ts`, `src/app/api/alerts/[id]/route.ts` | Application du quota (POST, PATCH) |
| `src/lib/server/subscriptions/lifecycle.ts`, `src/app/api/subscriptions/change-plan/route.ts`, `src/lib/server/notifications/templates.ts` | Désactivation à l'expiration / au retour au plan Gratuit, texte de notification |
| `src/components/settings/SubscriptionCard.tsx` | Avantages affichés sur les cartes de plans |

---

### Task 1 : Droits dans la tarification (schéma, défauts, helpers)

**Files :**
- Modify: `src/lib/subscription-plans.ts`
- Modify: `src/lib/pricing.ts`
- Test: `src/lib/pricing.test.ts`

**Interfaces :**
- Produces (utilisés par les Tasks 2-7) :
  - `PlanDefinition` gagne `monthlyTokens: number`, `includedBoosts: number`, `maxAlerts: number | null`.
  - `PricingData['plans'][K]` gagne les mêmes trois champs (toujours présents après parsing).
  - `planMonthlyTokens(p: PricingData, key: PlanKey): number`
  - `planIncludedBoosts(p: PricingData, key: PlanKey): number`
  - `planMaxAlerts(p: PricingData, key: PlanKey): number | null`
  - `tokensPerMonthLabel(n: number): string | null`
  - `alertsQuotaLabel(max: number | null): string | null`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter l'import `planMonthlyTokens, planIncludedBoosts, planMaxAlerts, tokensPerMonthLabel, alertsQuotaLabel` à l'import existant de `./pricing` dans `src/lib/pricing.test.ts`, puis ajouter à la fin du fichier :

```ts
describe('plan entitlements', () => {
  it('defaults to the official grid', () => {
    expect(planMonthlyTokens(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planMonthlyTokens(DEFAULT_PRICING, 'PRO_AGENT')).toBe(10);
    expect(planMonthlyTokens(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(40);
    expect(planIncludedBoosts(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planIncludedBoosts(DEFAULT_PRICING, 'PRO_AGENT')).toBe(1);
    expect(planIncludedBoosts(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(4);
    expect(planMaxAlerts(DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(planMaxAlerts(DEFAULT_PRICING, 'PRO_AGENT')).toBe(10);
    expect(planMaxAlerts(DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBeNull();
  });

  it('keeps a row stored before this phase valid and fills the grid defaults', () => {
    const legacy = {
      plans: {
        FREE: { priceFcfa: 0, maxActiveListings: 5 },
        PRO_AGENT: { priceFcfa: 17_000, maxActiveListings: 30 },
        AGENCY_PREMIUM: { priceFcfa: 35_000, maxActiveListings: null },
      },
      token: DEFAULT_PRICING.token,
    };
    const parsed = PricingDataSchema.parse(legacy);
    expect(parsed.plans.PRO_AGENT).toMatchObject({
      priceFcfa: 17_000,
      monthlyTokens: 10,
      includedBoosts: 1,
      maxAlerts: 10,
    });
    expect(parsed.plans.AGENCY_PREMIUM).toMatchObject({
      monthlyTokens: 40,
      includedBoosts: 4,
      maxAlerts: null,
    });
  });

  it('rejects negative entitlements', () => {
    const bad = structuredClone(DEFAULT_PRICING);
    bad.plans.PRO_AGENT.monthlyTokens = -1;
    expect(PricingDataSchema.safeParse(bad).success).toBe(false);
  });

  it('labels the perks, hiding zero values', () => {
    expect(tokensPerMonthLabel(0)).toBeNull();
    expect(tokensPerMonthLabel(1)).toBe('1 jeton offert par mois');
    expect(tokensPerMonthLabel(10)).toBe('10 jetons offerts par mois');
    expect(alertsQuotaLabel(0)).toBeNull();
    expect(alertsQuotaLabel(1)).toBe('1 alerte secteur');
    expect(alertsQuotaLabel(10)).toBe('10 alertes secteur');
    expect(alertsQuotaLabel(null)).toBe('Alertes secteur illimitées');
  });
});
```

- [ ] **Step 2 : Lancer les tests pour constater l'échec**

Run: `pnpm exec vitest run src/lib/pricing.test.ts`
Expected: FAIL (`planMonthlyTokens is not a function` ou erreur de type).

- [ ] **Step 3 : Implémenter**

Dans `src/lib/subscription-plans.ts`, ajouter à l'interface `PlanDefinition` (après `maxActiveListings`) :

```ts
  monthlyTokens: number; // tokens granted on every paid subscription period
  includedBoosts: number; // 7-day boosts included per period (consumed by phase 1B)
  maxAlerts: number | null; // active sector alerts for agent accounts; null = unlimited
```

et dans `PLAN_CATALOG` ajouter à chaque plan :

```ts
  // FREE
  monthlyTokens: 0,
  includedBoosts: 0,
  maxAlerts: 0,
  // PRO_AGENT
  monthlyTokens: 10,
  includedBoosts: 1,
  maxAlerts: 10,
  // AGENCY_PREMIUM
  monthlyTokens: 40,
  includedBoosts: 4,
  maxAlerts: null,
```

Dans `src/lib/pricing.ts`, remplacer le bloc `paidPlan` + `PricingDataSchema.plans` par :

```ts
const quota = z.number().int().nonnegative().nullable(); // null = unlimited
// Missing fields on a row stored before these existed fall back to the official
// grid (never to 0), so an old PricingConfig row stays valid and keeps its prices.
const entitlements = (key: PlanKey) => ({
  monthlyTokens: z
    .number()
    .int()
    .nonnegative()
    .max(100_000)
    .default(PLAN_CATALOG[key].monthlyTokens),
  includedBoosts: z.number().int().nonnegative().max(1_000).default(PLAN_CATALOG[key].includedBoosts),
  maxAlerts: quota.default(PLAN_CATALOG[key].maxAlerts),
});
const paidPlan = (key: PlanKey) =>
  z.object({
    priceFcfa: z.number().int().positive().max(10_000_000),
    maxActiveListings: quota,
    ...entitlements(key),
  });
```

(conserver la ligne `const quota` existante une seule fois) et dans le schéma :

```ts
  plans: z.object({
    FREE: z.object({
      priceFcfa: z.literal(0),
      maxActiveListings: quota,
      ...entitlements('FREE'),
    }),
    PRO_AGENT: paidPlan('PRO_AGENT'),
    AGENCY_PREMIUM: paidPlan('AGENCY_PREMIUM'),
  }),
```

Remplacer `DEFAULT_PRICING.plans` par :

```ts
const fromCatalog = (key: PlanKey) => ({
  priceFcfa: PLAN_CATALOG[key].priceFcfa,
  maxActiveListings: PLAN_CATALOG[key].maxActiveListings,
  monthlyTokens: PLAN_CATALOG[key].monthlyTokens,
  includedBoosts: PLAN_CATALOG[key].includedBoosts,
  maxAlerts: PLAN_CATALOG[key].maxAlerts,
});
```

et dans l'objet `DEFAULT_PRICING` : `plans: { FREE: { ...fromCatalog('FREE'), priceFcfa: 0 }, PRO_AGENT: fromCatalog('PRO_AGENT'), AGENCY_PREMIUM: fromCatalog('AGENCY_PREMIUM') }` (la clé `FREE` force le littéral `0` attendu par le type).

Ajouter les helpers à côté de `planMaxListings` :

```ts
export function planMonthlyTokens(p: PricingData, key: PlanKey): number {
  return p.plans[key].monthlyTokens;
}

export function planIncludedBoosts(p: PricingData, key: PlanKey): number {
  return p.plans[key].includedBoosts;
}

export function planMaxAlerts(p: PricingData, key: PlanKey): number | null {
  return p.plans[key].maxAlerts;
}

export function tokensPerMonthLabel(n: number): string | null {
  if (n <= 0) return null;
  return `${n} jeton${n > 1 ? 's' : ''} offert${n > 1 ? 's' : ''} par mois`;
}

export function alertsQuotaLabel(max: number | null): string | null {
  if (max === null) return 'Alertes secteur illimitées';
  if (max <= 0) return null;
  return `${max} alerte${max > 1 ? 's' : ''} secteur`;
}
```

- [ ] **Step 4 : Lancer les tests, le typecheck et le lint**

Run: `pnpm exec vitest run src/lib/pricing.test.ts` → PASS.
Run: `pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → aucune erreur (si un littéral `PricingData` dans un autre test ou composant est signalé, y ajouter les trois champs avec les valeurs de la grille).
Run: `pnpm exec prettier --write src/lib && pnpm exec eslint src/lib` → propre.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/subscription-plans.ts src/lib/pricing.ts src/lib/pricing.test.ts
git commit -m "feat(pricing): per-plan monthly tokens, included boosts and alert quota"
```

---

### Task 2 : Édition admin des nouveaux champs

**Files :**
- Modify: `src/components/admin/PricingEditor.tsx`

**Interfaces :**
- Consumes: `PricingData['plans'][K].{monthlyTokens, includedBoosts, maxAlerts}` (Task 1), `NumberInput` et `PLAN_ROWS` déjà définis dans ce fichier.

(Pas de test unitaire : le composant n'en a pas ; vérification par `tsc`, `eslint` et le parcours manuel de la Task 8.)

- [ ] **Step 1 : Ajouter le setter**

Dans `PricingEditor`, après `setQuota` :

```tsx
  function setEntitlement(
    key: (typeof PLAN_ROWS)[number]['key'],
    patch: Partial<{ monthlyTokens: number; includedBoosts: number; maxAlerts: number | null }>,
  ) {
    setDraft((d) => ({ ...d, plans: { ...d.plans, [key]: { ...d.plans[key], ...patch } } }));
  }
```

- [ ] **Step 2 : Ajouter les colonnes**

Dans le `<thead>` du premier tableau, après `<th className={TH_CLASS}>Illimité</th>`, ajouter :

```tsx
              <th className={TH_CLASS}>Jetons offerts / mois</th>
              <th className={TH_CLASS}>Boosts 7 j inclus</th>
              <th className={TH_CLASS}>Alertes max</th>
              <th className={TH_CLASS}>Illimitées</th>
```

passer `min-w-[560px]` de ce tableau à `min-w-[900px]`. Dans la ligne de chaque plan, après la cellule de la case « Annonces illimitées », ajouter (avec `const alertsUnlimited = plan.maxAlerts === null;` déclaré à côté de `unlimited`) :

```tsx
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Jetons offerts par mois ${label}`}
                      value={plan.monthlyTokens}
                      onChange={(n) => setEntitlement(key, { monthlyTokens: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Boosts inclus ${label}`}
                      value={plan.includedBoosts}
                      onChange={(n) => setEntitlement(key, { includedBoosts: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <NumberInput
                      label={`Alertes max ${label}`}
                      value={plan.maxAlerts ?? 0}
                      disabled={alertsUnlimited}
                      onChange={(n) => setEntitlement(key, { maxAlerts: n })}
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Alertes illimitées ${label}`}
                      checked={alertsUnlimited}
                      onChange={(e) =>
                        setEntitlement(key, { maxAlerts: e.target.checked ? null : 0 })
                      }
                      className="h-4 w-4 accent-[var(--color-brand,currentColor)]"
                    />
                  </td>
```

Mettre à jour la description de la section : `"Prix des plans, quotas d'annonces, jetons offerts, boosts inclus, alertes, prix de base du jeton et remises des packs."`

- [ ] **Step 3 : Vérifier**

Run: `pnpm exec prettier --write src/components/admin/PricingEditor.tsx && pnpm exec eslint src/components/admin/PricingEditor.tsx && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 4 : Commit**

```bash
git add src/components/admin/PricingEditor.tsx
git commit -m "feat(admin): edit monthly tokens, included boosts and alert quota per plan"
```

---

### Task 3 : Colonne `grantKey` et crédit mensuel de jetons

**Files :**
- Modify: `prisma/schema.prisma` (modèle `TokenTransaction`)
- Create: `prisma/migrations/20261014100000_token_grant_key/migration.sql`
- Modify: `src/lib/server/payments/fulfill-order.ts`
- Test: `src/lib/server/payments/fulfill-order.test.ts`

**Interfaces :**
- Consumes: `planMonthlyTokens(p, key)` (Task 1), `readStoredPricing(tx)` (existant).
- Produces: pour chaque commande d'abonnement validée dont le prix est gelé, une `TokenTransaction` `type: 'BONUS'`, `amount = monthlyTokens`, `grantKey = 'plan:<orderId>'`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `fulfill-order.test.ts`, ajouter près des autres mocks :

```ts
const tokenTransactionFindUnique = vi.fn();
```

changer l'objet `tx` : `tokenTransaction: { create: tokenTransactionCreate, findUnique: tokenTransactionFindUnique },`, ajouter dans `beforeEach` : `tokenTransactionFindUnique.mockReset().mockResolvedValue(null);` puis ajouter à la fin du fichier :

```ts
describe('monthly token grant', () => {
  beforeEach(() => {
    tokenWalletUpsert.mockResolvedValue({ userId: 'u1', balance: 10 });
  });

  it('credits the plan monthly tokens as a BONUS keyed by the order', async () => {
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(tokenWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balance: { increment: 10 } } }),
    );
    expect(tokenTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'BONUS',
        amount: 10,
        grantKey: 'plan:o1',
      }),
    });
  });

  it('grants the Agence amount', async () => {
    await fulfillPaidOrder(tx, subOrder('AGENCY_PREMIUM'));
    expect(tokenTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 40, grantKey: 'plan:o1' }),
    });
  });

  it('does not credit twice when the same order was already granted', async () => {
    tokenTransactionFindUnique.mockResolvedValue({ id: 't1' });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(tokenTransactionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { grantKey: 'plan:o1' } }),
    );
    expect(tokenWalletUpsert).not.toHaveBeenCalled();
    expect(tokenTransactionCreate).not.toHaveBeenCalled();
  });

  it('grants nothing when the live pricing sets 0 monthly tokens', async () => {
    vi.mocked(readStoredPricing).mockResolvedValue({
      ...DEFAULT_PRICING,
      plans: {
        ...DEFAULT_PRICING.plans,
        PRO_AGENT: { ...DEFAULT_PRICING.plans.PRO_AGENT, monthlyTokens: 0 },
      },
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT'));
    expect(tokenTransactionCreate).not.toHaveBeenCalled();
  });

  it('grants nothing without the price freeze marker (no subscription either)', async () => {
    await fulfillPaidOrder(tx, {
      ...subOrder('PRO_AGENT'),
      metadata: { kind: 'subscription_plan_change', planKey: 'PRO_AGENT' },
    });
    expect(subscriptionUpsert).not.toHaveBeenCalled();
    expect(tokenTransactionCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/server/payments/fulfill-order.test.ts`
Expected: FAIL (aucun crédit effectué ; `grantKey` inconnu).

- [ ] **Step 3 : Schéma et migration**

Dans `prisma/schema.prisma`, modèle `TokenTransaction`, après la ligne `orderId` :

```prisma
  grantKey     String?  @unique // idempotency key of automatic grants, e.g. "plan:<orderId>"
```

Créer `prisma/migrations/20261014100000_token_grant_key/migration.sql` :

```sql
-- AlterTable
ALTER TABLE "TokenTransaction" ADD COLUMN "grantKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TokenTransaction_grantKey_key" ON "TokenTransaction"("grantKey");
```

Appliquer en local (base `localhost:5432`, voir `.env.local`) puis régénérer le client. Si `pnpm dev` tourne, il verrouille le moteur Prisma sous Windows : demander à l'utilisateur de l'arrêter avant `generate`.

Run: `pnpm exec prisma migrate deploy && pnpm exec prisma generate`
Expected: « Applying migration `20261014100000_token_grant_key` » puis « Generated Prisma Client ».

- [ ] **Step 4 : Implémenter le crédit**

Dans `fulfill-order.ts`, changer l'import `planMaxListings` en `import { planMaxListings, planMonthlyTokens, type PricingData } from '@/lib/pricing';` et `import { isPlanKey, PLAN_CATALOG, type PlanKey } from '@/lib/subscription-plans';`.

Ajouter avant `grantSubscription` :

```ts
// Monthly tokens included in the plan. One grant per paid period: the key is the
// order, so a replayed delivery cannot credit twice (the findUnique guards the
// transaction; the unique column is the backstop). A unique violation inside this
// Serializable tx would abort it, hence the read-first.
async function grantMonthlyTokens(
  tx: PrismaTransactionClient,
  userId: string,
  planKey: PlanKey,
  orderId: string,
  pricing: PricingData,
): Promise<void> {
  const tokens = planMonthlyTokens(pricing, planKey);
  if (tokens <= 0) return;
  const grantKey = `plan:${orderId}`;
  const done = await tx.tokenTransaction.findUnique({ where: { grantKey }, select: { id: true } });
  if (done) return;
  const wallet = await tx.tokenWallet.upsert({
    where: { userId },
    create: { userId, balance: tokens },
    update: { balance: { increment: tokens } },
  });
  await tx.tokenTransaction.create({
    data: {
      userId,
      type: 'BONUS',
      amount: tokens,
      balanceAfter: wallet.balance,
      description: `Jetons offerts — plan ${PLAN_CATALOG[planKey].label}`,
      grantKey,
    },
  });
}
```

Changer la signature : `async function grantSubscription(tx, userId: string, planKey: PlanKey, orderId: string)`, l'appel dans `fulfillPaidOrder` en `await grantSubscription(tx, order.userId, meta.planKey, order.id);`, et remplacer la dernière instruction de `grantSubscription` par :

```ts
  const pricing = await readStoredPricing(tx);
  // Bring back listings hidden by a previous expiry, within the new quota.
  await reactivateHiddenListings(tx, userId, planMaxListings(pricing, planKey));
  await grantMonthlyTokens(tx, userId, planKey, orderId, pricing);
```

- [ ] **Step 5 : Tests, typecheck, lint**

Run: `pnpm exec vitest run src/lib/server/payments src/app/api/webhooks` → PASS.
Run: `pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 6 : Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261014100000_token_grant_key src/lib/server/payments/fulfill-order.ts src/lib/server/payments/fulfill-order.test.ts
git commit -m "feat(subscriptions): grant the plan monthly tokens on payment, idempotent per order"
```

---

### Task 4 : Module de quota d'alertes

**Files :**
- Create: `src/lib/server/alerts/quota.ts`
- Create: `src/lib/server/alerts/quota.test.ts`

**Interfaces :**
- Consumes: `planMaxAlerts` (Task 1), `getEffectivePlanKey` (`../subscriptions/effective-plan`), `TxClient` (`../withdrawals/lock`).
- Produces (utilisés par les Tasks 5 et 6) :
  - `SEEKER_ALERT_CAP = 20`
  - `lockUserAlertQuota(tx: TxClient, userId: string): Promise<void>`
  - `checkAlertQuota(db, userId, pricing, opts?: { now?: Date; excludeAlertId?: string }): Promise<AlertQuotaCheck>` avec `AlertQuotaCheck = { allowed: boolean; planKey: PlanKey; limit: number | null; used: number }`
  - `disableExcessAlerts(db, userId, pricing, planKey): Promise<number>` (nombre d'alertes désactivées)

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/lib/server/alerts/quota.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICING } from '@/lib/pricing';
import { checkAlertQuota, disableExcessAlerts, SEEKER_ALERT_CAP } from './quota';

const now = new Date('2026-11-01T12:00:00Z');
const agent = () => prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
const seeker = () => prismaMock.user.findUnique.mockResolvedValue({ accountType: 'TENANT_BUYER' } as never);
const noSub = () => prismaMock.subscription.findUnique.mockResolvedValue(null);
const sub = (planKey: string) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey,
    status: 'ACTIVE',
    currentPeriodEnd: new Date('2026-12-01'),
  } as never);

describe('checkAlertQuota', () => {
  it('refuses every alert for a FREE agent (grid: 0 included)', async () => {
    agent();
    noSub();
    prismaMock.alert.count.mockResolvedValue(0);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      planKey: 'FREE',
      limit: 0,
      used: 0,
    });
  });

  it('allows a PRO agent up to 10 active alerts', async () => {
    agent();
    sub('PRO_AGENT');
    prismaMock.alert.count.mockResolvedValue(9);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: true,
      limit: 10,
      used: 9,
    });
    prismaMock.alert.count.mockResolvedValue(10);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      used: 10,
    });
  });

  it('is unlimited for Agence, without counting', async () => {
    agent();
    sub('AGENCY_PREMIUM');
    const r = await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now });
    expect(r).toMatchObject({ allowed: true, limit: null });
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });

  it('caps a seeker at 20 whatever the plan, so a FREE seeker can still create alerts', async () => {
    seeker();
    noSub();
    prismaMock.alert.count.mockResolvedValue(19);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: true,
      limit: SEEKER_ALERT_CAP,
    });
    prismaMock.alert.count.mockResolvedValue(20);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
    });
  });

  it('uses the effective plan: a lapsed PRO agent is limited like FREE', async () => {
    agent();
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-10-01'),
    } as never);
    prismaMock.alert.count.mockResolvedValue(0);
    expect(await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now })).toMatchObject({
      allowed: false,
      planKey: 'FREE',
    });
  });

  it('excludes the alert being reactivated from the count', async () => {
    agent();
    sub('PRO_AGENT');
    prismaMock.alert.count.mockResolvedValue(0);
    await checkAlertQuota(prismaMock, 'u1', DEFAULT_PRICING, { now, excludeAlertId: 'a9' });
    expect(prismaMock.alert.count).toHaveBeenCalledWith({
      where: { userId: 'u1', active: true, id: { not: 'a9' } },
    });
  });
});

describe('disableExcessAlerts', () => {
  const alerts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i + 1}` })) as never;

  it('keeps the oldest alerts and deactivates the rest (never deletes)', async () => {
    agent();
    prismaMock.alert.findMany.mockResolvedValue(alerts(12));
    prismaMock.alert.updateMany.mockResolvedValue({ count: 2 });
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'PRO_AGENT')).toBe(2);
    expect(prismaMock.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a11', 'a12'] }, active: true },
      data: { active: false },
    });
    expect(prismaMock.alert.deleteMany).not.toHaveBeenCalled();
  });

  it('deactivates everything for a FREE agent (limit 0)', async () => {
    agent();
    prismaMock.alert.findMany.mockResolvedValue(alerts(3));
    prismaMock.alert.updateMany.mockResolvedValue({ count: 3 });
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'FREE')).toBe(3);
  });

  it('leaves a seeker alone', async () => {
    seeker();
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'FREE')).toBe(0);
    expect(prismaMock.alert.findMany).not.toHaveBeenCalled();
  });

  it('does nothing on an unlimited plan or when under the limit', async () => {
    agent();
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'AGENCY_PREMIUM')).toBe(0);
    prismaMock.alert.findMany.mockResolvedValue(alerts(4));
    expect(await disableExcessAlerts(prismaMock, 'u1', DEFAULT_PRICING, 'PRO_AGENT')).toBe(0);
    expect(prismaMock.alert.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/server/alerts/quota.test.ts`
Expected: FAIL (`Cannot find module './quota'`).

- [ ] **Step 3 : Implémenter**

Créer `src/lib/server/alerts/quota.ts` :

```ts
// Sector-alert quota per effective plan. Only agent accounts (OWNER_AGENT) are
// bound by the plan; seekers keep free alerts behind a fixed anti-abuse cap.
// Excess alerts are deactivated (active = false), never deleted — same spirit
// as hiding listings (listings/quota.ts).
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { planMaxAlerts, type PricingData } from '@/lib/pricing';
import type { PlanKey } from '@/lib/subscription-plans';
import type { TxClient } from '../withdrawals/lock';
import { getEffectivePlanKey } from '../subscriptions/effective-plan';

export const SEEKER_ALERT_CAP = 20;
const AGENT_ACCOUNT_TYPE = 'OWNER_AGENT';

/**
 * Per-user transaction-scoped advisory lock (distinct key namespace from the
 * listing quota). Always take lockUserListingQuota FIRST when both are needed.
 */
export async function lockUserAlertQuota(tx: TxClient, userId: string): Promise<void> {
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `alert-quota:${userId}`);
}

export interface AlertQuotaCheck {
  allowed: boolean;
  planKey: PlanKey;
  limit: number | null;
  used: number;
}

export async function checkAlertQuota(
  db: Pick<PrismaClient, 'subscription' | 'alert' | 'user'>,
  userId: string,
  pricing: PricingData,
  opts: { now?: Date; excludeAlertId?: string } = {},
): Promise<AlertQuotaCheck> {
  const now = opts.now ?? new Date();
  const user = await db.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, currentPeriodEnd: true },
  });
  const planKey = getEffectivePlanKey(sub, now);
  const limit = user?.accountType === AGENT_ACCOUNT_TYPE ? planMaxAlerts(pricing, planKey) : SEEKER_ALERT_CAP;
  if (limit === null) return { allowed: true, planKey, limit, used: 0 };

  const used = await db.alert.count({
    where: {
      userId,
      active: true,
      ...(opts.excludeAlertId ? { id: { not: opts.excludeAlertId } } : {}),
    },
  });
  return { allowed: used < limit, planKey, limit, used };
}

export async function disableExcessAlerts(
  db: Pick<PrismaClient, 'alert' | 'user'>,
  userId: string,
  pricing: PricingData,
  planKey: PlanKey,
): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  if (user?.accountType !== AGENT_ACCOUNT_TYPE) return 0;
  const limit = planMaxAlerts(pricing, planKey);
  if (limit === null) return 0;
  const active = await db.alert.findMany({
    where: { userId, active: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const excess = active.slice(limit).map((a) => a.id);
  if (excess.length === 0) return 0;
  const res = await db.alert.updateMany({
    where: { id: { in: excess }, active: true },
    data: { active: false },
  });
  return res.count;
}
```

- [ ] **Step 4 : Tests, format, lint**

Run: `pnpm exec prettier --write src/lib/server/alerts && pnpm exec vitest run src/lib/server/alerts/quota.test.ts && pnpm exec eslint src/lib/server/alerts` → PASS, propre.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/server/alerts/quota.ts src/lib/server/alerts/quota.test.ts
git commit -m "feat(alerts): plan-based alert quota with seeker cap and excess deactivation"
```

---

### Task 5 : Appliquer le quota à la création et à la réactivation

**Files :**
- Modify: `src/app/api/alerts/route.ts` (POST)
- Modify: `src/app/api/alerts/[id]/route.ts` (PATCH)
- Create: `src/app/api/alerts/route.test.ts`
- Create: `src/app/api/alerts/[id]/route.test.ts`

**Interfaces :**
- Consumes: `lockUserAlertQuota`, `checkAlertQuota` (Task 4), `getPricing` de `@/lib/server/pricing`.
- Produces: réponse 403 `{ error: 'ALERT_QUOTA_REACHED', message, planKey, limit }`.

- [ ] **Step 1 : Écrire les tests qui échouent (POST)**

Créer `src/app/api/alerts/route.test.ts` :

```ts
// ALERTS-02 — POST /api/alerts quota tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/alerts/matching', () => ({ runMatchingForNewAlert: vi.fn() }));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const body = {
  name: 'Villas Cotonou',
  transactionType: 'LOCATION',
  propertyTypes: ['VILLA'],
  country: 'Bénin',
  cities: ['Cotonou'],
  notifWhatsapp: false,
  notifEmail: true,
  notifSms: false,
};

function makePost(): NextRequest {
  return new NextRequest('http://test/api/alerts', {
    method: 'POST',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const futureSub = (planKey: string) =>
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey,
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.subscription.findUnique.mockResolvedValue(null);
  prismaMock.alert.count.mockResolvedValue(0 as never);
  prismaMock.alert.create.mockResolvedValue({
    id: 'a1',
    name: body.name,
    active: true,
    createdAt: new Date(),
  } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
});

describe('POST /api/alerts quota', () => {
  it('refuses a FREE agent with 403 ALERT_QUOTA_REACHED (limit 0)', async () => {
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: 'ALERT_QUOTA_REACHED',
      planKey: 'FREE',
      limit: 0,
    });
    expect(prismaMock.alert.create).not.toHaveBeenCalled();
  });

  it('lets a PRO agent create below 10 and refuses at 10', async () => {
    futureSub('PRO_AGENT');
    prismaMock.alert.count.mockResolvedValue(9 as never);
    expect((await POST(makePost())).status).toBe(201);
    prismaMock.alert.count.mockResolvedValue(10 as never);
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ limit: 10 });
  });

  it('does not count for an Agence agent', async () => {
    futureSub('AGENCY_PREMIUM');
    expect((await POST(makePost())).status).toBe(201);
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });

  it('lets a FREE seeker create up to 20, then refuses', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accountType: 'TENANT_BUYER' } as never);
    prismaMock.alert.count.mockResolvedValue(19 as never);
    expect((await POST(makePost())).status).toBe(201);
    prismaMock.alert.count.mockResolvedValue(20 as never);
    const res = await POST(makePost());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ limit: 20 });
  });
});
```

- [ ] **Step 2 : Écrire les tests qui échouent (PATCH)**

Créer `src/app/api/alerts/[id]/route.test.ts` :

```ts
// ALERTS-04 — PATCH /api/alerts/[id] quota tests (activate / deactivate).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

function makePatch(id: string, payload: unknown) {
  const req = new NextRequest(`http://test/api/alerts/${id}`, {
    method: 'PATCH',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

const stored = (active: boolean) =>
  ({ userId: 'user-1', active }) as never;
const updated = { id: 'a1', name: 'x', active: true } as never;

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.subscription.findUnique.mockResolvedValue({
    planKey: 'PRO_AGENT',
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
  } as never);
  prismaMock.alert.update.mockResolvedValue(updated);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
});

describe('PATCH /api/alerts/[id] quota', () => {
  it('refuses to reactivate an inactive alert when the plan limit is full', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(false));
    prismaMock.alert.count.mockResolvedValue(10 as never);
    const { req, ctx } = makePatch('a1', { active: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'ALERT_QUOTA_REACHED', limit: 10 });
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it('reactivates below the limit, excluding the alert itself from the count', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(false));
    prismaMock.alert.count.mockResolvedValue(9 as never);
    const { req, ctx } = makePatch('a1', { active: true });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(prismaMock.alert.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', active: true, id: { not: 'a1' } },
    });
  });

  it('never blocks a deactivation and skips the quota check', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(true));
    const { req, ctx } = makePatch('a1', { active: false });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });

  it('does not recheck an alert that is already active', async () => {
    prismaMock.alert.findUnique.mockResolvedValue(stored(true));
    const { req, ctx } = makePatch('a1', { active: true });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(prismaMock.alert.count).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3 : Constater l'échec**

Run: `pnpm exec vitest run src/app/api/alerts`
Expected: FAIL (le FREE agent reçoit 201 ; PATCH ne vérifie rien).

- [ ] **Step 4 : Implémenter (POST)**

Dans `src/app/api/alerts/route.ts`, ajouter les imports :

```ts
import { checkAlertQuota, lockUserAlertQuota } from '@/lib/server/alerts/quota';
import { getPricing } from '@/lib/server/pricing';
```

Remplacer l'appel `const alert = await prisma.alert.create({ ... select: {...} });` par :

```ts
    // The count and the insert must be atomic per user (same advisory-lock pattern
    // as listing publication), so parallel creates cannot both pass at limit-1.
    const pricing = await getPricing();
    const outcome = await prisma.$transaction(async (tx) => {
      await lockUserAlertQuota(tx, auth.user.sub);
      const quota = await checkAlertQuota(tx, auth.user.sub, pricing);
      if (!quota.allowed) return { quota } as const;
      const created = await tx.alert.create({
        data: {
          userId: auth.user.sub,
          name: data.name,
          transactionType: data.transactionType,
          propertyTypes: data.propertyTypes,
          country: data.country,
          cities: data.cities,
          priceMin: data.priceMin ?? null,
          priceMax: data.priceMax ?? null,
          frequency: data.frequency,
          notifWhatsapp: data.notifWhatsapp,
          notifEmail: data.notifEmail,
          notifSms: data.notifSms,
        },
        select: { id: true, name: true, active: true, createdAt: true },
      });
      return { alert: created } as const;
    });
    if ('quota' in outcome) {
      return NextResponse.json(
        {
          error: 'ALERT_QUOTA_REACHED',
          message: "Limite d'alertes atteinte pour votre plan.",
          planKey: outcome.quota.planKey,
          limit: outcome.quota.limit,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const alert = outcome.alert;
```

(le reste du handler — matching puis réponse 201 — est inchangé).

- [ ] **Step 5 : Implémenter (PATCH)**

Dans `src/app/api/alerts/[id]/route.ts`, ajouter les imports `checkAlertQuota, lockUserAlertQuota` (de `@/lib/server/alerts/quota`) et `getPricing` (de `@/lib/server/pricing`). Changer la lecture : `select: { userId: true, active: true }`. Remplacer l'appel `const alert = await prisma.alert.update({...})` par :

```ts
    let alert;
    if (parsed.data.active === true && !existing.active) {
      // Reactivation counts against the plan, atomically per user.
      const pricing = await getPricing();
      const outcome = await prisma.$transaction(async (tx) => {
        await lockUserAlertQuota(tx, auth.user.sub);
        const quota = await checkAlertQuota(tx, auth.user.sub, pricing, { excludeAlertId: id });
        if (!quota.allowed) return { quota } as const;
        const row = await tx.alert.update({
          where: { id },
          data: { active: true },
          select: ALERT_SELECT,
        });
        return { alert: row } as const;
      });
      if ('quota' in outcome) {
        return NextResponse.json(
          {
            error: 'ALERT_QUOTA_REACHED',
            message: "Limite d'alertes atteinte pour votre plan.",
            planKey: outcome.quota.planKey,
            limit: outcome.quota.limit,
          },
          { status: 403, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      alert = outcome.alert;
    } else {
      alert = await prisma.alert.update({
        where: { id },
        data: { active: parsed.data.active },
        select: ALERT_SELECT,
      });
    }
```

- [ ] **Step 6 : Tests, format, lint, typecheck**

Run: `pnpm exec prettier --write src/app/api/alerts && pnpm exec vitest run src/app/api/alerts src/lib/server/alerts` → PASS.
Run: `pnpm exec eslint src/app/api/alerts && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 7 : Commit**

```bash
git add src/app/api/alerts
git commit -m "feat(alerts): enforce the plan alert quota on create and reactivate"
```

---

### Task 6 : Désactivation des alertes en trop à l'expiration et au retour au plan Gratuit

**Files :**
- Modify: `src/lib/server/subscriptions/lifecycle.ts`
- Modify: `src/app/api/subscriptions/change-plan/route.ts`
- Modify: `src/lib/server/notifications/templates.ts`
- Test: `src/lib/server/subscriptions/lifecycle.test.ts`, `src/app/api/subscriptions/change-plan/route.test.ts`, `src/lib/server/notifications/templates.test.ts`

**Interfaces :**
- Consumes: `lockUserAlertQuota`, `disableExcessAlerts` (Task 4).
- Produces: `subscriptionExpiredNotification(userId, hiddenCount, periodEnd, disabledAlerts = 0)`.

- [ ] **Step 1 : Écrire les tests qui échouent**

`templates.test.ts` — ajouter l'import `subscriptionExpiredNotification` et :

```ts
describe('subscriptionExpiredNotification', () => {
  const end = new Date('2026-10-01T00:00:00Z');

  it('mentions hidden listings and deactivated alerts', () => {
    const body = subscriptionExpiredNotification('u1', 4, end, 2).body;
    expect(body).toContain('4 annonce(s) ont été masquées');
    expect(body).toContain('2 alerte(s) secteur ont été désactivées');
  });

  it('mentions only alerts when no listing was hidden', () => {
    const body = subscriptionExpiredNotification('u1', 0, end, 3).body;
    expect(body).not.toContain('masquées');
    expect(body).toContain('3 alerte(s) secteur');
  });

  it('keeps the plain message when nothing was affected', () => {
    expect(subscriptionExpiredNotification('u1', 0, end).body).toBe(
      'Votre compte repasse au plan Gratuit.',
    );
  });
});
```

`lifecycle.test.ts` — ajouter après les `vi.mock` existants :

```ts
vi.mock('@/lib/server/alerts/quota', () => ({
  lockUserAlertQuota: vi.fn(),
  disableExcessAlerts: vi.fn(),
}));
```

les imports `import { disableExcessAlerts, lockUserAlertQuota } from '@/lib/server/alerts/quota';`, les constantes `const mockDisable = vi.mocked(disableExcessAlerts); const mockAlertLock = vi.mocked(lockUserAlertQuota);`, dans `beforeEach` : `mockDisable.mockReset().mockResolvedValue(0); mockAlertLock.mockReset().mockResolvedValue(undefined);`, puis dans le bloc `describe('expiry', ...)` :

```ts
  it('deactivates excess alerts after hiding listings (lock order) and tells the user', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([]) // lapsed
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never); // to expire
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockHide.mockResolvedValue(1);
    mockDisable.mockResolvedValue(2);
    await run();
    expect(mockAlertLock).toHaveBeenCalledWith(prismaMock, 'a');
    expect(mockDisable).toHaveBeenCalledWith(prismaMock, 'a', DEFAULT_PRICING, 'FREE');
    expect(mockLock.mock.invocationCallOrder[0]).toBeLessThan(
      mockAlertLock.mock.invocationCallOrder[0] as number,
    );
    expect(mockNotify.mock.calls.at(-1)?.[1].body).toContain('2 alerte(s) secteur');
  });

  it('does not touch alerts when another run already expired the row', async () => {
    prismaMock.subscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 'a', currentPeriodEnd: at(-9) }] as never);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    await run();
    expect(mockDisable).not.toHaveBeenCalled();
  });
```

`change-plan/route.test.ts` — ajouter après les `vi.mock` existants :

```ts
vi.mock('@/lib/server/alerts/quota', () => ({
  lockUserAlertQuota: vi.fn().mockResolvedValue(undefined),
  disableExcessAlerts: vi.fn().mockResolvedValue(0),
}));
```

l'import `import { disableExcessAlerts, lockUserAlertQuota } from '@/lib/server/alerts/quota';` et, dans le test « locks the quota, then hides excess listings down to the FREE limit », avant la fin :

```ts
    expect(lockUserAlertQuota).toHaveBeenCalledWith(prismaMock, 'user_1');
    expect(disableExcessAlerts).toHaveBeenCalledWith(prismaMock, 'user_1', DEFAULT_PRICING, 'FREE');
    expect(vi.mocked(lockUserListingQuota).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(lockUserAlertQuota).mock.invocationCallOrder[0]!,
    );
```

- [ ] **Step 2 : Constater l'échec**

Run: `pnpm exec vitest run src/lib/server/notifications src/lib/server/subscriptions src/app/api/subscriptions`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

`templates.ts` — remplacer `subscriptionExpiredNotification` par :

```ts
export function subscriptionExpiredNotification(
  userId: string,
  hiddenCount: number,
  periodEnd: Date,
  disabledAlerts = 0,
): CreateNotificationInput {
  const parts: string[] = [];
  if (hiddenCount > 0) {
    parts.push(`${hiddenCount} annonce(s) ont été masquées. Elles reviendront dès le renouvellement.`);
  }
  if (disabledAlerts > 0) {
    parts.push(`${disabledAlerts} alerte(s) secteur ont été désactivées.`);
  }
  return {
    userId,
    type: 'SUBSCRIPTION_EXPIRED',
    title: 'Abonnement terminé',
    body: parts.length > 0 ? parts.join(' ') : 'Votre compte repasse au plan Gratuit.',
    data: { hiddenCount, disabledAlerts, periodEnd: periodEnd.toISOString() },
    dedupeKey: `sub-expired:${userId}:${periodEnd.toISOString()}`,
  };
}
```

`lifecycle.ts` — ajouter `import { disableExcessAlerts, lockUserAlertQuota } from '../alerts/quota';`, remplacer dans la transaction d'expiration :

```ts
        return { hidden: await hideExcessListings(tx, sub.userId, freeLimit) };
```

par :

```ts
        const hidden = await hideExcessListings(tx, sub.userId, freeLimit);
        // Listing lock first, alert lock second (fixed order, no deadlock).
        await lockUserAlertQuota(tx, sub.userId);
        const alertsDisabled = await disableExcessAlerts(tx, sub.userId, pricing, 'FREE');
        return { hidden, alertsDisabled };
```

et l'appel de notification :

```ts
          subscriptionExpiredNotification(sub.userId, outcome.hidden, end, outcome.alertsDisabled),
```

`change-plan/route.ts` — ajouter `import { disableExcessAlerts, lockUserAlertQuota } from '@/lib/server/alerts/quota';` et, dans la transaction juste après `await hideExcessListings(tx, auth.user.sub, planMaxListings(pricing, 'FREE'));` :

```ts
        await lockUserAlertQuota(tx, auth.user.sub);
        await disableExcessAlerts(tx, auth.user.sub, pricing, 'FREE');
```

- [ ] **Step 4 : Tests, format, lint, typecheck**

Run: `pnpm exec prettier --write src/lib/server src/app/api/subscriptions && pnpm exec vitest run src/lib/server/notifications src/lib/server/subscriptions src/app/api/subscriptions` → PASS.
Run: `pnpm exec eslint src/lib/server src/app/api/subscriptions && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/server/subscriptions src/lib/server/notifications src/app/api/subscriptions
git commit -m "feat(subscriptions): deactivate excess alerts on expiry and voluntary downgrade"
```

---

### Task 7 : Avantages affichés sur les cartes de plans

**Files :**
- Modify: `src/components/settings/SubscriptionCard.tsx`

**Interfaces :**
- Consumes: `listingsQuotaLabel`, `planMaxListings`, `planMonthlyTokens`, `planMaxAlerts`, `tokensPerMonthLabel`, `alertsQuotaLabel` (Task 1 ; les deux premiers existent déjà).

- [ ] **Step 1 : Implémenter**

Changer l'import `@/lib/pricing` en :

```ts
import {
  alertsQuotaLabel,
  listingsQuotaLabel,
  planMaxAlerts,
  planMaxListings,
  planMonthlyTokens,
  planPriceFcfa,
  tokensPerMonthLabel,
} from '@/lib/pricing';
```

et remplacer la liste rendue `{[listingsQuotaLabel(planMaxListings(pricing, plan.key)), ...plan.features].map((feature) => (` par :

```tsx
                {[
                  listingsQuotaLabel(planMaxListings(pricing, plan.key)),
                  tokensPerMonthLabel(planMonthlyTokens(pricing, plan.key)),
                  alertsQuotaLabel(planMaxAlerts(pricing, plan.key)),
                  ...plan.features,
                ]
                  .filter((feature): feature is string => feature !== null)
                  .map((feature) => (
```

(les props `key`/contenu du `<li>` restent identiques ; la ligne boost n'est volontairement pas affichée avant 1B).

- [ ] **Step 2 : Vérifier**

Run: `pnpm exec prettier --write src/components/settings/SubscriptionCard.tsx && pnpm exec eslint src/components/settings && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"` → propre.

- [ ] **Step 3 : Commit**

```bash
git add src/components/settings/SubscriptionCard.tsx
git commit -m "feat(settings): show monthly tokens and alert quota on plan cards"
```

---

### Task 8 : Vérification d'ensemble et parcours local

**Files :** aucun fichier du dépôt ; un script jetable dans le scratchpad de session.

- [ ] **Step 1 : Suite complète**

Run (depuis `frontend/`, `pnpm dev` arrêté pour éviter les timeouts bcrypt) : `pnpm exec prettier --check src && pnpm exec eslint . && pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/" ; pnpm exec vitest run`
Expected: tout passe. Un échec isolé de `admin-access-requests` sous charge est connu : le relancer seul.

- [ ] **Step 2 : Parcours local scripté**

Modèle : le script de contrôle de la phase 0 (création d'utilisateurs jetables dans la base locale, login par `POST /api/auth/login`, cookies + en-tête `x-csrf-token`, nettoyage à la fin ; refus de s'exécuter si `DATABASE_URL` n'est pas locale). Serveur dev relancé après `prisma generate`. Scénarios, chacun doit passer :
  1. Agent Gratuit : `POST /api/alerts` → 403 `ALERT_QUOTA_REACHED`, `limit: 0`.
  2. Même agent, abonnement `PRO_AGENT` ACTIVE inséré en base : 10 créations → 201, la 11e → 403 `limit: 10`.
  3. Désactiver une alerte (`PATCH {active:false}`) puis en créer une → 201 ; réactiver alors que 10 sont actives → 403.
  4. Chercheur (`accountType TENANT_BUYER`), plan Gratuit : 20 créations → 201, la 21e → 403 `limit: 20`.
  5. Abonnement Pro mis à `GRACE` avec `currentPeriodEnd` 8 jours dans le passé, 12 alertes actives, puis `GET /api/cron/subscription-lifecycle` avec `Authorization: Bearer $CRON_SECRET` → abonnement `EXPIRED`, 0 alerte active (limite Gratuit = 0), 12 lignes `Alert` toujours présentes ; second appel du cron → `expired: 0`.
  6. `GET /api/pricing` renvoie `monthlyTokens`, `includedBoosts`, `maxAlerts` par plan.
  Nettoyer ensuite : suppression des utilisateurs jetables (cascade).

- [ ] **Step 3 : Contrôle visuel (utilisateur)**

Demander à l'utilisateur d'ouvrir `/parametres` (cartes de plans : « 10 jetons offerts par mois », « 10 alertes secteur ») et la page admin de tarification (nouvelles colonnes), car aucun test automatisé ne couvre ces deux composants.

- [ ] **Step 4 : Mémoire projet**

Mettre à jour `project_monetization_plan.md` : 1A codé et committé en local, migration `20261014100000_token_grant_key` à appliquer en prod après `pricing_config`, reste 1B-1E.

## Déploiement (hors de ce plan, à demander à l'utilisateur à chaque étape)

Migrations dans l'ordre : `20261013120000_pricing_config` puis `20261014100000_token_grant_key` (`pnpm db:migrate:deploy`). Aucune nouvelle ligne cron. Une ligne `PricingConfig` déjà saisie en prod reste valide (champs absents = grille).
