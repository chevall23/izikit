# Backend `/blog` — articles, catégories, newsletter

**Date :** 2026-09-11
**Statut :** validé (design), prêt pour le plan d'implémentation
**Surface :** `frontend/src/app/api/admin/blog/*`, `frontend/src/app/api/public/blog/*`,
`frontend/src/app/api/public/newsletter/route.ts`, `frontend/src/lib/server/blog/*`,
`frontend/prisma/schema.prisma`, `frontend/src/app/blog/page.tsx`,
`frontend/src/app/blog/[slug]/page.tsx`

## Contexte

[frontend/src/app/blog/page.tsx](../../../frontend/src/app/blog/page.tsx) est
un mockup Banani intégral (voir `.planning/banani/blog.md`) : catégories,
articles, tags, "populaires" et newsletter sont tous des tableaux statiques ;
tout est marqué `InertRow` (inerte) sauf le filtre par catégorie qui opère sur
les 7 articles littéraux. Aucun modèle `BlogArticle`/`BlogCategory` n'existe.
Aucune page de détail d'article n'existe.

Le pattern back-office est établi ailleurs (`ContactMessage`,
`ListingReport`, `PropertyRequest`) : `requireAdmin('ADMIN')` +
`enforceAdminRateLimit` + `makeRequestContext`/`withRequestContext` +
`logAdminAction` pour les mutations, pagination curseur via
`lib/server/pagination/paginate.ts`. Le pattern public est établi par
`GET /api/public/listings` (pagination `page`/`limit`, filtres best-effort,
jamais de 400 sur des query params invalides) et `POST /api/public/contact`
(rate-limit par email via `createEmailLimiter`, persistance même si l'email
best-effort échoue).

## Objectif

Remplacer les données statiques de `/blog` par un vrai backend : modèles
Prisma, CRUD admin pour gérer catégories/articles, endpoints publics pour
lister/filtrer/rechercher/paginer et lire un article, page de détail
`/blog/[slug]`, et un formulaire newsletter fonctionnel.

## Décisions prises

| Sujet | Décision |
|---|---|
| Auteurs | Admin back-office uniquement — pas de rôle éditorial séparé |
| Catégories | Gérables dynamiquement par l'admin (`BlogCategory`), pas une liste figée |
| Contenu d'article | HTML brut saisi par l'admin, assaini côté serveur à l'écriture |
| Newsletter | Backend réel (`NewsletterSubscriber` + endpoint dédié) |
| Page de détail | Incluse dans ce lot (`/blog/[slug]`) |
| Auteur = personnage éditorial | Champs texte libre (`authorName`/`authorRole`/`authorAvatarUrl`), pas de FK vers `User` |

## Hors périmètre (explicite)

- **Commentaires sur les articles** — non demandés, non présents dans le
  mockup Banani.
- **Vue d'ensemble admin des abonnés newsletter** (liste/export) — seul
  l'endpoint d'inscription est construit ; une UI admin de gestion des
  abonnés est un lot séparé si besoin.
- **Historique de versions d'un article** — pas de `BlogArticleRevision`;
  édition en place uniquement.
- **Programmation de publication différée** (`scheduledAt`) — YAGNI, un
  statut `PUBLISHED` posé manuellement suffit.
- **Table de log de vues par article** (type `ListingView`) — un compteur
  `viewCount` incrémenté en best-effort suffit pour le tri "populaires";
  pas de ventilation par source de trafic.

## Modèle de données

```prisma
model BlogCategory {
  id        String   @id @default(cuid())
  slug      String   @unique
  label     String
  colorKey  String   @default("brand") // brand | green | amber | violet | red
  position  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  articles BlogArticle[]

  @@index([position])
}

model BlogArticle {
  id     String @id @default(cuid())
  slug   String @unique
  title  String
  excerpt String

  // HTML assaini côté serveur (sanitize-html) à la création/édition —
  // jamais réassaini à la lecture (seul l'admin écrit ce champ).
  contentHtml String

  coverImageUrl String?

  categoryId String
  category   BlogCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  tags Json @default("[]") // string[]

  // Signature éditoriale — texte libre, pas de compte utilisateur associé
  // (un article peut être signé par un expert externe non inscrit).
  authorName      String
  authorRole      String?
  authorAvatarUrl String?

  status      String    @default("DRAFT") // DRAFT | PUBLISHED | ARCHIVED
  isFeatured  Boolean   @default(false)

  // Calculé serveur à la création/édition : mots du texte brut (contentHtml
  // dépouillé de ses balises) / 200 wpm, arrondi, minimum 1.
  readTimeMinutes Int @default(1)

  viewCount Int @default(0)

  publishedAt DateTime? // posé au premier passage DRAFT/ARCHIVED → PUBLISHED

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, publishedAt])
  @@index([categoryId])
  @@index([isFeatured])
}

model NewsletterSubscriber {
  id             String    @id @default(cuid())
  email          String    @unique
  status         String    @default("ACTIVE") // ACTIVE | UNSUBSCRIBED
  createdAt      DateTime  @default(now())
  unsubscribedAt DateTime?

  @@index([status])
}
```

`onDelete: Restrict` sur `BlogArticle.category` : suppression d'une
catégorie encore utilisée refusée (mirroring `AdminAction.actor`).

## Sanitization du contenu HTML

Nouvelle dépendance `sanitize-html` (aucune lib de sanitization/markdown
n'existe déjà dans `package.json`). Liste blanche restreinte au strict
nécessaire d'un article de blog :
`p, h2, h3, h4, ul, ol, li, a, strong, em, blockquote, img, br, code, pre,
figure, figcaption`, attributs `href`/`title`/`target` sur `a` (avec
`rel="noopener noreferrer"` forcé), `src`/`alt` sur `img`. Aucune balise
`script`/`style`/`iframe`/`on*` autorisée. Appliqué dans
`lib/server/blog/sanitize.ts`, appelé par les routes admin POST/PATCH
avant écriture — jamais côté lecture (le HTML stocké est déjà propre).

## API Admin (`requireAdmin('ADMIN')` + CSRF + audit)

### Catégories

- `GET /api/admin/blog/categories` — liste triée par `position`, inclut le
  nombre d'articles par catégorie (`_count`).
- `POST /api/admin/blog/categories` — `{ slug?, label, colorKey?, position? }`
  (slug auto-généré depuis `label` via `slugify`/`ensureUniqueSlug` si
  omis). Audit `blog_category.create`.
- `PATCH /api/admin/blog/categories/[id]` — édition partielle. Audit
  `blog_category.update`.
- `DELETE /api/admin/blog/categories/[id]` — refusé (409) si des articles y
  sont rattachés (le `Restrict` Prisma remonte en erreur applicative
  propre). Audit `blog_category.delete`.

### Articles

- `GET /api/admin/blog/articles` — pagination curseur (`limit`/`cursor`,
  `clampLimit`/`decodeCursor`/`buildPage`), filtres `status`, `categoryId`,
  `q` (titre/extrait, insensitive), `total` pour la pagination numérotée
  admin. Mirrors `GET /api/admin/property-requests`.
- `POST /api/admin/blog/articles` — body validé par zod : `title`,
  `excerpt`, `contentHtml`, `categoryId`, `coverImageUrl?`, `tags?`,
  `authorName`, `authorRole?`, `authorAvatarUrl?`, `status?`
  (`DRAFT`/`PUBLISHED`, défaut `DRAFT`), `isFeatured?`. Slug auto-généré
  depuis `title`. `contentHtml` assaini avant écriture.
  `readTimeMinutes` calculé serveur. Si `status: 'PUBLISHED'`,
  `publishedAt = now()`. Audit `blog_article.create`.
- `GET /api/admin/blog/articles/[id]` — détail complet (y compris
  `contentHtml` brut post-sanitization, pour réédition).
- `PATCH /api/admin/blog/articles/[id]` — édition partielle, mêmes règles
  de sanitization/recalcul que POST ; transition vers `PUBLISHED` pose
  `publishedAt` seulement s'il est encore `null` (ne pas réinitialiser la
  date de première publication sur une simple modification). Audit
  `blog_article.update`.
- `DELETE /api/admin/blog/articles/[id]` — suppression définitive. Audit
  `blog_article.delete`.

## API publique (sans auth, jamais DRAFT/ARCHIVED)

- `GET /api/public/blog/categories` — `{ slug, label, colorKey, count }[]`
  où `count` = articles `PUBLISHED` de la catégorie. Remplace les
  compteurs codés en dur (48/14/11/9/8/6) du mockup.
- `GET /api/public/blog/articles` — query params best-effort (jamais de
  400) : `category` (slug), `q` (recherche titre/extrait), `page`, `limit`,
  `sort` (`recent` par défaut, ou `popular` pour trier par `viewCount`
  desc — sert à la fois la liste principale et le bloc "Articles
  populaires" de la sidebar, qui appelle ce même endpoint avec
  `sort=popular&limit=5`) (mirrors `GET /api/public/listings`). Retourne
  `{ items, featured, page, limit, total, totalPages }`. `featured` = le
  `BlogArticle` `isFeatured=true` + `PUBLISHED` le plus récent (`publishedAt`
  desc), ou à défaut l'article publié le plus récent tout court ; renvoyé
  séparément de `items` et jamais filtré par `category`/`q` (reste la
  vitrine éditoriale fixe, comme dans le mockup).
- `GET /api/public/blog/articles/[slug]` — article `PUBLISHED` complet
  (`contentHtml` inclus). 404 si `DRAFT`/`ARCHIVED`/inexistant. Incrémente
  `viewCount` via un `update` best-effort (erreur avalée + loggée, jamais
  bloquante pour la réponse).
- `GET /api/public/blog/tags` — top 12 tags par fréquence, calculés en
  agrégeant `tags` (Json) de tous les articles `PUBLISHED` en mémoire
  (volume attendu faible ; pas besoin d'une table `BlogTag` dédiée).
- `POST /api/public/newsletter` — `{ email }`, upsert idempotent sur
  `NewsletterSubscriber.email` (déjà abonné → 200 sans erreur, statut
  remis à `ACTIVE` si `UNSUBSCRIBED`). Rate-limit par email (5/h),
  `createEmailLimiter` comme `/api/public/contact`.

## Frontend

- `frontend/src/app/blog/page.tsx` : passe de tableaux statiques à un
  fetch au montage (`useEffect` + `api()`) vers `/api/public/blog/{categories,articles,tags}`,
  même schéma que `/annonces`. Filtre catégorie, recherche, pagination
  numérotée, "Articles populaires" (`GET /api/public/blog/articles?sort=popular&limit=5`),
  newsletter et "Lire l'article" deviennent réels.
- `frontend/src/app/blog/[slug]/page.tsx` (nouveau) : fetch
  `GET /api/public/blog/articles/[slug]`, rend `contentHtml` via
  `dangerouslySetInnerHTML` (sûr car assaini à l'écriture, jamais de
  contenu utilisateur non modéré), affiche auteur/catégorie/date/temps de
  lecture, 404 → page Next `notFound()`.
- La promo CTA "Trouvez votre bien idéal" reste inchangée (hors
  périmètre — ne dépend pas du blog).

## Tests

Vitest par route, même convention que `contact-messages`/`listing-reports`
(mock Prisma) : CRUD admin (succès, validation zod, 401/403 sans admin,
409 suppression catégorie utilisée), endpoints publics (filtre, pagination,
404 slug invalide/DRAFT, incrément vue), newsletter (upsert, rate-limit).
Vérification manuelle de `/blog` et `/blog/[slug]` via `pnpm dev` avant de
conclure — pas de harnais E2E dans ce starter.
