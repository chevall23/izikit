# Admin — Paramètres (Général) — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `ikG97Z8-uL2Z` — screen name correct this time: "Paramètres Admin"
- Fetched: 2026-09-04 — raw: `.planning/banani/raw/admin-parametres.html` (trimmed, see note)
- **Palette note**: this screen's inline `:root` uses a scratch sky-blue palette
  (`--primary: #0EA5E9`) that conflicts with the flow's authoritative `theme` object
  (`--primary: #376BFF`, same "Habitat Blue" as `admin-dashboard`/`admin-connexion`). Mapped to
  the theme object (`brand`), not the inline `:root` — consistent with every other admin screen.
- Scope: **UI mockup only, no backend wiring.**

## Structure map
- Reuses the `AdminShell` chrome (sidebar active = "Paramètres", same topbar) — no new chrome work.
- Page header: eyebrow "Administration · Multi-pays agrégée", title "Paramètres" (24px, no subtitle).
- **Settings layout** — 220px left tab rail + flexible right content:
  - **Tabs** (`AdminSettingsTabs`): Général (active), Pays & devises, Tarification, Rôles &
    permissions, Notifications. Only Général has a screen/body this pass — the rest are Banani
    screens not yet fetched (`Tarification Admin`, `Rôles Permissions` per STATUS.md's known batch).
  - **Général tab content** — 3 section cards:
    1. *Identité de la plateforme* — "Nom de la plateforme" field, 2-col [Logo principal upload,
       Favicon upload], "Email de contact" field, "URL du site" field. Footer: Annuler + Enregistrer.
    2. *Réseaux sociaux* — 4 rows (icon+label, 104px) + value field: Facebook, Instagram filled;
       Twitter/X, LinkedIn empty ("Non renseigné" placeholder). Footer: Annuler + Enregistrer.
    3. *Mode maintenance & accès* — 3 toggle rows (label + hint + switch): Mode maintenance (off),
       Inscription ouverte (on), Vérification KYC obligatoire pour les agences (on). Footer:
       Enregistrer only (no Annuler — matches the design).

## Component breakdown
- **NEW→shared** `AdminSettingsTabs.tsx` — left tab rail, `active` prop, real `next/link`s to
  `/admin/parametres/*` sibling routes (not built yet). Every future settings screen reuses this.
- **NEW→shared** `AdminSettingsSection.tsx` + `AdminSettingsButton` — the bordered section-card
  (header/body/footer). Reused 3× here, will be reused by every other settings tab.
- **NEW→shared** `AdminSettingsField.tsx` (`AdminSettingsField` labeled input, `AdminUploadBox`
  dashed drop-zone) — reused 4× here.
- **REUSE** `frontend/src/components/ui/Toggle.tsx` — the project's existing controlled switch
  (46×26, brand color) instead of pixel-cloning Banani's smaller 38×22 mock — same control,
  consistent with `settings/*Card.tsx` elsewhere in the app.
- **NEW, page-local** brand glyphs (`FacebookGlyph`/`InstagramGlyph`/`TwitterGlyph`/`LinkedinGlyph`)
  — `lucide-react` ships no brand marks; small inline SVGs, same pattern as the existing
  `GoogleIcon`/`FacebookIcon` in `login`/`signup` pages. Promote to `components/admin/` if a 2nd
  screen needs them.
- **AdminShell tweak**: added optional `searchPlaceholder` prop (this screen's search copy is
  shorter than the dashboard's) — defaults to the dashboard's string so screen 3 is unaffected.

## Token mapping
Same as `admin-dashboard.md` (Habitat Blue theme). Section-specific: `--radius-xl` (16px in this
screen's CSS, vs 12px theme value) → used `rounded-2xl` (16px) for section cards / tab rail to
match this screen's visibly larger corner radius; `rounded-[10px]` for fields/buttons/uploads
(this screen's own `--radius-lg`-ish 10px, distinct from the dashboard's 8px — kept screen-faithful
rather than forcing exact cross-screen radius parity, since Banani itself varies it).

## Responsive plan (Banani desktop-only — mobile designed here)
- **Base (<lg)**: tab rail and content stack vertically (`flex-col`) instead of side-by-side —
  the 220px rail would eat too much width on a 375px screen. Upload boxes and 2-col grids collapse
  to 1 col below `sm:`. Social rows: icon+label stays fixed 104px, input flexes.
- **lg+**: tab rail + content side-by-side (`lg:flex-row`), matches Banani.

## Interactions / state (mockup)
- 3 toggles are real controlled state (`useState` + `ui/Toggle`) — the only "live" bit, matches the
  `Mode maintenance` on/off shown in the design (maintenance starts off, the other two start on).
- All text fields are uncontrolled (`defaultValue`) — no save handler.
- "Annuler"/"Enregistrer les modifications" buttons are inert `type="button"`.
- Tab links are real `next/link`s; only `/admin/parametres` (Général) resolves today.

## Copy / i18n
French, inline. No English in JSX.

## Implementation checklist
- [x] `AdminSettingsTabs`, `AdminSettingsSection`/`AdminSettingsButton`, `AdminSettingsField`/`AdminUploadBox`
- [x] `src/app/admin/parametres/page.tsx` — client (toggle state), mobile-first
- [x] `AdminShell` — `searchPlaceholder` prop added (non-breaking)
- [x] `tsc --noEmit` + `eslint` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. The other 4 settings tabs (Pays & devises, Tarification, Rôles & permissions, Notifications)
   aren't built — their Banani screens haven't been sent yet. Tab links point at
   `/admin/parametres/{pays-devises,tarification,roles-permissions,notifications}` (404 until sent).
2. Radius inconsistency: this screen's own CSS uses 16px section corners vs the dashboard's 12px
   card corners, and 10px field corners vs the dashboard's 8px. Kept screen-faithful — flag if you'd
   rather force one consistent value across all admin screens.
