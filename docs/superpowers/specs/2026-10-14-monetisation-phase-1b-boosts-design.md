# Monétisation phase 1B — Boosts d'annonces

Date : 2026-10-14. Suite de la phase 1A (droits des plans). Morceaux suivants : 1C leads contre jetons, 1D essai Pro 14 j, 1E stats par niveau + export.

## Objectif

Un agent met une annonce en avant pendant 7, 15 ou 30 jours, en dépensant des jetons ou un boost inclus dans son plan (Pro : 1, Agence : 4 boosts de 7 jours par paiement d'abonnement, champ `includedBoosts` déjà stocké en 1A). Les annonces boostées apparaissent en tête des résultats publics avec le badge « Sponsorisé ».

## Décisions

- Boosts payants en jetons (pas de flux FCFA dédié). Prix par défaut : 7 j = 8 jetons, 15 j = 14, 30 j = 24 (≈ 2 400 / 4 200 / 7 200 F au jeton de base de 300 F). Éditables dans l'admin.
- Placement : annonces boostées épinglées en tête des résultats de `/annonces`, de l'accueil et des pages ville, **3 au maximum par recherche, en page 1 uniquement** (pas par page : un plafond par page casserait la pagination). Au-delà de 3 boostées, les 3 affichées tournent chaque heure.
- Seules les annonces `VERIFIED` se boostent. Pas de remboursement. Pas de statistiques d'impressions (hors périmètre).
- Les boosts inclus n'expirent pas (comme les jetons) et ne valent que pour la durée de 7 jours.

## Design

### 1. Données (migration Prisma)

- Modèle `Boost` : `id`, `listingId` (FK cascade), `userId` (FK cascade), `startsAt`, `endsAt`, `days` (7 | 15 | 30), `source` (`TOKENS` | `INCLUDED`), `tokensSpent` (0 si inclus), `createdAt` ; index `(listingId, endsAt)`. Historique et audit.
- `Listing.boostedUntil DateTime?` + index `(status, boostedUntil)` : valeur dénormalisée utilisée par le classement. Aucune expiration à gérer, les requêtes comparent à l'heure courante.
- `Subscription.boostCredits Int @default(0)` : boosts de 7 jours inclus restants.

### 2. Tarification (`lib/pricing.ts`)

Nouveau bloc `boost: { tokens7, tokens15, tokens30 }` (entiers > 0), avec valeur par défaut 8 / 14 / 24 pour les lignes `PricingConfig` déjà stockées. Helper `boostTokenCost(pricing, days)`. Éditeur admin : trois champs ; changement audité comme le reste.

### 3. Crédit des boosts inclus

Dans `fulfill-order.ts`, `grantMonthlyTokens` devient `grantPlanPerks` : une seule garde d'idempotence (`TokenTransaction.grantKey = plan:<orderId>`, déjà posée en 1A) couvre jetons et boosts. Si le plan accorde au moins un avantage (`monthlyTokens > 0` ou `includedBoosts > 0`), la ligne `BONUS` est écrite (montant = jetons, éventuellement 0 ; description « Jetons et boosts offerts — plan X ») et `Subscription.boostCredits` est incrémenté de `includedBoosts` dans la même transaction. Si la ligne existe déjà, rien n'est recrédité. Un plan sans aucun avantage n'écrit rien.

### 4. Achat — `POST /api/listings/[id]/boost`

Corps : `{ days: 7 | 15 | 30, useIncluded?: boolean }`. CSRF + `requireAuth`, `runtime = 'nodejs'`.

- Propriétaire de l'annonce, statut `VERIFIED`, sinon 404 (non propriétaire) ou 409 `LISTING_NOT_BOOSTABLE`.
- Une transaction avec verrou consultatif par utilisateur (`boost:<userId>`) :
  - `useIncluded` : `days` doit valoir 7 (sinon 400) ; `subscription.updateMany({ where: { userId, boostCredits: { gte: 1 } }, data: { boostCredits: { decrement: 1 } } })` ; `count = 0` → 409 `NO_INCLUDED_BOOST`.
  - sinon : décrément du portefeuille de `boostTokenCost` jetons, `assertBalanceNotNegative`, ligne `TokenTransaction` `USAGE` (description « Boost d'annonce — N jours ») ; solde insuffisant → 422 `INSUFFICIENT_TOKENS` (même format que le déblocage de contact).
  - nouvelle `endsAt` = `max(maintenant, boostedUntil actuel) + days` ; refus 409 `BOOST_HORIZON` si elle dépasse maintenant + 60 jours ; création du `Boost`, mise à jour de `Listing.boostedUntil`.
- Réponse 201 : `{ boost, boostedUntil, tokenBalance, boostCredits }`.
- `GET /api/subscriptions/me` expose `boostCredits`.

### 5. Classement public

Helper unique `lib/server/public/boosted.ts` : `pickPinnedBoosted(where, now)` récupère les annonces correspondant aux filtres avec `boostedUntil > now`, les ordonne par un hachage déterministe `(id + heure courante)` (rotation horaire) et retourne les 3 premières. `searchPublicListings` (`/annonces` et son API) et `loadLanding` (accueil, pages ville) l'utilisent : en page 1, les épinglées passent devant ; elles sont exclues (`id notIn`) de la requête normale, dont le `take` de la page 1 est réduit du nombre d'épinglées et dont le `skip` des pages suivantes est décalé d'autant ; les totaux restent corrects. Chaque item public porte `boosted: boolean` ; les cartes affichent un badge « Sponsorisé ». Les tris par prix : l'épinglage s'applique aussi (visibilité payée, comportement identique pour tous les tris).

### 6. Interface

« Mes annonces » : bouton « Booster » sur les annonces `VERIFIED`, ouvrant une modale (durée 7 / 15 / 30 j, coût en jetons selon la tarification en direct, option « Boost inclus — N restant(s) » pour 7 j si `boostCredits > 0`, solde de jetons, bouton de confirmation). Erreurs affichées en français via `ApiError.message`. Fin du boost affichée sur la ligne de l'annonce. Cartes de plans : ajout de « N boost(s) de 7 jours inclus » (lignes déjà prévues en 1A).

## Erreurs et cas limites

- Annonce masquée (`HIDDEN`), refusée ou vendue pendant un boost : le boost reste en base mais n'a aucun effet (le classement ne retient que `VERIFIED`) ; pas de remboursement.
- Crédit de boosts rejoué par un webhook : une seule fois (garde d'idempotence ci-dessus).
- Deux achats simultanés du même agent : sérialisés par le verrou ; un seul boost inclus peut être consommé par crédit.
- Plus de 3 boostées sur une recherche : rotation horaire, jamais plus de 3 épinglées.
- Annonce boostée sur une page filtrée qui ne la contient pas : non épinglée (l'épinglage respecte les filtres).

## Tests

- Tarification : défaut des lignes stockées, coût par durée, valeurs invalides refusées.
- Crédit : boosts crédités avec les jetons, rejeu sans double crédit, plan à 0 jeton mais boosts > 0.
- Achat : propriétaire / statut, jetons (solde insuffisant, transaction USAGE, atomicité sous concurrence), boost inclus (7 j seulement, décrément atomique, épuisement), prolongation, plafond 60 j.
- Classement : épinglage page 1, exclusion du reste, pagination et totaux cohérents, plafond 3, rotation horaire déterministe, respect des filtres, annonces non `VERIFIED` ignorées.
- Parcours local scripté (agent Pro, achat par jetons et par boost inclus, annonce en tête de l'API publique, expiration simulée) avant déploiement.

## Déploiement

Une migration (table `Boost`, `Listing.boostedUntil`, `Subscription.boostCredits`) à appliquer après `20261014100000_token_grant_key`. Aucun nouveau cron.
