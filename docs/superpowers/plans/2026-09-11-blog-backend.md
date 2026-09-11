# Blog Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static-data `/blog` page with a real backend: `BlogCategory`/`BlogArticle`/`NewsletterSubscriber` Prisma models, admin CRUD for categories/articles, public read endpoints (list/detail/tags/categories), a newsletter subscribe endpoint, and a rewritten `/blog` + new `/blog/[slug]` frontend wired to that API.

**Architecture:** Follows the existing starter conventions exactly: `requireAdmin('ADMIN')` + `verifyCsrf` + `enforceAdminRateLimit` + `logAdminAction` for every admin mutation, cursor pagination (`clampLimit`/`decodeCursor`/`buildPage`) for admin lists, page/limit pagination for public lists (mirrors `/api/public/listings`), `createEmailLimiter` for the newsletter's per-email rate limit (mirrors `/api/auth/login`). Article HTML is sanitized server-side at write time (admin-authored, never re-sanitized at read time). Slugs reuse the existing `slugify`/`ensureUniqueSlug` helper.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), new dependency `sanitize-html` (+ `@types/sanitize-html`).

**Spec:** [docs/superpowers/specs/2026-09-11-blog-backend-design.md](../specs/2026-09-11-blog-backend-design.md)

## Global Constraints

- Every Route Handler file MUST start with `export const runtime = 'nodejs';` (CI tripwire in `frontend/src/lib/server/observability/runtime-enforcement.test.ts` fails otherwise).
- Every admin mutation MUST call `logAdminAction(prisma, {...})` — no bypassing.
- Every admin route MUST call `requireAdmin('ADMIN')` then `enforceAdminRateLimit(auth.admin.id)` before touching the DB; every admin mutation MUST call `verifyCsrf(req)` first.
- Public GET routes never return `DRAFT`/`ARCHIVED` articles and never 400 on malformed query params (best-effort parsing, same as `/api/public/listings`).
- `contentHtml` is sanitized server-side on every admin write (create + update) — never trust the admin's raw HTML unsanitized, and never re-sanitize on read.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — build optional Prisma `data`/create payloads by spreading conditionally (`...(x !== undefined && { x })`), never assign `undefined` directly to an optional field.
- Do NOT modify any file in CLAUDE.md's "Files Claude must NOT modify" list (`middleware/index.ts`, `admin/audit.ts`, `rate-limit-by-email.ts`, `slug.ts`, etc.) — only import/consume them.
- Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` before the final commit of this plan.

---

## File Structure

```
frontend/prisma/schema.prisma                                   (modify — 3 new models)
frontend/package.json                                            (modify — add sanitize-html deps)

frontend/src/lib/server/blog/sanitize.ts                         (new)
frontend/src/lib/server/blog/sanitize.test.ts                    (new)
frontend/src/lib/server/blog/read-time.ts                        (new)
frontend/src/lib/server/blog/read-time.test.ts                   (new)

frontend/src/app/api/admin/blog/categories/route.ts               (new — GET, POST)
frontend/src/app/api/admin/blog/categories/route.test.ts          (new)
frontend/src/app/api/admin/blog/categories/[id]/route.ts          (new — PATCH, DELETE)
frontend/src/app/api/admin/blog/categories/[id]/route.test.ts     (new)
frontend/src/app/api/admin/blog/articles/route.ts                 (new — GET, POST)
frontend/src/app/api/admin/blog/articles/route.test.ts            (new)
frontend/src/app/api/admin/blog/articles/[id]/route.ts            (new — GET, PATCH, DELETE)
frontend/src/app/api/admin/blog/articles/[id]/route.test.ts       (new)

frontend/src/app/api/public/blog/categories/route.ts               (new — GET)
frontend/src/app/api/public/blog/categories/route.test.ts          (new)
frontend/src/app/api/public/blog/articles/route.ts                 (new — GET)
frontend/src/app/api/public/blog/articles/route.test.ts            (new)
frontend/src/app/api/public/blog/articles/[slug]/route.ts          (new — GET)
frontend/src/app/api/public/blog/articles/[slug]/route.test.ts     (new)
frontend/src/app/api/public/blog/tags/route.ts                     (new — GET)
frontend/src/app/api/public/blog/tags/route.test.ts                (new)
frontend/src/app/api/public/newsletter/route.ts                    (new — POST)
frontend/src/app/api/public/newsletter/route.test.ts               (new)

frontend/src/app/blog/page.tsx                                     (modify — rewrite, real data)
frontend/src/app/blog/[slug]/page.tsx                               (new — article detail)
```

---

### Task 1: Prisma schema — `BlogCategory`, `BlogArticle`, `NewsletterSubscriber`

**Files:**
- Modify: `frontend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `BlogCategory { id, slug, label, colorKey, position, createdAt, updatedAt, articles }`, `BlogArticle { id, slug, title, excerpt, contentHtml, coverImageUrl, categoryId, category, tags, authorName, authorRole, authorAvatarUrl, status, isFeatured, readTimeMinutes, viewCount, publishedAt, createdAt, updatedAt }`, `NewsletterSubscriber { id, email, status, createdAt, unsubscribedAt }` — every later task's Prisma calls (`prisma.blogCategory.*`, `prisma.blogArticle.*`, `prisma.newsletterSubscriber.*`) depend on these existing after `prisma generate`.

- [ ] **Step 1: Append the three models to the schema**

Add this block at the end of `frontend/prisma/schema.prisma` (after the closing `}` of `AdminAccessRequest`):

```prisma
// ───────────────────────────────────────────────────────────────────────
// Blog — public "/blog" page backend. Categories are admin-managed;
// articles are authored by admins only (no separate editorial role) with
// a free-text byline (authorName/Role/AvatarUrl are NOT a User relation —
// an article may be signed by an external expert with no login account).
// contentHtml is sanitized server-side at write time (see
// lib/server/blog/sanitize.ts) — never re-sanitized on read.
// ───────────────────────────────────────────────────────────────────────
model BlogCategory {
  id        String   @id @default(cuid())
  slug      String   @unique
  label     String
  colorKey  String   @default("brand") // brand | green | amber | violet | red
  position  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  articles BlogArticle[]

  @@index([position])
}

model BlogArticle {
  id          String @id @default(cuid())
  slug        String @unique
  title       String
  excerpt     String
  contentHtml String

  coverImageUrl String?

  categoryId String
  category   BlogCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  tags Json @default("[]") // string[]

  // Editorial byline — free text, not a User relation (see header comment).
  authorName      String
  authorRole      String?
  authorAvatarUrl String?

  status     String  @default("DRAFT") // DRAFT | PUBLISHED | ARCHIVED
  isFeatured Boolean @default(false)

  // Computed server-side from contentHtml word count (~200 wpm), min 1.
  readTimeMinutes Int @default(1)
  viewCount       Int @default(0)

  // Posed the first time status transitions to PUBLISHED; never reset by
  // later edits (preserves the original publish date).
  publishedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, publishedAt])
  @@index([categoryId])
  @@index([isFeatured])
}

// Public "/blog" sidebar newsletter form. Standalone — no relation to
// User (subscription is by email, not tied to an account).
model NewsletterSubscriber {
  id             String    @id @default(cuid())
  email          String    @unique
  status         String    @default("ACTIVE") // ACTIVE | UNSUBSCRIBED
  createdAt      DateTime  @default(now())
  unsubscribedAt DateTime?

  @@index([status])
}
```

- [ ] **Step 2: Validate the schema**

Run: `pnpm --filter frontend exec prisma format && pnpm --filter frontend exec prisma validate`
Expected: both commands exit 0 with no output beyond the formatted file confirmation.

- [ ] **Step 3: Create and apply the migration**

Run: `pnpm db:migrate:dev --name add_blog_models`

If this fails with a Neon quota/connection error, retry against the local
Postgres override documented in this repo's setup (localhost:5433) — read
`frontend/.env.local` for the exact local connection string first, then:
`DATABASE_URL="<local-connection-string-from-.env.local>" pnpm db:migrate:dev --name add_blog_models`
(PowerShell: `$env:DATABASE_URL="..."; pnpm db:migrate:dev --name add_blog_models`).

Expected: a new folder under `frontend/prisma/migrations/` containing
`add_blog_models`, and the command reports the migration applied
successfully. `prisma generate` runs automatically as part of `migrate dev`
— confirm `frontend/node_modules/.prisma/client/index.d.ts` now mentions
`BlogArticle`/`BlogCategory`/`NewsletterSubscriber` (e.g.
`grep -c BlogArticle frontend/node_modules/.prisma/client/index.d.ts`
returns a non-zero count).

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(blog): add BlogCategory, BlogArticle, NewsletterSubscriber models"
```

---

### Task 2: Install `sanitize-html` and write the article HTML sanitizer

**Files:**
- Modify: `frontend/package.json` (new dependency)
- Create: `frontend/src/lib/server/blog/sanitize.ts`
- Test: `frontend/src/lib/server/blog/sanitize.test.ts`

**Interfaces:**
- Produces: `sanitizeArticleHtml(html: string): string` — called by Task 6 (admin articles POST) and Task 7 (admin articles PATCH) before every `contentHtml` write.

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter frontend add sanitize-html` then `pnpm --filter frontend add -D @types/sanitize-html`
Expected: both commands exit 0; `frontend/package.json` gains `sanitize-html` under `dependencies` and `@types/sanitize-html` under `devDependencies`.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/server/blog/sanitize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeArticleHtml } from './sanitize';

describe('sanitizeArticleHtml', () => {
  it('keeps whitelisted formatting tags', () => {
    const input = '<p>Bonjour <strong>le monde</strong> et <em>vous</em>.</p>';
    expect(sanitizeArticleHtml(input)).toBe(input);
  });

  it('strips script tags entirely, including their content', () => {
    const input = '<p>Texte</p><script>alert("xss")</script>';
    expect(sanitizeArticleHtml(input)).toBe('<p>Texte</p>');
  });

  it('strips on* event handler attributes', () => {
    const input = '<p onclick="alert(1)">Texte</p>';
    expect(sanitizeArticleHtml(input)).toBe('<p>Texte</p>');
  });

  it('strips disallowed tags like iframe and style but keeps their text', () => {
    const input = '<iframe src="https://evil.example"></iframe><p>Safe</p>';
    expect(sanitizeArticleHtml(input)).toBe('<p>Safe</p>');
  });

  it('keeps safe links and forces rel="noopener noreferrer"', () => {
    const input = '<a href="https://example.com" target="_blank">Lien</a>';
    const out = sanitizeArticleHtml(input);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('drops javascript: URLs from links', () => {
    const input = '<a href="javascript:alert(1)">Clique</a>';
    const out = sanitizeArticleHtml(input);
    expect(out).not.toContain('javascript:');
  });

  it('keeps images with src and alt', () => {
    const input = '<img src="https://example.com/photo.jpg" alt="Photo" />';
    const out = sanitizeArticleHtml(input);
    expect(out).toContain('src="https://example.com/photo.jpg"');
    expect(out).toContain('alt="Photo"');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/blog/sanitize.test.ts`
Expected: FAIL — `Cannot find module './sanitize'` (file does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `frontend/src/lib/server/blog/sanitize.ts`:

```typescript
// Sanitizes admin-authored article HTML before it is ever written to
// BlogArticle.contentHtml. Only admins can write this field (no public
// write path exists), but we sanitize anyway: a compromised admin
// session, a pasted snippet with tracking scripts, or a future editorial
// role should never be able to stash a stored-XSS payload that every
// public /blog/[slug] visitor then executes. Sanitized ONCE at write
// time — the stored value is trusted and rendered as-is on read.
import 'server-only';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'blockquote',
  'img',
  'br',
  'code',
  'pre',
  'figure',
  'figcaption',
];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/blog/sanitize.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/lib/server/blog/sanitize.ts frontend/src/lib/server/blog/sanitize.test.ts
git commit -m "feat(blog): add sanitize-html dependency and article HTML sanitizer"
```

---

### Task 3: Read-time calculator

**Files:**
- Create: `frontend/src/lib/server/blog/read-time.ts`
- Test: `frontend/src/lib/server/blog/read-time.test.ts`

**Interfaces:**
- Produces: `computeReadTimeMinutes(html: string): number` — called by Task 6 (admin articles POST) and Task 7 (admin articles PATCH) whenever `contentHtml` is set.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/blog/read-time.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeReadTimeMinutes } from './read-time';

describe('computeReadTimeMinutes', () => {
  it('returns 1 for empty or whitespace-only content', () => {
    expect(computeReadTimeMinutes('')).toBe(1);
    expect(computeReadTimeMinutes('<p>   </p>')).toBe(1);
  });

  it('strips HTML tags before counting words', () => {
    const html = '<p>' + 'mot '.repeat(200) + '</p>';
    expect(computeReadTimeMinutes(html)).toBe(1);
  });

  it('rounds up to the nearest minute at 200 words per minute', () => {
    const html = 'mot '.repeat(450); // 450 / 200 = 2.25 -> ceil -> 3
    expect(computeReadTimeMinutes(html)).toBe(3);
  });

  it('never returns less than 1 even for a single word', () => {
    expect(computeReadTimeMinutes('Bonjour')).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/blog/read-time.test.ts`
Expected: FAIL — `Cannot find module './read-time'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/server/blog/read-time.ts`:

```typescript
// Deterministic read-time estimate for a BlogArticle — computed server-side
// so the admin never has to guess/enter it manually. Strips HTML tags,
// counts whitespace-separated words, divides by 200 wpm, rounds up,
// floors at 1 minute.
const WORDS_PER_MINUTE = 200;

export function computeReadTimeMinutes(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return 1;
  const wordCount = text.split(' ').length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/blog/read-time.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/blog/read-time.ts frontend/src/lib/server/blog/read-time.test.ts
git commit -m "feat(blog): add server-side read-time calculator"
```

---

### Task 4: Admin categories collection — `GET`/`POST /api/admin/blog/categories`

**Files:**
- Create: `frontend/src/app/api/admin/blog/categories/route.ts`
- Test: `frontend/src/app/api/admin/blog/categories/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `enforceAdminRateLimit(adminId)`, `logAdminAction(prisma, input)`, `verifyCsrf(req)`, `slugify(input)`/`ensureUniqueSlug(base, create)` from `@/lib/server/slug`.
- Produces: `GET` response `{ categories: { id, slug, label, colorKey, position, articleCount }[] }`; `POST` response `{ category: { id, slug, label, colorKey, position, articleCount } }` (201) — consumed by Task 5's category detail route and the admin UI (out of scope here, API only).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/admin/blog/categories/route.test.ts`:

```typescript
// ADMIN-BLOG-CATEGORIES-01 — GET + POST /api/admin/blog/categories tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET, POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/blog/categories');
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/blog/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogCategory.findMany.mockResolvedValue([
    { id: 'cat_1', slug: 'marche', label: 'Marché', colorKey: 'brand', position: 0, _count: { articles: 3 } },
  ] as never);
  prismaMock.blogCategory.create.mockResolvedValue({
    id: 'cat_2',
    slug: 'conseils',
    label: 'Conseils',
    colorKey: 'green',
    position: 1,
  } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/blog/categories', () => {
  it('returns categories with articleCount derived from _count', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: { slug: string; articleCount: number }[] };
    expect(body.categories).toEqual([
      { id: 'cat_1', slug: 'marche', label: 'Marché', colorKey: 'brand', position: 0, articleCount: 3 },
    ]);
  });

  it('propagates a non-admin response without querying the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.blogCategory.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/blog/categories', () => {
  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ label: '' }));
    expect(res.status).toBe(400);
  });

  it('creates a category with an auto-generated slug and logs an admin action', async () => {
    const res = await POST(makePost({ label: 'Conseils', colorKey: 'green', position: 1 }));
    expect(res.status).toBe(201);
    expect(prismaMock.blogCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'conseils', label: 'Conseils', colorKey: 'green', position: 1 }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'blog_category.create', targetId: 'cat_2' }),
      }),
    );
  });

  it('defaults colorKey to brand and position to 0 when omitted', async () => {
    await POST(makePost({ label: 'Juridique' }));
    expect(prismaMock.blogCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ colorKey: 'brand', position: 0 }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/blog/categories/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/admin/blog/categories/route.ts`:

```typescript
// ADMIN-BLOG-CATEGORIES-01 — GET + POST /api/admin/blog/categories
//
// GET: full category list (no pagination — expected to stay small,
// admin-curated) with a live articleCount via Prisma `_count`.
// POST: creates a category. `slug` is always derived from `label` via
// slugify/ensureUniqueSlug — never accepted from the client, so category
// URLs stay stable and collision-free.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const COLOR_KEYS = ['brand', 'green', 'amber', 'violet', 'red'] as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const rows = await prisma.blogCategory.findMany({
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        slug: true,
        label: true,
        colorKey: true,
        position: true,
        _count: { select: { articles: true } },
      },
    });

    const categories = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      label: r.label,
      colorKey: r.colorKey,
      position: r.position,
      articleCount: r._count.articles,
    }));

    return NextResponse.json({ categories }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const CreateBody = z.object({
  label: z.string().trim().min(1).max(120),
  colorKey: z.enum(COLOR_KEYS).default('brand'),
  position: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    let created!: { id: string; slug: string; label: string; colorKey: string; position: number };
    const base = slugify(data.label) || 'categorie';
    await ensureUniqueSlug(base, async (candidate) => {
      created = await prisma.blogCategory.create({
        data: { slug: candidate, label: data.label, colorKey: data.colorKey, position: data.position },
        select: { id: true, slug: true, label: true, colorKey: true, position: true },
      });
      return created;
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_category.create',
      targetType: 'BlogCategory',
      targetId: created.id,
      metadata: { label: created.label },
    });

    return NextResponse.json(
      { category: { ...created, articleCount: 0 } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/blog/categories/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/blog/categories/route.ts frontend/src/app/api/admin/blog/categories/route.test.ts
git commit -m "feat(blog): add admin blog categories list/create route"
```

---

### Task 5: Admin category detail — `PATCH`/`DELETE /api/admin/blog/categories/[id]`

**Files:**
- Create: `frontend/src/app/api/admin/blog/categories/[id]/route.ts`
- Test: `frontend/src/app/api/admin/blog/categories/[id]/route.test.ts`

**Interfaces:**
- Consumes: same middleware/audit helpers as Task 4.
- Produces: `PATCH` response `{ category: { id, slug, label, colorKey, position } }` (200); `DELETE` response `{ ok: true }` (200) or `{ error: 'CATEGORY_IN_USE' }` (409).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/admin/blog/categories/[id]/route.test.ts`:

```typescript
// ADMIN-BLOG-CATEGORIES-02 — PATCH + DELETE /api/admin/blog/categories/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { PATCH, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeReq(
  method: 'PATCH' | 'DELETE',
  id: string,
  body?: unknown,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/blog/categories/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogCategory.findUnique.mockResolvedValue({
    id: 'cat_1',
    slug: 'marche',
    label: 'Marché',
    colorKey: 'brand',
    position: 0,
  } as never);
  prismaMock.blogCategory.update.mockResolvedValue({
    id: 'cat_1',
    slug: 'marche',
    label: 'Marché immobilier',
    colorKey: 'brand',
    position: 0,
  } as never);
  prismaMock.blogArticle.count.mockResolvedValue(0 as never);
  prismaMock.blogCategory.delete.mockResolvedValue({ id: 'cat_1' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('PATCH /api/admin/blog/categories/[id]', () => {
  it('404s when the category does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('PATCH', 'missing', { label: 'X' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('updates the label and logs an admin action', async () => {
    const { req, ctx } = makeReq('PATCH', 'cat_1', { label: 'Marché immobilier' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.blogCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cat_1' }, data: { label: 'Marché immobilier' } }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_category.update' }) }),
    );
  });
});

describe('DELETE /api/admin/blog/categories/[id]', () => {
  it('404s when the category does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('DELETE', 'missing');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('409s when the category still has articles', async () => {
    prismaMock.blogArticle.count.mockResolvedValueOnce(2 as never);
    const { req, ctx } = makeReq('DELETE', 'cat_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(409);
    expect(prismaMock.blogCategory.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused category and logs an admin action', async () => {
    const { req, ctx } = makeReq('DELETE', 'cat_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.blogCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat_1' } });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_category.delete' }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/blog/categories/[id]/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/admin/blog/categories/[id]/route.ts`:

```typescript
// ADMIN-BLOG-CATEGORIES-02 — PATCH + DELETE /api/admin/blog/categories/[id]
//
// PATCH edits label/colorKey/position only — slug is immutable once
// created (it's the stable public URL segment via BlogArticle.category,
// same rationale as Organization.slug).
// DELETE is refused (409) while any BlogArticle still references the
// category — checked explicitly with a count() rather than relying on
// the Prisma `Restrict` FK error, so the response body stays a clean,
// documented error code instead of a raw P2003.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const COLOR_KEYS = ['brand', 'green', 'amber', 'violet', 'red'] as const;

const UpdateBody = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  colorKey: z.enum(COLOR_KEYS).optional(),
  position: z.number().int().min(0).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = UpdateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.blogCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const data = parsed.data;
    const updated = await prisma.blogCategory.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.colorKey !== undefined && { colorKey: data.colorKey }),
        ...(data.position !== undefined && { position: data.position }),
      },
      select: { id: true, slug: true, label: true, colorKey: true, position: true },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_category.update',
      targetType: 'BlogCategory',
      targetId: id,
      metadata: data,
    });

    return NextResponse.json({ category: updated }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.blogCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const articleCount = await prisma.blogArticle.count({ where: { categoryId: id } });
    if (articleCount > 0) {
      return NextResponse.json(
        { error: 'CATEGORY_IN_USE', message: 'Category still has articles attached' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.blogCategory.delete({ where: { id } });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_category.delete',
      targetType: 'BlogCategory',
      targetId: id,
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/blog/categories/[id]/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/admin/blog/categories/[id]/route.ts" "frontend/src/app/api/admin/blog/categories/[id]/route.test.ts"
git commit -m "feat(blog): add admin blog category edit/delete route"
```

---

### Task 6: Admin articles collection — `GET`/`POST /api/admin/blog/articles`

**Files:**
- Create: `frontend/src/app/api/admin/blog/articles/route.ts`
- Test: `frontend/src/app/api/admin/blog/articles/route.test.ts`

**Interfaces:**
- Consumes: `clampLimit`/`decodeCursor`/`cursorWhere`/`buildPage` from `@/lib/server/pagination/paginate`, `sanitizeArticleHtml` (Task 2), `computeReadTimeMinutes` (Task 3), `slugify`/`ensureUniqueSlug`.
- Produces: `GET` response `{ items: AdminArticleListItem[], nextCursor: string | null, total: number }` where `AdminArticleListItem = { id, slug, title, excerpt, coverImageUrl, status, isFeatured, viewCount, readTimeMinutes, publishedAt, createdAt, authorName, category: { id, slug, label, colorKey } }`; `POST` response `{ article: AdminArticleListItem }` (201) — `id` is consumed by Task 7's detail route.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/admin/blog/articles/route.test.ts`:

```typescript
// ADMIN-BLOG-ARTICLES-01 — GET + POST /api/admin/blog/articles tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET, POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/blog/articles${qs}`);
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/blog/articles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const row = {
  id: 'art_1',
  slug: 'mon-article',
  title: 'Mon article',
  excerpt: 'Extrait',
  coverImageUrl: null,
  status: 'DRAFT',
  isFeatured: false,
  viewCount: 0,
  readTimeMinutes: 1,
  publishedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  authorName: 'Jean',
  category: { id: 'cat_1', slug: 'marche', label: 'Marché', colorKey: 'brand' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogArticle.findMany.mockResolvedValue([row] as never);
  prismaMock.blogArticle.count.mockResolvedValue(1 as never);
  prismaMock.blogCategory.findUnique.mockResolvedValue({ id: 'cat_1' } as never);
  prismaMock.blogArticle.create.mockResolvedValue(row as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/blog/articles', () => {
  it('returns items, nextCursor and total', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; total: number };
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('filters by status and categoryId', async () => {
    await GET(makeGet('?status=PUBLISHED&categoryId=cat_1'));
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED', categoryId: 'cat_1' }),
      }),
    );
  });
});

const validCreate = {
  title: 'Nouvel article',
  excerpt: 'Un extrait suffisamment long',
  contentHtml: '<p>Contenu de test avec plusieurs mots pour le calcul du temps de lecture.</p>',
  categoryId: 'cat_1',
  authorName: 'Jean',
};

describe('POST /api/admin/blog/articles', () => {
  it('400s on an invalid body', async () => {
    const res = await POST(makePost({ title: '' }));
    expect(res.status).toBe(400);
  });

  it('400s when categoryId does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost(validCreate));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CATEGORY_NOT_FOUND');
  });

  it('creates an article, sanitizes contentHtml, computes readTimeMinutes, and logs an admin action', async () => {
    const res = await POST(makePost(validCreate));
    expect(res.status).toBe(201);
    expect(prismaMock.blogArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Nouvel article',
          categoryId: 'cat_1',
          status: 'DRAFT',
          publishedAt: null,
        }),
      }),
    );
    const call = prismaMock.blogArticle.create.mock.calls[0]?.[0] as { data: { contentHtml: string; readTimeMinutes: number } };
    expect(call.data.contentHtml).not.toContain('<script>');
    expect(call.data.readTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_article.create' }) }),
    );
  });

  it('sets publishedAt when status is PUBLISHED', async () => {
    await POST(makePost({ ...validCreate, status: 'PUBLISHED' }));
    const call = prismaMock.blogArticle.create.mock.calls[0]?.[0] as { data: { publishedAt: Date | null } };
    expect(call.data.publishedAt).toBeInstanceOf(Date);
  });

  it('propagates a non-admin response without querying the DB', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost(validCreate));
    expect(res.status).toBe(403);
    expect(prismaMock.blogArticle.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/blog/articles/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/admin/blog/articles/route.ts`:

```typescript
// ADMIN-BLOG-ARTICLES-01 — GET + POST /api/admin/blog/articles
//
// GET: cursor-paginated list for the (future) admin UI, filters
// status/categoryId/q. Mirrors GET /api/admin/property-requests.
// POST: creates an article. slug is auto-derived from title (never
// client-supplied). contentHtml is sanitized and readTimeMinutes is
// computed server-side on every write — the admin never sets either
// directly. publishedAt is set only when status is created as PUBLISHED.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { slugify, ensureUniqueSlug } from '@/lib/server/slug';
import { sanitizeArticleHtml } from '@/lib/server/blog/sanitize';
import { computeReadTimeMinutes } from '@/lib/server/blog/read-time';
import { clampLimit, cursorWhere, decodeCursor, buildPage } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const Q_MAX = 200;

const ARTICLE_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  status: true,
  isFeatured: true,
  viewCount: true,
  readTimeMinutes: true,
  publishedAt: true,
  createdAt: true,
  authorName: true,
  category: { select: { id: true, slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const sp = req.nextUrl.searchParams;
    const limit = clampLimit(sp.get('limit'));
    const cursor = decodeCursor(sp.get('cursor'));
    const status = sp.get('status');
    const categoryId = sp.get('categoryId');
    const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();

    const filterWhere: Prisma.BlogArticleWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const where: Prisma.BlogArticleWhereInput = cursor
      ? { AND: [filterWhere, cursorWhere(cursor)] }
      : filterWhere;

    const [rows, total] = await Promise.all([
      prisma.blogArticle.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: ARTICLE_LIST_SELECT,
      }),
      prisma.blogArticle.count({ where: filterWhere }),
    ]);

    const page = buildPage(rows as { id: string; createdAt: Date }[], limit);
    return NextResponse.json(
      { items: page.items, nextCursor: page.nextCursor, total },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(400),
  contentHtml: z.string().trim().min(1).max(50_000),
  categoryId: z.string().trim().min(1),
  coverImageUrl: z.string().trim().url().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  authorName: z.string().trim().min(1).max(120),
  authorRole: z.string().trim().max(120).optional(),
  authorAvatarUrl: z.string().trim().url().max(500).optional(),
  status: z.enum(STATUSES).default('DRAFT'),
  isFeatured: z.boolean().default(false),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const data = parsed.data;

    const category = await prisma.blogCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json(
        { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const contentHtml = sanitizeArticleHtml(data.contentHtml);
    const readTimeMinutes = computeReadTimeMinutes(contentHtml);
    const publishedAt = data.status === 'PUBLISHED' ? new Date() : null;

    let created!: Prisma.BlogArticleGetPayload<{ select: typeof ARTICLE_LIST_SELECT }>;
    const base = slugify(data.title) || 'article';
    await ensureUniqueSlug(base, async (candidate) => {
      created = await prisma.blogArticle.create({
        data: {
          slug: candidate,
          title: data.title,
          excerpt: data.excerpt,
          contentHtml,
          categoryId: data.categoryId,
          tags: data.tags,
          authorName: data.authorName,
          ...(data.coverImageUrl !== undefined && { coverImageUrl: data.coverImageUrl }),
          ...(data.authorRole !== undefined && { authorRole: data.authorRole }),
          ...(data.authorAvatarUrl !== undefined && { authorAvatarUrl: data.authorAvatarUrl }),
          status: data.status,
          isFeatured: data.isFeatured,
          readTimeMinutes,
          publishedAt,
        },
        select: ARTICLE_LIST_SELECT,
      });
      return created;
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_article.create',
      targetType: 'BlogArticle',
      targetId: created.id,
      metadata: { title: created.title, status: created.status },
    });

    return NextResponse.json(
      { article: created },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/blog/articles/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/blog/articles/route.ts frontend/src/app/api/admin/blog/articles/route.test.ts
git commit -m "feat(blog): add admin blog articles list/create route"
```

---

### Task 7: Admin article detail — `GET`/`PATCH`/`DELETE /api/admin/blog/articles/[id]`

**Files:**
- Create: `frontend/src/app/api/admin/blog/articles/[id]/route.ts`
- Test: `frontend/src/app/api/admin/blog/articles/[id]/route.test.ts`

**Interfaces:**
- Consumes: same helpers as Task 6, plus reads existing `status`/`publishedAt`/`categoryId` before applying an update.
- Produces: `GET` response `{ article: FullArticle }` where `FullArticle` extends Task 6's list item with `contentHtml`, `tags: string[]`, `authorRole`, `authorAvatarUrl`; `PATCH` response `{ article: FullArticle }`; `DELETE` response `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/admin/blog/articles/[id]/route.test.ts`:

```typescript
// ADMIN-BLOG-ARTICLES-02 — GET + PATCH + DELETE /api/admin/blog/articles/[id] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET, PATCH, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeReq(
  method: 'GET' | 'PATCH' | 'DELETE',
  id: string,
  body?: unknown,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/admin/blog/articles/${id}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

const existingArticle = {
  id: 'art_1',
  slug: 'mon-article',
  title: 'Mon article',
  excerpt: 'Extrait',
  contentHtml: '<p>Contenu</p>',
  coverImageUrl: null,
  tags: ['Cocody'],
  authorName: 'Jean',
  authorRole: null,
  authorAvatarUrl: null,
  status: 'DRAFT',
  isFeatured: false,
  viewCount: 0,
  readTimeMinutes: 1,
  publishedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  categoryId: 'cat_1',
  category: { id: 'cat_1', slug: 'marche', label: 'Marché', colorKey: 'brand' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  prismaMock.blogArticle.findUnique.mockResolvedValue(existingArticle as never);
  prismaMock.blogArticle.update.mockResolvedValue({ ...existingArticle, title: 'Titre modifié' } as never);
  prismaMock.blogArticle.delete.mockResolvedValue({ id: 'art_1' } as never);
  prismaMock.adminAction.create.mockResolvedValue({} as never);
});

describe('GET /api/admin/blog/articles/[id]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('GET', 'missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns the full article including contentHtml', async () => {
    const { req, ctx } = makeReq('GET', 'art_1');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { article: { contentHtml: string } };
    expect(body.article.contentHtml).toBe('<p>Contenu</p>');
  });
});

describe('PATCH /api/admin/blog/articles/[id]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('PATCH', 'missing', { title: 'X' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('400s when categoryId does not exist', async () => {
    prismaMock.blogCategory.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('PATCH', 'art_1', { categoryId: 'ghost' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('sanitizes contentHtml and recomputes readTimeMinutes when contentHtml is updated', async () => {
    const { req, ctx } = makeReq('PATCH', 'art_1', {
      contentHtml: '<p>Nouveau</p><script>alert(1)</script>',
    });
    await PATCH(req, ctx);
    const call = prismaMock.blogArticle.update.mock.calls[0]?.[0] as {
      data: { contentHtml?: string; readTimeMinutes?: number };
    };
    expect(call.data.contentHtml).not.toContain('<script>');
    expect(call.data.readTimeMinutes).toBeGreaterThanOrEqual(1);
  });

  it('sets publishedAt only the first time status becomes PUBLISHED', async () => {
    const { req, ctx } = makeReq('PATCH', 'art_1', { status: 'PUBLISHED' });
    await PATCH(req, ctx);
    const call = prismaMock.blogArticle.update.mock.calls[0]?.[0] as { data: { publishedAt?: Date } };
    expect(call.data.publishedAt).toBeInstanceOf(Date);
  });

  it('does not touch publishedAt when the article is already published', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce({
      ...existingArticle,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-01T00:00:00Z'),
    } as never);
    const { req, ctx } = makeReq('PATCH', 'art_1', { title: 'Titre modifié' });
    await PATCH(req, ctx);
    const call = prismaMock.blogArticle.update.mock.calls[0]?.[0] as { data: { publishedAt?: Date } };
    expect(call.data.publishedAt).toBeUndefined();
  });

  it('logs an admin action on update', async () => {
    const { req, ctx } = makeReq('PATCH', 'art_1', { title: 'Titre modifié' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_article.update' }) }),
    );
  });
});

describe('DELETE /api/admin/blog/articles/[id]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeReq('DELETE', 'missing');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('deletes the article and logs an admin action', async () => {
    const { req, ctx } = makeReq('DELETE', 'art_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.blogArticle.delete).toHaveBeenCalledWith({ where: { id: 'art_1' } });
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'blog_article.delete' }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/blog/articles/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/admin/blog/articles/[id]/route.ts`:

```typescript
// ADMIN-BLOG-ARTICLES-02 — GET + PATCH + DELETE /api/admin/blog/articles/[id]
//
// GET: full detail (contentHtml included) for admin re-editing.
// PATCH: partial update. slug is never editable (stable public URL).
// contentHtml, when provided, is re-sanitized and readTimeMinutes is
// recomputed. publishedAt is set ONLY the first time status becomes
// PUBLISHED (existing.publishedAt is still null) — later edits never
// reset the original publish date, even if status flips away and back.
// DELETE: hard delete, audited.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { sanitizeArticleHtml } from '@/lib/server/blog/sanitize';
import { computeReadTimeMinutes } from '@/lib/server/blog/read-time';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

const ARTICLE_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  contentHtml: true,
  coverImageUrl: true,
  tags: true,
  authorName: true,
  authorRole: true,
  authorAvatarUrl: true,
  status: true,
  isFeatured: true,
  viewCount: true,
  readTimeMinutes: true,
  publishedAt: true,
  createdAt: true,
  categoryId: true,
  category: { select: { id: true, slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const article = await prisma.blogArticle.findUnique({ where: { id }, select: ARTICLE_DETAIL_SELECT });
    if (!article) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      { article: { ...article, tags: (article.tags as string[]) ?? [] } },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

const UpdateBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  excerpt: z.string().trim().min(1).max(400).optional(),
  contentHtml: z.string().trim().min(1).max(50_000).optional(),
  categoryId: z.string().trim().min(1).optional(),
  coverImageUrl: z.string().trim().url().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  authorName: z.string().trim().min(1).max(120).optional(),
  authorRole: z.string().trim().max(120).nullable().optional(),
  authorAvatarUrl: z.string().trim().url().max(500).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  isFeatured: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = UpdateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.blogArticle.findUnique({
      where: { id },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const data = parsed.data;

    if (data.categoryId !== undefined) {
      const category = await prisma.blogCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { error: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
          { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const contentHtml = data.contentHtml !== undefined ? sanitizeArticleHtml(data.contentHtml) : undefined;
    const readTimeMinutes = contentHtml !== undefined ? computeReadTimeMinutes(contentHtml) : undefined;
    const publishedAt =
      data.status === 'PUBLISHED' && existing.publishedAt === null ? new Date() : undefined;

    const updated = await prisma.blogArticle.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.excerpt !== undefined && { excerpt: data.excerpt }),
        ...(contentHtml !== undefined && { contentHtml }),
        ...(readTimeMinutes !== undefined && { readTimeMinutes }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.coverImageUrl !== undefined && { coverImageUrl: data.coverImageUrl }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.authorName !== undefined && { authorName: data.authorName }),
        ...(data.authorRole !== undefined && { authorRole: data.authorRole }),
        ...(data.authorAvatarUrl !== undefined && { authorAvatarUrl: data.authorAvatarUrl }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.isFeatured !== undefined && { isFeatured: data.isFeatured }),
        ...(publishedAt !== undefined && { publishedAt }),
      },
      select: ARTICLE_DETAIL_SELECT,
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_article.update',
      targetType: 'BlogArticle',
      targetId: id,
      metadata: { from: existing.status, to: data.status ?? existing.status },
    });

    return NextResponse.json(
      { article: { ...updated, tags: (updated.tags as string[]) ?? [] } },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.blogArticle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.blogArticle.delete({ where: { id } });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'blog_article.delete',
      targetType: 'BlogArticle',
      targetId: id,
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/blog/articles/[id]/route.test.ts"`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/admin/blog/articles/[id]/route.ts" "frontend/src/app/api/admin/blog/articles/[id]/route.test.ts"
git commit -m "feat(blog): add admin blog article detail/edit/delete route"
```

---

### Task 8: Public categories — `GET /api/public/blog/categories`

**Files:**
- Create: `frontend/src/app/api/public/blog/categories/route.ts`
- Test: `frontend/src/app/api/public/blog/categories/route.test.ts`

**Interfaces:**
- Produces: `{ categories: { slug: string, label: string, colorKey: string, count: number }[] }` — consumed by Task 13's frontend rewrite for the category tab bar.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/public/blog/categories/route.test.ts`:

```typescript
// PUBLIC-BLOG-CATEGORIES-01 — GET /api/public/blog/categories tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/public/blog/categories');
}

beforeEach(() => {
  prismaMock.blogCategory.findMany.mockResolvedValue([
    { slug: 'marche', label: 'Marché', colorKey: 'brand', _count: { articles: 5 } },
    { slug: 'conseils', label: 'Conseils acheteurs', colorKey: 'green', _count: { articles: 2 } },
  ] as never);
});

describe('GET /api/public/blog/categories', () => {
  it('returns categories with published-article counts only', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: { slug: string; count: number }[] };
    expect(body.categories).toEqual([
      { slug: 'marche', label: 'Marché', colorKey: 'brand', count: 5 },
      { slug: 'conseils', label: 'Conseils acheteurs', colorKey: 'green', count: 2 },
    ]);
    expect(prismaMock.blogCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/blog/categories/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/public/blog/categories/route.ts`:

```typescript
// PUBLIC-BLOG-CATEGORIES-01 — GET /api/public/blog/categories
//
// Unauthenticated. `count` is the number of PUBLISHED articles in the
// category (never counts DRAFT/ARCHIVED) — the public /blog page's tab
// badges must never leak unpublished-content counts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rows = await prisma.blogCategory.findMany({
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
      select: {
        slug: true,
        label: true,
        colorKey: true,
        _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
      },
    });

    const categories = rows.map((r) => ({
      slug: r.slug,
      label: r.label,
      colorKey: r.colorKey,
      count: r._count.articles,
    }));

    return NextResponse.json({ categories }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/blog/categories/route.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/public/blog/categories/route.ts frontend/src/app/api/public/blog/categories/route.test.ts
git commit -m "feat(blog): add public blog categories route"
```

---

### Task 9: Public articles list — `GET /api/public/blog/articles`

**Files:**
- Create: `frontend/src/app/api/public/blog/articles/route.ts`
- Test: `frontend/src/app/api/public/blog/articles/route.test.ts`

**Interfaces:**
- Produces: `{ items: PublicArticleListItem[], featured: PublicArticleListItem | null, page, limit, total, totalPages }` where `PublicArticleListItem = { id, slug, title, excerpt, coverImageUrl, tags: string[], author: { name, role, avatarUrl }, category: { slug, label, colorKey }, readTimeMinutes, publishedAt, viewCount }` — consumed by Task 13 (list, grid, "populaires" sidebar via `?sort=popular`) and links to Task 10's detail route via `slug`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/public/blog/articles/route.test.ts`:

```typescript
// PUBLIC-BLOG-ARTICLES-01 — GET /api/public/blog/articles tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'art_1',
    slug: 'article-un',
    title: 'Article un',
    excerpt: 'Extrait',
    coverImageUrl: null,
    tags: ['Cocody'],
    authorName: 'Jean',
    authorRole: 'Expert',
    authorAvatarUrl: null,
    readTimeMinutes: 5,
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    viewCount: 10,
    category: { slug: 'marche', label: 'Marché', colorKey: 'brand' },
    ...overrides,
  };
}

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/public/blog/articles${qs}`);
}

beforeEach(() => {
  prismaMock.blogArticle.findMany.mockResolvedValue([makeRow()] as never);
  prismaMock.blogArticle.count.mockResolvedValue(1 as never);
  prismaMock.blogArticle.findFirst.mockResolvedValue(makeRow({ id: 'art_featured' }) as never);
});

describe('GET /api/public/blog/articles', () => {
  it('only queries status PUBLISHED', async () => {
    await GET(makeGet());
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('filters by category slug and search query', async () => {
    await GET(makeGet('?category=marche&q=cocody'));
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          category: { slug: 'marche' },
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('orders by viewCount desc when sort=popular', async () => {
    await GET(makeGet('?sort=popular'));
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ viewCount: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('orders by publishedAt desc by default', async () => {
    await GET(makeGet());
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('returns items, featured, and pagination metadata', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { slug: string }[];
      featured: { id: string } | null;
      total: number;
      totalPages: number;
    };
    expect(body.items).toHaveLength(1);
    expect(body.featured?.id).toBe('art_featured');
    expect(body.total).toBe(1);
    expect(body.totalPages).toBe(1);
  });

  it('never 400s on malformed query params', async () => {
    const res = await GET(makeGet('?page=not-a-number&limit=-5'));
    expect(res.status).toBe(200);
  });

  it('returns featured: null when no published article exists', async () => {
    prismaMock.blogArticle.findFirst.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet());
    const body = (await res.json()) as { featured: null };
    expect(body.featured).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/blog/articles/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/public/blog/articles/route.ts`:

```typescript
// PUBLIC-BLOG-ARTICLES-01 — GET /api/public/blog/articles
//
// Unauthenticated, read-only. Only PUBLISHED articles are ever returned.
// Query params are best-effort (mirrors GET /api/public/listings) —
// malformed input is silently ignored, never a 400, since this backs a
// public browse page.
//
// `sort=popular` also serves the "Articles populaires" sidebar
// (?sort=popular&limit=5) — same endpoint, no separate route needed.
//
// `featured` is the isFeatured=true PUBLISHED article most recently
// published, falling back to the most recently published article overall
// when none is flagged. It is never filtered by `category`/`q` — it's the
// fixed editorial hero slot, independent of the list's current filter.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DEFAULT_LIMIT = 7;
const MAX_LIMIT = 24;
const Q_MAX = 200;

function parsePage(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

const ARTICLE_PUBLIC_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImageUrl: true,
  tags: true,
  authorName: true,
  authorRole: true,
  authorAvatarUrl: true,
  readTimeMinutes: true,
  publishedAt: true,
  viewCount: true,
  category: { select: { slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

type ArticleRow = Prisma.BlogArticleGetPayload<{ select: typeof ARTICLE_PUBLIC_SELECT }>;

function mapArticle(r: ArticleRow) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverImageUrl: r.coverImageUrl,
    tags: (r.tags as string[]) ?? [],
    author: { name: r.authorName, role: r.authorRole, avatarUrl: r.authorAvatarUrl },
    category: r.category,
    readTimeMinutes: r.readTimeMinutes,
    publishedAt: r.publishedAt,
    viewCount: r.viewCount,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const sp = req.nextUrl.searchParams;
    const categorySlug = sp.get('category')?.trim() || undefined;
    const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim() || undefined;
    const page = parsePage(sp.get('page'));
    const limit = parseLimit(sp.get('limit'));
    const sort = sp.get('sort') === 'popular' ? 'popular' : 'recent';

    const where: Prisma.BlogArticleWhereInput = {
      status: 'PUBLISHED',
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.BlogArticleOrderByWithRelationInput[] =
      sort === 'popular' ? [{ viewCount: 'desc' }, { id: 'desc' }] : [{ publishedAt: 'desc' }, { id: 'desc' }];

    const [rows, total, featuredRow] = await Promise.all([
      prisma.blogArticle.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: ARTICLE_PUBLIC_SELECT,
      }),
      prisma.blogArticle.count({ where }),
      prisma.blogArticle.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        select: ARTICLE_PUBLIC_SELECT,
      }),
    ]);

    return NextResponse.json(
      {
        items: rows.map(mapArticle),
        featured: featuredRow ? mapArticle(featuredRow) : null,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/blog/articles/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/public/blog/articles/route.ts frontend/src/app/api/public/blog/articles/route.test.ts
git commit -m "feat(blog): add public blog articles list route"
```

---

### Task 10: Public article detail — `GET /api/public/blog/articles/[slug]`

**Files:**
- Create: `frontend/src/app/api/public/blog/articles/[slug]/route.ts`
- Test: `frontend/src/app/api/public/blog/articles/[slug]/route.test.ts`

**Interfaces:**
- Produces: `{ id, slug, title, excerpt, contentHtml, coverImageUrl, tags: string[], author: { name, role, avatarUrl }, category: { slug, label, colorKey }, readTimeMinutes, publishedAt, viewCount }` (200), or `{ error: 'ARTICLE_NOT_FOUND' }` (404) — consumed by Task 14's `/blog/[slug]` page.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/public/blog/articles/[slug]/route.test.ts`:

```typescript
// PUBLIC-BLOG-ARTICLE-DETAIL-01 — GET /api/public/blog/articles/[slug] tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(slug: string): { req: NextRequest; ctx: { params: Promise<{ slug: string }> } } {
  return {
    req: new NextRequest(`http://test/api/public/blog/articles/${slug}`),
    ctx: { params: Promise.resolve({ slug }) },
  };
}

const publishedArticle = {
  id: 'art_1',
  slug: 'mon-article',
  title: 'Mon article',
  excerpt: 'Extrait',
  contentHtml: '<p>Contenu</p>',
  coverImageUrl: null,
  tags: ['Cocody'],
  authorName: 'Jean',
  authorRole: 'Expert',
  authorAvatarUrl: null,
  readTimeMinutes: 5,
  publishedAt: new Date('2026-09-01T00:00:00Z'),
  viewCount: 10,
  status: 'PUBLISHED',
  category: { slug: 'marche', label: 'Marché', colorKey: 'brand' },
};

beforeEach(() => {
  prismaMock.blogArticle.findUnique.mockResolvedValue(publishedArticle as never);
  prismaMock.blogArticle.update.mockResolvedValue({ viewCount: 11 } as never);
});

describe('GET /api/public/blog/articles/[slug]', () => {
  it('404s when the article does not exist', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce(null as never);
    const { req, ctx } = makeGet('missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('404s when the article is DRAFT', async () => {
    prismaMock.blogArticle.findUnique.mockResolvedValueOnce({ ...publishedArticle, status: 'DRAFT' } as never);
    const { req, ctx } = makeGet('mon-article');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns the article with contentHtml and incremented viewCount', async () => {
    const { req, ctx } = makeGet('mon-article');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contentHtml: string; viewCount: number };
    expect(body.contentHtml).toBe('<p>Contenu</p>');
    expect(body.viewCount).toBe(11);
    expect(prismaMock.blogArticle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'mon-article' }, data: { viewCount: { increment: 1 } } }),
    );
  });

  it('still returns 200 when the viewCount increment throws', async () => {
    prismaMock.blogArticle.update.mockRejectedValueOnce(new Error('db down'));
    const { req, ctx } = makeGet('mon-article');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/public/blog/articles/[slug]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/public/blog/articles/[slug]/route.ts`:

```typescript
// PUBLIC-BLOG-ARTICLE-DETAIL-01 — GET /api/public/blog/articles/[slug]
//
// Unauthenticated. Only a PUBLISHED article is ever returned — 404 for
// DRAFT/ARCHIVED/missing, so this route never leaks unpublished content.
// Increments viewCount best-effort (mirrors GET /api/public/listings/[id]) —
// a lost increment under a race is an acceptable trade-off for a vanity
// counter.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const ARTICLE_DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  contentHtml: true,
  coverImageUrl: true,
  tags: true,
  authorName: true,
  authorRole: true,
  authorAvatarUrl: true,
  status: true,
  readTimeMinutes: true,
  publishedAt: true,
  viewCount: true,
  category: { select: { slug: true, label: true, colorKey: true } },
} as const satisfies Prisma.BlogArticleSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const { slug } = await ctx.params;

    const article = await prisma.blogArticle.findUnique({ where: { slug }, select: ARTICLE_DETAIL_SELECT });
    if (!article || article.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    let viewCount = article.viewCount;
    try {
      const updated = await prisma.blogArticle.update({
        where: { slug },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      });
      viewCount = updated.viewCount;
    } catch (err) {
      log.warn('blog-article-detail: viewCount increment failed', {
        slug,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json(
      {
        id: article.id,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        contentHtml: article.contentHtml,
        coverImageUrl: article.coverImageUrl,
        tags: (article.tags as string[]) ?? [],
        author: { name: article.authorName, role: article.authorRole, avatarUrl: article.authorAvatarUrl },
        category: article.category,
        readTimeMinutes: article.readTimeMinutes,
        publishedAt: article.publishedAt,
        viewCount,
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/public/blog/articles/[slug]/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/public/blog/articles/[slug]/route.ts" "frontend/src/app/api/public/blog/articles/[slug]/route.test.ts"
git commit -m "feat(blog): add public blog article detail route"
```

---

### Task 11: Public tags — `GET /api/public/blog/tags`

**Files:**
- Create: `frontend/src/app/api/public/blog/tags/route.ts`
- Test: `frontend/src/app/api/public/blog/tags/route.test.ts`

**Interfaces:**
- Produces: `{ tags: { tag: string, count: number }[] }` (top 12 by frequency) — consumed by Task 13's tag cloud.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/public/blog/tags/route.test.ts`:

```typescript
// PUBLIC-BLOG-TAGS-01 — GET /api/public/blog/tags tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/public/blog/tags');
}

beforeEach(() => {
  prismaMock.blogArticle.findMany.mockResolvedValue([
    { tags: ['Cocody', 'Marché'] },
    { tags: ['Cocody', 'Dakar'] },
    { tags: ['Cocody'] },
    { tags: [] },
  ] as never);
});

describe('GET /api/public/blog/tags', () => {
  it('only reads tags from PUBLISHED articles', async () => {
    await GET(makeGet());
    expect(prismaMock.blogArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });

  it('aggregates tag frequency across articles, sorted descending', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tags: { tag: string; count: number }[] };
    expect(body.tags[0]).toEqual({ tag: 'Cocody', count: 3 });
    expect(body.tags.map((t) => t.tag)).toContain('Marché');
    expect(body.tags.map((t) => t.tag)).toContain('Dakar');
  });

  it('caps the result at 12 tags', async () => {
    prismaMock.blogArticle.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({ tags: [`tag-${i}`] })) as never,
    );
    const res = await GET(makeGet());
    const body = (await res.json()) as { tags: unknown[] };
    expect(body.tags).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/blog/tags/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/public/blog/tags/route.ts`:

```typescript
// PUBLIC-BLOG-TAGS-01 — GET /api/public/blog/tags
//
// Unauthenticated. Aggregates `tags` (a Json string[] column) across every
// PUBLISHED article in memory — expected article volume is small enough
// that a dedicated BlogTag table would be premature (YAGNI).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const TOP_N = 12;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const rows = await prisma.blogArticle.findMany({
      where: { status: 'PUBLISHED' },
      select: { tags: true },
    });

    const freq = new Map<string, number>();
    for (const row of rows) {
      for (const raw of (row.tags as string[]) ?? []) {
        const tag = raw.trim();
        if (!tag) continue;
        freq.set(tag, (freq.get(tag) ?? 0) + 1);
      }
    }

    const tags = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([tag, count]) => ({ tag, count }));

    return NextResponse.json({ tags }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/blog/tags/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/public/blog/tags/route.ts frontend/src/app/api/public/blog/tags/route.test.ts
git commit -m "feat(blog): add public blog tags aggregation route"
```

---

### Task 12: Newsletter subscribe — `POST /api/public/newsletter`

**Files:**
- Create: `frontend/src/app/api/public/newsletter/route.ts`
- Test: `frontend/src/app/api/public/newsletter/route.test.ts`

**Interfaces:**
- Consumes: `createEmailLimiter` from `@/lib/server/middleware/rate-limit-by-email`, `redis` from `@/lib/server/redis`.
- Produces: `{ subscriber: { id, email, status } }` (201) — consumed by Task 13's newsletter form.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/public/newsletter/route.test.ts`:

```typescript
// PUBLIC-NEWSLETTER-01 — POST /api/public/newsletter tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

function makePost(body: unknown, opts: { ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip ?? `test-ip-${Math.random()}`,
  };
  return new NextRequest('http://test/api/public/newsletter', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  prismaMock.newsletterSubscriber.upsert.mockResolvedValue({
    id: 'sub_1',
    email: 'awa@example.com',
    status: 'ACTIVE',
  } as never);
});

describe('POST /api/public/newsletter', () => {
  it('400s on an invalid email', async () => {
    const res = await POST(makePost({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });

  it('upserts the subscriber and returns 201', async () => {
    const res = await POST(makePost({ email: 'awa@example.com' }));
    expect(res.status).toBe(201);
    expect(prismaMock.newsletterSubscriber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'awa@example.com' },
        create: { email: 'awa@example.com', status: 'ACTIVE' },
        update: { status: 'ACTIVE', unsubscribedAt: null },
      }),
    );
  });

  it('lowercases and trims the email before upserting', async () => {
    await POST(makePost({ email: '  AWA@Example.com  ' }));
    expect(prismaMock.newsletterSubscriber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'awa@example.com' } }),
    );
  });

  it('rejects a 6th request for the same email within the window', async () => {
    const email = `fixed-rl-${Math.random()}@example.com`;
    for (let i = 0; i < 5; i++) {
      const res = await POST(makePost({ email }, { ip: 'shared-ip' }));
      expect(res.status).toBe(201);
    }
    const res = await POST(makePost({ email }, { ip: 'shared-ip' }));
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/newsletter/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/public/newsletter/route.ts`:

```typescript
// PUBLIC-NEWSLETTER-01 — POST /api/public/newsletter
//
// Unauthenticated newsletter signup from the /blog sidebar. Idempotent
// upsert on email: re-subscribing an already-ACTIVE email is a no-op, and
// re-subscribing a previously UNSUBSCRIBED email flips it back to ACTIVE.
// Rate-limited per email (mirrors POST /api/auth/login's per-identifier
// limiter) rather than per-IP-only, since the identifying field (email)
// is known before the limiter check.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  email: z.string().trim().email().max(200),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'newsletter-subscribe',
  windowMs: 60 * 60 * 1000,
  max: 5,
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many requests. Try again later.',
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const email = parsed.data.email.trim().toLowerCase();

    const limited = await limiter.check(req, email);
    if (limited) return limited;

    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, status: 'ACTIVE' },
      update: { status: 'ACTIVE', unsubscribedAt: null },
      select: { id: true, email: true, status: true },
    });

    return NextResponse.json(
      { subscriber },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/public/newsletter/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/public/newsletter/route.ts frontend/src/app/api/public/newsletter/route.test.ts
git commit -m "feat(blog): add public newsletter subscribe route"
```

---

### Task 13: Rewrite `/blog` to consume the real API

**Files:**
- Modify: `frontend/src/app/blog/page.tsx`

**Interfaces:**
- Consumes: `GET /api/public/blog/categories` (Task 8), `GET /api/public/blog/articles` (Task 9, plus `?sort=popular&limit=5` for the sidebar), `GET /api/public/blog/tags` (Task 11), `POST /api/public/newsletter` (Task 12).

- [ ] **Step 1: Replace the file contents**

Replace the full contents of `frontend/src/app/blog/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Home,
  Loader2,
  Mail,
  Search,
  Send,
  Star,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { formatDate } from '@/lib/alerts';
import { cloudinaryOptimize } from '@/lib/listings';

interface Category {
  slug: string;
  label: string;
  colorKey: string;
  count: number;
}

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  tags: string[];
  author: { name: string; role: string | null; avatarUrl: string | null };
  category: { slug: string; label: string; colorKey: string };
  readTimeMinutes: number;
  publishedAt: string | null;
  viewCount: number;
}

interface ArticlesResponse {
  items: ArticleItem[];
  featured: ArticleItem | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TagItem {
  tag: string;
  count: number;
}

const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  brand: 'bg-brand/10 text-brand',
  green: 'bg-green-600/10 text-green-600',
  amber: 'bg-amber-500/10 text-amber-600',
  violet: 'bg-violet-500/10 text-violet-600',
  red: 'bg-red-500/10 text-red-600',
};

function categoryClasses(colorKey: string): string {
  return CATEGORY_COLOR_CLASSES[colorKey] ?? CATEGORY_COLOR_CLASSES['brand']!;
}

const PAGE_LIMIT = 7;

export default function BlogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [articles, setArticles] = useState<ArticlesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [popular, setPopular] = useState<ArticleItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterState, setNewsletterState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  useEffect(() => {
    api<{ categories: Category[] }>('/api/public/blog/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
    api<{ tags: TagItem[] }>('/api/public/blog/tags')
      .then((res) => setTags(res.tags))
      .catch(() => setTags([]));
    api<ArticlesResponse>('/api/public/blog/articles?sort=popular&limit=5')
      .then((res) => setPopular(res.items))
      .catch(() => setPopular([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (categorySlug) params.set('category', categorySlug);
    if (query) params.set('q', query);
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));

    api<ArticlesResponse>(`/api/public/blog/articles?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setArticles(res);
      })
      .catch(() => {
        if (cancelled) return;
        setArticles(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug, query, page]);

  function selectCategory(slug: string) {
    setCategorySlug(slug);
    setPage(1);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
    setPage(1);
  }

  function selectTag(tag: string) {
    setSearchInput(tag);
    setQuery(tag);
    setPage(1);
  }

  async function submitNewsletter(e: React.FormEvent) {
    e.preventDefault();
    setNewsletterState('sending');
    try {
      await api('/api/public/newsletter', { method: 'POST', body: { email: newsletterEmail } });
      setNewsletterState('sent');
      setNewsletterEmail('');
    } catch (err) {
      setNewsletterState('error');
      void err;
    }
  }

  const totalArticles = categories.reduce((sum, c) => sum + c.count, 0);
  const grid = articles?.items.slice(0, 3) ?? [];
  const list = articles?.items.slice(3) ?? [];
  const totalPages = articles?.totalPages ?? 1;
  const featured = articles?.featured ?? null;

  return (
    <div className="bg-white text-neutral-900">
      <PublicNavbar active="blog" />

      {/* HERO */}
      <section
        className="relative overflow-hidden px-4 py-14 text-center lg:px-7 lg:py-16"
        style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 50%, #0F172A 100%)' }}
      >
        <div className="pointer-events-none absolute -top-[180px] -right-20 h-[500px] w-[500px] rounded-full bg-white/5" />
        <div className="relative z-[1] mx-auto max-w-[1280px]">
          <div className="mb-4.5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold tracking-[0.12em] whitespace-nowrap text-white/90 uppercase">
            <BookOpen className="h-3 w-3" aria-hidden />
            Blog &amp; Actualités
          </div>
          <h1 className="font-sora mx-auto mb-3.5 max-w-[720px] text-[28px] leading-[1.1] font-extrabold tracking-[-0.04em] text-white lg:text-[44px]">
            L&apos;immobilier en Afrique de l&apos;Ouest, décrypté pour vous
          </h1>
          <p className="mx-auto mb-7 max-w-[560px] text-[15px] leading-relaxed text-white/75 lg:text-base">
            Conseils d&apos;experts, analyses de marché, actualités juridiques et tendances
            immobilières au Bénin, Togo, Côte d&apos;Ivoire et Sénégal.
          </p>
          <form
            onSubmit={submitSearch}
            className="mx-auto flex max-w-[520px] items-center gap-0 rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
          >
            <div className="flex flex-shrink-0 items-center pl-4.5">
              <Search className="h-4 w-4 text-gray-400" aria-hidden />
            </div>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Rechercher un article, un sujet…"
              className="flex-1 truncate bg-transparent px-4 py-3.5 text-left text-sm text-neutral-900 outline-none placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="m-1 flex items-center gap-2 rounded-full bg-brand px-[22px] py-3 text-sm font-semibold whitespace-nowrap text-white"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              Rechercher
            </button>
          </form>
        </div>
      </section>

      {/* CATEGORIES */}
      <div className="border-b border-black/[0.06] px-4 lg:px-7">
        <div className="mx-auto max-w-[1280px] overflow-x-auto">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => selectCategory('')}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4.5 py-4 text-[13px] font-semibold whitespace-nowrap',
                categorySlug === ''
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-neutral-900',
              )}
            >
              Tous les articles
              <span
                className={cn(
                  'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                  categorySlug === '' ? 'bg-brand/15 text-brand' : 'bg-gray-100 text-gray-500',
                )}
              >
                {totalArticles}
              </span>
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => selectCategory(c.slug)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-4.5 py-4 text-[13px] font-semibold whitespace-nowrap',
                  categorySlug === c.slug
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-neutral-900',
                )}
              >
                {c.label}
                <span
                  className={cn(
                    'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                    categorySlug === c.slug ? 'bg-brand/15 text-brand' : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {c.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <section className="px-4 py-11 pb-20 lg:px-7">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          {/* LEFT */}
          <div className="order-2 flex flex-col gap-8 lg:order-1">
            {/* FEATURED */}
            {featured && (
              <div>
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                  Article à la une
                </div>
                <Link
                  href={`/blog/${featured.slug}`}
                  className="grid grid-cols-1 overflow-hidden rounded-2xl border border-black/[0.08] lg:grid-cols-2"
                >
                  {featured.coverImageUrl ? (
                    <img
                      src={cloudinaryOptimize(featured.coverImageUrl, 600)}
                      alt={featured.title}
                      className="h-[220px] w-full object-cover lg:h-full"
                    />
                  ) : (
                    <div className="flex h-[220px] flex-col items-center justify-center gap-2 bg-gradient-to-br from-sky-100 to-blue-50 lg:h-full">
                      <TrendingUp className="h-8 w-8 text-brand" aria-hidden />
                    </div>
                  )}
                  <div className="flex flex-col justify-center gap-3.5 p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap uppercase',
                          categoryClasses(featured.category.colorKey),
                        )}
                      >
                        <TrendingUp className="h-[11px] w-[11px]" aria-hidden />
                        {featured.category.label}
                      </span>
                      {featured.publishedAt && (
                        <span className="text-[11px] whitespace-nowrap text-gray-500">
                          {formatDate(featured.publishedAt)} · {featured.readTimeMinutes} min
                        </span>
                      )}
                    </div>
                    <p className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
                      {featured.title}
                    </p>
                    <p className="text-sm leading-relaxed text-gray-500">{featured.excerpt}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {featured.author.avatarUrl && (
                        <img
                          src={featured.author.avatarUrl}
                          alt={featured.author.name}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      )}
                      <span className="text-[13px] font-semibold whitespace-nowrap">
                        {featured.author.name}
                      </span>
                      {featured.author.role && (
                        <span className="text-xs whitespace-nowrap text-gray-500">
                          {featured.author.role}
                        </span>
                      )}
                    </div>
                    <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-brand px-4.5 py-2.5 text-[13px] font-bold whitespace-nowrap text-white">
                      Lire l&apos;article
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* GRID */}
            <div>
              <div className="mb-5 flex items-center justify-between gap-4">
                <span className="text-[17px] font-bold">Derniers articles</span>
              </div>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
                </div>
              ) : grid.length === 0 ? (
                <div className="rounded-2xl border border-black/[0.06] bg-gray-50 p-8 text-center text-sm text-gray-500">
                  Aucun article dans cette catégorie.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {grid.map((a) => (
                    <Link
                      key={a.id}
                      href={`/blog/${a.slug}`}
                      className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08]"
                    >
                      {a.coverImageUrl ? (
                        <img
                          src={cloudinaryOptimize(a.coverImageUrl, 400)}
                          alt={a.title}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-sky-50 to-blue-50">
                          <TrendingUp className="h-6 w-6 text-brand/50" aria-hidden />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <span
                          className={cn(
                            'inline-flex w-fit items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap uppercase',
                            categoryClasses(a.category.colorKey),
                          )}
                        >
                          {a.category.label}
                        </span>
                        <p className="text-sm leading-snug font-bold">{a.title}</p>
                        <p className="flex-1 text-[13px] leading-relaxed text-gray-500">
                          {a.excerpt}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold whitespace-nowrap">
                              {a.author.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {a.publishedAt && (
                              <span className="text-[11px] whitespace-nowrap text-gray-500">
                                {formatDate(a.publishedAt)}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[11px] whitespace-nowrap text-gray-500">
                              <Clock className="h-[11px] w-[11px]" aria-hidden />
                              {a.readTimeMinutes} min
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* LIST */}
            {list.length > 0 && (
              <div>
                <div className="mb-5 text-[17px] font-bold">Plus d&apos;articles</div>
                <div className="flex flex-col gap-4">
                  {list.map((a) => (
                    <Link
                      key={a.id}
                      href={`/blog/${a.slug}`}
                      className="flex gap-4 rounded-xl border border-black/[0.08] p-4"
                    >
                      {a.coverImageUrl ? (
                        <img
                          src={cloudinaryOptimize(a.coverImageUrl, 200)}
                          alt={a.title}
                          className="h-[76px] w-[100px] flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-[76px] w-[100px] flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-50 to-blue-50">
                          <TrendingUp className="h-5 w-5 text-brand/50" aria-hidden />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'mb-1.5 inline-flex w-fit items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap uppercase',
                            categoryClasses(a.category.colorKey),
                          )}
                        >
                          {a.category.label}
                        </span>
                        <p className="mb-1 text-sm leading-snug font-bold">{a.title}</p>
                        <p className="mb-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
                          {a.excerpt}
                        </p>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xs font-semibold whitespace-nowrap">
                            {a.author.name}
                          </span>
                          {a.publishedAt && (
                            <span className="text-[11px] whitespace-nowrap text-gray-500">
                              {formatDate(a.publishedAt)}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[11px] whitespace-nowrap text-gray-500">
                            <Clock className="h-[11px] w-[11px]" aria-hidden />
                            {a.readTimeMinutes} min
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/[0.08] text-gray-500 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold',
                      n === page
                        ? 'bg-brand text-white'
                        : 'border border-black/[0.08] text-gray-500',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/[0.08] text-gray-500 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <div className="order-1 flex flex-col gap-6 lg:order-2">
            {/* NEWSLETTER */}
            <div className="rounded-2xl border border-black/[0.08] p-5">
              <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                <Mail className="h-3.5 w-3.5 text-brand" aria-hidden />
                Newsletter
              </div>
              <p className="mb-3.5 text-[13px] leading-relaxed text-gray-500">
                Recevez chaque semaine les meilleures analyses immobilières directement dans votre
                boîte mail.
              </p>
              {newsletterState === 'sent' ? (
                <p className="text-[13px] font-semibold text-emerald-600">
                  Merci ! Vérifiez votre boîte mail.
                </p>
              ) : (
                <form onSubmit={submitNewsletter}>
                  <input
                    required
                    type="email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="Votre adresse email"
                    className="mb-2.5 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={newsletterState === 'sending'}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-bold whitespace-nowrap text-white disabled:opacity-50"
                  >
                    {newsletterState === 'sending' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden />
                    )}
                    S&apos;abonner gratuitement
                  </button>
                  {newsletterState === 'error' && (
                    <p className="mt-2 text-[11px] text-red-500">
                      Échec de l&apos;inscription. Réessayez.
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* POPULAR */}
            {popular.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] p-5">
                <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                  <Flame className="h-3.5 w-3.5 text-red-500" aria-hidden />
                  Articles populaires
                </div>
                <div className="flex flex-col gap-3.5">
                  {popular.map((p, i) => (
                    <Link key={p.id} href={`/blog/${p.slug}`} className="flex items-start gap-3">
                      <span className="w-5 flex-shrink-0 text-xl leading-none font-black text-brand/30">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="mb-0.5 text-[13px] leading-snug font-semibold">{p.title}</p>
                        <p className="text-[11px] text-gray-500">
                          {p.viewCount.toLocaleString('fr-FR')} lectures · {p.readTimeMinutes} min
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* TAGS */}
            {tags.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] p-5">
                <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                  <Tag className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                  Sujets populaires
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => selectTag(t.tag)}
                      className={cn(
                        'rounded-full border px-3 py-[5px] text-xs font-medium whitespace-nowrap',
                        query === t.tag
                          ? 'border-brand/30 bg-brand/10 text-brand'
                          : 'border-black/[0.08] bg-gray-50 text-gray-500',
                      )}
                    >
                      {t.tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PROMO */}
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)' }}
            >
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                <Home className="h-[22px] w-[22px] text-white" aria-hidden />
              </div>
              <p className="mb-2 text-[15px] font-extrabold whitespace-nowrap text-white">
                Trouvez votre bien idéal
              </p>
              <p className="mb-4 text-xs leading-relaxed text-white/80">
                Des milliers d&apos;annonces vérifiées au Bénin, Togo, Côte d&apos;Ivoire et
                Sénégal. Des agents certifiés à votre service.
              </p>
              <Link
                href="/annonces"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold whitespace-nowrap text-brand"
              >
                Voir les annonces
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint the page**

Run: `pnpm --filter frontend exec tsc --noEmit` then `pnpm --filter frontend exec eslint src/app/blog/page.tsx`
Expected: both exit 0.

- [ ] **Step 3: Manual verification**

Run: `pnpm dev` (in `frontend/`), open `http://localhost:3000/blog`.
Expected: with zero seeded articles the page renders with empty
grid/list/popular/tags sections and no console errors (categories list
will be empty too until an admin creates one via `POST
/api/admin/blog/categories` + `POST /api/admin/blog/articles`). If you
want to see real content, use `pnpm db:studio` or the admin API directly
to seed one category and one `PUBLISHED` article, then reload.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/blog/page.tsx
git commit -m "feat(blog): wire /blog to the real backend (categories, articles, tags, newsletter, pagination)"
```

---

### Task 14: New `/blog/[slug]` article detail page

**Files:**
- Create: `frontend/src/app/blog/[slug]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/public/blog/articles/[slug]` (Task 10).

- [ ] **Step 1: Write the page**

Create `frontend/src/app/blog/[slug]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { formatDate } from '@/lib/alerts';
import { cloudinaryOptimize } from '@/lib/listings';

interface ArticleDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  tags: string[];
  author: { name: string; role: string | null; avatarUrl: string | null };
  category: { slug: string; label: string; colorKey: string };
  readTimeMinutes: number;
  publishedAt: string | null;
  viewCount: number;
}

const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  brand: 'bg-brand/10 text-brand',
  green: 'bg-green-600/10 text-green-600',
  amber: 'bg-amber-500/10 text-amber-600',
  violet: 'bg-violet-500/10 text-violet-600',
  red: 'bg-red-500/10 text-red-600',
};

function categoryClasses(colorKey: string): string {
  return CATEGORY_COLOR_CLASSES[colorKey] ?? CATEGORY_COLOR_CLASSES['brand']!;
}

export default function BlogArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    api<ArticleDetail>(`/api/public/blog/articles/${slug}`)
      .then((res) => {
        if (cancelled) return;
        setArticle(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
        setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="bg-white text-neutral-900">
        <PublicNavbar active="blog" />
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="bg-white text-neutral-900">
        <PublicNavbar active="blog" />
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-lg font-bold">Article introuvable</p>
          <p className="max-w-[360px] text-sm text-gray-500">
            Cet article n&apos;existe pas ou n&apos;est plus disponible.
          </p>
          <Link href="/blog" className="mt-2 text-sm font-semibold text-brand">
            Retour au blog
          </Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="bg-white text-neutral-900">
      <PublicNavbar active="blog" />

      <div className="mx-auto max-w-[760px] px-4 py-10 lg:px-7 lg:py-14">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Retour au blog
        </Link>

        <span
          className={cn(
            'mb-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap uppercase',
            categoryClasses(article.category.colorKey),
          )}
        >
          {article.category.label}
        </span>

        <h1 className="font-sora mb-4 text-[26px] leading-tight font-extrabold tracking-[-0.03em] lg:text-[38px]">
          {article.title}
        </h1>

        <div className="mb-7 flex flex-wrap items-center gap-3">
          {article.author.avatarUrl && (
            <img
              src={article.author.avatarUrl}
              alt={article.author.name}
              className="h-9 w-9 rounded-full object-cover"
            />
          )}
          <span className="text-sm font-semibold">{article.author.name}</span>
          {article.author.role && (
            <span className="text-xs text-gray-500">{article.author.role}</span>
          )}
          {article.publishedAt && (
            <span className="text-xs text-gray-500">{formatDate(article.publishedAt)}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" aria-hidden />
            {article.readTimeMinutes} min
          </span>
        </div>

        {article.coverImageUrl && (
          <img
            src={cloudinaryOptimize(article.coverImageUrl, 900)}
            alt={article.title}
            className="mb-8 w-full rounded-2xl object-cover"
          />
        )}

        <div
          className="prose prose-neutral max-w-none text-[15px] leading-relaxed"
          // contentHtml is sanitized server-side at write time (admin-only
          // write path, see lib/server/blog/sanitize.ts) — never re-sanitized
          // here, never populated from unmoderated user input.
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />

        {article.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-black/[0.06] pt-6">
            {article.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-black/[0.08] bg-gray-50 px-3 py-[5px] text-xs font-medium whitespace-nowrap text-gray-500"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <PublicFooter />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter frontend exec tsc --noEmit` then `pnpm --filter frontend exec eslint src/app/blog/[slug]/page.tsx`
Expected: both exit 0.

- [ ] **Step 3: Manual verification**

With `pnpm dev` running, use the admin API (or `pnpm db:studio`) to create
one `BlogCategory` and one `PUBLISHED` `BlogArticle`, then open
`http://localhost:3000/blog/<its-slug>` and confirm the title, author,
category pill, cover image (if set), and `contentHtml` render correctly,
and that `http://localhost:3000/blog/does-not-exist` shows the "Article
introuvable" state.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/blog/[slug]/page.tsx"
git commit -m "feat(blog): add /blog/[slug] article detail page"
```

---

### Task 15: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all four commands exit 0. `pnpm test` should show the new
suites (`sanitize`, `read-time`, admin categories/articles ×2, public
categories/articles/detail/tags, newsletter) passing alongside the
existing suite, including
`frontend/src/lib/server/observability/runtime-enforcement.test.ts`
(confirms every new route file declared `export const runtime = 'nodejs'`).

- [ ] **Step 2: Fix any failures found**

If `pnpm lint` or `pnpm typecheck` reports issues in the files from Tasks
1–14, fix them in place (common ones: an unused import in
`blog/page.tsx` per Task 13's note, or a Prisma type mismatch if a
`select` shape drifted from what a later task's mapper expects — cross-
check against the exact `ARTICLE_LIST_SELECT`/`ARTICLE_PUBLIC_SELECT`/
`ARTICLE_DETAIL_SELECT` field lists defined in Tasks 6, 7, 9, 10).

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore(blog): verification pass (format, lint, typecheck, test)"
```

(Skip this commit if Step 1 passed clean with nothing to fix.)
