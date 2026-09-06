# Backend `/admin/annonces` — modération des annonces

**Date :** 2026-09-06
**Statut :** validé (design), prêt pour le plan d'implémentation
**Surface :** `frontend/src/app/api/admin/listings/*`, `frontend/src/lib/server/listings/moderation.ts`, `frontend/prisma/schema.prisma`, `frontend/src/app/api/listings/[id]/route.ts`

## Contexte

La page [frontend/src/app/admin/(protected)/annonces/page.tsx](../../../frontend/src/app/admin/(protected)/annonces/page.tsx)
est aujourd'hui un mockup Banani intégral (données statiques `LISTINGS`). Aucune
route `/api/admin/listings` n'existe. Le modèle `Listing` et ses satellites
(`ListingPhoto`, `ListingDocument`, `ListingReport`, `ListingView`,
`ListingInquiry`) sont déjà en place.

Le flux propriétaire actuel :

- `POST /api/listings` crée un `DRAFT` nu.
- `PATCH /api/listings/[id]` avec `publish: true` valide les champs requis et
  passe l'annonce **directement en `VERIFIED`** — aucun contrôle admin.
- `GET /api/public/listings` ne renvoie que les annonces `VERIFIED`.

Le pattern back-office est établi : `GET /api/admin/users` (liste filtrée +
pagination curseur), `PATCH /api/admin/listing-reports/[id]` (modération +
`logAdminAction`), `requireAdmin('ADMIN')` + `enforceAdminRateLimit` +
`makeRequestContext`/`withRequestContext`.

## Objectif

Câbler le backend de la page « Gestion des annonces » : liste filtrée avec
onglets par statut, tiroir de détail, validation/rejet (avec motif),
suppression, actions en masse, export CSV — le tout audité.

## Décisions prises

| Sujet | Décision |
|---|---|
| Périmètre | Modération complète : liste, détail, valider/rejeter, éditer, supprimer, masse, CSV |
| File de modération | Oui — `publish` passe désormais en `PENDING` ; l'annonce n'est publique qu'après validation admin |
| Statuts manquants | `REJECTED` seulement (Boostée / Expirée reportées) |
| Historique des modifications | Reporté — le tiroir front affichera un placeholder |
| Couche service | Oui — `lib/server/listings/moderation.ts`, routes fines |

## Hors périmètre (explicite)

- **Boost** : nécessite `boostedUntil` + lien paiement + tri « boostées en
  premier ». Feature dédiée ultérieure. Le bouton « Booster » du tiroir et
  l'onglet « Boostée » restent non câblés.
- **Expiration automatique** : statut `EXPIRED` + cron `listing-expiration`.
  Reporté. L'onglet « Expirée » reste non câblé.
- **Historique de modération** (`ListingEvent`) : reporté. Le bloc
  « Historique des modifications » du tiroir reste un placeholder front.
- **Création admin « au nom de »** : le bouton « Nouvelle annonce » nécessite
  un sélecteur de propriétaire ; laissé non câblé. `POST /api/admin/listings`
  n'est **pas** créé dans cette itération.

## Modèle de données

### `Listing` — champs ajoutés

```prisma
model Listing {
  // ...
  // commentaire à étendre : DRAFT | PENDING | VERIFIED | REJECTED | SOLD
  status String @default("PENDING")   // inchangé — déjà PENDING dans le schéma actuel

  rejectionReason String?
  rejectedAt      DateTime?
  moderatedById   String?
  moderatedBy     User?     @relation("ListingModerator", fields: [moderatedById], references: [id], onDelete: SetNull)
  moderatedAt     DateTime?
  // ...
  @@index([status])
  @@index([status, createdAt])   // nouvel index — tri liste admin
}
```

`User` reçoit la relation inverse :

```prisma
model User {
  // ...
  moderatedListings Listing[] @relation("ListingModerator")
}
```

- `rejectionReason` / `rejectedAt` : renseignés au rejet, remis à `null` à la
  validation et à la re-soumission par le propriétaire.
- `moderatedById` / `moderatedAt` : dernier admin ayant statué (validation ou
  rejet). `onDelete: SetNull` — la suppression d'un compte admin ne casse pas
  l'annonce.

### Migration

`pnpm db:migrate:dev --name admin_listings_moderation`. Migration purement
additive : nouvelles colonnes nullables + nouvel index + FK `SetNull`. Aucun
backfill (`status` et son défaut `PENDING` sont inchangés).

## Changement du flux de publication

Fichier : [frontend/src/app/api/listings/[id]/route.ts](../../../frontend/src/app/api/listings/[id]/route.ts)

1. `publish: true` : à la place de `status: 'VERIFIED'`, écrire
   `status: 'PENDING'`. Les vérifications `PUBLISH_REQUIREMENTS_NOT_MET`
   restent identiques.
2. Autoriser l'édition d'une annonce `REJECTED` par son propriétaire (le
   verrou actuel `LISTING_NOT_DRAFT` / 409 ne s'applique qu'à `DRAFT`) :
   étendre à « `DRAFT` **ou** `REJECTED` éditables ». Sur `publish: true`
   depuis `REJECTED`, repasser en `PENDING` et remettre
   `rejectionReason = null`, `rejectedAt = null`.
3. `GET /api/listings` (liste propriétaire) : ajouter `rejected` au bloc
   `counts` et inclure `rejectionReason` dans le `select` des lignes pour que
   le propriétaire voie le motif. Statuts affichés inchangés sinon.

Aucun changement à `GET /api/public/listings` : il filtre déjà `VERIFIED`, donc
`PENDING` / `REJECTED` restent hors du site public automatiquement.

## Couche service — `frontend/src/lib/server/listings/moderation.ts`

Fonctions pures (reçoivent `prisma` ou un client de transaction), sans dépendance
Next/HTTP. Codes d'erreur stables levés via une classe `ModerationError`
(`{ code, message }`) que les routes mappent en HTTP.

```ts
type ModerationErrorCode =
  | 'LISTING_NOT_FOUND'
  | 'LISTING_NOT_MODERATABLE'   // statut DRAFT ou SOLD
  | 'REASON_REQUIRED';

approveListing(db, { id: string, adminId: string }): Promise<Listing>
```

- Charge l'annonce (`id`). Absente → `LISTING_NOT_FOUND`.
- Statut ∈ {`DRAFT`, `SOLD`} → `LISTING_NOT_MODERATABLE`.
- Statut ∈ {`PENDING`, `VERIFIED`, `REJECTED`} → update
  `{ status: 'VERIFIED', moderatedById: adminId, moderatedAt: now,
  rejectionReason: null, rejectedAt: null }`.
- Idempotent : approuver une annonce déjà `VERIFIED` réécrit
  `moderatedBy/At` sans erreur (cohérent avec le non-no-op de
  `listing-reports`).

```ts
rejectListing(db, { id: string, adminId: string, reason: string }): Promise<Listing>
```

- `reason` vide/absente après `trim` → `REASON_REQUIRED` (la route valide déjà
  `3..500` via Zod ; garde-fou service).
- Mêmes règles de statut qu'`approve`. Update
  `{ status: 'REJECTED', rejectionReason: reason, rejectedAt: now,
  moderatedById: adminId, moderatedAt: now }`.

```ts
deleteListing(db, { id: string }): Promise<void>
```

- Absente → `LISTING_NOT_FOUND`.
- `prisma.listing.delete({ where: { id } })`. Les `onDelete: Cascade` sur
  `ListingPhoto` / `ListingDocument` / `ListingInquiry` / `ListingReport` /
  `ListingView` nettoient les satellites. (`Visit` cascade via `ListingInquiry`.)
- Note : les photos/documents Cloudinary ne sont **pas** supprimés côté
  provider dans cette itération (dette connue, cohérente avec l'absence de
  nettoyage Cloudinary ailleurs dans le repo).

```ts
bulkModerate(db, {
  action: 'approve' | 'reject' | 'delete',
  ids: string[],
  adminId: string,
  reason?: string,
}): Promise<{ ok: string[]; skipped: { id: string; code: ModerationErrorCode }[] }>
```

- `action: 'reject'` sans `reason` → lève `REASON_REQUIRED` avant la boucle.
- Itère `ids` (dédupliqués, ordre d'entrée préservé). Chaque élément est traité
  dans sa propre transaction courte via la fonction unitaire correspondante ;
  une `ModerationError` sur un id → `skipped`, on continue. Toute autre
  exception remonte (échec réel).
- Pas de verrou consultatif : la modération n'a pas d'invariant financier ; le
  pire cas concurrent est un double `approve` idempotent.

## Routes — `frontend/src/app/api/admin/listings/`

Toutes : `export const runtime = 'nodejs'`, `import 'server-only'`,
`makeRequestContext` + `withRequestContext`, `requireAdmin('ADMIN')`,
`enforceAdminRateLimit(auth.admin.id)`. Mutations : `verifyCsrf(req)` en tête +
`logAdminAction(prisma, …)` après succès. En-tête `x-request-id` sur chaque
réponse.

### `GET /api/admin/listings` — `route.ts`

Query params (tous optionnels) :

| Param | Effet |
|---|---|
| `q` | `contains` insensible sur `title` OU `city` (cap 200 car.) |
| `status` | égalité exacte (`PENDING` \| `VERIFIED` \| `REJECTED` \| `SOLD` \| `DRAFT`) |
| `country`, `city` | égalité exacte |
| `propertyType`, `transactionType` | égalité exacte |
| `minPrice`, `maxPrice` | entiers ; `price gte / lte` |
| `from`, `to` | ISO date ; `createdAt gte / lte` |
| `cursor`, `limit` | `decodeCursor` / `clampLimit` (pattern `paginate`) |

- `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, `take: limit + 1`,
  `buildPage`.
- `select` : `id, title, city, country, propertyType, transactionType, price,
  currency, status, viewCount, createdAt`, plus
  `user: { select: { id, name } }` et
  `photos: { where: { isPrimary: true }, take: 1, select: { url } }` pour la
  vignette.
- `counts` : `Promise.all` de `prisma.listing.count` par statut
  (`pending`, `verified`, `rejected`, `sold`, `all` = hors `DRAFT`) — alimente
  les onglets. `counts` reflète les filtres **hors** `status` (les onglets
  montrent les totaux par statut du sous-ensemble filtré).
- Vide → `200 { items: [], nextCursor: null, counts }` — jamais 404.

### `GET /api/admin/listings/[id]` — `[id]/route.ts`

- 404 `LISTING_NOT_FOUND` si absente.
- Renvoie `{ listing }` avec : tous les champs métier + `rejectionReason`,
  `rejectedAt`, `moderatedAt`, `moderatedBy: { id, name }`,
  `photos` (triées `position`), `documents` (`type, status, url, filename`),
  `owner: { id, name, email, phone, listingCount }` (où `listingCount` =
  `prisma.listing.count({ where: { userId, status: { not: 'DRAFT' } } })`),
  `inquiryCount`, `reportCount`.

### `PATCH /api/admin/listings/[id]` — `[id]/route.ts`

- Corps Zod : même dictionnaire de champs que `PATCH /api/listings/[id]`
  (`title, description, landmark, city, country, propertyType,
  transactionType, price, currency, surfaceM2, capacity, yearBuilt, standing,
  roomsTotal, bedrooms, bathrooms, kitchens, amenities`) — **sans** `publish`.
  Optionnellement `status` parmi `PENDING | VERIFIED | REJECTED | SOLD` pour un
  forçage manuel (si `REJECTED`, `rejectionReason` devient obligatoire dans le
  même corps).
- Pas de restriction de statut ni de propriétaire (override admin assumé).
- 404 si absente. Update partiel (spread conditionnel, pattern existant).
- `logAdminAction` `action: 'listing.update'`, `metadata: { fields: [...] }`.

### `DELETE /api/admin/listings/[id]` — `[id]/route.ts`

- `deleteListing`. 404 → `LISTING_NOT_FOUND`.
- `logAdminAction` `action: 'listing.delete'`,
  `metadata: { title, ownerId, status }` (capturés avant suppression).
- `204` sans corps.

### `POST /api/admin/listings/[id]/approve` — `[id]/approve/route.ts`

- `approveListing`. Mappe `LISTING_NOT_FOUND` → 404,
  `LISTING_NOT_MODERATABLE` → 409.
- `logAdminAction` `action: 'listing.approve'`,
  `metadata: { from: <statut avant> }`.
- `200 { listing }`.

### `POST /api/admin/listings/[id]/reject` — `[id]/reject/route.ts`

- Corps Zod : `{ reason: z.string().trim().min(3).max(500) }`. Invalide → 400
  `VALIDATION_FAILED`.
- `rejectListing`. Mappage d'erreurs idem `approve`.
- `logAdminAction` `action: 'listing.reject'`,
  `metadata: { from, reason }`.
- `200 { listing }`.

### `POST /api/admin/listings/bulk` — `bulk/route.ts`

- Corps Zod : `{ action: z.enum(['approve','reject','delete']),
  ids: z.array(z.string()).min(1).max(100),
  reason: z.string().trim().min(3).max(500).optional() }`.
  `action === 'reject'` sans `reason` → 400 `REASON_REQUIRED`.
- `bulkModerate`. Une seule ligne d'audit :
  `logAdminAction` `action: 'listing.bulk-' + action`,
  `metadata: { requested: ids.length, ok: ok.length, skipped }`.
- `200 { ok, skipped }`.

### `GET /api/admin/listings/export` — `export/route.ts`

- Mêmes filtres que la liste (`q, status, country, city, propertyType,
  transactionType, minPrice, maxPrice, from, to`), **sans** curseur.
- `findMany` avec `take: 5000` (cap dur ; en-tête
  `x-export-truncated: true` si 5000 lignes retournées).
- Colonnes : `id, title, status, transactionType, propertyType, city,
  country, price, currency, ownerName, ownerEmail, viewCount, createdAt,
  moderatedAt, rejectionReason`.
- Helper `frontend/src/lib/server/csv.ts` : `toCsv(rows, columns)` — échappe
  `"` par `""`, entoure de `"` tout champ contenant `",\n\r`, `\r\n` en fin de
  ligne, BOM UTF-8 en tête (Excel).
- Réponse : `new NextResponse(csv, { headers: { 'content-type':
  'text/csv; charset=utf-8', 'content-disposition':
  'attachment; filename="annonces-<yyyy-mm-dd>.csv"' } })`.
- `logAdminAction` `action: 'listing.export'`, `metadata: { count, filters }`.

## Codes d'erreur (contrat frontend)

| HTTP | `error` | Quand |
|---|---|---|
| 400 | `VALIDATION_FAILED` | corps Zod invalide |
| 400 | `REASON_REQUIRED` | `bulk`/`reject` sans motif |
| 401 | (middleware) | pas de session admin |
| 403 | (middleware) | rôle `USER` |
| 404 | `LISTING_NOT_FOUND` | id inconnu |
| 409 | `LISTING_NOT_MODERATABLE` | approve/reject sur `DRAFT` ou `SOLD` |
| 429 | (middleware) | > 100 req/min/admin |

## Tests (Vitest)

### `frontend/src/lib/server/listings/moderation.test.ts`

- `approveListing` : `PENDING`→`VERIFIED` ; `REJECTED`→`VERIFIED` efface
  `rejectionReason` ; `DRAFT`/`SOLD` → `LISTING_NOT_MODERATABLE` ; id absent →
  `LISTING_NOT_FOUND` ; positionne `moderatedById/At`.
- `rejectListing` : `PENDING`→`REJECTED` renseigne `rejectionReason` +
  `rejectedAt` ; `reason` vide → `REASON_REQUIRED`.
- `deleteListing` : supprime + cascade (compter photos/inquiries à 0 après) ;
  id absent → `LISTING_NOT_FOUND`.
- `bulkModerate` : mix d'ids valides/invalides → `ok` + `skipped` corrects,
  ordre préservé ; `reject` sans `reason` → lève `REASON_REQUIRED` ; ids
  dupliqués traités une fois.

### Routes — un `route.test.ts` par fichier

Patron commun (repris de `admin/users/route.test.ts`,
`admin/listing-reports/[id]/route.test.ts`) :

- 401 sans admin ; 403 si `requireAdmin` renvoie une réponse `USER`.
- Mutations : 403 `CSRF` si `verifyCsrf` échoue.
- Happy path : statut attendu + forme du corps.
- `logAdminAction` appelé avec le bon `action` / `targetType: 'Listing'` /
  `targetId` (spy sur le module audit).
- `GET` liste : filtres appliqués (mock `prisma.listing.findMany` — asserts sur
  le `where`), `counts` présents, vide → `items: []` jamais 404.
- `[id]` : 404 sur id inconnu.
- `approve`/`reject` : 409 sur `DRAFT`.
- `bulk` : `reject` sans `reason` → 400 ; réponse `{ ok, skipped }`.
- `export` : `content-type` + `content-disposition` corrects ; en-tête
  `x-export-truncated` quand cap atteint.

### `frontend/src/lib/server/csv.test.ts`

- Échappement `"`, champs avec virgule / saut de ligne, BOM présent, ligne
  vide → `""`.

### Tripwires existants

- `runtime-enforcement.test.ts` : couvre automatiquement les nouvelles routes
  (chacune doit exporter `runtime = 'nodejs'`).
- Aucun impact sur les `*shape.test.ts` (pas de mention backend legacy, pas de
  route cron ajoutée).

## Fichiers touchés

**Créés**
- `frontend/src/lib/server/listings/moderation.ts` + `.test.ts`
- `frontend/src/lib/server/csv.ts` + `.test.ts`
- `frontend/src/app/api/admin/listings/route.ts` + `.test.ts`
- `frontend/src/app/api/admin/listings/[id]/route.ts` + `.test.ts`
- `frontend/src/app/api/admin/listings/[id]/approve/route.ts` + `.test.ts`
- `frontend/src/app/api/admin/listings/[id]/reject/route.ts` + `.test.ts`
- `frontend/src/app/api/admin/listings/bulk/route.ts` + `.test.ts`
- `frontend/src/app/api/admin/listings/export/route.ts` + `.test.ts`
- `frontend/prisma/migrations/<ts>_admin_listings_moderation/`

**Modifiés**
- `frontend/prisma/schema.prisma` — champs `Listing` + relation `User` + index
- `frontend/src/app/api/listings/[id]/route.ts` — `publish`→`PENDING`,
  édition depuis `REJECTED`
- `frontend/src/app/api/listings/route.ts` — `counts.rejected`,
  `rejectionReason` dans le `select`
- `frontend/src/app/api/listings/route.test.ts` /
  `[id]/route.test.ts` — attentes mises à jour (`PENDING` au lieu de
  `VERIFIED`, nouveau count)

## Gate pré-commit

`pnpm format && pnpm lint && pnpm typecheck && pnpm test` — tout vert avant
commit.
