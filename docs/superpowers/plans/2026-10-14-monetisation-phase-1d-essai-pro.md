# Monétisation phase 1D — Essai Pro de 14 jours — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un agent jamais abonné démarre en un clic 14 jours de plan Pro (sans jetons ni boost), puis retombe sur le plan gratuit si ses annonces/alertes dépassent le quota (masquées, jamais supprimées).

**Architecture:** Un nouveau statut `TRIAL` sur `Subscription` + une colonne `trialStartedAt` (trace de l'essai déjà pris). Le plan effectif dérive de la ligne et de l'horloge (pas de grâce). Le cron horaire existant envoie le rappel J-3 et termine l'essai. L'endpoint `POST /api/subscriptions/trial` crée l'essai sous le verrou de quota d'annonces.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 / PostgreSQL, Vitest 4 (`prismaMock`), React client component.

**Spec:** `docs/superpowers/specs/2026-10-14-monetisation-phase-1d-essai-pro-design.md`

## Global Constraints

- Essai : 14 jours (constante `TRIAL_DAYS = 14`), plan `PRO_AGENT`, **aucun** jeton ni boost offert.
- Éligible : compte `OWNER_AGENT` ET (aucune ligne d'abonnement OU ligne `planKey = 'FREE'`, `status = 'ACTIVE'`, `trialStartedAt = null`). Tout le reste : 409 `TRIAL_NOT_AVAILABLE`.
- Pas de période de grâce après un essai.
- Route : `export const runtime = 'nodejs'`, `verifyCsrf(req)` puis `requireAuth(...)`, comptes non agent : 403 `AGENT_ONLY`.
- Le plan effectif doit rester correct même si le cron a du retard.
- Verrous : listing (`lockUserListingQuota`) puis alerte (`lockUserAlertQuota`), dans cet ordre.
- Ne pas modifier les fichiers protégés de CLAUDE.md. Ne pas réécrire de fichier avec PowerShell 5.1. Textes visibles en français.

## Review Focus

- Double clic / deux onglets : un seul essai, le second reçoit 409 (T3, éligibilité relue sous verrou).
- Essai terminé alors que le cron n'a pas tourné : le plan effectif est déjà FREE (T1).
- Paiement pendant l'essai : période de 30 jours depuis le paiement, statut `ACTIVE`, `trialStartedAt` conservé (T6).
- Un agent qui a eu un abonnement payant expiré ou un essai déjà pris ne peut pas redémarrer d'essai, y compris après un retour à FREE volontaire (T2).
- Un essai ne peut pas être « résilié » (route cancel) : il se termine seul (T3).

## File Structure

- Modify `frontend/prisma/schema.prisma` + create `frontend/prisma/migrations/20261014160000_subscription_trial/migration.sql`.
- Modify `frontend/src/lib/server/subscriptions/effective-plan.ts` (+ test) — statut `TRIAL`.
- Create `frontend/src/lib/server/subscriptions/trial.ts` (+ test) — `TRIAL_DAYS`, `isTrialEligible`.
- Create `frontend/src/app/api/subscriptions/trial/route.ts` (+ test).
- Modify `frontend/src/app/api/subscriptions/cancel/route.ts` (+ test) — refuse `TRIAL`.
- Modify `frontend/src/app/api/subscriptions/me/route.ts` (+ test) — `trialStartedAt`, `trialEligible`.
- Modify `frontend/src/lib/server/notifications/templates.ts` — 2 gabarits.
- Modify `frontend/src/lib/server/subscriptions/lifecycle.ts` (+ test) — rappel et fin d'essai.
- Modify `frontend/src/lib/server/payments/fulfill-order.test.ts` — paiement pendant l'essai.
- Modify `frontend/src/lib/subscription-renewal.ts`, `frontend/src/components/settings/SubscriptionCard.tsx` — UI.

---

### Task 1: Colonne `trialStartedAt`, statut `TRIAL` et plan effectif

**Files:**
- Modify: `frontend/prisma/schema.prisma` (modèle `Subscription`)
- Create: `frontend/prisma/migrations/20261014160000_subscription_trial/migration.sql`
- Modify: `frontend/src/lib/server/subscriptions/effective-plan.ts`
- Test: `frontend/src/lib/server/subscriptions/effective-plan.test.ts`

**Interfaces:**
- Produces: `Subscription.trialStartedAt: Date | null` ; `getEffectivePlanKey` traite `status === 'TRIAL'`.

- [ ] **Step 1: Write the failing test** — ajouter dans `effective-plan.test.ts` (dans le `describe` existant ou un nouveau) :

```ts
describe('getEffectivePlanKey — trial', () => {
  const trial = (offsetMs: number) => ({
    planKey: 'PRO_AGENT',
    status: 'TRIAL',
    currentPeriodEnd: end(offsetMs),
  });

  it('gives the trial plan until the end of the trial, boundary included', () => {
    expect(getEffectivePlanKey(trial(DAY), now)).toBe('PRO_AGENT');
    expect(getEffectivePlanKey(trial(0), now)).toBe('PRO_AGENT');
  });

  it('has no grace window: FREE right after the trial end, even if the cron is late', () => {
    expect(getEffectivePlanKey(trial(-1), now)).toBe('FREE');
    expect(getEffectivePlanKey(trial(-DAY), now)).toBe('FREE');
  });

  it('a trial without an end date is not a free pass', () => {
    expect(
      getEffectivePlanKey({ planKey: 'PRO_AGENT', status: 'TRIAL', currentPeriodEnd: null }, now),
    ).toBe('FREE');
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/subscriptions/effective-plan.test.ts` — Expected: FAIL (le statut `TRIAL` retombe dans la branche « grâce »).

- [ ] **Step 3: Implement.** Dans `effective-plan.ts`, après la ligne `if (sub.status === 'EXPIRED') return 'FREE';` :

```ts
  // A trial has a hard end: no grace window, and no end date means no trial.
  if (sub.status === 'TRIAL') {
    return sub.currentPeriodEnd && now.getTime() <= sub.currentPeriodEnd.getTime()
      ? sub.planKey
      : 'FREE';
  }
```
Dans `schema.prisma`, modèle `Subscription` : ajouter `trialStartedAt DateTime? // set once when the 14-day Pro trial is taken, kept after it ends` après `canceledAt` et mettre à jour le commentaire de `status` : `// ACTIVE | GRACE | EXPIRED | CANCELED | TRIAL`. Migration :

```sql
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
```

- [ ] **Step 4: Run** le test — Expected: PASS. Puis (serveur de dev arrêté) depuis `frontend/` : `pnpm exec prisma format`, `pnpm exec prisma migrate deploy`, `pnpm exec prisma generate`, `pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` — Expected: « No difference detected » ; `pnpm typecheck` — 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma frontend/src/lib/server/subscriptions/effective-plan.ts frontend/src/lib/server/subscriptions/effective-plan.test.ts
git commit -m "feat(trial): TRIAL status, trialStartedAt column and effective plan"
```

---

### Task 2: Règle d'éligibilité

**Files:**
- Create: `frontend/src/lib/server/subscriptions/trial.ts`
- Test: `frontend/src/lib/server/subscriptions/trial.test.ts`

**Interfaces:**
- Produces: `TRIAL_DAYS = 14`, `TRIAL_DAYS_MS`, `isTrialEligible(accountType: string | null | undefined, sub: { planKey: string; status: string; trialStartedAt: Date | null } | null): boolean`.

- [ ] **Step 1: Write the failing test** :

```ts
import { describe, it, expect } from 'vitest';
import { TRIAL_DAYS, isTrialEligible } from './trial';

const sub = (over: Partial<{ planKey: string; status: string; trialStartedAt: Date | null }> = {}) => ({
  planKey: 'FREE',
  status: 'ACTIVE',
  trialStartedAt: null,
  ...over,
});

describe('isTrialEligible', () => {
  it('lasts 14 days', () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it('is open to an agent who was never subscribed', () => {
    expect(isTrialEligible('OWNER_AGENT', null)).toBe(true);
    expect(isTrialEligible('OWNER_AGENT', sub())).toBe(true);
  });

  it('is closed to non-agents', () => {
    expect(isTrialEligible('TENANT_BUYER', null)).toBe(false);
    expect(isTrialEligible(undefined, null)).toBe(false);
  });

  it('is closed once a trial was taken, even after going back to FREE', () => {
    expect(isTrialEligible('OWNER_AGENT', sub({ trialStartedAt: new Date() }))).toBe(false);
  });

  it('is closed to anyone who had or has a paid subscription', () => {
    for (const status of ['ACTIVE', 'GRACE', 'CANCELED', 'EXPIRED', 'TRIAL']) {
      expect(isTrialEligible('OWNER_AGENT', sub({ planKey: 'PRO_AGENT', status }))).toBe(false);
    }
    // a lapsed paid subscription is back on FREE but EXPIRED
    expect(isTrialEligible('OWNER_AGENT', sub({ status: 'EXPIRED' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/subscriptions/trial.test.ts` — Expected: FAIL (module absent).

- [ ] **Step 3: Implement** `trial.ts` :

```ts
// 14-day Pro trial: who may start it. A trial is a one-off per account — the
// `trialStartedAt` marker outlives the trial itself — and never goes to
// someone who already had a paid plan (their FREE row is EXPIRED, not ACTIVE).
import 'server-only';

export const TRIAL_DAYS = 14;
export const TRIAL_DAYS_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export function isTrialEligible(
  accountType: string | null | undefined,
  sub: { planKey: string; status: string; trialStartedAt: Date | null } | null,
): boolean {
  if (accountType !== 'OWNER_AGENT') return false;
  if (sub === null) return true;
  return sub.planKey === 'FREE' && sub.status === 'ACTIVE' && sub.trialStartedAt === null;
}
```

- [ ] **Step 4: Run** le test — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/subscriptions/trial.ts frontend/src/lib/server/subscriptions/trial.test.ts
git commit -m "feat(trial): eligibility rule for the 14-day Pro trial"
```

---

### Task 3: `POST /api/subscriptions/trial` et refus de résiliation d'un essai

**Files:**
- Create: `frontend/src/app/api/subscriptions/trial/route.ts`
- Test: `frontend/src/app/api/subscriptions/trial/route.test.ts`
- Modify: `frontend/src/app/api/subscriptions/cancel/route.ts` (+ `route.test.ts`)

**Interfaces:**
- Consumes: `isTrialEligible`, `TRIAL_DAYS_MS` (T2) ; `lockUserListingQuota`, `reactivateHiddenListings` (`@/lib/server/listings/quota`) ; `getPricing` + `planMaxListings`.
- Produces: `POST → 201 { subscription: { planKey, status, currentPeriodEnd, canceledAt, trialStartedAt } }` ; 403 `AGENT_ONLY` ; 409 `TRIAL_NOT_AVAILABLE`.

- [ ] **Step 1: Write the failing test** `trial/route.test.ts` :

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/listings/quota', () => ({
  lockUserListingQuota: vi.fn(),
  reactivateHiddenListings: vi.fn(),
}));
vi.mock('@/lib/server/pricing', async () => {
  const { DEFAULT_PRICING } = await import('@/lib/pricing');
  return { getPricing: vi.fn(async () => DEFAULT_PRICING) };
});

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { lockUserListingQuota, reactivateHiddenListings } from '@/lib/server/listings/quota';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLock = vi.mocked(lockUserListingQuota);
const mockReactivate = vi.mocked(reactivateHiddenListings);
const NOW = new Date('2026-11-10T12:00:00Z');
const DAY = 86_400_000;

const call = () =>
  POST(new NextRequest('http://test/api/subscriptions/trial', { method: 'POST' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  __cookieStore.clear();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@x.io' } });
  mockLock.mockResolvedValue(undefined);
  mockReactivate.mockResolvedValue(0);
  prismaMock.user.findUnique.mockResolvedValue({ accountType: 'OWNER_AGENT' } as never);
  prismaMock.subscription.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    (cb as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock),
  );
  prismaMock.subscription.upsert.mockImplementation((async (a: { create: object }) => ({
    ...a.create,
  })) as never);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/subscriptions/trial', () => {
  it('rejects CSRF failures and anonymous callers', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await call()).status).toBe(403);
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await call()).status).toBe(401);
  });

  it('403 AGENT_ONLY for a non-agent', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ accountType: 'TENANT_BUYER' } as never);
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('AGENT_ONLY');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('starts a 14-day Pro trial with no tokens and no boost', async () => {
    const res = await call();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subscription).toMatchObject({ planKey: 'PRO_AGENT', status: 'TRIAL' });
    expect(new Date(body.subscription.currentPeriodEnd).getTime()).toBe(NOW.getTime() + 14 * DAY);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        create: expect.objectContaining({
          userId: 'u1',
          planKey: 'PRO_AGENT',
          status: 'TRIAL',
          trialStartedAt: NOW,
        }),
        update: expect.objectContaining({
          planKey: 'PRO_AGENT',
          status: 'TRIAL',
          trialStartedAt: NOW,
          canceledAt: null,
        }),
      }),
    );
    const data = JSON.stringify(prismaMock.subscription.upsert.mock.calls[0]![0]);
    expect(data).not.toContain('boostCredits');
    expect(prismaMock.tokenWallet.upsert).not.toHaveBeenCalled();
    expect(prismaMock.tokenTransaction.create).not.toHaveBeenCalled();
  });

  it('reactivates hidden listings within the Pro quota', async () => {
    await call();
    expect(mockReactivate).toHaveBeenCalledWith(expect.anything(), 'u1', 30);
  });

  it.each([
    ['trial already taken', { planKey: 'FREE', status: 'ACTIVE', trialStartedAt: new Date() }],
    ['paid and active', { planKey: 'PRO_AGENT', status: 'ACTIVE', trialStartedAt: null }],
    ['in grace', { planKey: 'PRO_AGENT', status: 'GRACE', trialStartedAt: null }],
    ['canceled', { planKey: 'PRO_AGENT', status: 'CANCELED', trialStartedAt: null }],
    ['lapsed', { planKey: 'FREE', status: 'EXPIRED', trialStartedAt: null }],
    ['running trial', { planKey: 'PRO_AGENT', status: 'TRIAL', trialStartedAt: new Date() }],
  ])('409 TRIAL_NOT_AVAILABLE when %s', async (_n, sub) => {
    prismaMock.subscription.findUnique.mockResolvedValue(sub as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TRIAL_NOT_AVAILABLE');
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
  });

  it('re-checks eligibility under the lock (a concurrent request won the race)', async () => {
    // free to look at first, taken by the time the lock is held
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'PRO_AGENT', status: 'TRIAL', trialStartedAt: NOW,
    } as never);
    const res = await call();
    expect(res.status).toBe(409);
    const lockOrder = mockLock.mock.invocationCallOrder.at(-1)!;
    const readOrder = prismaMock.subscription.findUnique.mock.invocationCallOrder.at(-1)!;
    expect(lockOrder).toBeLessThan(readOrder);
  });
});
```

Dans `cancel/route.test.ts`, ajouter un cas : une ligne `{ planKey: 'PRO_AGENT', status: 'TRIAL' }` donne 400 `NO_ACTIVE_SUBSCRIPTION` et `subscription.update` n'est pas appelé (suivre le style des cas existants de ce fichier pour l'authentification et la requête).

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/app/api/subscriptions/trial src/app/api/subscriptions/cancel` — Expected: FAIL (route absente ; cas cancel en échec).

- [ ] **Step 3: Implement** `trial/route.ts` :

```ts
// TRIAL-01 — POST /api/subscriptions/trial
//
// Starts the one-off 14-day Pro trial for an agent who was never subscribed.
// No payment, no tokens, no included boost: those are only granted by a paid
// order. Eligibility is re-read under the per-user listing-quota lock, the
// same lock that serialises publishing, payment grants and expiry.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPricing } from '@/lib/server/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { lockUserListingQuota, reactivateHiddenListings } from '@/lib/server/listings/quota';
import { TRIAL_DAYS_MS, isTrialEligible } from '@/lib/server/subscriptions/trial';
import { planMaxListings } from '@/lib/pricing';

class NotEligible extends Error {}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true },
    });
    if (user?.accountType !== 'OWNER_AGENT') {
      return NextResponse.json(
        { error: 'AGENT_ONLY', message: 'Réservé aux comptes agent.' },
        { status: 403, headers },
      );
    }

    const pricing = await getPricing();

    try {
      const subscription = await prisma.$transaction(async (tx) => {
        await lockUserListingQuota(tx, userId);
        const existing = await tx.subscription.findUnique({
          where: { userId },
          select: { planKey: true, status: true, trialStartedAt: true },
        });
        if (!isTrialEligible(user.accountType, existing)) throw new NotEligible();

        const now = new Date();
        const currentPeriodEnd = new Date(now.getTime() + TRIAL_DAYS_MS);
        const sub = await tx.subscription.upsert({
          where: { userId },
          create: {
            userId,
            planKey: 'PRO_AGENT',
            status: 'TRIAL',
            currentPeriodEnd,
            trialStartedAt: now,
          },
          update: {
            planKey: 'PRO_AGENT',
            status: 'TRIAL',
            currentPeriodEnd,
            trialStartedAt: now,
            canceledAt: null,
          },
          select: {
            planKey: true,
            status: true,
            currentPeriodEnd: true,
            canceledAt: true,
            trialStartedAt: true,
          },
        });
        await reactivateHiddenListings(tx, userId, planMaxListings(pricing, 'PRO_AGENT'));
        return sub;
      });

      return NextResponse.json({ subscription }, { status: 201, headers });
    } catch (err) {
      if (err instanceof NotEligible) {
        return NextResponse.json(
          { error: 'TRIAL_NOT_AVAILABLE', message: 'L’essai Pro n’est plus disponible.' },
          { status: 409, headers },
        );
      }
      throw err;
    }
  });
}
```

Dans `cancel/route.ts`, étendre la garde : `existing.status === 'CANCELED' || existing.status === 'TRIAL'` (un essai se termine seul).

- [ ] **Step 4: Run** les deux dossiers de test — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/subscriptions
git commit -m "feat(trial): start the 14-day Pro trial"
```

---

### Task 4: `GET /api/subscriptions/me` expose l'essai

**Files:**
- Modify: `frontend/src/app/api/subscriptions/me/route.ts`
- Test: `frontend/src/app/api/subscriptions/me/route.test.ts`

**Interfaces:**
- Consumes: `isTrialEligible` (T2).
- Produces: réponse `{ subscription: { planKey, status, currentPeriodEnd, canceledAt, boostCredits, trialStartedAt }, trialEligible: boolean }`.

- [ ] **Step 1: Write the failing test.** Les tests existants comparent la réponse avec `toEqual` : les mettre à jour pour inclure `trialStartedAt: null` dans `subscription` et `trialEligible: false` au niveau racine (le mock `prismaMock.user.findUnique` de ce fichier renvoie un utilisateur sans `accountType`, donc non éligible). Ajouter :

```ts
  it('is trial-eligible for an agent who was never subscribed', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1', email: 'user@example.com', tokenVersion: 0, accountType: 'OWNER_AGENT',
    } as never);
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const body = await (await GET(makeReq(validToken))).json();
    expect(body.trialEligible).toBe(true);
    expect(body.subscription.trialStartedAt).toBeNull();
  });

  it('is not eligible once a trial was taken and exposes its start', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1', email: 'user@example.com', tokenVersion: 0, accountType: 'OWNER_AGENT',
    } as never);
    const started = new Date('2026-11-01T00:00:00Z');
    prismaMock.subscription.findUnique.mockResolvedValue({
      planKey: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, canceledAt: null,
      boostCredits: 0, trialStartedAt: started,
    } as never);
    const body = await (await GET(makeReq(validToken))).json();
    expect(body.trialEligible).toBe(false);
    expect(body.subscription.trialStartedAt).toBe(started.toISOString());
  });
```

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/app/api/subscriptions/me` — Expected: FAIL.

- [ ] **Step 3: Implement.** Dans `me/route.ts` : ajouter `trialStartedAt: true` au `select`, `trialStartedAt: null` au repli `FREE`, lire `const user = await prisma.user.findUnique({ where: { id: auth.user.sub }, select: { accountType: true } });`, importer `isTrialEligible` et répondre `{ subscription, trialEligible: isTrialEligible(user?.accountType, row ? { planKey: row.planKey, status: row.status, trialStartedAt: row.trialStartedAt } : null) }`.

- [ ] **Step 4: Run** — Expected: PASS ; `pnpm typecheck`. Corriger les consommateurs TypeScript si le type de réponse est partagé.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/subscriptions/me
git commit -m "feat(trial): expose trialStartedAt and trialEligible on /me"
```

---

### Task 5: Cycle de vie — rappel J-3 et fin d'essai

**Files:**
- Modify: `frontend/src/lib/server/notifications/templates.ts`
- Modify: `frontend/src/lib/server/subscriptions/lifecycle.ts`
- Test: `frontend/src/lib/server/subscriptions/lifecycle.test.ts`

**Interfaces:**
- Produces: `trialReminderNotification(userId: string, trialEnd: Date): CreateNotificationInput` (dedupeKey `trial-reminder:<userId>:<trialEnd ISO>`), `trialEndedNotification(userId: string, hiddenCount: number, trialEnd: Date, disabledAlerts?: number): CreateNotificationInput` (dedupeKey `trial-ended:<userId>:<trialEnd ISO>`) ; `LifecycleResult.trialEnded: number` (les compteurs existants gardent leur sens).

- [ ] **Step 1: Write the failing test** — ajouter à `lifecycle.test.ts` (même mocks que le fichier ; `prismaMock.subscription.findMany` répond dans l'ordre des requêtes : adapter en distinguant par `where.status === 'TRIAL'` au moyen d'un `mockImplementation`) :

```ts
describe('trial', () => {
  const trialRows = (rows: unknown[]) =>
    prismaMock.subscription.findMany.mockImplementation((async (a: { where: { status?: unknown } }) =>
      a.where.status === 'TRIAL' ? rows : []) as never);

  it('reminds a trial ending within 3 days, once per trial', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(2) }]);
    const r = await run();
    expect(r.reminded).toBe(1);
    expect(mockNotify.mock.calls.map((c) => c[1].dedupeKey)).toContain(
      `trial-reminder:a:${at(2).toISOString()}`,
    );
  });

  it('ends an elapsed trial: FREE/EXPIRED, excess listings and alerts removed, notified', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(-0.5) }]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    mockHide.mockResolvedValue(4);
    mockDisable.mockResolvedValue(6);
    const r = await run();
    expect(r.trialEnded).toBe(1);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'a', status: 'TRIAL', currentPeriodEnd: { lte: now } },
      data: { planKey: 'FREE', status: 'EXPIRED' },
    });
    expect(mockHide).toHaveBeenCalledWith(expect.anything(), 'a', 5);
    expect(mockDisable).toHaveBeenCalledWith(expect.anything(), 'a', DEFAULT_PRICING, 'FREE');
    expect(mockNotify.mock.calls.map((c) => c[1].dedupeKey)).toContain(
      `trial-ended:a:${at(-0.5).toISOString()}`,
    );
  });

  it('is idempotent: a trial already ended by another run changes nothing', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(-1) }]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const r = await run();
    expect(r.trialEnded).toBe(0);
    expect(mockHide).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('asks only for trials ending within 3 days for the reminder', async () => {
    trialRows([]);
    await run();
    const wheres = prismaMock.subscription.findMany.mock.calls
      .map((c) => c[0]!.where as Record<string, unknown>)
      .filter((w) => w.status === 'TRIAL');
    expect(
      wheres.some(
        (w) => JSON.stringify(w.currentPeriodEnd) === JSON.stringify({ gt: now, lte: at(3) }),
      ),
    ).toBe(true);
  });

  it('takes the listing lock before the alert lock', async () => {
    trialRows([{ userId: 'a', currentPeriodEnd: at(-1) }]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
    await run();
    expect(mockLock.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      mockAlertLock.mock.invocationCallOrder.at(-1)!,
    );
  });
});
```
Les tests existants du fichier doivent continuer à passer (leurs `mockResolvedValueOnce` successifs : les nouvelles requêtes d'essai sont ajoutées **après** les requêtes existantes pour ne pas décaler leur ordre).

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/subscriptions/lifecycle.test.ts` — Expected: FAIL (`trialEnded` absent).

- [ ] **Step 3: Implement.** Dans `templates.ts` (après `subscriptionExpiredNotification`) :

```ts
export function trialReminderNotification(userId: string, trialEnd: Date): CreateNotificationInput {
  return {
    userId,
    type: 'TRIAL_REMINDER',
    title: 'Votre essai Pro se termine bientôt',
    body: `Votre essai gratuit se termine le ${isoDay(trialEnd)}. Passez à Pro pour garder vos 30 annonces et vos alertes.`,
    data: { trialEnd: trialEnd.toISOString() },
    dedupeKey: `trial-reminder:${userId}:${trialEnd.toISOString()}`,
  };
}

export function trialEndedNotification(
  userId: string,
  hiddenCount: number,
  trialEnd: Date,
  disabledAlerts = 0,
): CreateNotificationInput {
  const parts: string[] = ['Votre essai Pro est terminé, votre compte repasse au plan Gratuit.'];
  if (hiddenCount > 0) {
    parts.push(`${hiddenCount} annonce(s) ont été masquées. Elles reviendront si vous passez à Pro.`);
  }
  if (disabledAlerts > 0) {
    parts.push(`${disabledAlerts} alerte(s) secteur ont été désactivées.`);
  }
  return {
    userId,
    type: 'TRIAL_ENDED',
    title: 'Essai Pro terminé',
    body: parts.join(' '),
    data: { hiddenCount, disabledAlerts, trialEnd: trialEnd.toISOString() },
    dedupeKey: `trial-ended:${userId}:${trialEnd.toISOString()}`,
  };
}
```
Si `type` est une union ou un enum validé ailleurs (`grep -rn "SUBSCRIPTION_GRACE" frontend/src`), y ajouter `TRIAL_REMINDER` et `TRIAL_ENDED`.

Dans `lifecycle.ts` : importer les deux gabarits ; ajouter `trialEnded: 0` à `LifecycleResult` et à l'objet initial ; **après l'étape 3 existante** (avant `return result`) :

```ts
  // 4. Trials. Reminder (3 days before the end), then the hard stop: no grace.
  const endingTrials = await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 3 * DAY_MS) },
    },
    select: { userId: true, currentPeriodEnd: true },
    orderBy: { currentPeriodEnd: 'asc' },
    take: BATCH,
  });
  for (const sub of endingTrials) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const created = await createNotification(prisma, trialReminderNotification(sub.userId, end));
      if (created) result.reminded++;
    } catch (err) {
      log.warn('trial reminder failed', { userId: sub.userId, error: String(err) });
    }
  }

  const elapsedTrials = await prisma.subscription.findMany({
    where: { status: 'TRIAL', currentPeriodEnd: { lte: now } },
    select: { userId: true, currentPeriodEnd: true },
    orderBy: { currentPeriodEnd: 'asc' },
    take: BATCH,
  });
  for (const sub of elapsedTrials) {
    const end = sub.currentPeriodEnd;
    if (!end) continue;
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        await lockUserListingQuota(tx, sub.userId);
        const moved = await tx.subscription.updateMany({
          where: { userId: sub.userId, status: 'TRIAL', currentPeriodEnd: { lte: now } },
          data: { planKey: 'FREE', status: 'EXPIRED' },
        });
        if (moved.count === 0) return null;
        const hidden = await hideExcessListings(tx, sub.userId, freeLimit);
        // Listing lock first, alert lock second (fixed order, no deadlock).
        await lockUserAlertQuota(tx, sub.userId);
        const alertsDisabled = await disableExcessAlerts(tx, sub.userId, pricing, 'FREE');
        return { hidden, alertsDisabled };
      });
      if (outcome) {
        await createNotification(
          prisma,
          trialEndedNotification(sub.userId, outcome.hidden, end, outcome.alertsDisabled),
        );
        result.trialEnded++;
      }
    } catch (err) {
      log.warn('trial end failed', { userId: sub.userId, error: String(err) });
    }
  }
```
`freeLimit` est déjà défini plus haut dans la fonction. Mettre à jour l'en-tête de commentaire du fichier (`TRIAL ──(end)──► EXPIRED, no grace`). Si la route cron `app/api/cron/subscription-lifecycle/route.ts` (ou son test) liste les champs du résultat, y ajouter `trialEnded`.

- [ ] **Step 4: Run** `pnpm --filter frontend exec vitest run src/lib/server/subscriptions src/app/api/cron` — Expected: PASS ; `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/notifications/templates.ts frontend/src/lib/server/subscriptions frontend/src/app/api/cron
git commit -m "feat(trial): end-of-trial reminder and expiry in the lifecycle cron"
```

---

### Task 6: Paiement pendant l'essai

**Files:**
- Test: `frontend/src/lib/server/payments/fulfill-order.test.ts` (aucun changement de code attendu : `grantSubscription` ne reporte une période que pour `ACTIVE`/`CANCELED`)

**Interfaces:**
- Consumes: `fulfillPaidOrder`, helpers de test du fichier (`subOrder`, `tx`, `subscriptionFindUnique`, `subscriptionUpsert`, `NOW`, `at`).

- [ ] **Step 1: Write the test** — dans le `describe('subscription renewal and reactivation')`, sur le modèle exact du test « starts from now on a plan change » (lignes ~107-120 : relire ce test et reprendre sa façon d'appeler `fulfillPaidOrder` avec `subOrder('PRO_AGENT')` et de lire l'argument de `subscriptionUpsert`) :

```ts
  it('starts a full 30-day period from payment when paying during a trial, and keeps the trial marker', async () => {
    subscriptionFindUnique.mockResolvedValue({
      planKey: 'PRO_AGENT',
      status: 'TRIAL',
      currentPeriodEnd: at(5),
    });
    await fulfillPaidOrder(tx, subOrder('PRO_AGENT') as never);
    const args = subscriptionUpsert.mock.calls[0]![0];
    expect(args.update.status).toBe('ACTIVE');
    expect(args.update.currentPeriodEnd.getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(args.update).not.toHaveProperty('trialStartedAt');
  });
```
(Ajuster l'appel `fulfillPaidOrder(...)` à la signature réellement utilisée par les tests voisins.)

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/lib/server/payments/fulfill-order.test.ts` — Expected: PASS directement (le comportement existe déjà ; ce test le fige). Si FAIL, corriger `grantSubscription` : le statut `TRIAL` ne doit jamais entrer dans `carryFrom`.

- [ ] **Step 3: Vérifier que les jetons et boosts sont bien accordés** par un second test, identique mais qui contrôle `tokenTransactionCreate` appelé avec le grantKey `plan:<orderId>` (copier l'assertion du test « credits the plan monthly tokens as a BONUS keyed by the order » en y ajoutant la ligne `TRIAL`).

- [ ] **Step 4: Run** le fichier — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/payments/fulfill-order.test.ts
git commit -m "test(trial): paying during a trial starts a normal period with perks"
```

---

### Task 7: Interface — carte d'abonnement

**Files:**
- Modify: `frontend/src/lib/subscription-renewal.ts`
- Modify: `frontend/src/components/settings/SubscriptionCard.tsx`
- Test: `frontend/src/lib/subscription-renewal.test.ts` (existe-t-il ? sinon le créer)

**Interfaces:**
- Consumes: `GET /api/subscriptions/me` (`trialEligible`, `subscription.trialStartedAt`), `POST /api/subscriptions/trial`.

- [ ] **Step 1: Write the failing test** pour `getRenewalState` :

```ts
import { describe, it, expect } from 'vitest';
import { getRenewalState } from './subscription-renewal';

const now = new Date('2026-11-10T12:00:00Z');

describe('getRenewalState — trial', () => {
  it('a running trial can always be upgraded, whatever the days left', () => {
    const s = getRenewalState(
      { planKey: 'PRO_AGENT', status: 'TRIAL', currentPeriodEnd: '2026-11-24T12:00:00Z' },
      now,
    );
    expect(s.canRenew).toBe(true);
    expect(s.inGrace).toBe(false);
    expect(s.graceDeadline).toBeNull();
  });
});
```
(S'il existe déjà un fichier de test pour ce module, y ajouter le `describe`.)

- [ ] **Step 2: Run** le test — Expected: FAIL (type `'TRIAL'` non accepté / `canRenew` faux).

- [ ] **Step 3: Implement.** `subscription-renewal.ts` : `status: 'ACTIVE' | 'CANCELED' | 'GRACE' | 'TRIAL';` et dans `getRenewalState` : `canRenew: inGrace || sub.status === 'CANCELED' || sub.status === 'TRIAL' || nearEnd`.

`SubscriptionCard.tsx` :
- Type `Subscription` : `status: 'ACTIVE' | 'CANCELED' | 'GRACE' | 'TRIAL';` et `trialStartedAt?: string | null;`.
- État `const [trialEligible, setTrialEligible] = useState(false);` ; dans le `useEffect`, typer la réponse `{ subscription: Subscription; trialEligible?: boolean }` et appeler `setTrialEligible(res.trialEligible === true)`.
- Fonction :

```tsx
  async function startTrial() {
    setBusyPlan('PRO_AGENT');
    try {
      const res = await api<{ subscription: Subscription }>('/api/subscriptions/trial', {
        method: 'POST',
      });
      setSubscription(res.subscription);
      setTrialEligible(false);
      toast('Essai Pro de 14 jours activé.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erreur réseau. Réessaie.', 'error');
    } finally {
      setBusyPlan(null);
    }
  }
```
- Dans le bandeau « Plan actif » : le badge affiche « Essai Pro » quand `subscription?.status === 'TRIAL'` (sinon « Plan actif »), et la ligne de date devient, pour `TRIAL` : `Essai gratuit — se termine le <date fr-FR> (<N> jour(s) restant(s))` avec `N = Math.max(0, Math.ceil((end - now) / 86_400_000))`. Ne pas afficher le prix mensuel « par mois, taxes comprises » pendant l'essai : afficher « Gratuit pendant l'essai » à la place du bloc prix.
- Entre le bandeau et la grille des plans, quand `trialEligible && currentPlanKey === 'FREE'` :

```tsx
      {trialEligible && currentPlanKey === 'FREE' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 p-5">
          <div>
            <h3 className="font-sora text-[15px] font-semibold text-neutral-900">
              Essayez Pro gratuitement pendant 14 jours
            </h3>
            <p className="text-[13px] text-gray-600">
              30 annonces et 10 alertes secteur, sans carte bancaire. Les jetons et le boost inclus
              sont accordés à l’abonnement.
            </p>
          </div>
          <button
            type="button"
            disabled={busyPlan !== null}
            onClick={() => void startTrial()}
            className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {busyPlan === 'PRO_AGENT' ? 'Activation…' : 'Démarrer l’essai'}
          </button>
        </div>
      )}
```
- Libellé du bouton de la carte du plan courant pendant l'essai : `isRenewal` est vrai (T7 step 3) ; remplacer `'Renouveler'` par `subscription?.status === 'TRIAL' ? 'Passer à Pro' : 'Renouveler'`.

- [ ] **Step 4: Run** `pnpm --filter frontend exec vitest run src/lib/subscription-renewal.test.ts` — Expected: PASS ; `pnpm typecheck`, `pnpm lint`, `pnpm exec prettier --write` sur les fichiers modifiés.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/subscription-renewal.ts frontend/src/lib/subscription-renewal.test.ts frontend/src/components/settings/SubscriptionCard.tsx
git commit -m "feat(trial): trial invitation, badge and upgrade button on the plan card"
```

---

### Task 8: Vérification finale et parcours local

**Files:** aucun fichier de production.

- [ ] **Step 1: Suite complète** (serveur de dev arrêté) : `pnpm format && pnpm lint && pnpm typecheck && pnpm test`. Expected: tout vert (≈ 1854 tests existants + les nouveaux ; si un test bcrypt expire, relancer le fichier seul).

- [ ] **Step 2: Parcours local scripté** (script jetable dans le scratchpad sur le modèle de `phase1c-check.cjs` : base locale uniquement, comptes jetables, nettoyage final). Vérifier :
  - `GET /api/subscriptions/me` d'un agent neuf : `trialEligible: true` ; d'un non-agent : `false`.
  - `POST /api/subscriptions/trial` : 201, `planKey PRO_AGENT`, `status TRIAL`, fin à J+14 (± quelques secondes), **solde de jetons inchangé** et `boostCredits` 0 ; le quota d'annonces vaut 30 (publier la 6ᵉ annonce passe, elle échouait en FREE).
  - Second `POST` : 409 `TRIAL_NOT_AVAILABLE` ; deux `POST` simultanés d'un autre agent : un seul 201.
  - `POST /api/subscriptions/cancel` pendant l'essai : 400.
  - Essai terminé simulé (`currentPeriodEnd` reculée en base) puis `GET /api/cron/subscription-lifecycle` avec `Authorization: Bearer ${CRON_SECRET}` (lire `CRON_SECRET` dans `.env.local`) : `trialEnded` ≥ 1, ligne `FREE`/`EXPIRED`, annonces au-delà de 5 passées `HIDDEN`, alertes en trop désactivées, notification `TRIAL_ENDED` présente ; un second appel du cron ne change rien.
  - Après la fin : `POST /trial` donne 409 (essai déjà pris).
  - Agent neuf, essai démarré, puis simulation du paiement par appel direct de `fulfillPaidOrder` impossible en HTTP : se contenter du test unitaire de T6 pour cette partie.
  - Un agent avec un abonnement payant expiré (`FREE`/`EXPIRED`) : `trialEligible: false`.

- [ ] **Step 3: Vérification visuelle** : `pnpm dev`, ouvrir les réglages « Abonnement » avec un agent jetable éligible : le bloc d'invitation apparaît, le clic démarre l'essai, le badge « Essai Pro » et les jours restants s'affichent, le bouton « Passer à Pro » est actif. Si l'affichage ne peut pas être contrôlé, le dire dans le compte rendu.

- [ ] **Step 4: Commit** (si des correctifs ont été nécessaires) avec un message `fix(trial): …`.

---

## Notes de déploiement (hors exécution)

Migrations à appliquer dans l'ordre : `20261013120000_pricing_config`, `20261014100000_token_grant_key`, `20261014120000_listing_boosts`, `20261014140000_lead_purchases`, puis `20261014160000_subscription_trial`. Aucun nouveau cron : le cron horaire `subscription-lifecycle` porte la logique d'essai (rappel et fin). Aucun push ni déploiement sans autorisation explicite de l'utilisateur.
