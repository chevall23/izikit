# Admin — Connexion administrateur — Banani → Next.js 16 / Tailwind v4

## Source
- Banani flow: HABITATAFRIK EQUIPE (`DRXBZMH20_G8`)
- Banani screen ID: `AMrwAz6pMkoQ` (Banani screen *name* is the stale "Acheter Jetons Modal";
  the HTML is the admin **login** page — companion to `admin-inscription`)
- Fetched: 2026-09-04 — **theme tokens included this time** (see mapping)
- Scope: **UI mockup only, no backend wiring** (explicit user instruction)

## Structure map (same centered-card shell as `admin-inscription`)
- **Header** — kicker (`log-in` + "Connexion administrateur"), 30px title "Accéder au tableau de bord
  administration", 14px muted subtitle
- **Alert** — brand icon tile (`shield-alert`), "Vérification renforcée activée" + code-de-confirmation copy
- **Form** (18px gap):
  1. Adresse email — icon `mail`, meta "Professionnel", placeholder "admin@habitatafrik.com"
  2. Mot de passe — label row link "Mot de passe oublié ?"; icon `lock`, trailing `eye`, placeholder "••••••••••••"
  3. ~~Portail (select "Administration centrale")~~ — **removed for parity** with the inscription
     screen (user said "retire le" there; kept consistent). Flag if login specifically needs it.
  - Checkbox row — "Maintenir ma session sur cet appareil" + link "Besoin d'un accès administrateur ?"
  - Primary button — `arrow-right` + "Se connecter"
- **Secondary actions** (2-col grid) — `key-round` "Réinitialiser l'accès" / "Envoyer un lien
  sécurisé" ; `headset` "Support interne" / "Assistance technique prioritaire"
- **Footer meta** — `shield-check` (success) + "Connexion chiffrée · Journalisation des activités" +
  pill "Français · FCFA"

## Component breakdown
- **REUSE** `AdminAuthCard`, `AdminField` (built for `admin-inscription`)
- **NEW→shared** `AdminSecondaryAction` — `src/components/admin/AdminSecondaryAction.tsx` — the
  `.action-card`; extracted on its 2nd occurrence and back-ported into `admin-inscription`.

## Token mapping (Banani "Habitat Blue" theme → project)
| Banani token | Value | Project |
| `--primary` | #376BFF | `brand` (exact match with `globals.css --color-brand`) |
| `--primary-foreground` | #FFFFFF | `brand-foreground` |
| `--foreground` | #111827 | `text-neutral-900` |
| `--muted-foreground` | #9CA3AF | `text-gray-400` |
| `--secondary-foreground` | #374151 | `text-gray-500` (≈ #4B5563, close) |
| `--card` | #FFFFFF | `bg-white` |
| `--secondary` / `--input` | #F3F4F6 / #F9FAFB | `bg-gray-50` |
| `--border` | #00000014 | `border-black/[0.08]` |
| `--success` | #10B981 | `text-emerald-600` |
| `--radius-xl` | 12px | `rounded-xl` (card) |
| `--radius-lg` | 8px | `rounded-lg` (fields, button, alert, action cards) |
| `--radius-md` | 6px | `rounded-md` (icon tiles) |
| `--radius-sm` | 4px | `rounded-sm` (checkbox) |
| font | inter | body default (headings `font-sora`) |

**Retro-fix**: `admin-inscription` was first built with `rounded-[20px]` card + `rounded-[10px]`
fields; corrected to the authoritative radii above once the theme arrived.

## Responsive plan (Banani desktop/tablet-only — mobile designed here)
Identical to `admin-inscription`: card full-width @375 w/ 24px padding, secondary-actions stack to
1 col < 640px, checkbox + footer rows wrap. Card locks to `max-w-[520px]` from `md:`. Every field
≥ 50px, button 52px.

## Interactions / state (mockup)
- Controlled inputs, `onSubmit` = `preventDefault` no-op.
- Working show/hide eye toggle + "Maintenir ma session" checkbox (starts checked, matches design).
- "Mot de passe oublié ?", "Besoin d'un accès administrateur ?", both action cards, "Français ·
  FCFA": inert `type="button"` — destinations wired later.
- Focus rings on all controls; `:focus-within` border-brand on field boxes.

## Copy / i18n
French, inline (consistent with existing auth pages). No English in JSX.

## Implementation checklist
- [x] Reuse `AdminAuthCard` / `AdminField`
- [x] Extract `AdminSecondaryAction`, back-port to inscription
- [x] `src/app/admin/connexion/page.tsx` — client, mobile-first
- [x] `pnpm exec eslint` + `tsc --noEmit` clean
- [ ] 375 / 768 / 1280 live browser check vs Banani (Playwright sandbox limitation — do manually)
- [x] STATUS.md updated

## Open questions for user
1. Route — `/admin/connexion` chosen for parity with `/admin/inscription`. OK? (vs `/admin/login`)
2. "Portail" select — removed here to match the inscription screen. Confirm the admin login doesn't
   need a portal picker, or say which options.
3. All secondary links/cards are inert — provide destinations when backend work starts.
