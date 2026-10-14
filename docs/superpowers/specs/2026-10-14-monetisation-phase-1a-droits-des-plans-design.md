# Monétisation phase 1A — Droits des plans

Date : 2026-10-14. Premier morceau de la phase 1 (voir `docs/plan-monetisation-habitat-afrik.pdf`).
Morceaux suivants, chacun avec son propre spec : 1B boosts, 1C leads contre jetons, 1D essai Pro 14 j, 1E stats par niveau + export.

## Objectif

Rendre réels trois avantages de la grille officielle des plans (décidée le 2026-10-14) :

| | Gratuit | Pro Agent (15 000 F) | Agence (35 000 F) |
|---|---|---|---|
| Jetons offerts par mois | 0 | 10 | 40 |
| Boosts 7 j inclus | 0 | 1 | 4 |
| Alertes secteur incluses | 0 | 10 | illimité |

Les boosts inclus sont seulement **stockés** ici (champ de tarification) ; leur consommation est le morceau 1B.

## Décisions

- Boosts payants en jetons (réglé pour 1B, pas traité ici).
- Les jetons mensuels n'expirent pas.
- La limite d'alertes ne s'applique qu'aux comptes agents (`accountType = OWNER_AGENT`). Les chercheurs gardent des alertes gratuites, avec un plafond technique anti-abus de 20 alertes actives.

## Design

### 1. Tarification étendue (`lib/pricing.ts`)

Chaque plan reçoit :
- `monthlyTokens` : entier ≥ 0
- `includedBoosts` : entier ≥ 0
- `maxAlerts` : entier ≥ 0 ou `null` (illimité)

Valeurs par défaut = grille ci-dessus (constantes dans `subscription-plans.ts`, comme les prix). Un champ absent d'une ligne `PricingConfig` déjà stockée retombe sur la valeur par défaut du plan (`.default()` zod par plan) : aucune migration de données, aucune ligne existante invalide. `GET /api/pricing` et l'éditeur admin (`PricingEditor`) exposent les trois champs ; la mise à jour reste auditée (`PRICING_UPDATED`).

### 2. Jetons mensuels : un crédit par paiement

- Un abonnement payé dure 30 jours : le crédit est donné **à la validation du paiement**, dans la même transaction que l'activation du plan (`fulfill-order.ts`, branche `subscription_plan_change`). Pas de nouveau cron.
- Montant = `monthlyTokens` du plan acheté, lu depuis la tarification en vigueur. Si 0, aucun crédit.
- Idempotence : nouvelle colonne `TokenTransaction.grantKey String? @unique`, valeur `plan:<orderId>`. Une transaction `BONUS` avec cette clé ; un rejeu de webhook rencontre la contrainte unique et ne crédite pas deux fois (même traitement `P2002` que `createNotification`).
- Renouvellement et changement de plan = nouveau paiement = nouveau crédit. L'essai Pro (1D) créditera à son propre point d'entrée avec sa propre clé.
- Description affichée dans l'historique : « Jetons offerts — plan Pro Agent ».

### 3. Limite d'alertes

- Nouveau helper `lib/server/alerts/quota.ts` calqué sur `listings/quota.ts` : plan effectif (`getEffectivePlanKey`), compte des alertes `active = true`, verrou consultatif par utilisateur pour éviter la course à la limite-1.
- Appliqué à la **création** d'une alerte et à sa **réactivation** (`active: false → true`), uniquement si le compte est `OWNER_AGENT`. Refus : 403 `ALERT_QUOTA_REACHED` avec `planKey` et `limit`.
- Compte chercheur : plafond fixe de 20 alertes actives, même code d'erreur.
- À l'expiration d'un abonnement (cron `subscription-lifecycle`, étape d'expiration) : les alertes actives au-delà de la limite du plan Gratuit sont désactivées (`active = false`), les plus récentes d'abord ; jamais supprimées. Pas de réactivation automatique au renouvellement (l'agent réactive lui-même, dans la limite).
- La notification d'expiration existante mentionne le nombre d'alertes désactivées s'il est > 0.

### 4. Interface

- Cartes de plans (`SubscriptionCard`) : ajoutent « N jetons offerts par mois » (si > 0) et « N alertes secteur » / « Alertes secteur illimitées » (agents). La ligne boost n'apparaît qu'après 1B.
- Éditeur admin (`PricingEditor`) : trois champs par plan.
- Erreur `ALERT_QUOTA_REACHED` : message français côté formulaire d'alerte (le frontend switche sur `ApiError.code`).

## Hors périmètre

Consommation des boosts, ventes de leads, essai 14 j, niveaux de statistiques/export, badge Vérifié par plan (retiré de la grille).

## Erreurs et cas limites

- Rejeu de webhook : crédit unique garanti par `grantKey`.
- Paiement validé alors que la tarification a changé : le crédit utilise la valeur en vigueur au moment de la validation (le prix, lui, reste figé à la commande).
- Plan Gratuit à `maxAlerts = 0` : un agent Gratuit ne peut créer aucune alerte (c'est la grille) ; ses alertes existantes restent visibles mais inactives si elles dépassent la limite à l'expiration.
- Verrou consultatif : même ordre de verrous que le quota d'annonces pour éviter un deadlock.

## Tests

- Schéma : ligne stockée sans les nouveaux champs → valeurs par défaut ; valeurs négatives refusées.
- Crédit mensuel : montant correct par plan, 0 = pas de transaction, rejeu = un seul crédit, rollback si l'activation échoue.
- Quota d'alertes : agent Gratuit refusé, Pro à 10, Agence illimitée, chercheur plafonné à 20, réactivation comptée, course simulée.
- Cycle de vie : alertes en trop désactivées à l'expiration, rien de supprimé, idempotent au second passage.
- Parcours local scripté (comme le contrôle de la phase 0) avant déploiement.

## Déploiement

Une migration : colonne `TokenTransaction.grantKey` (nullable, unique). Aucun nouveau cron. À appliquer après la migration `pricing_config` déjà en attente.
