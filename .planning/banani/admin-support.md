# Admin — Modération & Support — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `BJKHob0JudDQ` — "Modération Support" (name correct)
- Fetched: 2026-09-04 — raw: `.planning/banani/raw/admin-support.html` (trimmed)
- Theme: `--primary: #376BFF` (brand) — **no conflict this time**, matches dashboard/connexion/inscription.
- Route: `/admin/support` (matches `admin-nav.ts`'s existing `support` entry).
- Scope: **UI mockup only, no backend wiring.**

## Structure map
- Reuses `AdminShell` (active="support"), custom `searchPlaceholder`.
- **Page header** — eyebrow "Administration · Multi-pays agrégée", title "Modération & Support",
  action "Exporter" (secondary, page-level like the dashboard's/roles-screen's header buttons).
- **Main tabs** — "Signalements" (active, count 14) / "Support client" (count 5). Only Signalements
  has table content in this fetch — Support client is visual-only, not yet built.
- **KPI row** (3): "Signalements en attente" 14 / "+3 depuis hier" (warning tone); "Traités cette
  semaine" 27 / "Sur 31 signalements reçus" (success tone); "Temps de traitement moyen" 4h 12m /
  "Objectif : moins de 6h" (brand tone).
- **Filter bar** — Motif / Gravité / Statut / Pays / Période selects + divider + Réinitialiser.
- **Signalements table** — toolbar "41 signalements" + search + "Exporter CSV". Columns: type icon |
  élément concerné (name+ref, brand-colored) | motif | gravité badge | statut badge | date |
  action menu. 6 rows, each **clickable → opens the detail drawer**. Pagination footer.
- **Détail du signalement — drawer** (was a permanently-open 460px panel in Banani, see decision
  below): info grid (Type/Motif/Gravité/Signalé le), "Élément concerné" preview (photo card for
  annonces, plain text card for user/agency reports), "Signalé par" reporter card, description
  quote, "Changer le statut" 3 buttons, "Historique de traitement" timeline, "Ajouter une note
  interne" textarea. Footer: 2 danger buttons (Suspendre l'annonce / l'utilisateur), 1 success
  (Marquer comme résolu), 1 secondary (Contacter le signalant).

## Key layout decision: drawer is real, not permanently open
Banani's `.page { padding-right: 508px }` + `.drawer-backdrop { position: absolute }` keeps the
460px detail panel **always visible** — a frozen single-frame export, not a real interaction state.
That's unusable below ~1400px and breaks entirely on mobile. Implemented instead as a real overlay
(`AdminDrawer`): closed by default, a table row click opens it with that row's data, backdrop/X
closes it. Full-width sheet below `sm:` instead of a fixed 460px, so it works on every breakpoint.

## Component breakdown
- **NEW→shared** `AdminDrawer.tsx` — generic right-anchored overlay (backdrop + panel, header with
  title/titleExtra/close, scrollable body, optional footer). Reusable by any future "click a row →
  see detail" screen (Utilisateurs, Gestion des annonces will very likely want the same shell).
- **NEW→shared** `AdminPagination.tsx` — "Affichage X–Y sur Z" + rows-per-page pill + page buttons.
  Inert (mockup shows one page of static rows) but every future list screen needs this footer shape.
- **EXTENDED** `AdminStatCard` — added optional `tone` (`warning`/`success`/`brand`, tints the icon
  tile) and made `unit` optional (this screen's KPIs have no unit, unlike tarification's "FCFA"/"%").
- **REUSE** `AdminStatusBadge` — `danger`/`warning`/`neutral` for gravité, `primary`/`warning`/
  `success`/`neutral` for statut. No new tones needed.
- **PAGE-LOCAL** the signalements table and all drawer body sections — bespoke to this screen's
  domain (type-icon tinting, subject/reporter cards); `InfoItem` mini component stays page-local.

## Token mapping
Type-icon tints are a **fixed domain palette** (identifies report type, not a themeable action):
| Banani | Project |
| fraud `#FEF2F2`/`#EF4444` | `bg-red-50`/`text-red-500` |
| scam `#FFF1F2`/`#EF4444` | `bg-rose-50`/`text-red-500` |
| content `#FFFBEB`/`#D97706` | `bg-amber-50`/`text-amber-600` |
| other `#F5F6F8`/`#6B7280` | `bg-gray-100`/`text-gray-500` |
Everything else: standard Habitat Blue → `brand`/neutrals mapping, same as prior admin screens.

## Responsive plan (Banani desktop-only, drawer especially — mobile designed here)
- **Base (<lg)**: KPI row `grid-cols-1` → `sm:grid-cols-3`. Filter bar wraps (`flex-wrap`), divider
  hidden `<sm:`. Table wrapped in `overflow-x-auto` with `min-w-[820px]` — this table has the most
  columns of any admin screen so far, squashing it would be unreadable. Drawer is a full-width sheet
  below `sm:` (see decision above) instead of Banani's fixed 460px.
- **lg+**: everything fits without horizontal scroll at typical desktop widths; drawer caps at 460px.

## Interactions / state (mockup)
- **Real**: row click → `selectedId` state → opens drawer with that row's data; backdrop/X/close
  closes it. This is the first admin screen with genuine row-to-detail interactivity.
- **Inert**: main tabs, all 5 filters + Réinitialiser, table search/Exporter CSV, action-menu (⋯),
  pagination buttons, drawer's "Changer le statut" buttons, note textarea (real `<textarea>`, no
  save), all 4 footer action buttons — no backend, so nothing here should look wired.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `AdminDrawer`, `AdminPagination`, `AdminStatCard` tone/unit extension
- [x] `src/app/admin/support/page.tsx`
- [x] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. **Drawer content beyond row 1**: Banani only fully specified the drawer for the "Villa de luxe –
   Cocody" report (reporter Amadou Diallo, exact description, exact history). Rows 2–6 got
   consistent but **authored** reporter names/avatars/descriptions in the same style — not literal
   Banani content. Flag if you'd rather those rows show a lighter/generic placeholder instead of
   invented detail, or if a future Banani screen will supply the real data.
2. "Support client" tab (count 5) has no table/content in this fetch — presumably its own Banani
   screen not sent yet.
3. "41 signalements" in the toolbar vs 6 rows shown / pagination says pages 1,2,3,5 (no 4) — kept
   exactly as Banani specified, including the gap; likely a mockup artifact, not intentional.
