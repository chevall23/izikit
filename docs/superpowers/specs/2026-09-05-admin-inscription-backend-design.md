# Admin inscription — backend (access-request + review workflow)

## Context

`frontend/src/app/admin/inscription/page.tsx` is a UI mockup built from a
Banani screen: a form (name, email, phone, password, confirm) with no
submit handler. No self-service admin account creation exists anywhere in
the codebase today — admin accounts are created via
`pnpm db:make-superadmin <email>` or by an existing SUPERADMIN changing a
user's role from `/admin/utilisateurs` (`PATCH /api/admin/users/[id]` per
CLAUDE.md's admin role model).

A public form that directly grants the `ADMIN` role would break the
project's core invariant ("Only SUPERADMIN can change roles"). This design
introduces a **request-and-review** workflow instead: submitting the form
creates a pending request, verified by email, then approved or rejected by
an existing SUPERADMIN — no `User` row (and therefore no login capability)
exists until approval.

## Goal

Wire `/admin/inscription` to a real backend that lets someone request an
admin account, verify their email, and — once a SUPERADMIN approves the
request — log in at `/admin/connexion` with the credentials they set. Add
a SUPERADMIN-only review screen to approve/reject pending requests.

## Data model

New model in `frontend/prisma/schema.prisma`, deliberately **separate from
`User`** — no account exists until approval, so there is nothing to attach
a `VerificationCode` row to (that model requires an existing `userId`).

```prisma
model AdminAccessRequest {
  id                    String    @id @default(cuid())
  name                  String
  email                 String
  phone                 String
  passwordHash          String
  status                String    @default("PENDING_EMAIL")
  // PENDING_EMAIL | PENDING_REVIEW | APPROVED | REJECTED
  emailVerifiedAt       DateTime?
  verificationCode      String?
  verificationExpiresAt DateTime?
  verificationAttempts  Int       @default(0)
  reviewedByUserId      String?
  reviewedAt            DateTime?
  rejectionReason       String?
  createdUserId         String?   // set on approval — the resulting User.id
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([status])
  @@index([email])
}
```

No DB-level unique constraint on `email` (a rejected request must be
re-requestable) — uniqueness-against-active-requests is enforced in route
logic (see below). Versioned migration via `pnpm db:migrate:dev`.

## API routes

All routes `export const runtime = 'nodejs'`.

### `POST /api/admin/access-requests` (new, public, no CSRF)

Pre-session route, same carve-out as `/api/auth/signup` (no CSRF cookie
exists yet).

- Body (zod): `{ name: string (min 1), email, phone (zPhone), password }`.
- Password policy — reuse `isBanned` + `PASSWORD_MIN` (env
  `AUTH_PASSWORD_MIN_LENGTH`, same default as signup) from
  `@/lib/server/auth/banned-passwords` / existing constants. HIBP check
  optional, gated by `PASSWORD_HIBP_CHECK=1` like signup.
- Rate limit: `createEmailLimiter` bucket `admin:access-request`, 5/hour
  (mirrors signup's `AUTH_SIGNUP_RATE_LIMIT_MAX` pattern, own env var
  `ADMIN_ACCESS_REQUEST_RATE_LIMIT_MAX` default 5).
- **Enumeration-resistant**, mirroring signup: look up an existing `User`
  with this email OR an `AdminAccessRequest` with this email in status
  `PENDING_EMAIL | PENDING_REVIEW | APPROVED`. If found, run
  `dummyBcryptCompare(password)` and return the same `201 { ok: true }` as
  the success path (no distinguishing signal).
- New-request branch: `hashPassword(password)` (from `@/lib/server/auth`),
  `generateVerificationCode()` (same helper signup uses), 15-minute
  expiry (`ADMIN_ACCESS_REQUEST_VERIFICATION_TTL_MIN`, default 15). Create
  the `AdminAccessRequest` row (status `PENDING_EMAIL`). Outside the
  Prisma call, best-effort `getEmailQueue()?.enqueue({ to: email, subject,
  html })` with the code — **not** the outbox (see "Why EmailQueue, not
  outbox" below). Missing email queue config → log a warning, still 201
  (matches `/api/public/contact`'s best-effort precedent).
- Response: `201 { ok: true }` always (parity with signup).

### `POST /api/admin/access-requests/verify-email` (new, public, no CSRF)

- Body: `{ email, code }` (code shape reuses `VERIFICATION_CODE_REGEX`
  from `@/lib/server/auth`).
- Rate limit: `createEmailLimiter` bucket `admin:access-request-verify`,
  15 min / 5 attempts (same shape as `/api/auth/verify-email`).
- Look up the `AdminAccessRequest` by `email` + `status: PENDING_EMAIL`.
  Not found, code mismatch, expired, or `verificationAttempts >= 5` → same
  generic `400 VERIFICATION_CODE_INVALID` (enumeration-resistant, mirrors
  existing verify-email). Mismatch increments `verificationAttempts`.
- Success: set `emailVerifiedAt = now()`, `status = 'PENDING_REVIEW'`,
  clear `verificationCode`/`verificationExpiresAt`.
- Best-effort notify all `SUPERADMIN` users
  (`prisma.user.findMany({ where: { role: 'SUPERADMIN' } })`) via
  `EmailQueue` — "a new admin access request is awaiting review" with a
  link to `/admin/demandes-acces`. Small SUPERADMIN count expected in
  practice; no batching needed.
- Response: `200 { ok: true }`. No cookies issued — no session exists for
  a request that isn't even reviewed yet.

### `GET /api/admin/access-requests` (new, `requireAdmin('SUPERADMIN')`)

- Query param `status` (default `PENDING_REVIEW`) — also accepts
  `APPROVED`/`REJECTED` so the review screen's history views work.
- Cursor pagination, mirrors `GET /api/admin/contact-messages` shape:
  `{ items, nextCursor }`.
- `items[]`: `id, name, email, phone, status, createdAt, emailVerifiedAt,
  reviewedAt, rejectionReason`. Never returns `passwordHash`.

### `GET /api/admin/access-requests/[id]` (new, `requireAdmin('SUPERADMIN')`)

Single-record detail, same field set as the list (minus `passwordHash`).
404 (not the row) if not found.

### `POST /api/admin/access-requests/[id]/approve` (new, `requireAdmin('SUPERADMIN')`, CSRF required)

- Guard: `status` must be `PENDING_REVIEW` → else `409
  REQUEST_NOT_PENDING`.
- Guard: no existing `User` with that email (race with a normal signup in
  the interim) → `409 EMAIL_ALREADY_REGISTERED`.
- Single Prisma transaction: create `User` (`email, phone, name,
  passwordHash` copied from the request, `role: 'ADMIN'`, `status:
  'ACTIVE'`, `emailVerifiedAt: now()` since already verified in step 2);
  update `AdminAccessRequest` → `status: 'APPROVED'`, `reviewedByUserId:
  auth.admin.id`, `reviewedAt: now()`, `createdUserId: <new user id>`.
- `logAdminAction(prisma, { actorId: auth.admin.id, action:
  'admin-access-request.approve', targetType: 'AdminAccessRequest',
  targetId: id, metadata: { createdUserId, email } })` — inside or right
  after the tx, following the existing admin-route convention.
- Outside the tx, best-effort `EmailQueue` approval email with a link to
  `/admin/connexion`. No auto-login (this request runs in the
  SUPERADMIN's own browser session — issuing cookies here would be wrong).
- Response: `200 { ok: true }`.

### `POST /api/admin/access-requests/[id]/reject` (new, `requireAdmin('SUPERADMIN')`, CSRF required)

- Body: `{ reason?: string }` (optional, zod, max length e.g. 500).
- Guard: `status` must be `PENDING_REVIEW` → else `409
  REQUEST_NOT_PENDING`.
- Update `status: 'REJECTED'`, `reviewedByUserId`, `reviewedAt`,
  `rejectionReason`.
- `logAdminAction(..., action: 'admin-access-request.reject', ...)`.
- Best-effort `EmailQueue` rejection email (includes `reason` if given).
- Response: `200 { ok: true }`.

### Why `EmailQueue`, not the outbox

`/api/auth/signup` enqueues its verification email via
`enqueueOutbox(tx, { kind: 'email.verification_code', ... })`, drained by
`outbox/dispatcher.ts`. Adding the two new email kinds this feature needs
(approval, rejection) would mean adding cases to that dispatcher's switch
statement — but `frontend/src/lib/server/outbox/dispatcher.ts` is on the
protected-files list ("atomic claim + backoff invariants"). Rather than
touching a protected file, all three new emails (verification code,
SUPERADMIN notify, approval/rejection) go through the already-available,
unprotected `getEmailQueue()?.enqueue({ to, subject, html })` path (same
one `email-queue-drain` already processes). This is a best-effort,
outside-the-transaction send — the same pattern
`POST /api/public/contact` already uses for its own notification email.
Email content (subject/html) is written inline at each call site; no new
shared template file needed for three one-off emails.

## Frontend changes

### `frontend/src/app/admin/inscription/page.tsx`

Currently a single-step static form. Add local step state:

1. **Form step** (current UI, minus the already-removed intro/org
   field): wire `onSubmit` to `POST /api/admin/access-requests` via the
   `api()` wrapper. Map `ApiError.code` to inline field errors
   (`PASSWORD_BANNED`, `PASSWORD_TOO_SHORT`, `PASSWORD_PWNED`,
   `TOO_MANY_SIGNUP_ATTEMPTS`-equivalent) or a generic toast. On success,
   advance to step 2 (no error surfaced on the enumeration-resistant
   branch either — same UX as signup, by design).
2. **Code-verification step**: a single `AdminField` for the 8-char code
   + submit, posting to `verify-email`. Resend-code affordance is
   out of scope for this pass (matches `/verify-email`'s existing scope
   in the public flow — no resend wired there either at this stage;
   confirm during implementation planning if this needs a stub).
3. **Confirmation step**: static "Demande envoyée, en attente de
   validation" message, no further action.

### New screen: `frontend/src/app/admin/demandes-acces/page.tsx`

Not sourced from a Banani screen — authored to match the visual language
of the other admin list screens built this session (`AdminShell`,
`AdminStatusBadge`, `AdminDrawer`, `AdminPagination`), since the user
explicitly chose "dedicated new screen" during design.

- Fetches `GET /api/admin/access-requests` on mount (default `status=
  PENDING_REVIEW`), status tabs for `PENDING_REVIEW` / `APPROVED` /
  `REJECTED` (each re-fetches with the corresponding `status` query
  param — real data this time, not client-side-only filtering like the
  earlier mockup screens).
- Row click → drawer with full detail (name, email, phone, submitted at,
  email-verified at) and, only when `status === 'PENDING_REVIEW'`,
  Approuver / Rejeter actions (rejeter opens a small reason textarea
  inline in the drawer before confirming).
- Real `PATCH`-equivalent calls (`POST .../approve` / `.../reject`) via
  `api()`, optimistic row removal from the `PENDING_REVIEW` list on
  success, toast on failure.
- No bulk actions, no KPI row — this is an ops queue, not a dashboard;
  matches the simplicity of `admin-alerte-secteur`'s no-bulk-select table.

### Nav change

Add to `frontend/src/components/admin/admin-nav.ts`: key `'access-
requests'`, label "Demandes d'accès admin", icon `UserPlus` (already used
on the inscription page itself), href `/admin/demandes-acces`. Placement:
directly after `settings` (last item before the divider/logout) — this is
an ops/security screen, not a core content-management one, so it sits
apart from the Banani-sourced content screens rather than interleaved
with them.

## Error codes (stable, `ApiError.code`-switchable per CLAUDE.md convention)

| Code | Route | Meaning |
|---|---|---|
| `PASSWORD_BANNED` | `POST /access-requests` | Common/blocklisted password |
| `PASSWORD_TOO_SHORT` | `POST /access-requests` | Below `AUTH_PASSWORD_MIN_LENGTH` |
| `PASSWORD_PWNED` | `POST /access-requests` | HIBP hit (only when enabled) |
| `TOO_MANY_ACCESS_REQUEST_ATTEMPTS` | `POST /access-requests` | Rate limit |
| `VERIFICATION_CODE_INVALID` | `POST /verify-email` | Wrong/expired/exhausted/unknown code (enumeration-resistant) |
| `TOO_MANY_VERIFY_ATTEMPTS` | `POST /verify-email` | Rate limit |
| `REQUEST_NOT_PENDING` | `.../approve`, `.../reject` | Already decided or not found in `PENDING_REVIEW` |
| `EMAIL_ALREADY_REGISTERED` | `.../approve` | A `User` with this email appeared since the request was verified |

## Testing

- `route.test.ts` per new endpoint, mirroring the existing
  `contact-messages` / `signup` / `verify-email` test suites:
  - `POST /access-requests`: enumeration resistance (existing email → same
    201), password policy rejections, rate limit, successful creation +
    email enqueue call.
  - `POST /verify-email`: correct code succeeds and transitions status,
    wrong code increments attempts then locks out at 5, expired code
    rejected, enumeration resistance.
  - `GET /access-requests(/[id])`: `requireAdmin('SUPERADMIN')` enforced
    (ADMIN-but-not-SUPERADMIN gets 403), correct filtering by status.
  - `.../approve`: creates `User` with role `ADMIN`, updates request,
    `logAdminAction` called, guard against double-approval
    (`REQUEST_NOT_PENDING` on second call), `EMAIL_ALREADY_REGISTERED`
    guard.
  - `.../reject`: updates request + reason, guard against
    double-rejection.
- No new frontend component tests (matches this session's precedent for
  `annonces`/`demandes`/`alerte-secteur` pages).

## Out of scope

- Resend-verification-code affordance on the inscription form's step 2.
- Any change to `frontend/src/lib/server/auth.ts`,
  `outbox/dispatcher.ts`, `middleware/index.ts`,
  `middleware/require-admin.ts`, or `admin/audit.ts` — all protected,
  none needed for this feature.
- Auto-login after approval — the requester logs in normally at
  `/admin/connexion`.
- Gating the rest of `/admin/*` pages behind client-side auth checks —
  a separate, larger concern; this feature's own new pages rely on the
  server-side `requireAdmin('SUPERADMIN')` guard on every route that
  returns or mutates sensitive data, same as every other `/admin/api`
  route in the codebase.
- A resend-notification-to-SUPERADMINs path if the first email fails —
  best-effort only, same tolerance as `/api/public/contact`.
