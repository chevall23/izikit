# Admin Inscription Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `/admin/inscription` to a real backend — a request-and-review workflow where submitting the form creates a pending `AdminAccessRequest`, the requester verifies their email, and a SUPERADMIN approves (creating the real `User` with role `ADMIN`) or rejects it from a new review screen.

**Architecture:** One new Prisma model (`AdminAccessRequest`) deliberately separate from `User` — no login-capable account exists until approval. Six new Route Handlers (2 public/pre-session, 4 SUPERADMIN-gated) plus two frontend pages (the existing `/admin/inscription` wired to a 3-step flow, and a new `/admin/demandes-acces` review queue). Emails go through the existing `EmailQueue`/Brevo pipeline, not the outbox (see Global Constraints).

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Zod, Vitest + `prismaMock` (jest-mock-extended `mockDeep`), existing `@/lib/api` fetch wrapper on the frontend.

**Spec:** `docs/superpowers/specs/2026-09-05-admin-inscription-backend-design.md`

## Global Constraints

- Every Route Handler `export const runtime = 'nodejs'` (Prisma + bcrypt).
- **Do not modify** `frontend/src/lib/server/auth.ts`, `frontend/src/lib/server/outbox/dispatcher.ts`, `frontend/src/lib/server/middleware/index.ts`, `frontend/src/lib/server/middleware/require-admin.ts`, `frontend/src/lib/server/admin/audit.ts` — all protected per `CLAUDE.md`. Every task below only *imports* from them.
- **Deviation from the spec doc, decided during planning:** the spec named both new-request creation and email-verification as `POST /api/admin/access-requests(...)`. That collides with this codebase's established convention that `/api/admin/*` is always `requireAdmin`-gated (see `contact-messages`, `listing-reports`) while unauthenticated public mutations live under `/api/public/*` (see `/api/public/contact`). This plan places the two public, pre-session routes under `/api/public/admin-access-requests(...)` instead. Behavior, fields, and status machine are unchanged from the spec — only the URL prefix differs.
- **Deviation from the spec doc:** the spec's `AdminAccessRequest` model included a `verificationAttempts` counter for lockout. The real `VerificationCode` model has an `attempts` column that is never actually read or incremented anywhere in the codebase (grepped and confirmed) — brute-force protection for `/api/auth/verify-email` comes entirely from the per-email rate limiter. This plan drops `verificationAttempts` and relies on the same per-email rate limiter, matching the existing pattern exactly instead of inventing an unused field.
- Money/role/status strings are plain `String` columns with a comment enumerating the allowed values — matches every other status field in `schema.prisma` (`User.role`, `User.status`, `ContactMessage.status`, …). No Prisma `enum` introduced.
- New env vars (all optional, with defaults baked into the code — no `.env.example` change required to run locally): `ADMIN_ACCESS_REQUEST_RATE_LIMIT_MAX` (default 5), `ADMIN_ACCESS_REQUEST_VERIFICATION_TTL_MIN` (default 15), `ADMIN_ACCESS_REQUEST_VERIFY_RATE_LIMIT_MAX` (default 5). Reuses existing `AUTH_PASSWORD_MIN_LENGTH` and `PASSWORD_HIBP_CHECK` as-is.
- Test harness: `prismaMock` from `@/test-utils/prisma-mock` (import first in every test file so its `vi.mock('@/lib/server/prisma', ...)` hoists), `seedAdmin`/`seedSuperadmin` from `@/test-utils/admin-fixtures`. Mirror the exact mocking shape used by `frontend/src/app/api/admin/contact-messages/route.test.ts` and `frontend/src/app/api/auth/signup/route.test.ts` — both read in full during planning.
- Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` before considering any task's commit final (per `CLAUDE.md`).

---

## Task 1: Prisma schema — `AdminAccessRequest` model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (add the model after `ContactMessage`, the last model in the file)

**Interfaces:**
- Produces: `prisma.adminAccessRequest` client accessor with fields `id, name, email, phone, passwordHash, status, emailVerifiedAt, verificationCode, verificationExpiresAt, reviewedByUserId, reviewedAt, rejectionReason, createdUserId, createdAt, updatedAt` — every later task in this plan reads/writes these exact field names.

- [ ] **Step 1: Add the model to `schema.prisma`**

Open `frontend/prisma/schema.prisma`, find the `ContactMessage` model (last model in the file), and append this new model directly after it:

```prisma
// ───────────────────────────────────────────────────────────────────────
// Admin access requests — self-service request-and-review workflow for
// /admin/inscription. Deliberately separate from `User`: no login-capable
// account exists until a SUPERADMIN approves the request (see
// docs/superpowers/specs/2026-09-05-admin-inscription-backend-design.md).
// ───────────────────────────────────────────────────────────────────────
model AdminAccessRequest {
  id                    String    @id @default(cuid())
  name                  String
  email                 String
  phone                 String
  passwordHash          String
  status                String    @default("PENDING_EMAIL") // PENDING_EMAIL | PENDING_REVIEW | APPROVED | REJECTED
  emailVerifiedAt       DateTime?
  verificationCode      String?
  verificationExpiresAt DateTime?
  reviewedByUserId      String?
  reviewedAt            DateTime?
  rejectionReason       String?
  createdUserId         String? // set on approval — the resulting User.id
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([status])
  @@index([email])
}
```

- [ ] **Step 2: Apply the migration**

Run from `frontend/`:

```bash
pnpm db:migrate:dev --name add_admin_access_request
```

If this fails to reach the database (`P1001` or similar), the project's `.env.local` already documents a local-Postgres `DATABASE_URL` override near the top of the file (added 2026-08-28) for exactly this situation — the Neon dev branch's quota lapses periodically. Switch to that override, re-run the command, then switch back (or leave it — both are valid dev configs per the project's own notes).

Expected: a new folder under `frontend/prisma/migrations/` and output ending in `Your database is now in sync with your schema.`

- [ ] **Step 3: Confirm the generated Prisma Client picks up the new model**

Run:

```bash
pnpm --filter frontend exec tsc --noEmit
```

Expected: no errors. (If `prisma.adminAccessRequest` isn't recognized, run `pnpm --filter frontend exec prisma generate` and retry — `db:migrate:dev` normally does this automatically.)

- [ ] **Step 4: Run the existing full test suite to confirm no regression**

```bash
pnpm test
```

Expected: same pass count as before this change (schema-only changes shouldn't break anything).

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "$(cat <<'EOF'
feat(db): add AdminAccessRequest model

Backs the /admin/inscription request-and-review workflow. Deliberately
separate from User — no account exists until a SUPERADMIN approves.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `POST /api/public/admin-access-requests` (create request)

**Files:**
- Create: `frontend/src/app/api/public/admin-access-requests/route.ts`
- Test: `frontend/src/app/api/public/admin-access-requests/route.test.ts`

**Interfaces:**
- Consumes: `prisma.adminAccessRequest` (Task 1); `hashPassword`, `generateVerificationCode`, `VERIFICATION_CODE_REGEX` from `@/lib/server/auth`; `isBanned` from `@/lib/server/auth/banned-passwords`; `isPwned` from `@/lib/server/auth/hibp`; `dummyBcryptCompare` from `@/lib/server/auth/dummy-bcrypt`; `createEmailLimiter` from `@/lib/server/middleware/rate-limit-by-email`; `getEmailQueue` from `@/lib/server/queues/email-queue-singleton`.
- Produces: `AdminAccessRequest` rows in status `PENDING_EMAIL`. Response contract `201 { ok: true }` (always, enumeration-resistant) or `400 { error: 'VALIDATION_FAILED' | 'PASSWORD_BANNED' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_PWNED' }` or `429 { error: 'TOO_MANY_ACCESS_REQUEST_ATTEMPTS' }`. Task 7 (frontend) calls this exact path/shape.

- [ ] **Step 1: Write the test file**

Create `frontend/src/app/api/public/admin-access-requests/route.test.ts`:

```ts
// ADMIN-ACCESS-REQUEST-01 — POST /api/public/admin-access-requests tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth/dummy-bcrypt', () => ({
  dummyBcryptCompare: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/auth/hibp', () => ({
  isPwned: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { POST } from './route';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { VERIFICATION_CODE_REGEX } from '@/lib/server/auth';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/public/admin-access-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Kofi Mensah',
    email: 'new-admin@example.com',
    phone: '+22967000000',
    password: 'a-strong-passphrase',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
});

describe('POST /api/public/admin-access-requests', () => {
  it('creates a new request and enqueues the verification email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminAccessRequest.create.mockResolvedValue({ id: 'req-1' } as never);

    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.adminAccessRequest.create).toHaveBeenCalledTimes(1);
    const createArg = prismaMock.adminAccessRequest.create.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      name: 'Kofi Mensah',
      email: 'new-admin@example.com',
      phone: '+22967000000',
    });
    expect(createArg?.data?.verificationCode).toMatch(VERIFICATION_CODE_REGEX);
  });

  it('returns identical 201 + dummy-bcrypts when a User already has this email (enumeration-resist)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-existing' } as never);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);

    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAccessRequest.create).not.toHaveBeenCalled();
  });

  it('returns identical 201 + dummy-bcrypts when an active request already exists for this email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({ id: 'req-existing' } as never);

    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);
    expect(prismaMock.adminAccessRequest.create).not.toHaveBeenCalled();
  });

  it('rejects banned passwords with PASSWORD_BANNED before any DB lookup', async () => {
    const res = await POST(makeReq(baseBody({ password: 'password' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PASSWORD_BANNED');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects short passwords with PASSWORD_TOO_SHORT', async () => {
    const res = await POST(makeReq(baseBody({ password: 'ab' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PASSWORD_TOO_SHORT');
  });

  it('rejects malformed bodies with VALIDATION_FAILED', async () => {
    const res = await POST(
      makeReq({ name: '', email: 'not-an-email', phone: '123', password: 'x' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 429 TOO_MANY_ACCESS_REQUEST_ATTEMPTS when the per-email limit is hit', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);
    prismaMock.adminAccessRequest.create.mockResolvedValue({ id: 'req-rate' } as never);

    const calls = await Promise.all(
      Array.from({ length: 6 }, () =>
        POST(makeReq(baseBody({ email: 'rate-target@example.com' }))),
      ),
    );
    const limited = calls.find((r) => r.status === 429);
    expect(limited).toBeDefined();
    const body = await limited!.json();
    expect(body.error).toBe('TOO_MANY_ACCESS_REQUEST_ATTEMPTS');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/app/api/public/admin-access-requests/route.test.ts
```

Expected: FAIL — `Cannot find module './route'` (the route file doesn't exist yet).

- [ ] **Step 3: Write the route implementation**

Create `frontend/src/app/api/public/admin-access-requests/route.ts`:

```ts
// ADMIN-ACCESS-REQUEST-01 — POST /api/public/admin-access-requests
//
// Public, unauthenticated: anyone can request an admin account. Creates a
// PENDING_EMAIL AdminAccessRequest — no User row exists yet, so this alone
// grants no access. Enumeration-resistant like /api/auth/signup: identical
// 201 whether the email is new or already claimed (by a User or another
// active request).
//
// CSRF carve-out: pre-session route, same reasoning as /api/auth/signup —
// no CSRF cookie exists yet.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail, zPhone } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { hashPassword, generateVerificationCode } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);
const VERIFICATION_TTL_MIN = Number(process.env.ADMIN_ACCESS_REQUEST_VERIFICATION_TTL_MIN ?? 15);
const VERIFICATION_TTL_MS = VERIFICATION_TTL_MIN * 60 * 1000;
const ACTIVE_STATUSES = ['PENDING_EMAIL', 'PENDING_REVIEW', 'APPROVED'];

const Body = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: zEmail,
  phone: zPhone,
  password: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'admin-access-request',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.ADMIN_ACCESS_REQUEST_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_ACCESS_REQUEST_ATTEMPTS',
  message: 'Too many requests. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { name, email, phone, password } = parsed.data;

    if (isBanned(password)) {
      return NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (password.length < PASSWORD_MIN) {
      return NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      return NextResponse.json(
        { error: 'PASSWORD_PWNED', message: 'This password appeared in a known data breach.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const [existingUser, existingRequest] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
      prisma.adminAccessRequest.findFirst({
        where: { email, status: { in: ACTIVE_STATUSES } },
        select: { id: true },
      }),
    ]);
    if (existingUser || existingRequest) {
      await dummyBcryptCompare(password);
      log.info('admin-access-request duplicate (enumeration-resist)');
      return NextResponse.json(
        { ok: true },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await prisma.adminAccessRequest.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        verificationCode: code,
        verificationExpiresAt: expiresAt,
      },
    });

    try {
      const queue = getEmailQueue();
      if (queue) {
        await queue.enqueue({
          to: email,
          subject: 'Confirmez votre demande de compte administrateur',
          html: `<p>Bonjour ${name},</p><p>Votre code de vérification est : <strong>${code}</strong></p><p>Ce code expire dans ${VERIFICATION_TTL_MIN} minutes.</p>`,
          text: `Votre code de vérification est : ${code} (expire dans ${VERIFICATION_TTL_MIN} minutes)`,
        });
      } else {
        log.warn('admin-access-request: email queue not configured, verification code not sent');
      }
    } catch (err) {
      log.warn('admin-access-request: email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log.info('admin-access-request created');
    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/app/api/public/admin-access-requests/route.test.ts
```

Expected: PASS, all 7 tests.

- [ ] **Step 5: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint src/app/api/public/admin-access-requests/route.ts
pnpm --filter frontend exec prettier --write src/app/api/public/admin-access-requests/route.ts src/app/api/public/admin-access-requests/route.test.ts
```

Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/public/admin-access-requests/route.ts frontend/src/app/api/public/admin-access-requests/route.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/public/admin-access-requests

Enumeration-resistant admin-account request endpoint, mirrors the
signup route's password-policy + duplicate-handling pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `POST /api/public/admin-access-requests/verify-email`

**Files:**
- Create: `frontend/src/app/api/public/admin-access-requests/verify-email/route.ts`
- Test: `frontend/src/app/api/public/admin-access-requests/verify-email/route.test.ts`

**Interfaces:**
- Consumes: `prisma.adminAccessRequest` (Task 1); `VERIFICATION_CODE_REGEX`, `timingSafeCompare` from `@/lib/server/auth`; `getEmailQueue`.
- Produces: transitions a row from `PENDING_EMAIL` to `PENDING_REVIEW`. Response `200 { ok: true }` or `400 { error: 'VERIFICATION_CODE_INVALID' | 'VALIDATION_FAILED' }` or `429 { error: 'TOO_MANY_VERIFY_ATTEMPTS' }`. Task 7 calls this exact path/shape.

- [ ] **Step 1: Write the test file**

Create `frontend/src/app/api/public/admin-access-requests/verify-email/route.test.ts`:

```ts
// ADMIN-ACCESS-REQUEST-02 — POST /api/public/admin-access-requests/verify-email tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { POST } from './route';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/public/admin-access-requests/verify-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FUTURE = new Date(Date.now() + 10 * 60 * 1000);
const PAST = new Date(Date.now() - 10 * 60 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
  prismaMock.user.findMany.mockResolvedValue([] as never);
});

describe('POST /api/public/admin-access-requests/verify-email', () => {
  it('marks the request PENDING_REVIEW on a correct, unexpired code', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: FUTURE,
    } as never);
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makeReq({ email: 'req@example.com', code: 'ABCDEFGH' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.adminAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'PENDING_EMAIL' },
      data: expect.objectContaining({ status: 'PENDING_REVIEW' }),
    });
  });

  it('notifies SUPERADMIN users on success', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: FUTURE,
    } as never);
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.user.findMany.mockResolvedValue([{ email: 'super@example.com' }] as never);
    const enqueue = vi.fn().mockResolvedValue('job-1');
    vi.mocked(getEmailQueue).mockReturnValue({ enqueue } as never);

    await POST(makeReq({ email: 'req@example.com', code: 'ABCDEFGH' }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ to: 'super@example.com' }));
  });

  it('returns VERIFICATION_CODE_INVALID for an unknown email', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue(null);

    const res = await POST(makeReq({ email: 'unknown@example.com', code: 'ABCDEFGH' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('returns VERIFICATION_CODE_INVALID for a wrong code', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: FUTURE,
    } as never);

    const res = await POST(makeReq({ email: 'req@example.com', code: 'ZZZZZZZZ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_CODE_INVALID');
    expect(prismaMock.adminAccessRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns VERIFICATION_CODE_INVALID for an expired code', async () => {
    prismaMock.adminAccessRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      verificationCode: 'ABCDEFGH',
      verificationExpiresAt: PAST,
    } as never);

    const res = await POST(makeReq({ email: 'req@example.com', code: 'ABCDEFGH' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VERIFICATION_CODE_INVALID');
  });

  it('rejects malformed code shape with VALIDATION_FAILED', async () => {
    const res = await POST(makeReq({ email: 'req@example.com', code: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/app/api/public/admin-access-requests/verify-email/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route implementation**

Create `frontend/src/app/api/public/admin-access-requests/verify-email/route.ts`:

```ts
// ADMIN-ACCESS-REQUEST-02 — POST /api/public/admin-access-requests/verify-email
//
// Consumes the code from ADMIN-ACCESS-REQUEST-01: PENDING_EMAIL ->
// PENDING_REVIEW. No cookies issued — no User exists yet. Enumeration-
// resistant like /api/auth/verify-email: unknown email / wrong code /
// expired code all surface as the same VERIFICATION_CODE_INVALID.
// Brute-force protection is the per-email rate limiter only (5 / 15min) —
// same as the real verify-email route, which never actually reads/writes
// VerificationCode.attempts despite the column existing.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { VERIFICATION_CODE_REGEX, timingSafeCompare } from '@/lib/server/auth';

const Body = z.object({
  email: zEmail,
  code: z.string().regex(VERIFICATION_CODE_REGEX, 'Invalid verification code format'),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'admin-access-request-verify',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_ACCESS_REQUEST_VERIFY_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_VERIFY_ATTEMPTS',
  message: 'Too many verification attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { email, code } = parsed.data;

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const invalid = () =>
      NextResponse.json(
        { error: 'VERIFICATION_CODE_INVALID', message: 'Verification code is invalid.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );

    const row = await prisma.adminAccessRequest.findFirst({
      where: { email, status: 'PENDING_EMAIL' },
      select: { id: true, verificationCode: true, verificationExpiresAt: true },
    });
    if (!row || !row.verificationCode || !row.verificationExpiresAt) return invalid();
    if (row.verificationExpiresAt.getTime() < Date.now()) return invalid();
    if (!timingSafeCompare(code, row.verificationCode)) return invalid();

    // TOCTOU-safe transition, mirrors /api/auth/verify-email's updateMany guard.
    const consumed = await prisma.adminAccessRequest.updateMany({
      where: { id: row.id, status: 'PENDING_EMAIL' },
      data: {
        status: 'PENDING_REVIEW',
        emailVerifiedAt: new Date(),
        verificationCode: null,
        verificationExpiresAt: null,
      },
    });
    if (consumed.count === 0) return invalid();

    try {
      const queue = getEmailQueue();
      if (queue) {
        const superadmins = await prisma.user.findMany({
          where: { role: 'SUPERADMIN' },
          select: { email: true },
        });
        await Promise.all(
          superadmins.map((s) =>
            queue.enqueue({
              to: s.email,
              subject: 'Nouvelle demande de compte administrateur',
              html: `<p>Une nouvelle demande d'accès administrateur (${email}) attend votre validation dans le tableau de bord admin.</p>`,
              text: `Une nouvelle demande d'accès administrateur (${email}) attend votre validation.`,
            }),
          ),
        );
      }
    } catch (err) {
      log.warn('admin-access-request verify: superadmin notify failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log.info('admin-access-request email verified');
    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/app/api/public/admin-access-requests/verify-email/route.test.ts
```

Expected: PASS, all 6 tests.

- [ ] **Step 5: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint src/app/api/public/admin-access-requests/verify-email/route.ts
pnpm --filter frontend exec prettier --write src/app/api/public/admin-access-requests/verify-email/route.ts src/app/api/public/admin-access-requests/verify-email/route.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/public/admin-access-requests/verify-email/route.ts frontend/src/app/api/public/admin-access-requests/verify-email/route.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/public/admin-access-requests/verify-email

Moves a request PENDING_EMAIL -> PENDING_REVIEW and best-effort notifies
SUPERADMIN users that a request is awaiting review.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `GET /api/admin/access-requests` (list) + `GET /api/admin/access-requests/[id]` (detail)

**Files:**
- Create: `frontend/src/app/api/admin/access-requests/route.ts`
- Test: `frontend/src/app/api/admin/access-requests/route.test.ts`
- Create: `frontend/src/app/api/admin/access-requests/[id]/route.ts`
- Test: `frontend/src/app/api/admin/access-requests/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/server/middleware`; `enforceAdminRateLimit` from `@/lib/server/middleware/rate-limit-by-userid`; `clampLimit, cursorWhere, decodeCursor, buildPage` from `@/lib/server/pagination/paginate`; `prisma.adminAccessRequest` (Task 1).
- Produces: `GET list` → `{ items: AccessRequestSummary[], nextCursor: string | null }`; `GET detail` → `{ accessRequest: AccessRequestSummary & { createdUserId } }` or `404 { error: 'ACCESS_REQUEST_NOT_FOUND' }`. `AccessRequestSummary = { id, name, email, phone, status, emailVerifiedAt, reviewedAt, rejectionReason, createdAt }` — never includes `passwordHash`. Task 8 (review screen) consumes this exact shape.

- [ ] **Step 1: Write the list route's test file**

Create `frontend/src/app/api/admin/access-requests/route.test.ts`:

```ts
// ADMIN-ACCESS-REQUEST-03 — GET /api/admin/access-requests tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadmin = seedSuperadmin({ id: 'super_1', email: 'super@test.local' });
const adminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.adminAccessRequest.findMany.mockResolvedValue([] as never);
});

describe('GET /api/admin/access-requests', () => {
  it('defaults to the PENDING_REVIEW status filter', async () => {
    await GET(makeGet('http://test/api/admin/access-requests'));
    expect(prismaMock.adminAccessRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING_REVIEW' }) }),
    );
  });

  it('applies an explicit status filter', async () => {
    await GET(makeGet('http://test/api/admin/access-requests?status=APPROVED'));
    expect(prismaMock.adminAccessRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('never selects passwordHash', async () => {
    await GET(makeGet('http://test/api/admin/access-requests'));
    const selectArg = prismaMock.adminAccessRequest.findMany.mock.calls[0]?.[0]?.select as
      | Record<string, unknown>
      | undefined;
    expect(selectArg).not.toHaveProperty('passwordHash');
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/access-requests'));
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** (`Cannot find module './route'`)

```bash
pnpm --filter frontend exec vitest run src/app/api/admin/access-requests/route.test.ts
```

- [ ] **Step 3: Write the list route**

Create `frontend/src/app/api/admin/access-requests/route.ts`:

```ts
// ADMIN-ACCESS-REQUEST-03 — GET /api/admin/access-requests
//
// SUPERADMIN-only review queue. Defaults to the actionable PENDING_REVIEW
// status; pass ?status=APPROVED|REJECTED|PENDING_EMAIL for history views.
// Never selects passwordHash.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, decodeCursor, buildPage } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ACCESS_REQUEST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
} as const satisfies Prisma.AdminAccessRequestSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status') ?? 'PENDING_REVIEW';
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.AdminAccessRequestWhereInput = {
      status,
      ...cursorWhere(cursor),
    };

    const rows = await prisma.adminAccessRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: ACCESS_REQUEST_SELECT,
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
```

- [ ] **Step 4: Run the list test, verify it passes**

```bash
pnpm --filter frontend exec vitest run src/app/api/admin/access-requests/route.test.ts
```

- [ ] **Step 5: Write the detail route's test file**

Create `frontend/src/app/api/admin/access-requests/[id]/route.test.ts`:

```ts
// ADMIN-ACCESS-REQUEST-04 — GET /api/admin/access-requests/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadmin = seedSuperadmin({ id: 'super_1', email: 'super@test.local' });
const adminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makeGet(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/access-requests/${id}`, { method: 'GET' });
}
function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/access-requests/[id]', () => {
  it('returns the request detail', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      name: 'Kofi Mensah',
      email: 'kofi@example.com',
      phone: '+22967000000',
      status: 'PENDING_REVIEW',
      emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
      reviewedAt: null,
      rejectionReason: null,
      createdUserId: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    } as never);

    const res = await GET(makeGet('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessRequest.id).toBe('req-1');
  });

  it('returns 404 for an unknown id', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('missing'), ctxFor('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('ACCESS_REQUEST_NOT_FOUND');
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it, verify it fails**

```bash
pnpm --filter frontend exec vitest run "src/app/api/admin/access-requests/[id]/route.test.ts"
```

- [ ] **Step 7: Write the detail route**

Create `frontend/src/app/api/admin/access-requests/[id]/route.ts`:

```ts
// ADMIN-ACCESS-REQUEST-04 — GET /api/admin/access-requests/[id]
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const row = await prisma.adminAccessRequest.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        createdUserId: true,
        createdAt: true,
      },
    });
    if (!row) {
      return NextResponse.json(
        { error: 'ACCESS_REQUEST_NOT_FOUND', message: 'Access request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { accessRequest: row },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

- [ ] **Step 8: Run the detail test, verify it passes**

```bash
pnpm --filter frontend exec vitest run "src/app/api/admin/access-requests/[id]/route.test.ts"
```

- [ ] **Step 9: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint "src/app/api/admin/access-requests/route.ts" "src/app/api/admin/access-requests/[id]/route.ts"
pnpm --filter frontend exec prettier --write "src/app/api/admin/access-requests/route.ts" "src/app/api/admin/access-requests/route.test.ts" "src/app/api/admin/access-requests/[id]/route.ts" "src/app/api/admin/access-requests/[id]/route.test.ts"
```

- [ ] **Step 10: Commit**

```bash
git add "frontend/src/app/api/admin/access-requests/route.ts" "frontend/src/app/api/admin/access-requests/route.test.ts" "frontend/src/app/api/admin/access-requests/[id]/route.ts" "frontend/src/app/api/admin/access-requests/[id]/route.test.ts"
git commit -m "$(cat <<'EOF'
feat(api): admin access-requests list + detail (SUPERADMIN)

GET /api/admin/access-requests (cursor-paginated, status filter) and
GET .../[id]. Never exposes passwordHash.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `POST /api/admin/access-requests/[id]/approve`

**Files:**
- Create: `frontend/src/app/api/admin/access-requests/[id]/approve/route.ts`
- Test: `frontend/src/app/api/admin/access-requests/[id]/approve/route.test.ts`

**Interfaces:**
- Consumes: `verifyCsrf` from `@/lib/server/auth`; `requireAdmin` from `@/lib/server/middleware`; `logAdminAction` from `@/lib/server/admin/audit` (via `prisma.adminAction.create`, not mocked directly — see Task 4's test convention); `getEmailQueue`; `prisma.adminAccessRequest`, `prisma.user`.
- Produces: on success, a new `User` row with `role: 'ADMIN'`; the `AdminAccessRequest` moves to `APPROVED`. Response `200 { ok: true }`, `404 { error: 'ACCESS_REQUEST_NOT_FOUND' }`, `409 { error: 'REQUEST_NOT_PENDING' | 'EMAIL_ALREADY_REGISTERED' }`. Task 8 calls this exact path.

- [ ] **Step 1: Write the test file**

Create `frontend/src/app/api/admin/access-requests/[id]/approve/route.test.ts`:

```ts
// ADMIN-ACCESS-REQUEST-05 — POST /api/admin/access-requests/[id]/approve tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadmin = seedSuperadmin({ id: 'super_1', email: 'super@test.local' });
const adminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePost(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/access-requests/${id}/approve`, {
    method: 'POST',
  });
}
function ctxFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PENDING_REQUEST = {
  id: 'req-1',
  name: 'Kofi Mensah',
  email: 'kofi@example.com',
  phone: '+22967000000',
  passwordHash: '$2a$12$hash',
  status: 'PENDING_REVIEW',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/admin/access-requests/[id]/approve', () => {
  it('creates an ADMIN user and marks the request APPROVED', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(PENDING_REQUEST as never);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'user-new' } as never);
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(200);

    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ADMIN', email: 'kofi@example.com' }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin-access-request.approve',
          targetId: 'req-1',
        }),
      }),
    );
  });

  it('returns 409 REQUEST_NOT_PENDING for an already-decided request', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue({
      ...PENDING_REQUEST,
      status: 'APPROVED',
    } as never);

    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REQUEST_NOT_PENDING');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('returns 409 EMAIL_ALREADY_REGISTERED when a User already has this email', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(PENDING_REQUEST as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user' } as never);

    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('EMAIL_ALREADY_REGISTERED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown request id', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(null);
    const res = await POST(makePost('missing'), ctxFor('missing'));
    expect(res.status).toBe(404);
  });

  it('propagates 403 from requireAdmin (ADMIN, not SUPERADMIN) without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost('req-1'), ctxFor('req-1'));
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter frontend exec vitest run "src/app/api/admin/access-requests/[id]/approve/route.test.ts"
```

- [ ] **Step 3: Write the route implementation**

Create `frontend/src/app/api/admin/access-requests/[id]/approve/route.ts`:

```ts
// ADMIN-ACCESS-REQUEST-05 — POST /api/admin/access-requests/[id]/approve
//
// Only path in this feature that grants the ADMIN role — SUPERADMIN-only,
// consistent with "only SUPERADMIN can change roles". Creates the real
// User row from the request's stored passwordHash; no auto-login (this
// runs in the approving SUPERADMIN's own session).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.adminAccessRequest.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, passwordHash: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ACCESS_REQUEST_NOT_FOUND', message: 'Access request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (existing.status !== 'PENDING_REVIEW') {
      return NextResponse.json(
        { error: 'REQUEST_NOT_PENDING', message: 'This request has already been decided.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email: existing.email },
      select: { id: true },
    });
    if (emailTaken) {
      return NextResponse.json(
        { error: 'EMAIL_ALREADY_REGISTERED', message: 'A user with this email already exists.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let createdUserId: string;
    try {
      createdUserId = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: existing.email,
            phone: existing.phone,
            name: existing.name,
            passwordHash: existing.passwordHash,
            role: 'ADMIN',
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });
        const updated = await tx.adminAccessRequest.updateMany({
          where: { id: existing.id, status: 'PENDING_REVIEW' },
          data: {
            status: 'APPROVED',
            reviewedByUserId: auth.admin.id,
            reviewedAt: new Date(),
            createdUserId: user.id,
          },
        });
        if (updated.count === 0) {
          throw new Error('REQUEST_RACE');
        }
        return user.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'REQUEST_RACE') {
        return NextResponse.json(
          { error: 'REQUEST_NOT_PENDING', message: 'This request has already been decided.' },
          { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw err;
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin-access-request.approve',
      targetType: 'AdminAccessRequest',
      targetId: existing.id,
      metadata: { createdUserId, email: existing.email },
    });

    try {
      const queue = getEmailQueue();
      if (queue) {
        await queue.enqueue({
          to: existing.email,
          subject: 'Votre demande de compte administrateur est approuvée',
          html: `<p>Bonjour ${existing.name},</p><p>Votre demande d'accès administrateur a été approuvée. Vous pouvez maintenant vous connecter sur la page de connexion administrateur avec l'email et le mot de passe que vous avez fournis.</p>`,
          text: `Votre demande d'accès administrateur a été approuvée. Connectez-vous avec l'email et le mot de passe fournis.`,
        });
      }
    } catch (err) {
      log.warn('admin-access-request approve: email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter frontend exec vitest run "src/app/api/admin/access-requests/[id]/approve/route.test.ts"
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint "src/app/api/admin/access-requests/[id]/approve/route.ts"
pnpm --filter frontend exec prettier --write "src/app/api/admin/access-requests/[id]/approve/route.ts" "src/app/api/admin/access-requests/[id]/approve/route.test.ts"
```

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/api/admin/access-requests/[id]/approve/route.ts" "frontend/src/app/api/admin/access-requests/[id]/approve/route.test.ts"
git commit -m "$(cat <<'EOF'
feat(api): POST /api/admin/access-requests/[id]/approve

SUPERADMIN-only: creates the real ADMIN User from a PENDING_REVIEW
request, audited via logAdminAction, best-effort approval email.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `POST /api/admin/access-requests/[id]/reject`

**Files:**
- Create: `frontend/src/app/api/admin/access-requests/[id]/reject/route.ts`
- Test: `frontend/src/app/api/admin/access-requests/[id]/reject/route.test.ts`

**Interfaces:**
- Consumes: same as Task 5 minus `prisma.user`.
- Produces: `AdminAccessRequest` → `REJECTED`. Response `200 { ok: true }`, `404`, `409 { error: 'REQUEST_NOT_PENDING' }`. Task 8 calls this exact path.

- [ ] **Step 1: Write the test file**

Create `frontend/src/app/api/admin/access-requests/[id]/reject/route.test.ts`:

```ts
// ADMIN-ACCESS-REQUEST-06 — POST /api/admin/access-requests/[id]/reject tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const superadmin = seedSuperadmin({ id: 'super_1', email: 'super@test.local' });
const adminCtx = {
  user: { sub: superadmin.id, email: superadmin.email },
  admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
};

function makePost(
  id: string,
  body: unknown = {},
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/access-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  vi.mocked(getEmailQueue).mockReturnValue({
    enqueue: vi.fn().mockResolvedValue('job-1'),
  } as never);
  prismaMock.adminAccessRequest.findUnique.mockResolvedValue({
    id: 'req-1',
    name: 'Kofi Mensah',
    email: 'kofi@example.com',
    status: 'PENDING_REVIEW',
  } as never);
  prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('POST /api/admin/access-requests/[id]/reject', () => {
  it('marks the request REJECTED with the given reason', async () => {
    const { req, ctx } = makePost('req-1', { reason: 'Email non vérifiable' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);

    expect(prismaMock.adminAccessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'PENDING_REVIEW' },
      data: expect.objectContaining({
        status: 'REJECTED',
        rejectionReason: 'Email non vérifiable',
      }),
    });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'admin-access-request.reject',
          targetId: 'req-1',
        }),
      }),
    );
  });

  it('accepts an omitted reason', async () => {
    const { req, ctx } = makePost('req-1', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
  });

  it('returns 409 REQUEST_NOT_PENDING when already decided', async () => {
    prismaMock.adminAccessRequest.updateMany.mockResolvedValue({ count: 0 } as never);
    const { req, ctx } = makePost('req-1', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('REQUEST_NOT_PENDING');
  });

  it('returns 404 for an unknown request id', async () => {
    prismaMock.adminAccessRequest.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePost('missing', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('propagates 403 from requireAdmin without a DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const { req, ctx } = makePost('req-1', {});
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.adminAccessRequest.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter frontend exec vitest run "src/app/api/admin/access-requests/[id]/reject/route.test.ts"
```

- [ ] **Step 3: Write the route implementation**

Create `frontend/src/app/api/admin/access-requests/[id]/reject/route.ts`:

```ts
// ADMIN-ACCESS-REQUEST-06 — POST /api/admin/access-requests/[id]/reject
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('SUPERADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.adminAccessRequest.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ACCESS_REQUEST_NOT_FOUND', message: 'Access request not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.adminAccessRequest.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: {
        status: 'REJECTED',
        reviewedByUserId: auth.admin.id,
        reviewedAt: new Date(),
        ...(parsed.data.reason !== undefined && { rejectionReason: parsed.data.reason }),
      },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'REQUEST_NOT_PENDING', message: 'This request has already been decided.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin-access-request.reject',
      targetType: 'AdminAccessRequest',
      targetId: id,
      metadata: { email: existing.email, reason: parsed.data.reason ?? null },
    });

    try {
      const queue = getEmailQueue();
      if (queue) {
        await queue.enqueue({
          to: existing.email,
          subject: 'Votre demande de compte administrateur',
          html: `<p>Bonjour ${existing.name},</p><p>Votre demande d'accès administrateur n'a pas été retenue.${parsed.data.reason ? ` Motif : ${parsed.data.reason}` : ''}</p>`,
          text: `Votre demande d'accès administrateur n'a pas été retenue.${parsed.data.reason ? ` Motif : ${parsed.data.reason}` : ''}`,
        });
      }
    } catch (err) {
      log.warn('admin-access-request reject: email dispatch failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter frontend exec vitest run "src/app/api/admin/access-requests/[id]/reject/route.test.ts"
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint "src/app/api/admin/access-requests/[id]/reject/route.ts"
pnpm --filter frontend exec prettier --write "src/app/api/admin/access-requests/[id]/reject/route.ts" "src/app/api/admin/access-requests/[id]/reject/route.test.ts"
```

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/api/admin/access-requests/[id]/reject/route.ts" "frontend/src/app/api/admin/access-requests/[id]/reject/route.test.ts"
git commit -m "$(cat <<'EOF'
feat(api): POST /api/admin/access-requests/[id]/reject

SUPERADMIN-only: marks a PENDING_REVIEW request REJECTED with an
optional reason, audited, best-effort rejection email.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire `/admin/inscription` to a 3-step flow

**Files:**
- Modify: `frontend/src/app/admin/inscription/page.tsx` (full rewrite of the component body — same file, same imports of `AdminAuthCard`/`AdminField`)

**Interfaces:**
- Consumes: `POST /api/public/admin-access-requests` and `POST /api/public/admin-access-requests/verify-email` (Tasks 2, 3), `api`/`ApiError` from `@/lib/api`, `useToast` from `@/contexts/ToastContext`.
- Produces: nothing consumed by other tasks — this is a leaf page.

- [ ] **Step 1: Replace the page component**

Read the current file first (`frontend/src/app/admin/inscription/page.tsx`) to match exact current import ordering conventions, then replace its full contents with:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import {
  UserPlus,
  User,
  Mail,
  Phone,
  Lock,
  Shield,
  Eye,
  EyeOff,
  Check,
  ArrowRight,
  KeyRound,
  MailCheck,
} from 'lucide-react';
import { AdminAuthCard } from '@/components/admin/AdminAuthCard';
import { AdminField } from '@/components/admin/AdminField';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type Step = 'form' | 'code' | 'done';

const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  PASSWORD_BANNED: 'Ce mot de passe est trop courant, choisissez-en un autre.',
  PASSWORD_TOO_SHORT: 'Le mot de passe est trop court.',
  PASSWORD_PWNED: 'Ce mot de passe est apparu dans une fuite de données connue.',
  TOO_MANY_ACCESS_REQUEST_ATTEMPTS: 'Trop de tentatives, réessayez plus tard.',
  VALIDATION_FAILED: 'Merci de vérifier les informations saisies.',
};

const CODE_ERROR_MESSAGES: Record<string, string> = {
  VERIFICATION_CODE_INVALID: 'Code invalide ou expiré.',
  TOO_MANY_VERIFY_ATTEMPTS: 'Trop de tentatives, réessayez plus tard.',
  VALIDATION_FAILED: 'Le code doit contenir 8 caractères.',
};

export default function AdminInscriptionPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('form');
  const [manager, setManager] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast('Les mots de passe ne correspondent pas.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/public/admin-access-requests', {
        method: 'POST',
        body: { name: manager, email, phone, password },
      });
      setStep('code');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (REQUEST_ERROR_MESSAGES[err.code] ?? 'Une erreur est survenue, réessayez.')
          : 'Une erreur est survenue, réessayez.';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/public/admin-access-requests/verify-email', {
        method: 'POST',
        body: { email, code },
      });
      setStep('done');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (CODE_ERROR_MESSAGES[err.code] ?? 'Une erreur est survenue, réessayez.')
          : 'Une erreur est survenue, réessayez.';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminAuthCard>
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-brand">
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Inscription administrateur
          </div>
          <h1 className="font-sora text-2xl leading-[1.15] font-bold tracking-[-0.03em] text-neutral-900 md:text-[30px]">
            {step === 'form' && 'Créer un compte pour le tableau de bord administration'}
            {step === 'code' && 'Vérifiez votre adresse email'}
            {step === 'done' && 'Demande envoyée'}
          </h1>
        </header>

        {step === 'form' && (
          <form onSubmit={onSubmitForm} className="flex flex-col gap-[18px]">
            <AdminField
              label="Nom du responsable"
              name="manager"
              icon={<User className="h-4 w-4" aria-hidden />}
              meta="Principal"
              placeholder="Prénom et nom complet"
              autoComplete="name"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              required
            />

            <AdminField
              label="Adresse email professionnelle"
              name="email"
              type="email"
              icon={<Mail className="h-4 w-4" aria-hidden />}
              meta="Vérifiée"
              placeholder="nom@entreprise.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <AdminField
              label="Téléphone professionnel"
              name="phone"
              type="tel"
              icon={<Phone className="h-4 w-4" aria-hidden />}
              meta="WhatsApp"
              placeholder="+229 00 00 00 00"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />

            <AdminField
              label="Créer un mot de passe"
              name="password"
              type={showPassword ? 'text' : 'password'}
              icon={<Lock className="h-4 w-4" aria-hidden />}
              placeholder="Minimum 10 caractères"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="flex items-center focus-visible:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              }
            />

            <AdminField
              label="Confirmer le mot de passe"
              name="confirm"
              type={showConfirm ? 'text' : 'password'}
              icon={<Shield className="h-4 w-4" aria-hidden />}
              placeholder="Ressaisissez votre mot de passe"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="flex items-center focus-visible:outline-none"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden />
                  )}
                </button>
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setAccepted((v) => !v)}
                className="flex items-center gap-2.5 text-left text-[13px] text-gray-500"
                aria-pressed={accepted}
              >
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-sm border-[1.5px] transition-colors',
                    accepted ? 'border-brand bg-brand' : 'border-black/[0.15] bg-white',
                  )}
                >
                  {accepted && <Check className="h-3 w-3 text-brand-foreground" aria-hidden />}
                </span>
                J&apos;accepte la vérification de l&apos;organisation et les conditions d&apos;accès
              </button>
              <a href="/admin/connexion" className="text-[13px] font-semibold text-brand">
                Déjà un compte ?
              </a>
            </div>

            <button
              type="submit"
              disabled={!accepted || submitting}
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              {submitting ? 'Envoi en cours…' : 'Demander la création du compte'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={onSubmitCode} className="flex flex-col gap-[18px]">
            <p className="text-[14px] leading-relaxed text-gray-500">
              Un code à 8 caractères a été envoyé à <strong>{email}</strong>. Saisissez-le
              ci-dessous pour finaliser votre demande.
            </p>
            <AdminField
              label="Code de vérification"
              name="code"
              icon={<KeyRound className="h-4 w-4" aria-hidden />}
              placeholder="ABCD1234"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
            <button
              type="submit"
              disabled={submitting || code.length !== 8}
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-brand text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              {submitting ? 'Vérification…' : 'Vérifier le code'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
              <MailCheck className="h-6 w-6 text-brand" aria-hidden />
            </span>
            <p className="text-[15px] font-semibold text-neutral-900">
              Demande envoyée, en attente de validation
            </p>
            <p className="max-w-[360px] text-[13px] leading-relaxed text-gray-500">
              Un administrateur va examiner votre demande. Vous recevrez un email dès
              qu&apos;une décision sera prise.
            </p>
          </div>
        )}
      </div>
    </AdminAuthCard>
  );
}
```

- [ ] **Step 2: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint src/app/admin/inscription/page.tsx
pnpm --filter frontend exec prettier --write src/app/admin/inscription/page.tsx
```

- [ ] **Step 3: Manual smoke test (this page has no automated test — matches the session's existing precedent of curl/dev-server checks for admin UI pages)**

```bash
pnpm dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/inscription
```

Expected: `200`. Then, with the dev server running and a real (or local-Postgres) database reachable, manually walk through: submit the form with a fresh email → confirm step 2 (code entry) renders → check `EmailJob`/logs for the verification code if no real email provider is configured (`getEmailQueue()` returns `null` without `UPSTASH_REDIS_REST_URL`/`BREVO_API_KEY` — in that case the code only appears in the server console via `log.warn`, which is an acceptable local-dev limitation, not a bug) → submit the code → confirm step 3 (done message) renders. Stop the dev server (`kill %1` or close the terminal) when done.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/inscription/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): wire /admin/inscription to the access-request backend

3-step flow: submit request -> verify email code -> pending-review
confirmation. No account/session created here — approval happens from
the new SUPERADMIN review screen (next commit).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Build `/admin/demandes-acces` review screen + nav entry

**Files:**
- Create: `frontend/src/app/admin/demandes-acces/page.tsx`
- Modify: `frontend/src/components/admin/admin-nav.ts`

**Interfaces:**
- Consumes: `GET /api/admin/access-requests`, `POST .../[id]/approve`, `POST .../[id]/reject` (Tasks 4, 5, 6); `AdminShell`, `AdminStatusBadge`, `AdminDrawer` (existing shared components).
- Produces: nothing consumed by other tasks — leaf page + a nav entry other admin pages already read via `AdminShell`/`AdminSidebarNav`.

- [ ] **Step 1: Add the nav entry**

Edit `frontend/src/components/admin/admin-nav.ts`. Add `UserPlus` to the `lucide-react` import, add `'access-requests'` to `AdminNavKey`, and append a new entry after `settings`:

```ts
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  Siren,
  Users,
  Wallet,
  Video,
  ShieldAlert,
  Settings2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavKey =
  | 'dashboard'
  | 'annonces'
  | 'demande'
  | 'alerte-secteur'
  | 'users'
  | 'finance'
  | 'vr'
  | 'support'
  | 'settings'
  | 'access-requests';
```

And in `ADMIN_NAV`, after the `settings` entry:

```ts
  { key: 'settings', label: 'Paramètres', icon: Settings2, href: '/admin/parametres' },
  {
    key: 'access-requests',
    label: "Demandes d'accès admin",
    icon: UserPlus,
    href: '/admin/demandes-acces',
  },
];
```

- [ ] **Step 2: Write the review screen**

Create `frontend/src/app/admin/demandes-acces/page.tsx`:

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Mail, Phone, Calendar, Check, X, Clock3 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { AdminStatusBadge, type AdminStatusTone } from '@/components/admin/AdminStatusBadge';
import { AdminDrawer } from '@/components/admin/AdminDrawer';
import { useToast } from '@/contexts/ToastContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type Status = 'PENDING_EMAIL' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

const STATUS_LABEL: Record<Status, string> = {
  PENDING_EMAIL: 'Email non vérifié',
  PENDING_REVIEW: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
};
const STATUS_TONE: Record<Status, AdminStatusTone> = {
  PENDING_EMAIL: 'neutral',
  PENDING_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: Status;
  emailVerifiedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

const TABS: { key: Status; label: string }[] = [
  { key: 'PENDING_REVIEW', label: 'En attente' },
  { key: 'APPROVED', label: 'Approuvées' },
  { key: 'REJECTED', label: 'Rejetées' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function AdminDemandesAccesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Status>('PENDING_REVIEW');
  const [items, setItems] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(
    (status: Status) => {
      setLoading(true);
      api<{ items: AccessRequest[] }>(`/api/admin/access-requests?status=${status}&limit=50`)
        .then((res) => setItems(res.items))
        .catch((e) =>
          toast(e instanceof ApiError ? e.message : 'Impossible de charger les demandes.', 'error'),
        )
        .finally(() => setLoading(false));
    },
    [toast],
  );

  useEffect(() => {
    load(tab);
    setOpenId(null);
    setRejecting(false);
    setRejectReason('');
  }, [tab, load]);

  const selected = items.find((r) => r.id === openId) ?? null;

  async function approve(id: string) {
    setDeciding(true);
    try {
      await api(`/api/admin/access-requests/${id}/approve`, { method: 'POST' });
      toast('Compte administrateur créé.', 'success');
      setOpenId(null);
      load(tab);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Impossible d'approuver cette demande.", 'error');
    } finally {
      setDeciding(false);
    }
  }

  async function reject(id: string) {
    setDeciding(true);
    try {
      await api(`/api/admin/access-requests/${id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason || undefined },
      });
      toast('Demande rejetée.', 'success');
      setOpenId(null);
      load(tab);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Impossible de rejeter cette demande.', 'error');
    } finally {
      setDeciding(false);
      setRejecting(false);
      setRejectReason('');
    }
  }

  return (
    <AdminShell active="access-requests" searchPlaceholder="Rechercher une demande d'accès admin…">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-brand">Administration · Sécurité</p>
          <h1 className="font-sora mt-2 text-2xl leading-tight font-bold text-neutral-900 md:text-[26px]">
            Demandes d&apos;accès admin
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-gray-400">
            Approuvez ou rejetez les demandes de création de compte administrateur.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] px-[18px] py-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-[30px] items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap',
                tab === t.key ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="bg-gray-50">
                {['Demandeur', 'Email', 'Téléphone', 'Statut', 'Soumise le', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-[11px] font-bold whitespace-nowrap text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Chargement…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-10 text-center text-[13px] text-gray-400">
                    Aucune demande dans cette catégorie.
                  </td>
                </tr>
              ) : (
                items.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className={cn(
                      'cursor-pointer border-t border-black/[0.05]',
                      i % 2 !== 0 ? 'bg-gray-50/60' : '',
                    )}
                  >
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-neutral-900">{r.name}</td>
                    <td className="px-3 py-2.5 text-[13px] text-neutral-700">{r.email}</td>
                    <td className="px-3 py-2.5 text-[13px] whitespace-nowrap text-neutral-700">
                      {r.phone}
                    </td>
                    <td className="px-3 py-2.5">
                      <AdminStatusBadge tone={STATUS_TONE[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-gray-400">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AdminDrawer
        open={selected != null}
        onClose={() => setOpenId(null)}
        title={selected?.name ?? ''}
        titleExtra={
          selected && (
            <span className="text-[11px] font-semibold whitespace-nowrap text-gray-400">
              {STATUS_LABEL[selected.status]}
            </span>
          )
        }
        footer={
          selected &&
          selected.status === 'PENDING_REVIEW' && (
            <>
              {rejecting ? (
                <div className="flex flex-col gap-2.5">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motif du rejet (optionnel)"
                    rows={2}
                    className="w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3 py-2 text-[13px] outline-none focus:border-brand"
                  />
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setRejecting(false)}
                      className="flex h-[38px] flex-1 items-center justify-center rounded-lg bg-gray-100 text-[14px] font-semibold text-neutral-900"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={deciding}
                      onClick={() => reject(selected.id)}
                      className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Confirmer le rejet
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={deciding}
                    onClick={() => approve(selected.id)}
                    className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-brand text-[14px] font-semibold text-brand-foreground disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Approuver
                  </button>
                  <button
                    type="button"
                    disabled={deciding}
                    onClick={() => setRejecting(true)}
                    className="flex h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-red-50 text-[14px] font-semibold text-red-500 disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Rejeter
                  </button>
                </div>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="flex flex-col gap-3">
              <DetailRow
                icon={<Mail className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Email"
                value={selected.email}
              />
              <DetailRow
                icon={<Phone className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Téléphone"
                value={selected.phone}
              />
              <DetailRow
                icon={<Calendar className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Soumise le"
                value={formatDate(selected.createdAt)}
              />
              <DetailRow
                icon={<Clock3 className="h-[15px] w-[15px] text-brand" aria-hidden />}
                label="Email vérifié"
                value={selected.emailVerifiedAt ? formatDate(selected.emailVerifiedAt) : 'Non'}
              />
            </div>
            {selected.status === 'REJECTED' && selected.rejectionReason && (
              <div className="rounded-lg bg-red-50 p-3.5 text-[13px] text-red-600">
                Motif : {selected.rejectionReason}
              </div>
            )}
          </>
        )}
      </AdminDrawer>
    </AdminShell>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gray-100">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400">{label}</div>
        <div className="text-[13px] font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, format**

```bash
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend exec eslint src/app/admin/demandes-acces/page.tsx src/components/admin/admin-nav.ts
pnpm --filter frontend exec prettier --write src/app/admin/demandes-acces/page.tsx src/components/admin/admin-nav.ts
```

- [ ] **Step 4: Manual smoke test**

```bash
pnpm dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/demandes-acces
```

Expected: `200` (the page itself renders regardless of auth — the `GET /api/admin/access-requests` fetch inside it will 401/403 for an unauthenticated/non-SUPERADMIN visitor, which the page already handles via the `catch` → toast path, so no sensitive data leaks). To exercise the full approve/reject path locally, bootstrap a SUPERADMIN (`pnpm db:make-superadmin <email>`), log in at `/admin/connexion`, walk through a real request end to end. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/demandes-acces/page.tsx frontend/src/components/admin/admin-nav.ts
git commit -m "$(cat <<'EOF'
feat(admin): add /admin/demandes-acces SUPERADMIN review screen

Lists PENDING_REVIEW/APPROVED/REJECTED access requests with
Approuver/Rejeter actions. New nav entry after Paramètres.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

**Files:** none (verification only).

**Interfaces:** N/A.

- [ ] **Step 1: Full test suite**

```bash
pnpm test
```

Expected: every test passes, including all new `route.test.ts` files from Tasks 2–6, with no regressions in the pre-existing suite.

- [ ] **Step 2: Full quality gate**

```bash
pnpm format
pnpm lint
pnpm typecheck
```

Expected: all clean (per `CLAUDE.md`'s "Before committing" checklist).

- [ ] **Step 3: Build**

```bash
pnpm build
```

Expected: production build succeeds (catches any server/client boundary mistakes `tsc --noEmit` alone can miss, e.g. importing a server-only module from a `'use client'` file — none expected here, but this is the project's own gate).

- [ ] **Step 4: End-to-end manual walkthrough**

With `pnpm dev` running and a reachable database:

1. Visit `/admin/inscription`, submit the form with a fresh email.
2. Confirm the code-entry step appears; find the code (server log if no email provider configured, or the real inbox if `BREVO_API_KEY`/`UPSTASH_REDIS_REST_URL` are set).
3. Submit the code, confirm the "Demande envoyée" step.
4. `pnpm db:make-superadmin <your-email>` if you don't already have a SUPERADMIN locally; log in at `/admin/connexion`.
5. Visit `/admin/demandes-acces`, confirm the new request appears under "En attente".
6. Approve it; confirm it disappears from "En attente" and a `User` row now exists with `role=ADMIN` (check via `pnpm db:studio` or a quick `SELECT`).
7. Repeat steps 1–3 with a second email, then reject it from the drawer with a reason; confirm it appears under "Rejetées" with that reason visible.

- [ ] **Step 5: Update `STATUS.md`**

Append an entry to `.planning/banani/STATUS.md` (top of the file, same convention as every prior entry this session) documenting: route list, the two spec deviations (route namespace, dropped `verificationAttempts`), and that this is the first screen in the admin batch with a **real** backend (Prisma model + Route Handlers) rather than a static mockup.

- [ ] **Step 6: Final commit** (only if Step 5 produced uncommitted changes)

```bash
git add .planning/banani/STATUS.md
git commit -m "$(cat <<'EOF'
docs(status): admin inscription backend shipped

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
