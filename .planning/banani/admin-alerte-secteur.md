# Admin — Alerte Secteur — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `bwoP7pzNWUzb` — "Alerte Secteur Admin"
- Fetched: 2026-09-04
- Theme: `--primary: #376BFF` (brand) — no conflict.
- Scope: **UI mockup only, no backend wiring** (same convention as the rest of the batch).

## Not part of the originally-named 8-screen batch
This screen belongs to the **"Demande Immobilière" / alerting feature area** archived raw-only
back on 2026-08-03 (`Alerte Secteur`, `Alerte Detail`, `Gérer Alertes`, `Nouvelle Alerte` — 21
screens, none planned/implemented yet), not the admin back-office batch (Gestion annonces,
Gestion utilisateurs, Finances, Modération, Paramètres, Tarification, Rôles). Flagging this
because it changes the sidebar nav — see open question 1 below.

## Structure map
- Sidebar nav in this fetch shows **2 items not in the current `admin-nav.ts`**, inserted between
  "Gestion des annonces" and "Utilisateurs": **"Demande immobilière"** (count 12, no page built)
  and **"Alerte Secteur"** (count 6, active — this screen).
- **Page header** — eyebrow "Administration · Alertes", title "Alerte Secteur", subtitle
  (2-line description), actions [Exporter secondary, "+ Nouvelle alerte" primary].
- **KPI row** (4, reuses `AdminKpiCard`): Alertes totales 38 (+6 ce mois); Alertes actives 24 (+2
  aujourd'hui); Correspondances envoyées 143 (6 non envoyées, warn tone); En pause / Expirées 8
  (Stable, **neutral tone — new**, `AdminKpiCard.deltaTone` currently only supports `up`/`warn`).
- **Table card**: title "Liste des alertes" + 4 tabs (Toutes 38/Actives 24/En pause 6/Expirées 8,
  real client-side filter on the 6 demo rows), "Filtres" toggle button (inert), filter bar (4
  inert selects: Pays/Type de bien/Fréquence/Statut — no bulk-select checkboxes on this screen,
  first admin table without row selection), 9-column table (checkbox(unused)/Propriétaire/
  Pays·Ville/Type de bien/Fréquence/Correspondances/Statut/Créée le/Actions), 6 rows, pagination
  (1–6 sur 38, pages 1 2 3 … 7).
- **Détail alerte — drawer** (right-anchored, real click-to-open): eyebrow+title header, owner
  profile row (avatar/name/contact/status badge), critères tags (6 icon-tag chips), paramètres
  block (5 key/value rows), correspondances list (3 property-match cards w/ thumb+title+location+
  price). Footer: Envoyer les correspondances (primary) / Mettre en pause (warning) / Supprimer
  l'alerte (danger).

## Component breakdown
- **REUSE** `AdminShell`, `AdminKpiCard`, `AdminStatusBadge` (success=Active, warning=En pause,
  neutral=Expirée — all 3 already covered), `AdminDrawer` (plain `title`+`titleExtra` for the
  eyebrow/title header — no custom `header` slot needed), `AdminPagination`.
- **EXTENDED** `AdminKpiCard`: `deltaTone` gains a `'neutral'` option (gray pill, `bg-gray-100
  text-gray-500`) for the "Stable" KPI — the only 2-tone (`up`/`warn`) case in the whole admin
  batch so far.
- **PAGE-LOCAL**: status tabs, filter bar, alerts table, criteria tags, match-list cards — bespoke
  to this screen (no bulk-select bar this time — table has no row-selection UI at all in the
  fetched markup, unlike `admin-annonces`/`admin-utilisateurs`).

## Real interactivity
- **Status tabs filter** the 6 demo rows client-side by status (Active/En pause/Expirée — "Toutes"
  shows all). Same genuinely-filtering pattern as prior screens.
- **Row click → drawer** open/close (only row 1, Aminata Koné/ALS-0038, has literal drawer detail
  from the fetch — other 5 rows would need authored detail same as prior screens' convention).
- Everything else (header actions, Filtres toggle, 4 filter selects, row action-menu icons,
  pagination, drawer footer buttons) stays inert.

## Token mapping
Standard Habitat Blue → `brand`/neutrals. No new `AdminStatusBadge` tone needed (success/warning/
neutral already cover Active/En pause/Expirée).

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: KPI grid `grid-cols-1` → `sm:grid-cols-2` → `lg:grid-cols-4`. Tabs + filter bar
  wrap. Table `overflow-x-auto` with `min-w-[920px]` (9 columns). Drawer full-width overlay below
  `sm:`, same pattern as prior screens.
- **lg+**: everything fits at typical desktop widths.

## Interactions / state (mockup)
- **Real**: status-tab filtering, row-click → drawer open/close.
- **Inert**: Exporter/+ Nouvelle alerte, Filtres toggle, all 4 filter selects, row action-menu
  icons (eye/pencil/more-horizontal — eye could open the drawer but isn't wired separately from
  the row click, matching this screen's simpler no-bulk-select table), pagination controls, all 3
  drawer footer actions.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [ ] `AdminKpiCard` `neutral` deltaTone addition
- [ ] Decide nav placement (see open question 1)
- [ ] `src/app/admin/alerte-secteur/page.tsx` (or agreed route)
- [ ] `tsc --noEmit` + `eslint` + `prettier` clean
- [ ] Dev-server smoke test
- [ ] STATUS.md updated

## Open questions for user
1. **Nav change**: this screen's fetch shows 2 new sidebar items not in the current nav —
   "Demande immobilière" (12) and "Alerte Secteur" (6) — inserted between "Gestion des annonces"
   and "Utilisateurs". Do you want me to:
   (a) add **only** "Alerte Secteur" to `admin-nav.ts` now (since that's the only page being
       built), leaving "Demande immobilière" out until its own list screen is built — avoids a
       dead nav link, or
   (b) add **both** now, with "Demande immobilière" pointing at a route that doesn't exist yet
       (matches the literal Banani nav order today, but 404s until built)?
   I'd default to (a).
2. **Route slug**: `/admin/alerte-secteur` (matches the nav-key convention `alerte-secteur` /
   `alertes-secteur` / `alertes`)? No existing reservation for this in `admin-nav.ts`.
3. Same authored-data disclosure as prior screens: only row 1 (Aminata Koné) has literal drawer
   detail from the Banani fetch — the other 5 rows would get consistent authored detail. OK?
