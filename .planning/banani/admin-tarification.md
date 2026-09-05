# Admin — Paramètres · Tarification — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `WCE8iUkqg8QO` — "Tarification Admin" (name correct)
- Fetched: 2026-09-04 — raw: `.planning/banani/raw/admin-tarification.html` (trimmed, see note)
- **Palette conflict**: this screen's `theme` object itself says `--primary: #0EA5E9` (sky blue) —
  unlike `admin-parametres` where only the inline scratch `:root` disagreed with the theme, HERE
  the authoritative theme disagrees with the rest of the flow (`admin-dashboard`/`admin-connexion`/
  `admin-inscription` all say `#376BFF`). Kept mapping to the project's `brand` (#376BFF) anyway —
  this screen is navigated to from the same sidebar/topbar as every other admin screen, so a
  per-screen color swap would look broken, not faithful. **Flagged for user confirmation below.**
- Scope: **UI mockup only, no backend wiring.**

## Structure map
- Reuses `AdminShell` (active="settings") + `AdminSettingsTabs` (active="pricing" — 3rd tab).
- Header: eyebrow "Paramètres · Tarification", title "Tarification" (no subtitle).
- **KPI row** (2-col): "Prix moyen du jeton" 500 FCFA / "Moyenne pondérée sur 4 pays"; "Commission
  moyenne" 3,5 % / "Toutes transactions confondues".
- **Prix des jetons par pays** — table (Pays+drapeau / Devise badge XOF / Prix unitaire / Pack 10 /
  Pack 50 / actions), 4 rows (BJ/TG/CI/SN), header action "Tout enregistrer".
- **Commissions par type de transaction** — table (Type+icône / Transaction badge Vente|Location /
  Taux / Appliqué depuis / edit), 6 rows, header action "Enregistrer".
- **Boost & mise en avant** — 3-card pricing grid (7j / 15j *featured* / 30j), each: name+duration+
  edit pencil, big price, inline price editor (input+OK), 4-item feature checklist (7j has 1 "x").
- **Historique des modifications** — changelog list, dot (brand=latest, gray=older) + field +
  old→new + author avatar/name + time. Header badge "8 entrées" but only **4 rows rendered** in the
  Banani source itself (design shows a partial list, not a Banani gap on my end) — kept faithful,
  flagged below.

## Component breakdown
- **NEW→shared** `AdminStatCard.tsx` — simple icon/label/value+unit/sub tile (lighter than the
  dashboard's `AdminKpiCard` — no delta pill, no footer). 2 uses here.
- **NEW→shared** `AdminPricingCard.tsx` — one boost/pack card (name, duration, price, `featured`
  border+badge, inline price editor, feature checklist). 3 uses here.
- **NEW→shared** `AdminHistoryRow.tsx` — one changelog row (dot/field/from→to/author/time). 4 uses.
- **EXTENDED** `AdminSettingsSection` — added optional `headerRight` (this screen puts Save actions
  in the section header, not the footer like `admin-parametres`'s Général tab) and `bodyClassName`
  override (tables need `overflow-x-auto`, the history list needs flush/no-padding).
- **EXTENDED** `AdminStatusBadge` — added a `neutral` tone (gray) for the XOF currency badge and the
  "8 entrées" counter.
- **PAGE-LOCAL** the two data tables (jetons pricing, commissions) — plain `<table>` markup with
  `AdminStatusBadge`/editable `<input>` cells; different-enough column shapes that a shared
  `AdminDataTable` isn't worth it yet with only 2 instances.

## Token mapping
Same as prior admin screens (Habitat Blue → `brand`/neutrals), plus: `--success #22C55E` used for
the pricing-card checkmarks → `text-emerald-500`; `X-circle` (excluded feature) → `text-gray-300`.

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: tab rail + content stack (`flex-col`, same pattern as `admin-parametres`). KPI row
  `grid-cols-1` → `sm:grid-cols-2`. Both data tables wrapped in `overflow-x-auto` with a
  `min-w-[560–640px]` inner table so they scroll instead of squashing. Boost pricing grid
  `grid-cols-1` → `sm:grid-cols-3`.
- **lg+**: tab rail beside content, matches Banani.

## Interactions / state (mockup)
- All price/rate cells and the boost inline price editors are uncontrolled `<input defaultValue>` —
  no save wiring. Edit-pencil / "Sauv." / "OK" / "Tout enregistrer" / "Enregistrer" are all inert
  `type="button"`.
- No real state on this page at all (unlike `admin-parametres`'s toggles) — everything here is a
  value display or an inert action.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `AdminStatCard`, `AdminPricingCard`, `AdminHistoryRow`
- [x] `AdminSettingsSection` `headerRight`/`bodyClassName`, `AdminStatusBadge` `neutral` tone
- [x] `src/app/admin/parametres/tarification/page.tsx`
- [x] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. **Color conflict**: this screen's own theme says sky-blue (#0EA5E9), every other admin screen
   says brand blue (#376BFF). I kept brand blue for a consistent look across the admin surface —
   confirm, or say if Tarification should actually stand out in a different accent.
2. "Historique des modifications" shows a badge "8 entrées" but only 4 rows in the design — is that
   a real "view more" truncation (add a "Voir tout" link/pagination) or just a placeholder count?
3. Pays & devises / Rôles & permissions / Notifications settings tabs still not built — waiting on
   their Banani screens.
