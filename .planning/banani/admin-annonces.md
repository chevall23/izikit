# Admin — Gestion des annonces — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `KwtyLo_2MeSI` — "Gestion Annonces"
- Fetched: 2026-09-04
- Theme: `--primary: #376BFF` (brand) — no conflict.
- Route: `/admin/annonces` (matches `admin-nav.ts`'s existing `annonces` entry).
- Scope: **UI mockup only, no backend wiring** (same convention as the other 8 admin screens
  this batch — real `/api/admin/*` moderation endpoints don't exist yet either).

## Structure map
- Reuses `AdminShell` (active="annonces"), default search placeholder.
- **Page header** — eyebrow "Administration · Multi-pays agrégée", title "Gestion des annonces",
  action "+ Nouvelle annonce" (primary, inert).
- **Status tabs** (5, real client-side filter on the 7 demo rows by status): Toutes 128 / En
  attente 14 / Validées 98 / Rejetées 9 / Expirées 7 — counts stay literal (don't match the 7-row
  sample, same convention as `admin-support`/`admin-utilisateurs`: real filtering logic, literal
  header counts).
- **Filter bar** — 6 selects (Pays/Ville/Type de bien/Transaction/Prix/Date de publication) +
  Réinitialiser — all inert (matches `admin-utilisateurs` convention).
- **Table card**: bulk-select bar (real `Set<string>` selection, 3 rows pre-selected in the Banani
  source — same "starts pre-selected" pattern as `admin-utilisateurs`'s Ama Kouassi), toolbar
  ("128 annonces"), 7-column table (checkbox / Annonce (thumb+name+ref) / Ville·Pays / Prix /
  Transaction / Statut / Actions), 7 rows, pagination (1–7 sur 128, pages 1 2 3 … 13).
- **Détail annonce — drawer** (right-anchored, real click-to-open like `admin-utilisateurs`):
  title+price+status header, 8-item info grid (Superficie/Pièces/Type/Transaction/Localisation/
  Publication/Vues/Référence), description, propriétaire/agence card, historique des
  modifications (4-item timeline), motif de rejet textarea (inert). Footer: Valider/Rejeter row +
  Modifier/Booster/Supprimer row.

## Component breakdown
- **REUSE** `AdminShell`, `AdminKpiCard` (not used here — no KPI row on this screen, first admin
  list screen without one), `AdminStatusBadge`, `AdminBulkBar` (itemLabel="annonce"),
  `AdminDrawer` (plain `title` mode — no custom header needed here, unlike `admin-utilisateurs`),
  `AdminPagination`.
- **NEW** `AdminStatusBadge` tone addition: none needed for status (warning/success/danger/neutral/
  primary already cover En attente/Validée/Rejetée/Expirée/Boostée) — but **transaction badges**
  (Vente=blue, Location=violet) need a 6th tone (`violet`) since violet isn't in the current 5-tone
  set. Adding `violet: 'bg-violet-500/[0.14] text-violet-600'` to `AdminStatusBadge`'s `TONE` map.
- **PAGE-LOCAL** the ads table, filter bar, status tabs, drawer info grid, history timeline —
  bespoke to this screen (same pattern as `admin-utilisateurs`'s page-local table).

## Real interactivity beyond the drawer
- **Status tabs filter** the 7 demo rows client-side by each row's literal status (En
  attente/Validée/Rejetée/Boostée/Expirée) — same genuinely-filtering pattern as
  `admin-utilisateurs`'s type tabs. Empty state for a tab with no matching demo row.
- **Row selection**: real `Set<string>` state, 3 rows pre-selected per the Banani source, checkbox
  `stopPropagation`, row click elsewhere opens the drawer.
- **Drawer** open/close on row click / eye-close button, footer actions inert.

## Token mapping
Standard Habitat Blue → `brand`/neutrals. New `violet` tone on `AdminStatusBadge` for
Location-transaction badges (Banani: `#7C3AED` on `#F5F3FF` ≈ `violet-600`/`violet-500/14`).

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: status tabs wrap. Filter bar wraps (6 selects + reset). Table `overflow-x-auto`
  with `min-w-[880px]` (7 columns: checkbox + annonce (thumb) + 5 data columns). Drawer full-width
  overlay below `sm:`, same as `admin-utilisateurs`.
- **lg+**: everything fits at typical desktop widths.

## Interactions / state (mockup)
- **Real**: status-tab filtering, row checkbox selection + bulk bar visibility, row-click → drawer
  open/close.
- **Inert**: "+ Nouvelle annonce", all 6 filter selects + Réinitialiser, bulk-bar action buttons
  (Valider/Rejeter en masse, Exporter CSV), row action-menu (more-horizontal), pagination controls,
  drawer reject-motif textarea, all drawer footer actions (Valider/Rejeter/Modifier/Booster/
  Supprimer), owner-card message icon.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [ ] `AdminStatusBadge` `violet` tone addition
- [ ] `src/app/admin/annonces/page.tsx`
- [ ] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [ ] STATUS.md updated

## Open questions for user
1. Same authored-data disclosure as prior screens: only the 7 literal Banani rows carry real
   thumbnails/data — is that fine, or do you want more authored rows for a richer demo?
2. This closes "Gestion des annonces" — after this, the remaining gaps in the originally-named
   8-screen batch are **Visites virtuelles** and the **Pays & devises**/**Notifications** tabs of
   `admin-parametres`. Want me to continue with one of those next, or fetch a new screen?
