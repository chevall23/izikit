# Monétisation phase 1C — Leads acheteurs contre jetons

Date : 2026-10-14. Suite de 1A (droits des plans) et 1B (boosts). Morceaux suivants : 1D essai Pro 14 j, 1E stats par niveau + export.

## Objectif

Un agent parcourt les demandes immobilières déposées par des visiteurs (sans compte), sans voir leurs coordonnées, et paie des jetons pour les révéler. Au plus 3 agents peuvent acheter la même demande. Si le numéro est faux, l'agent est remboursé automatiquement, dans la limite d'un plafond.

## État actuel (vérifié dans le code)

- « Demande immobilière » dans l'espace agent ne montre que les demandes saisies par l'agent (`PropertyRequest.userId` renseigné). Il n'existe pas de place de marché.
- Les demandes publiques (`POST /api/public/property-requests`) ont `userId = null` (« pending an agent to pick up ») ; la liste publique n'expose ni nom, ni téléphone, ni e-mail.
- `trustStatus` (`TRUSTED | REVIEW | REJECTED`) existe déjà : une demande `REVIEW` ou `REJECTED` n'est jamais proposée aux agents tant qu'un admin ne l'a pas approuvée.

## Décisions

- Vendable = `userId IS NULL`, `trustStatus = 'TRUSTED'`, `status <> 'CLOTUREE'`. Les demandes saisies par un agent restent à lui.
- Visible avant achat : type de bien, transaction, pays, ville, quartier, budget, priorité, délai, financement, date. Les notes libres restent cachées (elles contiennent souvent un numéro). Révélé à l'achat : nom, téléphone, e-mail, notes, type de client.
- Prix : 3 jetons, 5 pour une demande de priorité `Urgent`. Éditables dans l'admin.
- Maximum 3 acheteurs actifs par demande. Un achat est définitif pour l'agent (jamais re-facturé).
- Remboursement « numéro invalide » **automatique**, signalement dans les 72 h suivant l'achat, plafond de **2 remboursements par agent sur 30 jours glissants**. Pas de file admin dédiée.
- Risque accepté : un agent peut copier un numéro valide puis se faire rembourser ; le plafond et la revue admin de la demande le limitent sans l'éliminer.
- Consentement : le formulaire public de demande et la page confidentialité mentionnent que les coordonnées peuvent être transmises à jusqu'à 3 agents.

## Design

### 1. Données (migration Prisma)

Modèle `LeadPurchase` : `id`, `requestId` (FK `PropertyRequest`, cascade), `agentId` (FK `User`, cascade), `tokensSpent`, `status` (`ACTIVE` | `REFUNDED`, défaut `ACTIVE`), `reportedAt?`, `reportReason?`, `refundedAt?`, `createdAt`. Unique `(requestId, agentId)` ; index `(requestId, status)` et `(agentId, createdAt)`. Relations inverses `leadPurchases` sur `PropertyRequest` et `User`. Aucun changement des colonnes de `PropertyRequest` : les places restantes sont `3 − count(ACTIVE)`.

### 2. Tarification (`lib/pricing.ts`)

Bloc `lead: { tokensStandard, tokensUrgent }` (entiers > 0), valeurs par défaut 3 / 5 pour les lignes `PricingConfig` déjà stockées (même mécanisme que `boost`). Helper `leadTokenCost(pricing, priority)` : `Urgent` → urgent, tout le reste → standard. Éditeur admin : deux champs, audités comme le reste.

### 3. API

Toutes : `runtime = 'nodejs'`, mutations avec `verifyCsrf` puis `requireAuth()`, réservées aux comptes `accountType = 'OWNER_AGENT'` (sinon 403 `AGENT_ONLY`).

- `GET /api/leads?country&city&cursor&limit` : demandes vendables, plus récentes d'abord (pagination par curseur existante). Chaque item : champs visibles avant achat, `price`, `slotsLeft`, `purchased` (l'agent a un achat `ACTIVE`). Les demandes dont les 3 places sont prises et que l'agent n'a pas achetées sont masquées. Aucune coordonnée, aucune note.
- `POST /api/leads/[id]/purchase` : une transaction avec verrou consultatif par demande (`lead:<requestId>`) :
  1. La demande doit rester vendable, sinon 409 `LEAD_UNAVAILABLE`.
  2. Si l'agent a déjà un achat `ACTIVE` : 200 avec les coordonnées, sans débit (`charged: false`).
  3. Si 3 achats `ACTIVE` existent : 409 `LEAD_FULL`.
  4. Solde insuffisant : 422 `INSUFFICIENT_TOKENS` (même corps que `unlock-contact`, plus `required`).
  5. Débit atomique du portefeuille (`assertBalanceNotNegative`), `TokenTransaction` `USAGE` (« Achat de lead — <ville> »), création du `LeadPurchase`.
  6. Réponse 201 `{ contact: { clientName, clientPhone, clientEmail, clientType, notes }, tokenBalance, charged: true }`.
- `GET /api/leads/purchased` : achats `ACTIVE` de l'agent avec champs visibles + coordonnées, plus récents d'abord ; les achats `REFUNDED` sont listés sans coordonnées (`refunded: true`).
- `POST /api/leads/[id]/report` (corps `{ reason: 'INVALID_NUMBER' }`) : transaction verrouillée par demande :
  1. Pas d'achat de cet agent pour cette demande : 404 `PURCHASE_NOT_FOUND`.
  2. Achat déjà `REFUNDED` : 200 idempotent, sans nouveau remboursement.
  3. Achat de plus de 72 h : 409 `REPORT_WINDOW_CLOSED`.
  4. Déjà 2 remboursements sur les 30 derniers jours pour cet agent : 409 `REFUND_LIMIT`.
  5. Sinon : l'achat passe `REFUNDED` (`updateMany … where status ACTIVE`, le `count` garantit l'idempotence sous concurrence), jetons rendus (`increment`) avec une `TokenTransaction` de type `REFUND` (montant positif, « Remboursement de lead »), la place est libérée, la demande passe `trustStatus = 'REVIEW'` avec le signal `LEAD_REPORTED_INVALID_NUMBER` ajouté à `trustFlags` (si elle était `TRUSTED`).

### 4. Interface

- Page agent « Leads acheteurs » (`/leads`), entrée dans la navigation de l'espace agent, deux onglets : « Opportunités » (cartes : bien, ville, budget, priorité, délai, prix, places restantes, bouton « Acheter ») et « Mes leads » (coordonnées avec liens `tel:` et WhatsApp, date d'achat, bouton « Signaler un numéro invalide » tant que la fenêtre de 72 h est ouverte, état « Remboursé »).
- Modale de confirmation d'achat : prix, solde, avertissement « paiement définitif, remboursable uniquement si le numéro est invalide dans les 72 h ».
- Historique des jetons : le type `REFUND` est affiché lisiblement.
- Consentement : phrase ajoutée au formulaire public de demande (dernière étape) et à la page confidentialité.

## Erreurs et cas limites

- Deux agents achètent la dernière place en même temps : le verrou par demande garantit qu'un seul réussit, l'autre reçoit `LEAD_FULL` sans débit.
- Une demande devient `REVIEW` ou `CLOTUREE` pendant que l'agent regarde la liste : l'achat est refusé (`LEAD_UNAVAILABLE`), sans débit. Les acheteurs déjà servis gardent l'accès à leurs coordonnées (ils ont payé).
- Remboursement rejoué (double clic, rejeu réseau) : un seul remboursement.
- Demande supprimée : les achats disparaissent en cascade ; aucun remboursement automatique (cas admin).
- Compte agent suspendu : bloqué par le contrôle d'accès existant.

## Hors périmètre

Notification des agents dont une alerte correspond à un nouveau lead, file admin des signalements, vente des demandes saisies par les agents, tarification dynamique selon le budget, statistiques de conversion.

## Tests

- Tarification : défauts des lignes stockées, coût standard/urgent, valeurs invalides refusées.
- Liste : seules les demandes vendables, aucune coordonnée ni note, places restantes, demandes complètes masquées, réservé aux agents.
- Achat : coûts 3 et 5, `INSUFFICIENT_TOKENS`, `LEAD_FULL` à la 4ᵉ tentative, ré-achat gratuit, concurrence sur la dernière place, demande `REVIEW`/`CLOTUREE`/appartenant à un agent refusée, transaction `USAGE`.
- Signalement : remboursement exact, transaction `REFUND`, place libérée, demande en `REVIEW` avec signal, idempotence, fenêtre de 72 h, plafond de 2 par 30 jours, coordonnées masquées après remboursement.
- Parcours local scripté (agent avec jetons, 4 agents sur une même demande, remboursement, plafond) avant déploiement.

## Déploiement

Une migration (table `LeadPurchase`) à appliquer après `20261014120000_listing_boosts`. Aucun nouveau cron. Textes de consentement à relire avant mise en ligne.
