# Article Detail — Banani → Next.js/Tailwind

## Source
- Flow: `HABITATAFRIK EQUIPE` (`DRXBZMH20_G8`)
- Banani screen ID: `FvkpPvHYHh_q` ("Article Detail", page title "Habitat-Afrik — Article")
- Fetched: 2026-09-11

## Scope
Rewrite the existing **real-backend** page `frontend/src/app/blog/[slug]/page.tsx`
(already wired to `GET /api/public/blog/articles/[slug]`, built in the
blog-backend session) to match this Banani screen's structure. No backend
changes — every new UI element maps to data the API already returns
(`readTimeMinutes`, `viewCount`, `tags`, `author`, `category`, `contentHtml`,
`publishedAt`) or is derived client-side from it.

## Route
`frontend/src/app/blog/[slug]/page.tsx` (unchanged route).

## Component breakdown
- **REUSE** `PublicNavbar` (`active="blog"`), `PublicFooter`, `cn`, `api`/
  `ApiError`, `formatDate`, `cloudinaryOptimize`, the existing
  `CATEGORY_COLOR_CLASSES`/`categoryClasses` map (already duplicated between
  `/blog` and `/blog/[slug]`; still only 2 occurrences, not extracting yet).
- **NEW** breadcrumb row: Accueil / Blog / {category, links to
  `/blog?category=slug` via query param the list page already reads} /
  current title (truncated, non-link, `aria-current`).
- **NEW** meta row: category badge (icon `Tag`, colored via
  `categoryClasses`) · date · read time · **view count** (`viewCount`,
  `toLocaleString('fr-FR')`, same formatting already used in the list
  page's "Articles populaires" sidebar).
- **NEW** excerpt "lead" styled as a left-bordered blockquote (matches
  `.article-excerpt-lead`).
- **NEW** share row next to the author block: 4 real actions — Facebook/X/
  LinkedIn open their real share-intent URL in a new tab, "Copier le lien"
  copies `location.href` to the clipboard with a small inline confirmation.
  Brand icons (`Facebook`/`Twitter`/`Linkedin`) don't exist in this
  project's `lucide-react` v1 (confirmed by node inspection — same gap
  `contact-page.md` hit) — rendered as small circular letter badges ("f",
  "X", "in") + a `Link2` icon for copy, same "letter badge" fallback
  convention as the contact page's dropped social sidebar.
- **NEW** dynamic table of contents (sidebar "Sommaire" card): after the
  sanitized `contentHtml` renders, walk the content container for `<h2>`
  elements, slugify their text into ids assigned via DOM (not by mutating
  the HTML string — sanitizer/backend untouched), build the TOC list from
  them, and highlight the section currently in view via
  `IntersectionObserver`. If an article has zero `<h2>` (short articles),
  the "Sommaire" card is omitted entirely — not rendered empty.
- **NEW** "Articles similaires" (related articles): 3 cards, fetched
  client-side from the existing `GET /api/public/blog/articles?category=
  {slug}&limit=4`, filtered to exclude the current article, first 3 kept.
  No new backend endpoint.
- **REUSE (adapted)** sidebar Newsletter card and "Articles populaires"
  card — same markup/behavior as `/blog`'s sidebar (`sort=popular&limit=4`,
  real `POST /api/public/newsletter`), so the two pages feel identical.
- **REUSE** promo card (static `Link` to `/annonces`).
- **Not implemented** — the Banani mock's `.article-stat-row` /
  `.article-callout` blocks are hand-authored content inside that one demo
  article's copy, not a data-model feature (no "stat"/"callout" block type
  exists in `BlogArticle.contentHtml`'s sanitizer whitelist or anywhere in
  the design spec). Not adding fake structural chrome for something no
  article's real content actually has — regular articles render via the
  existing `.prose`-style typographic classes (h2/h3/p/ul/strong already
  sanitizer-whitelisted). Disclosed, not silently dropped.

## Token mapping
Same substitution as every other public page this session: Banani's
`--primary` (#0EA5E9 in this screen's HTML tokens) → project's `bg-brand`/
`text-brand`. Category badge colors reuse the existing 5-color map already
established on `/blog` (brand/green/amber/violet/red).

## Responsive plan
- **Base (375px)**: `article-layout` (`grid-cols-[1fr_320px]` on desktop)
  becomes `grid-cols-1`; sidebar renders **after** the article body
  (`order-2`), matching `/blog`'s existing mobile ordering convention.
  Breadcrumb scrolls horizontally if it overflows (`overflow-x-auto`,
  `whitespace-nowrap` per item). Meta row wraps. Author row stacks the
  share buttons below the author info if needed (`flex-wrap`). Hero image
  height drops (`h-[220px]` vs `lg:h-[420px]`). Related grid `grid-cols-1`.
- **sm (640px+)**: related grid `grid-cols-2`.
- **lg (1024px+)**: 2-col `[1fr_320px]` layout, sidebar sticky
  (`lg:sticky lg:top-6`), related grid `grid-cols-3` — matches Banani
  desktop mock.

## Interactions / state
- Loading (spinner, unchanged), not-found (unchanged, already handles 404
  identically for draft/archived/missing per the backend route).
- TOC active-section highlight via `IntersectionObserver` (real, driven by
  actual scroll position).
- Share buttons: real Facebook/X/LinkedIn share-intent links (`window.open`,
  `noopener,noreferrer`), real clipboard copy with a 2s "Lien copié !"
  inline confirmation state.
- Related articles: real fetch, empty state (section omitted) if the
  category has no other published articles.
- Newsletter form: real `POST /api/public/newsletter`, same states as
  `/blog` (idle/sending/sent/error).

## Implementation checklist
- [ ] Rewrite `frontend/src/app/blog/[slug]/page.tsx`
- [ ] `pnpm exec tsc --noEmit` / `eslint` / `prettier --write`
- [ ] Dev-server smoke test (`curl` 200 on a seeded slug)
- [ ] 375px / 768px / 1280px structural check (no headless browser in this
      environment — flagged if not visually verified)
- [ ] Update `STATUS.md`

## Open questions for user
None blocking. Three disclosed assumptions above (letter-badge share
icons, DOM-derived TOC, category-based "related" query) follow this
session's established pattern of authored, disclosed decisions over
blocking on unavailable data — proceeding.
