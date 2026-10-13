# Monétisation — Phase 0 : corriger les fuites de revenu

Date : 2026-10-13 · Statut : à relire · Base : `docs/plan-monetisation-habitat-afrik.pdf` (audit 2026-10-12)

## Objectif

Boucher les fuites de revenu avant de vendre plus (boosts, leads : phase 1). La prod est vide, aucune migration de données réelles.

## Décisions validées

| Sujet | Décision |
|---|---|
| Expiration d'abonnement | Rappels J-7 / J-3 / J-0, 7 jours de grâce (plan encore actif), puis passage à FREE et **masquage** (pas suppression) des annonces au-delà de 3, les plus anciennes d'abord. Réactivées au renouvellement, dans la limite du quota. |
| Renouvellement | Pas de prélèvement récurrent (mobile money) : rappel puis paiement manuel. |
| Prix du jeton | Base 300 F. Recharge libre = 300 F/jeton. Prix des packs **calculés** depuis la base par remise de volume. |
| PricingConfig | En base, éditable depuis `admin/parametres/tarification`, avec journal d'audit. Boosts exclus (phase 1). |

## Hors périmètre

Boosts, leads contre jetons, jetons mensuels, essai gratuit, passage de 29 900 à 19 900 F (réglable ensuite via l'admin), multi-devise.

## 1. Configuration des prix

- Modèle Prisma `PricingConfig` : `id String @id` (ligne unique `default`), `data Json`, `updatedAt`, `updatedById String?`.
- `frontend/src/lib/server/pricing/` : schéma zod `PricingData`, `getPricing()` (cache mémoire 60 s, invalidé à l'écriture admin), `savePricing()`.
- `PricingData` contient :
  - `plans` : par `PlanKey`, `priceFcfa` et `maxActiveListings` (entier ou `null` = illimité).
  - `token.baseFcfa` (300) et `token.packs` : par pack, `tokens` et `discountPct`.
- Repli : si la ligne est absente ou invalide, `getPricing()` renvoie les constantes de `subscription-plans.ts` et `token-packs.ts` (qui deviennent les valeurs par défaut) et journalise un `log.warn`. L'app ne casse jamais.
- Prix pack = `round(tokens × baseFcfa × (1 − discountPct/100))`. Paliers initiaux proposés : 50 jetons −10 %, 150 jetons −20 %, 350 jetons −28 % (à confirmer à la relecture).
- `GET /api/pricing` (public) alimente l'UI client. Les composants n'importent plus les prix en dur.
- Les `Order` figent `priceFcfa`, `planKey` / `packKey` et le nombre de jetons dans `metadata` à la création. `fulfillPaidOrder` crédite ce qui a été payé, pas le catalogue courant.

## 2. Quotas d'annonces

- Helper `assertCanPublish(prisma, userId)` : compte les annonces publiées, compare au quota du plan **effectif**.
- Plan effectif : `FREE` si le statut est `EXPIRED`, ou si `currentPeriodEnd + 7 j` est dépassé (même avant le passage du cron). Pendant `GRACE`, le plan payant reste actif.
- Appelé dans `POST /api/listings` et à la republication d'une annonce masquée.
- Erreur : 403 `LISTING_QUOTA_REACHED` avec `{ planKey, limit }`, pour que l'UI propose la mise à niveau.

## 3. Cycle de vie de l'abonnement

- Statuts `Subscription.status` : `ACTIVE | GRACE | EXPIRED | CANCELED`.
- Nouveau cron `app/api/cron/subscription-lifecycle/route.ts` (toutes les heures, `verifyCronSecret`, `runtime = 'nodejs'`) :
  1. Rappels J-7 / J-3 / J-0 via l'outbox, `dedupeKey` = `sub-reminder:{userId}:{periodEnd}:{J}`.
  2. `ACTIVE` → `GRACE` quand `currentPeriodEnd` est dépassé.
  3. `GRACE` → `EXPIRED` après 7 jours : `planKey = FREE`, masquage des annonces au-delà de 3 (statut annonce masqué, jamais supprimé), notification.
  4. Idempotent : relancer le cron ne produit ni double notification ni double masquage.
- `fulfillPaidOrder` : nouvelle période = `max(now, currentPeriodEnd) + 30 j` (les jours restants ne sont pas perdus). Statut remis à `ACTIVE`, annonces masquées réactivées dans la limite du quota.
- Documenter la ligne cron dans `docs/deploy/n0c-crons.md` et mettre à jour le test tripwire de l'inventaire des crons.
- `POST /api/subscriptions/cancel` : le plan reste actif jusqu'à `currentPeriodEnd`, sans passer par la grâce.

## 4. Jetons

- Un seul chemin de calcul de prix (`pricing/tokens.ts`) utilisé par l'affichage, `POST /api/orders` et la recharge libre.
- Validation de la recharge libre : entier ≥ 1, borne max à fixer au plan.

## 5. Admin

- `PUT /api/admin/pricing` : SUPERADMIN uniquement, `verifyCsrf`, validation zod, `logAdminAction(prisma, …)` avec l'ancien et le nouveau contenu.
- Garde-fous : prix ≥ 0, remise 0-90 %, quota entier ≥ 0 ou `null`, `FREE.priceFcfa` figé à 0.
- La page `admin/parametres/tarification` (aujourd'hui une maquette statique) devient un formulaire branché sur cette route.

## 6. Schéma et migration

- Ajout du modèle `PricingConfig`, nouveaux statuts d'abonnement (texte, pas d'enum), éventuel champ de masquage sur `Listing` si l'état actuel ne couvre pas « masquée par expiration » (à vérifier à l'écriture du plan).
- Migration versionnée (`pnpm db:migrate:dev` sur la base locale `localhost:5433`).

## 7. Tests (TDD)

- Quotas : quota exact, plan échu traité comme gratuit, republication, illimité.
- Cron : chaque transition, idempotence, rappels dédupliqués, masquage des plus anciennes.
- Pricing : repli sur les défauts (ligne absente / JSON invalide), invalidation du cache, calcul des packs.
- Webhook : crédit conforme au prix figé dans `metadata` malgré un changement de prix intermédiaire.
- Admin : accès refusé hors SUPERADMIN, ligne d'audit écrite, garde-fous.

## Risques

- `fulfill-order.ts` tourne dans la transaction Serializable du webhook : logique courte, pas d'appel externe.
- Les routes de paiement existantes lisent les constantes : migration de chaque appelant vers `getPricing()` à lister précisément dans le plan.
- Le cache mémoire est par instance (acceptable en instance unique sur N0C, 60 s de décalage possible après une édition).
