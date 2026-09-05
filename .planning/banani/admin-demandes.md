# Admin — Demandes immobilières — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `QS4xOi3_zbuE` — "Demandes Admin"
- Fetched: 2026-09-04
- Theme: `--primary: #376BFF` (brand) — no conflict.
- Scope: **UI mockup only, no backend wiring**.

## Fills the nav slot reserved earlier
This is the "Demande immobilière" list screen whose nav entry was deliberately **left out** of
`admin-nav.ts` when `admin-alerte-secteur.md` was built (to avoid a dead link). Same feature area
(the "Demande Immobilière"/alerting screens archived raw-only on 2026-08-03).

## Structure map
- Sidebar nav in this fetch confirms order: Tableau de bord, Gestion des annonces, **Demande
  immobilière (12, active)**, Alerte Secteur (6), Utilisateurs, Finances & jetons, Visites
  virtuelles, Modération & support (19), Paramètres — matches what `admin-alerte-secteur`'s fetch
  showed, so insertion point is confirmed: right after `annonces`, before `alerte-secteur`.
- **Page header** — eyebrow "Administration · Privé", title "Demandes immobilières", 2-line
  subtitle, actions [Exporter secondary, "+ Nouvelle demande" primary].
- **KPI row** (4, reuses `AdminKpiCard`, same shape as `admin-alerte-secteur`): Demandes totales 47
  (+3 ce mois); En attente de traitement 12 (warn tone, "À traiter"); Traitées / Transmises 29 (+8
  ce mois); Archivées / Annulées 6 (neutral tone, "Stable" — already supported since the alerte-
  secteur screen).
- **Table card**: title "Liste des demandes" + 4 tabs (Toutes 47/En attente 12/Transmises 29/
  Archivées 6, real client-side filter on the 6 demo rows), "Filtres" toggle (inert), filter bar (4
  inert selects: Pays/Type de bien/Statut/Date), 8-column table (checkbox(visual-only, no
  selection — same as `admin-alerte-secteur`)/Demandeur/Pays·Ville/Type de bien/Budget/Statut/Date
  de dépôt/Actions), 6 rows, pagination (1–6 sur 47, pages 1 2 3 … 8).
- **Détail demande — drawer** (right-anchored, real click-to-open): eyebrow+title header
  (`DEM-0047 · Privé admin` / "Demande de villa à Abidjan"), requester profile row (avatar/name/
  contact/status badge), critères de recherche tags (6 icon-tag chips), détails financiers (4
  key/value rows: budget min/max, transaction, financement), informations admin (4 rows: date de
  dépôt, pays cible, agent assigné, priorité badge), note du demandeur (warning-tinted quote box).
  Footer: Transmettre à un agent (success) / Modifier la demande (secondary) / Archiver / Annuler
  (danger).

## Component breakdown
- **REUSE** `AdminShell`, `AdminKpiCard` (incl. the `neutral` deltaTone added for
  `admin-alerte-secteur`), `AdminStatusBadge` (warning=En attente, success=Transmise,
  neutral=Archivée — all 3 already covered, plus warning reused again for the drawer's "Priorité:
  Haute" badge), `AdminDrawer` (plain `title`+`titleExtra`), `AdminPagination`.
- **No new shared component or tone needed** — this screen is structurally almost identical to
  `admin-alerte-secteur` (KPI row shape, tabs+filter-bar+table shape, drawer shape), just different
  domain fields. First screen this batch that's a near-1:1 structural repeat of a previous one.
- **PAGE-LOCAL**: status tabs, filter bar, requests table, criteria tags, financial/admin detail
  rows, note box — bespoke to this screen.

## Real interactivity
- **Status tabs filter** the 6 demo rows client-side by status. Same pattern as prior screens.
- **Row click (or eye icon) → drawer** open/close. Only row 1 (Aminata Koné, DEM-0047) has literal
  drawer detail from the fetch — the other 5 rows get consistent authored detail (criteria,
  financial range matching their table budget, admin info), same disclosed pattern as prior
  screens.
- Everything else (header actions, Filtres toggle, 4 filter selects, pencil/more-horizontal row
  icons, pagination, drawer footer actions) stays inert.

## Token mapping
Standard Habitat Blue → `brand`/neutrals. No new tokens/tones needed.

## Nav change
Add to `admin-nav.ts`: key `'demande'`, label "Demande immobilière", icon `FileText`, href
`/admin/demandes`, count 12 — inserted between `annonces` and `alerte-secteur` (confirmed order
from both fetches).

## Route slug
Proposing **`/admin/demandes`** (not `/admin/demande-immobiliere` — that path is already the
*public* 3-step wizard route (`frontend/src/app/demande-immobiliere/`); a distinct admin slug
avoids any confusion between the public form and this internal list).

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: KPI grid `grid-cols-1` → `sm:grid-cols-2` → `lg:grid-cols-4`. Tabs + filter bar
  wrap. Table `overflow-x-auto` with `min-w-[860px]` (8 columns). Drawer full-width overlay below
  `sm:`, same pattern as prior screens.
- **lg+**: everything fits at typical desktop widths.

## Interactions / state (mockup)
- **Real**: status-tab filtering, row-click → drawer open/close.
- **Inert**: Exporter/+ Nouvelle demande, Filtres toggle, all 4 filter selects, row action icons
  (pencil/more-horizontal — eye opens the drawer), pagination controls, all 3 drawer footer
  actions.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [ ] `admin-nav.ts` — add `demande` entry
- [ ] `src/app/admin/demandes/page.tsx`
- [ ] `tsc --noEmit` + `eslint` + `prettier` clean
- [ ] Dev-server smoke test
- [ ] STATUS.md updated

## Open questions for user
1. Route slug `/admin/demandes` (vs. `/admin/demande-immobiliere`, which collides in naming with
   the existing public wizard route) — OK?
2. Same authored-data disclosure as prior screens: only row 1 (Aminata Koné) has literal drawer
   detail — the other 5 rows get consistent authored detail. OK?
