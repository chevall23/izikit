# Admin — Finances & Jetons — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `z9rwwxh6snfW` — "Finances Jetons" (name correct)
- Fetched: 2026-09-04 — raw: `.planning/banani/raw/admin-finances.html` (full source, saved via script)
- Theme: `--primary: #376BFF` (brand) — **no conflict**, matches dashboard/connexion/inscription/support.
- Route: `/admin/finances` (matches `admin-nav.ts`'s existing `finance` entry).
- Scope: **UI mockup only, no backend wiring.**

## Structure map
- Reuses `AdminShell` (active="finance"), custom `searchPlaceholder`.
- **Page header** — eyebrow "Revenus & Transactions · Multi-pays agrégée", title "Finances &
  Jetons", subtitle, actions [Exporter CSV secondary, Rapport financier primary].
- **KPI row** (4, reuses the dashboard's `AdminKpiCard` verbatim — identical shape): Revenus jetons
  42,3M (+14,2%), Revenus commissions 31,9M (+9,8%), Total du mois 84,7M (+11,1%), Transactions
  1 847 (-3,2% warn) w/ Réussies/Échouées breakdown.
- **Charts row** (2fr/1fr, reuses `AdminCard`):
  - Line chart — "Évolution des revenus sur 6 mois", period-tab switcher (7j/30j/**6 mois**/Année,
    real `useState`), 3 series (Jetons w/ area fill under it, Commissions, VR).
  - Donut chart — "Répartition des revenus par pays" (CI 38% / SN 28% / BJ 20% / TG 14%), SVG ring
    built from `stroke-dasharray`/`stroke-dashoffset` segments, center total "84,7 M / FCFA total".
- **Transactions table** — toolbar: title + 4 filter chips (Toutes/Achats jetons/Commissions/
  Remboursements, real `useState`) + Filtres chip + Exporter. Columns: Utilisateur | Type | Montant
  (tinted by kind: brand/success/danger) | Moyen de paiement (badge w/ icon) | Statut | Date/heure |
  Actions (Voir + a 3rd icon that varies: receipt for normal, retry for Échoué, ⋯ for En attente).
  5 rows. Pagination: "1–5 sur 1 847", 25/page, pages **1 2 3 … 74** (first screen needing an
  ellipsis gap in pagination).
- **Pricing settings row** (2-col):
  - "Paramétrage de la tarification" — 4 country columns (BJ/CI/TG/SN) × 3 pricing rows each
    (Jeton unitaire, Commission vente, Commission location), header action "Modifier".
  - "Historique des modifications tarifaires" — 6-row changelog (colored dot + title + "Par X
    (rôle)" + time) — a different shape from `AdminHistoryRow` (no avatar, arbitrary dot color per
    entry) so built as page-local rows rather than forcing reuse.

## Component breakdown
- **REUSE** `AdminShell`, `AdminCard`/`AdminMiniFilter`, `AdminKpiCard` (all built for the
  dashboard — this screen's KPI/chart-card shapes match exactly, first real payoff of that
  extraction), `AdminStatusBadge` (`success`/`warning`/`danger` — no new tones needed).
- **EXTENDED** `AdminPagination` — `pages` now accepts `(number | '…')[]` to render a non-clickable
  ellipsis gap (this screen's 1 847-row table needed it; the docstring had promised this since
  `admin-support` but it wasn't implemented until now).
- **PAGE-LOCAL** line/donut chart SVGs, transactions table, `PricingRow`, pricing-history rows —
  bespoke enough (fixed SVG coordinates from the design, specific column shapes) that extracting
  further wasn't worth it for single-screen use.

## Token mapping
Standard Habitat Blue → `brand`/neutrals, same as prior non-conflicting admin screens. Chart series
colors are literal hex (SVG `stroke`/inline dot `style`, consistent with the dashboard's own chart
pattern): Jetons `#376BFF`, Commissions `#10B981`, VR `#F59E0B`; donut adds Togo as a mid-gray
`#6B7280` (Banani's `color-mix(foreground 55%, card)` approximation).

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: KPI grid `grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-4`. Charts row
  `grid-cols-1` → `lg:grid-cols-[1.8fr_1fr]`. Transactions table `overflow-x-auto` with
  `min-w-[860px]` (7 columns, the widest table yet). Pricing-settings row `grid-cols-1` →
  `lg:grid-cols-2`; the 4-country pricing grid inside `grid-cols-1` → `sm:grid-cols-2`.
- **lg+**: matches Banani's two-column layouts throughout.

## Interactions / state (mockup)
- **Real**: period-tab selection (line chart), transaction-type filter chips — both `useState`,
  purely visual (don't actually filter the static rows).
- **Inert**: header Exporter/Rapport buttons, donut "Juillet 2025" filter, table Filtres/Exporter,
  row action icons, pagination controls, "Modifier" pricing button.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `AdminPagination` ellipsis-gap support
- [x] `src/app/admin/finances/page.tsx`
- [x] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. None new — same standing notes as prior screens (hotlinked avatars/thumbs to self-host before
   prod; filter/tab controls are visual-only until a real API exists).
2. This is the last of the 8 admin back-office screens named in STATUS.md's original batch
   (Gestion Annonces, Gestion Utilisateurs, Finances, Visites virtuelles, Support, Paramètres Admin,
   Tarification Admin, Rôles Permissions) still outstanding: **Gestion des annonces**, **Utilisateurs**,
   **Visites virtuelles** haven't been sent yet, plus the settings sub-tabs "Pays & devises" and
   "Notifications".
