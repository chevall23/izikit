# Admin — Paramètres · Rôles & Permissions — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `LZmHMZTrI3Rt` — "Rôles Permissions" (name correct)
- Fetched: 2026-09-04 — raw: `.planning/banani/raw/admin-roles-permissions.html` (trimmed)
- **Palette conflict**: same as `admin-tarification` — this screen's theme object says
  `--primary: #0EA5E9`. Mapped to `brand` (#376BFF) per the standing decision, no new question
  raised (already flagged once, applies uniformly to all settings tabs).
- Scope: **UI mockup only, no backend wiring.**

## Structure map
- Reuses `AdminShell` (active="settings") + `AdminSettingsTabs` (active="roles" — 4th tab).
- **Page header** (not a section — page-level, like the dashboard's Exporter/Rapport): eyebrow
  "Paramètres · Rôles & Permissions", title, primary button "Inviter un admin" (user-plus icon).
- Subtitle line above the sections: "Gérez les comptes admin et leurs niveaux d'accès à la
  plateforme."
- **Résumé des rôles** — 4 role cards (icon tile custom color + role name + big count + "comptes
  actifs"): Super Admin 2 (sky), Modérateur 5 (violet), Support 3 (orange), Comptabilité 2 (emerald).
- **Comptes administrateurs** — "12 comptes admin au total", header action "Filtrer". Table:
  Administrateur (avatar+name+email) | Rôle (colored pill) | Statut (Actif/Inactif) | Dernière
  connexion | action menu (⋮). 6 rows (2 Super Admin, 2 Modérateur, 1 Support, 1 Comptabilité —
  the one Inactif).
- **Matrice des permissions** — "Droits d'accès par rôle et par module", header shows a 3-item color
  legend (Lecture + écriture / Lecture seule / Aucun accès). Table: Module (icon+name) × 4 role
  columns (icon tile + role name header), each cell a full/read/none badge with icon
  (pencil/eye/ban). 6 modules: Annonces, Utilisateurs, Finances, Visites virtuelles, Modération,
  Paramètres — access varies realistically per role (e.g. Comptabilité only touches Finances +
  read-only Paramètres; Support never touches Finances or Paramètres).

## Component breakdown
- **NEW→shared** `AdminRoleBadge.tsx` (+ exported `ADMIN_ROLE_LABEL`, `AdminRoleKey`) — the 4-hue
  role pill (Super Admin/Modérateur/Support/Comptabilité). Used in the accounts table, the role
  cards, and the matrix column headers. Deliberately a fixed domain palette, not `AdminStatusBadge`
  tones — will very likely be reused by a future "Utilisateurs" admin screen.
- **NEW→shared** `AdminPermBadge.tsx` (+ `AdminPermLevel`) — full/read/none matrix cell badge with
  icon. Self-contained, reusable by any future permission-matrix UI.
- **REUSE** `AdminSettingsSection`'s `headerRight` (already added for `admin-tarification`) — used
  here for "Filtrer" and for the permissions legend.
- **REUSE** `AdminStatusBadge` (`success`/`neutral` tones) for the Actif/Inactif column.
- **PAGE-LOCAL** role-summary cards, admin-accounts table, permissions-matrix table — bespoke enough
  (custom per-role icon-tile colors, matrix headers with icon+label) that a generic shared table
  wasn't worth it for a single-screen use; data arrays (`ROLE_SUMMARY`, `ADMIN_ACCOUNTS`, `MATRIX`)
  keep the JSX declarative.

## Token mapping
Role/permission hues are a **fixed domain palette**, not derived from the Banani theme tokens
(they identify a role/permission-level, not a themeable primary action):
| Banani | Project |
| Super Admin `#E0F2FE`/`#0EA5E9` | `bg-sky-100`/`text-sky-600` |
| Modérateur `#EDE9FE`/`#7C3AED` | `bg-violet-100`/`text-violet-600` |
| Support `#FFF7ED`/`#C2410C` | `bg-orange-100`/`text-orange-700` |
| Comptabilité `#F0FDF4`/`#15803D` | `bg-emerald-100`/`text-emerald-700` |
| perm full `#E0F2FE`/`#0369A1` | `bg-sky-100`/`text-sky-700` |
| perm read `#F3F4F6`/`#4B5563` | `bg-gray-100`/`text-gray-600` |
| perm none `#FEE2E2`/`#DC2626` | `bg-red-100`/`text-red-600` |
Everything else: same Habitat Blue → `brand`/neutrals mapping as prior admin screens.

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: tab rail + content stack (`flex-col`, consistent with the other settings tabs).
  Role-summary cards `grid-cols-1` → `sm:grid-cols-2` → `xl:grid-cols-4`. Both tables
  (`overflow-x-auto`, `min-w-[640px]`) scroll horizontally instead of squashing — the permissions
  matrix in particular (5 columns) would be unreadable compressed.
- **lg+**: tab rail beside content; matrix and accounts table fit without scrolling at typical
  desktop widths.

## Interactions / state (mockup)
- Fully static — no controlled state on this page (unlike `admin-parametres`'s toggles). "Inviter un
  admin", "Filtrer", the per-row action menu (⋮) are all inert `type="button"`.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `AdminRoleBadge`, `AdminPermBadge`
- [x] `src/app/admin/parametres/roles-permissions/page.tsx`
- [x] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. Same standing color-conflict question as `admin-tarification` (sky vs brand blue) — applies here
   too, not re-asking separately.
2. "12 comptes admin au total" but only 6 rows rendered (same partial-list pattern as the
   tarification screen's "8 entrées" / 4 rows) — real pagination needed later, or just a mockup
   placeholder count?
3. Only "Pays & devises" and "Notifications" settings tabs remain unbuilt now.
