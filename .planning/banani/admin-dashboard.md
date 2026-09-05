# Admin — Tableau de bord admin — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `x9tyH65N9HgJ` (Banani screen *name* is the stale "Modifier Annonce Mobile";
  the HTML is the full admin **dashboard** — title "Tableau de bord admin")
- Fetched: 2026-09-04 — theme "Habitat Blue" included (same tokens as `admin-connexion`, plus
  `--sidebar-primary #EEF3FF` / `--sidebar-primary-foreground #376BFF` = brand tint / brand)
- Raw HTML: `.planning/banani/raw/admin-dashboard.html`
- Scope: **UI mockup only, no backend wiring** (explicit user instruction). All numbers, rows,
  activity items, chart series are hard-coded from the design.

## Structure map
- **Sidebar** (248px, `lg:` only) — brand block, "Vue active" country switcher, country pills
  (BJ active / TG / CI / SN), 7-item nav (Tableau de bord ·4, Gestion des annonces, Utilisateurs,
  Finances & jetons, Visites virtuelles, Modération & support ·19, Paramètres), spacer, red
  "Déconnexion" button.
- **Topbar** (76px) — wide search pill (420px), notif bell w/ red dot, admin pill (avatar "Kofi
  Mensah / Admin plateforme" + chevrons-up-down).
- **Page**:
  - Header — eyebrow "Vue globale · Multi-pays agrégée", 30px title, subtitle, actions
    (Exporter = secondary, Rapport mensuel = primary).
  - **KPI grid** — 4 cards: Annonces actives 12 480 (+8,2%), Inscriptions 7j 986 (+14,6%),
    Revenus du mois 84,7 M FCFA (+11,1%), Conversion 18,4% (+1,9 pt, warn tone).
  - **Content grid** `minmax(0,2fr) minmax(320px,1fr)`:
    - Left: line-chart card (4 country series, SVG polylines), bar-chart card (Villa/Appartement/
      Terrain/Bureau, twin bars light+solid), moderation table (4 tabs, 6 cols, 4 rows w/ thumbs
      + status badges + 2 action icons each).
    - Right: "Activité récente" (4 feed rows), "Alertes opérationnelles" (2 tinted alert cards w/
      big metric), "Revenus rapides" (3 feed rows w/ % trailing).
  - **Tablet note** — design annotation card ("Mode tablette simplifié prévu"); kept verbatim
    from the mockup, flag if it should be dropped in the real build.

## Component breakdown (all new, `src/components/admin/`)
- **NEW** `admin-nav.ts` — `ADMIN_NAV` entries (key/label/icon/href/count) + `ADMIN_COUNTRY_PILLS`.
- **NEW** `AdminSidebarNav.tsx` — sidebar inner content; shared by desktop `<aside>` + mobile drawer.
- **NEW** `AdminShell.tsx` (`'use client'`) — full chrome: 248px sidebar + 76px topbar on `lg:`,
  hamburger + slide-in drawer + compact topbar below. Props: `active`, `children`. **This is the
  shell every upcoming admin back-office screen plugs into.**
- **NEW** `AdminCard.tsx` — generic bordered card (title/subtitle/headerRight/body) + `AdminMiniFilter`
  pill. Used 5× on this screen.
- **NEW** `AdminKpiCard.tsx` — the 4-up KPI tile.
- **NEW** `AdminStatusBadge.tsx` — success/warning/danger/primary status pill (moderation table).
- **PAGE-LOCAL** `FeedRow`, `LineChart`, `BarChart`, `ModerationTable` in `page.tsx` — static,
  single-use in this mockup; promote to `components/admin/` when a 2nd screen needs them.

## Token mapping (→ project)
| Banani | Project |
| `--primary #376BFF` | `brand` |
| `--sidebar-primary #EEF3FF` | `bg-brand/10` (active nav bg, KPI icon tile, pills, badges) |
| `--sidebar-primary-foreground` | `text-brand` |
| `--foreground #111827` | `text-neutral-900` |
| `--muted-foreground #9CA3AF` | `text-gray-400` |
| `--secondary-foreground #374151` | `text-gray-700` |
| `--muted / --secondary #F3F4F6` | `bg-gray-100` |
| `--border #00000014` | `border-black/[0.08]` |
| `--success #10B981` | `text-emerald-600` / `bg-emerald-500/[0.14]` |
| `--warning #F59E0B` | `text-amber-600` / `bg-amber-500/[0.12–0.16]` |
| `--destructive #EF4444` | `text-red-500` / `bg-red-500/10` |
| radius xl/lg/md | `rounded-xl` (12) / `rounded-lg` (8) / `rounded-md` (6); inline 10px → `rounded-[10px]` |
| chart series colours | literal hex in SVG `stroke`/`fill` + legend-dot inline `style` (matches the
  repo's existing chart pattern in `dashboard/page.tsx` / `statistiques/page.tsx`) |

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base / mobile (<lg)**: sidebar hidden → hamburger opens a 280px slide-in drawer (same
  `AdminSidebarNav`). Topbar compact (68px), search pill flexes full-width, admin name/role hidden
  `<sm`. KPI grid `grid-cols-1` → `sm:grid-cols-2`. Content grid single column (left stack then
  right stack). Moderation table wrapped in `overflow-x-auto` with a `min-w-[720px]` inner grid so
  it scrolls instead of squashing.
- **lg (1024+)**: sidebar + 76px topbar appear, content grid becomes 2fr/1fr, KPI `xl:grid-cols-4`.
- **xl (1280+)**: KPI row goes 4-up; matches the Banani desktop mockup.

## Interactions / state (mockup)
- `AdminShell` drawer open/close is the only real state (`useState`). Backdrop click + X + nav-tap
  all close it.
- Every other control (search, bell, admin pill, country pills, tabs, filter pills, table row
  actions, header buttons, logout) is an inert `<button type="button">` — no navigation/handlers.
- Nav links are real `next/link` to `/admin/*` slugs; only `/admin` resolves today, the rest 404
  until their screens ship.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `admin-nav.ts`, `AdminSidebarNav`, `AdminShell` (sidebar + topbar + mobile drawer)
- [x] `AdminCard` / `AdminMiniFilter`, `AdminKpiCard`, `AdminStatusBadge`
- [x] `src/app/admin/page.tsx` — header, KPIs, line+bar charts, moderation table, activity/alerts/
      revenue widgets, tablet note
- [x] `pnpm exec tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. Route — dashboard is `/admin` (index); nav slugs are `/admin/annonces`, `/admin/utilisateurs`,
   `/admin/finances`, `/admin/visites-virtuelles`, `/admin/support`, `/admin/parametres`. OK to lock
   these in? (they'll be the routes for the next screens)
2. The "Mode tablette simplifié prévu" note is a design annotation — keep it rendered on the real
   page, or drop it?
3. Table thumbnails + admin avatar are hotlinked from Banani's storage bucket — self-host before
   prod (same standing caveat as the login hero image).
4. Charts are static SVG/CSS from the mockup — when backend lands, swap for a real chart lib or
   keep the lightweight hand-rolled SVG?
