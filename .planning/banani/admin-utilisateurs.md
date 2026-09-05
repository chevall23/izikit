# Admin — Utilisateurs — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `-Uy2RRwYIq6u` — "Gestion Utilisateurs" (name correct)
- Fetched: 2026-09-04 — raw: `.planning/banani/raw/admin-utilisateurs.html` (full source)
- Theme: `--primary: #376BFF` (brand) — **no conflict** (inline scratch `:root` uses sky-blue hex
  again, same pattern as `admin-support`, but the authoritative `theme` object agrees with brand).
- Route: `/admin/utilisateurs` (matches `admin-nav.ts`'s existing `users` entry).
- Scope: **UI mockup only, no backend wiring.**

## Structure map
- Reuses `AdminShell` (active="users"), custom `searchPlaceholder`.
- **Page header** — eyebrow, title "Utilisateurs", meta line, actions [Exporter CSV secondary,
  "+ Ajouter un admin" primary].
- **KPI row** (3, reuses `AdminKpiCard`): Total utilisateurs 3 284 (+6,4%); Nouvelles inscriptions·7j
  986 (+14,6%); Comptes en attente de vérification 47 (+3, warn tone).
- **Table card**: title + "3 284 au total" pill; **tabs** (Tous/Particuliers/Agences/Démarcheurs,
  real client-side filter on the 6 demo rows by `type` — Admins tab omitted since no admin-type row
  exists in the design's sample); filter row (search + Statut/Pays/Date d'inscription selects +
  Réinitialiser); **bulk-select bar** (real checkbox selection state, shows "N sélectionné(s)" +
  Suspendre/Exporter when ≥1 row checked — Ama Kouassi starts pre-selected per the Banani source);
  9-column table (checkbox / Utilisateur / Type / Pays / Statut / Annonces / Jetons / Inscription /
  Actions), 6 rows; pagination (1–6 sur 3 284, pages 1 2 3 … 132).
- **Détail utilisateur — drawer** (right-anchored, was permanently open in Banani like
  `admin-support`'s — same real click-to-open treatment applied here): custom header (avatar+name+
  type/status/KYC badges), 3-stat grid, contact info block, amber KYC block (only when the user has
  one), internal tabs (Annonces/Transactions/Activité — only Annonces populated), listing mini-list,
  conversion-rate callout. Footer: Suspendre/Réactiver (flips per current status) + Envoyer un
  message + Modifier le profil.

## Component breakdown
- **NEW→shared** `AdminBulkBar.tsx` — tinted "N sélectionné(s)" bar with an actions slot,
  `itemLabel` prop for reuse by other selectable-list screens (Gestion des annonces will need this).
- **EXTENDED** `AdminDrawer` — added an optional `header` ReactNode that fully replaces the default
  title/titleExtra row (needed for this screen's avatar+name+badges header, taller than the plain
  title bar `admin-support` uses); made `title` optional to match. Header row switched from a fixed
  `h-[68px]` to `py-4` auto-height so both header styles fit.
- **REUSE** `AdminShell`, `AdminKpiCard`, `AdminStatusBadge` (`primary`/`neutral`/`warning` for user
  type, `success`/`warning`/`danger` for status — no new tones needed), `AdminPagination` (ellipsis
  gap, added for `admin-finances`).
- **PAGE-LOCAL** the users table, `StatItem`, `ContactRow` — bespoke to this screen.

## Real interactivity beyond the drawer (new this screen)
- **Row selection**: real `Set<string>` state, checkbox click `stopPropagation`s so it doesn't also
  open the drawer; row click elsewhere opens the drawer (same pattern as `admin-support`).
- **Type tabs actually filter** the 6 demo rows client-side (first screen where a tab genuinely
  filters real static data, vs. `admin-dashboard`'s/`admin-finances`'s tabs which are visual-only).
  Selecting "Démarcheurs" correctly shows only Moussa Traoré; an empty-category tab (there is none
  among Tous/Particuliers/Agences/Démarcheurs here, but the pattern is there for future data) shows
  an "Aucun utilisateur…" empty state.
- **Suspend/Reactivate footer button flips** based on the selected user's current status
  (`Suspendu` → "Réactiver le compte", success tone; otherwise → "Suspendre le compte", danger tone)
  — still inert (no actual status change), just correct labeling per row.

## Token mapping
Standard Habitat Blue → `brand`/neutrals. Type/status badges map directly onto existing
`AdminStatusBadge` tones (no new domain palette needed, unlike `admin-roles-permissions`'s role
badges) — a nice confirmation the 5-tone set generalizes.

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: KPI row `grid-cols-1` → `sm:grid-cols-3`. Filter row wraps. Table
  `overflow-x-auto` with `min-w-[900px]` (9 columns, the widest yet — checkbox + 8 data columns).
  Drawer is the same full-width-below-`sm:` overlay pattern as `admin-support`.
- **lg+**: everything fits at typical desktop widths.

## Interactions / state (mockup)
- **Real**: tab filtering, row checkbox selection + bulk bar visibility, row-click/eye-icon → drawer
  open, drawer close, suspend/reactivate label flip.
- **Inert**: header actions, Statut/Pays/Date filters + Réinitialiser, table search, bulk-bar
  action buttons, more-horizontal row menu, pagination controls, drawer KYC "Voir" links, drawer
  internal tabs (Transactions/Activité have no content), all drawer footer actions.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `AdminBulkBar`, `AdminDrawer` `header` extension
- [x] `src/app/admin/utilisateurs/page.tsx`
- [x] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. Same as `admin-support`: only Ama Kouassi's drawer content is literal Banani data — the other 5
   rows got consistent but **authored** detail (phone, city, KYC state, listings, conversion %).
2. "Admins" tab (45) has no sample row in this screen's design — clicking it here would show the
   real empty-state text since no admin-type user exists in `USERS`.
3. This closes out the originally-named 8-screen admin batch except **Gestion des annonces** and
   **Visites virtuelles**, plus the "Pays & devises"/"Notifications" settings tabs.
