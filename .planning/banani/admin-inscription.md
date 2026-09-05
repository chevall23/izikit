# Admin — Inscription administrateur — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `x9kdIJW7jcU-`
- Screen name in Banani metadata: "Acheter Jetons Modal" (STALE — the actual HTML/CSS is an admin
  registration page: title "Créer un compte pour le tableau de bord administration",
  kicker "Inscription administrateur")
- Fetched: 2026-09-04
- Scope: **UI mockup only, no backend wiring** (explicit user instruction)

## Structure map (single centered card — NOT the split-screen auth layout)
The Banani CSS hides the brand panel (`.brand-panel { display: none }`) and centers one card
(`max-width: 520px`) on a `linear-gradient(180deg, --background 0%, --secondary 100%)` page.

- **Page shell** — full-height, vertically+horizontally centered, subtle top→bottom gradient bg, 32/24 padding
- **Card** (`.login-panel`) — white, `radius-xl`, 36px padding, big soft shadow, 28px vertical gap
- **Header** — kicker (icon `user-plus` + "Inscription administrateur"), 30px title, 14px muted subtitle
- **Alert** (`.login-alert`) — secondary-bg rounded box, brand icon tile (`shield-check`), title + text:
  "Validation manuelle avant activation" / verified-by-team copy
- **Form grid** (18px gap) — all fields are the same `.field-box` shell: 50px min-height, input-bg,
  1px border, `radius-lg`, leading lucide icon (muted), then either a right-aligned meta label
  (Société / Principal / Vérifiée / WhatsApp) or a trailing icon (chevrons-up-down, eye):
  1. Nom de l'organisation — icon `building-2`, meta "Société", placeholder "Habitat-Afrik Bénin"
  2. Nom du responsable — icon `user`, meta "Principal", placeholder "Prénom et nom complet"
  3. Adresse email professionnelle — icon `mail`, meta "Vérifiée", placeholder "nom@entreprise.com"
  4. Téléphone professionnel — icon `phone`, meta "WhatsApp", placeholder "+229 00 00 00 00"
  5. Portail demandé — icon `briefcase-business`, trailing `chevrons-up-down`, value "Administration centrale" (select)
  6. Créer un mot de passe — label row has a "Exigences de sécurité" link; icon `lock`, trailing `eye`,
     placeholder "Minimum 12 caractères"
  7. Confirmer le mot de passe — icon `shield`, trailing `eye`, placeholder "Ressaisissez votre mot de passe"
- **Checkbox row** — checked brand checkbox + "J'accepte la vérification de l'organisation et les
  conditions d'accès" ; right side link "Déjà un compte ?"
- **Primary button** (`.btn-primary`) — 52px, brand bg, icon `arrow-right` + "Demander la création du compte"
- **Secondary actions** — 2-col grid of cards (secondary bg): card icon tile (white) + title/sub
  - `file-check` — "Documents requis" / "Préparer registre et identité"
  - `headset` — "Assistance d'inscription" / "Support prioritaire de mise en place"
- **Footer meta** — trust row (`badge-check` success icon + "Dossier examiné sous 24h · Accès activé
  après validation") + pill chip "Français · FCFA"

## Component breakdown
- **NEW** `AdminAuthCard` — `src/components/admin/AdminAuthCard.tsx` — centered gradient page + white card
  shell (children slot). Reused by the upcoming admin login screen.
- **NEW** `AdminField` — `src/components/admin/AdminField.tsx` — the `.field-box` shell: `label`,
  optional `labelSlot`, leading `icon`, `meta` string OR `trailing` node. Props mirror the design's
  two variants (meta label vs trailing icon).
- **REUSE** none of the existing `ui/*` primitives fit 1:1 (they're the split-screen auth style:
  gray-50 bg, 48px, no leading icon, no meta). Keep them untouched.
- **PRIMITIVE** none extracted to `ui/` this pass — the field shell is admin-specific.

## Token mapping (Banani shadcn tokens → project)
| Banani token | Project value |
| `--primary` / `--primary-foreground` | `brand` / `brand-foreground` (#376bff / #fff) |
| `--foreground` | `text-neutral-900` |
| `--muted-foreground` | `text-gray-400` |
| `--secondary-foreground` | `text-gray-500` |
| `--card` | `bg-white` |
| `--secondary` | `bg-gray-50` (alert bg, action cards, chip) |
| `--input` | `bg-gray-50` (field bg) |
| `--border` | `border-black/[0.08]` |
| `--background`→`--secondary` gradient | `bg-gradient-to-b from-white to-gray-50` |
| `--success` | `text-emerald-600` |
| `--radius-xl` (card) | `rounded-[20px]` |
| `--radius-lg` (fields/btn/alert) | `rounded-[10px]` |
| `--radius-md` (icon tiles) | `rounded-lg` |
| `--radius-sm` (checkbox) | `rounded-[5px]` |
| `--font-family-body` | Inter (body default) — headings `font-sora` |

## Tailwind translation notes
- `.field-box`: `flex min-h-[50px] items-center justify-between gap-3 rounded-[10px] border-[1.5px] border-black/[0.08] bg-gray-50 px-3.5`
- `.btn-primary`: `flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] bg-brand text-[15px] font-semibold text-brand-foreground`
- `.secondary-actions`: `grid grid-cols-2 gap-3` (→ `grid-cols-1` on mobile)
- Icons: Banani `iconify-icon icon="lucide:x"` → `lucide-react` components (`UserPlus`, `ShieldCheck`,
  `Building2`, `User`, `Mail`, `Phone`, `BriefcaseBusiness`, `ChevronsUpDown`, `Lock`, `Eye`, `EyeOff`,
  `Shield`, `Check`, `ArrowRight`, `FileCheck`, `Headset`, `BadgeCheck`)

## Responsive plan (Banani is desktop/tablet-only — mobile designed here)
- **Base (375px)**: card full-width (minus 20px page padding), padding 24px (not 36), header title
  ~24px, secondary-actions **stack to 1 col**, checkbox row wraps (already `flex-wrap`), footer meta
  wraps (chip drops below trust row). Every field ≥ 50px (touch-OK). Button 52px full-width.
- **sm (640px+)**: card padding 32px, secondary-actions back to 2 cols.
- **md (768px+)**: card padding 36px, title 30px, max-width 520px, page padding 32px. Matches Banani.
- **lg+**: unchanged (card is fixed max-width, just more breathing room around it).

## Interactions / state (mockup)
- All inputs are real, controlled with local `useState`, no submit handler (or `preventDefault` no-op).
- Password fields: working show/hide eye toggle (local state) — cheap, expected.
- "Portail demandé": real `<select>` styled as the field box, options TBD (see open questions).
- Checkbox: real toggle, local state, starts checked (matches design).
- "Exigences de sécurité", "Déjà un compte ?", "Documents requis", "Assistance d'inscription",
  "Français · FCFA": rendered as `type="button"` / inert `<button>` — no navigation this pass.
- Submit button: disabled-look hover only; clicking does nothing (no API).
- Focus rings on all interactive elements; `:focus-within` border-brand on field boxes.

## Copy / i18n
All strings are French, inline in the page for now (consistent with existing `login`/`signup` pages
which also inline their copy — `constants.ts` currently only holds API config). No English in JSX.

## Implementation checklist
- [ ] `AdminAuthCard` shell
- [ ] `AdminField` component (meta + trailing variants)
- [ ] `src/app/admin/inscription/page.tsx` (route TBD) — client component, mobile-first
- [ ] 375 / 768 / 1280 visual checks vs Banani
- [ ] `pnpm lint && pnpm typecheck`
- [ ] Update STATUS.md

## Resolved with user (2026-09-04)
1. Route path — **`/admin/inscription`**.
2. Layout — **centered single card, faithful to Banani** (new `AdminAuthCard`, no `AuthSplitLayout`).
3. "Portail demandé" field — **removed entirely** per user. Form is now 6 fields (org, responsable,
   email pro, téléphone pro, mot de passe, confirmation).

## Still open
- All action links/buttons ("Exigences de sécurité", "Déjà un compte ?", "Documents requis",
  "Assistance d'inscription", "Français · FCFA") are inert `type="button"` — wire destinations later.
- No live browser screenshot verification (Playwright/Chromium sandbox limitation) — open
  http://localhost:3000/admin/inscription at 375 / 768 / 1280 to confirm pixel parity.
