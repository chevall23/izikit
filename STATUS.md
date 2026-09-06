# amadou-monolith — port status

Cloned from [`amadou-template`](../amadou-template) on 2026-05-07 as a Next.js full-stack variant (no separate Express backend). This document is the source of truth for what's done and what's left.

## ✅ DONE

### Phase 0 — Foundation (commit `dfb4aab`)

- Vitest config + `server-only` alias
- Observability primitives: `makeRequestContext`, `withRequestContext`, structured `log`
- `runtime='nodejs'` enforcement test (CI fails if any new route omits the export)
- Prisma client + 4 migrations under `frontend/prisma/`

### Phase 1 — Auth Routes (commits `058f185` → `ce02cd4`, fixes `9d82636` → `cac03e5`)

All 9 auth routes shipped under `frontend/src/app/api/auth/*/route.ts` plus 6 lib helpers under `frontend/src/lib/server/auth/`:

| Endpoint                | Method | Status | Requirement |
| ----------------------- | ------ | ------ | ----------- |
| `signup`                | POST   | ✓      | AUTH-01     |
| `login`                 | POST   | ✓      | AUTH-02     |
| `verify-email`          | POST   | ✓      | AUTH-03     |
| `refresh`               | POST   | ✓      | AUTH-04     |
| `logout`                | POST   | ✓      | AUTH-05     |
| `me`                    | GET    | ✓      | AUTH-06     |
| `forgot-password`       | POST   | ✓      | AUTH-07     |
| `reset-password`        | POST   | ✓      | AUTH-08     |
| `change-password`       | PUT    | ✓      | AUTH-09     |

Lib helpers: `banned-passwords` · `hibp` (k-anonymity) · `lockout` (Redis sliding-window + memory fallback) · `refresh-lock` (SETNX single-flight + Lua release) · `dummy-bcrypt` · `email-templates` (HTML-escaped). All 1 critical + 7 warnings from the standard-depth code review have been auto-fixed (`01-REVIEW-FIX.md`). 140/140 tests pass; typecheck + lint clean. Phase 1 verification status: `human_needed` — 3 live-stack UAT items remain (E2E happy path, real-Redis lockout, real-Redis refresh single-flight) and persist in `01-HUMAN-UAT.md`.

### Phase 2 — OAuth, Notifications, Withdrawal-PIN (commits TBD)

Google OAuth flow shipped under `frontend/src/app/api/auth/oauth/google/{start,callback}/route.ts` using `arctic` (state + PKCE cookies path-scoped to `/api/auth/oauth`). OAuth callback refuses `email_verified !== true`; account-linking by email; standard auth cookies issued on success. Notifications CRUD under `/api/notifications/*` (list, count, mark-read, prefs). Withdrawal-PIN under `/api/auth/withdrawal-pin` (GET/POST/DELETE). All `createNotification(prisma, input)` paths catch `P2002` for at-most-once dedup.

| Endpoint                                | Method        | Status | Requirement |
| --------------------------------------- | ------------- | ------ | ----------- |
| `/api/auth/oauth/google/start`          | GET           | ✓      | OAUTH-01    |
| `/api/auth/oauth/google/callback`       | GET           | ✓      | OAUTH-02    |
| `/api/notifications`                    | GET / POST    | ✓      | NOTIF-01-02 |
| `/api/notifications/count`              | GET           | ✓      | NOTIF-03    |
| `/api/notifications/prefs`              | GET / PATCH   | ✓      | NOTIF-04-05 |
| `/api/auth/withdrawal-pin`              | GET/POST/DEL  | ✓      | PIN-01      |

### Phase 3 — Admin, Orders, Visibility (commits TBD)

12 admin endpoints shipped under `/api/admin/*` (users list/detail, role/status mutations, orders, withdrawals + cancel, audit-log, outbox visibility, email-queue visibility, rate-limits visibility, /me probe). All admin mutations call `logAdminAction(prisma, {...})` → AdminAction row. `pnpm db:make-superadmin <email>` script lives at `frontend/scripts/make-superadmin.ts` with companion test. `POST /api/orders` ships with idempotency-key + Bictorys provider + in-memory CircuitBreaker (PAY-01).

| Endpoint                              | Method | Status | Requirement |
| ------------------------------------- | ------ | ------ | ----------- |
| `/api/admin/users` (list+detail)      | GET    | ✓      | ADMIN-01    |
| `/api/admin/users/:id/role`           | PATCH  | ✓      | ADMIN-01    |
| `/api/admin/orders`                   | GET    | ✓      | ADMIN-02    |
| `/api/admin/withdrawals`              | GET    | ✓      | ADMIN-03    |
| `/api/admin/withdrawals/:id/cancel`   | POST   | ✓      | ADMIN-03    |
| `/api/admin/audit-log`                | GET    | ✓      | ADMIN-04    |
| `/api/admin/me`                       | GET    | ✓      | ADMIN-05    |
| `/api/admin/outbox`                   | GET    | ✓      | OBS-01      |
| `/api/admin/email-queue`              | GET    | ✓      | OBS-02      |
| `/api/admin/rate-limits`              | GET    | ✓      | OBS-03      |
| `/api/orders`                         | POST   | ✓      | PAY-01      |

Multi-tenancy (Organizations) deferred per ROADMAP — Prisma models + middleware retained as opt-in plumbing.

### Phase 4 — Upload, Files, Withdrawals (commits TBD)

`POST /api/upload` ships with `req.formData()` + `File.arrayBuffer()` + magic-byte sniff against `UPLOAD_ALLOWED_MIME` allowlist (no trusting `File.type`). The upload route forwards bytes to Cloudinary via `upload_stream` and returns the `secure_url` directly — files are CDN-served, no owner-gated proxy ships (the historical R2-era `/api/files/[...key]` route was retired when the storage backend swapped to Cloudinary). `POST /api/withdrawals` runs the 8-code guard chain (`AMOUNT_BELOW_MIN`, `AMOUNT_ABOVE_MAX`, `DAILY_LIMIT_EXCEEDED`, `COOLDOWN_ACTIVE`, `PIN_NOT_SET`, `PIN_REQUIRED`, `PIN_INVALID`, `INSUFFICIENT_BALANCE`) inside a Serializable transaction guarded by `pg_advisory_xact_lock(hashtext(userId))` — race-free per WD-01. `WITHDRAWAL_BALANCE_CHECK=1` default; disable documented as financial-safety risk.

| Endpoint                | Method | Status | Requirement   |
| ----------------------- | ------ | ------ | ------------- |
| `/api/upload`           | POST   | ✓      | UP-01         |
| `/api/withdrawals`      | POST   | ✓      | WD-01-02-04   |
| `/api/withdrawals`      | GET    | ✓      | WD-03         |

### Phase 5 — Webhooks and Vercel Cron (commits TBD)

`POST /api/webhooks/bictorys` ships with raw-body HMAC verification (60s replay window) + `WebhookLog @@unique([externalId, eventType])` dedup inside Serializable transaction; side-effects emit through outbox via `enqueueOutbox(tx, event)`. 5 cron route handlers under `/api/cron/<name>/route.ts`, each gated by `Authorization: Bearer ${CRON_SECRET}` (verified by `verifyCronSecret(req)` at `frontend/src/lib/server/cron/auth.ts`). `frontend/vercel.json` declares all 5 schedules.

| Endpoint                              | Schedule    | Status | Requirement |
| ------------------------------------- | ----------- | ------ | ----------- |
| `/api/webhooks/bictorys`              | (provider)  | ✓      | WH-01-02    |
| `/api/cron/outbox-drain`              | every 1 min | ✓      | CRON-01     |
| `/api/cron/email-queue-drain`         | every 1 min | ✓      | CRON-02     |
| `/api/cron/verification-cleanup`      | hourly      | ✓      | CRON-03     |
| `/api/cron/order-expiration`          | every 5 min | ✓      | CRON-04     |
| `/api/cron/webhook-log-purge`         | daily       | ✓      | CRON-05     |
| `frontend/vercel.json`                | —           | ✓      | CRON-07     |

In-memory CircuitBreaker remains single-instance per CLAUDE.md ("documented limitation"); Redis-backed swap deferred to v2.

### Doc + tooling cleanup (commits `25c1cac` → `dce8bbe`)

- CI workflow now targets the monolith (`--filter frontend`, drop `BACKEND_URL` env)
- `CLAUDE.md` rewritten for App Router + Next.js 16 (was 25 dead `backend/` references)
- `README.md` rewritten for monolith architecture (was 29 dead `backend` references)
- Husky 9 + lint-staged 17 — pre-commit hook runs prettier + eslint + typecheck
- `eslint.config.mjs` dead `backend/src/**` block removed

---

## 📚 Earlier scaffold work (already on master, kept here for archaeology)

### M1 — Scaffold

- `frontend/prisma/` — schema + 4 migrations copied from `amadou-template/backend/prisma/`
- `frontend/package.json` — Prisma 5, bcryptjs, jose, arctic, @upstash/redis, resend, cloudinary, @sentry/nextjs, server-only, vitest, tsx
- Workspace narrowed to `frontend/` only
- Root `package.json` scripts re-pointed at `--filter frontend`
- `pnpm install` passes; Prisma client generates

### M2 — Libs + middleware ported, fully typechecks

All `backend/src/lib/**` → `frontend/src/lib/server/**`:
- `auth.ts` rewritten: cookies via `cookies()` from `next/headers` (async), `verifyCsrf(req)` returns `NextResponse | null` (no Express middleware)
- `redis.ts` adds singleton `getRedis()` + `redis: Redis | null` export (returns null when env missing instead of throwing — call sites decide fallback)
- `rate-limit-store.ts` drops `express-rate-limit` dep, adds `MemoryRateLimitStore` for dev fallback
- `webhook/handler.ts` returns `(NextRequest) => Promise<NextResponse>`, raw body via `await req.arrayBuffer()` (preserves byte-identical HMAC invariant)
- `sentry.ts` reduced to a thin re-export of `@sentry/nextjs` + `captureRouteError()` helper (init lives in `frontend/instrumentation.ts`)
- `lib/server/middleware/index.ts` — HOFs `requireAuth` / `requireAdmin` / `requireSuperadmin` / `requireOrgRole` / `optionalAuth` returning `Context | NextResponse`
- `middleware/{require-admin,require-org-role}.ts` shrunk to role types + rank helpers
- `middleware/rate-limit-by-email.ts` rewritten as `createEmailLimiter(...).check(req, email)` returning `NextResponse | null`

### M3 (partial) — Health + readyz routes

- `frontend/src/app/api/health/route.ts` — liveness, no external calls
- `frontend/src/app/api/readyz/route.ts` — DB + Redis probes with 1.5s timeout, 503 on failure

## ✅ v1 shipped

Phases 0 → 7 complete. 555/555 unit tests green. `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build` exits 0 from a clean clone.

The port from `amadou-template` (Express monorepo predecessor) to a single Next.js 16 App-Router app is done; all 40 API routes export `runtime = 'nodejs'` (CI-enforced via `runtime-enforcement.test.ts`), the 8 doc-shape tripwires lock the architectural invariants, and the kit boots with only `DATABASE_URL` + auto-generated secrets.

### Post-v1 simplification waves

Two simplification waves landed after v1 to align the kit with the "vibe coding" pitch:
- **GSD / Banani made optional** — removed as setup-kit prereqs; the kit ships ready for "describe to Claude" out of the box. GSD surfaced only as a level-up after the first feature; Banani gated behind an `oui / non / plus tard` question in setup-kit Phase 5.
- **Cloudflare R2 → Cloudinary** — storage layer swapped; `/api/files/[...key]` owner-gated proxy deleted (Cloudinary URLs are direct). `frontend/.env.example` Storage section updated; `FileUpload.key` column kept as-is (semantically now a Cloudinary `public_id`, no migration needed).

Audit trail of these waves lives in `.planning/archive/` (SIMPLIFY-AUDIT, POST-SIMPLIFY-AUDIT, SIMULATION-AUDIT, AUDIT-2026-05-15).

### What is no longer in scope

- Docker / `docker-compose` — this project runs a local PostgreSQL cluster directly (see `.pg-local/`, port 5433) and deploys to a managed PostgreSQL on PlanetHoster N0C. No container layer.
- Vercel CLI as a prerequisite — deploys happen via `git push` → Vercel imports the repo via UI.
- A `frontend/Dockerfile` — removed in the simplification waves.

## Critical invariants (never compromise)

1. Sentry init stays the first thing the server runtime loads (`frontend/instrumentation.ts` register hook).
2. Webhook handler hashes raw body — never `await req.json()` before HMAC.
3. Withdrawals use `pg_advisory_xact_lock(hashtext(userId))` inside Serializable tx (Postgres-side; ports cleanly).
4. Notifications go through `createNotification(prisma, input)` — never `prisma.notification.create` directly.
5. Outbox `enqueueOutbox(tx, event)` runs INSIDE the same tx as the webhook handler.
6. Frontend `api()` wrapper retries only `GET`/`HEAD` on network errors.
7. OAuth callback refuses `email_verified !== true`.
8. Admin mutations call `logAdminAction(prisma, {...})`.
9. Cookies stay `httpOnly` + `Secure` (prod) + `SameSite=Lax`.
10. Cron handlers verify `Bearer ${CRON_SECRET}` to prevent unauthenticated invocation.
