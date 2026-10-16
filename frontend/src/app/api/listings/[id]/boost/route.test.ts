// BOOST-01 — POST /api/listings/[id]/boost tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const DAY = 86_400_000;

function makePost(payload: unknown, id = 'l1') {
  const req = new NextRequest(`http://test/api/listings/${id}/boost`, {
    method: 'POST',
    headers: { 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

const listing = (over: Record<string, unknown> = {}) =>
  ({
    userId: 'user-1',
    status: 'VERIFIED',
    boostedUntil: null,
    price: 150_000,
    _count: { photos: 2 },
    ...over,
  }) as never;

const createdBoost = () =>
  prismaMock.boost.create.mock.calls[0]![0].data as {
    source: string;
    tokensSpent: number;
    days: number;
    startsAt: Date;
    endsAt: Date;
  };

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } });
  prismaMock.listing.findUnique.mockResolvedValue(listing());
  prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 30 } as never);
  prismaMock.tokenWallet.update.mockResolvedValue({ balance: 22 } as never);
  prismaMock.tokenTransaction.create.mockResolvedValue({} as never);
  prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.subscription.findUnique.mockResolvedValue({ boostCredits: 0 } as never);
  prismaMock.boost.create.mockImplementation((async (a: { data: Record<string, unknown> }) => ({
    id: 'b1',
    ...a.data,
  })) as never);
  prismaMock.listing.update.mockResolvedValue({} as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) =>
    typeof cb === 'function'
      ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
      : Promise.resolve(cb),
  );
  prismaMock.$executeRawUnsafe.mockResolvedValue(0 as never);
});

describe('POST /api/listings/[id]/boost — guards', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const { req, ctx } = makePost({ days: 7 });
    expect((await POST(req, ctx)).status).toBe(401);
  });

  it('400 on an unknown duration', async () => {
    const { req, ctx } = makePost({ days: 10 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('400 when an included boost is requested for another duration than 7 days', async () => {
    const { req, ctx } = makePost({ days: 15, useIncluded: true });
    expect((await POST(req, ctx)).status).toBe(400);
  });

  it('404 for a listing the caller does not own', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(listing({ userId: 'someone-else' }));
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('LISTING_NOT_FOUND');
  });

  it.each(['PENDING', 'HIDDEN', 'REJECTED', 'SOLD', 'DRAFT'])(
    '409 LISTING_NOT_BOOSTABLE when the listing is %s',
    async (status) => {
      prismaMock.listing.findUnique.mockResolvedValue(listing({ status }));
      const { req, ctx } = makePost({ days: 7 });
      const res = await POST(req, ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('LISTING_NOT_BOOSTABLE');
      expect(prismaMock.boost.create).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/listings/[id]/boost — shop-window quality', () => {
  it('409 LISTING_NEEDS_PHOTO without a photo, spending nothing', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(listing({ _count: { photos: 0 } }));
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LISTING_NEEDS_PHOTO');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
  });

  it.each([0, 1, 999])('409 LISTING_NEEDS_PRICE for a placeholder price of %i', async (price) => {
    prismaMock.listing.findUnique.mockResolvedValue(listing({ price }));
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LISTING_NEEDS_PRICE');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
  });

  it('accepts the smallest real price (1 000)', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(listing({ price: 1000 }));
    const { req, ctx } = makePost({ days: 7 });
    expect((await POST(req, ctx)).status).toBe(201);
  });

  it('re-checks the photo under the lock: a photo deleted meanwhile refuses the boost', async () => {
    prismaMock.listing.findUnique
      .mockResolvedValueOnce(listing())
      .mockResolvedValueOnce(listing({ _count: { photos: 0 } }));
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('LISTING_NEEDS_PHOTO');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/listings/[id]/boost — paying with tokens', () => {
  it('debits the live price, records a USAGE transaction and a TOKENS boost', async () => {
    const before = Date.now();
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 8 } } }),
    );
    expect(prismaMock.tokenTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        type: 'USAGE',
        amount: -8,
        balanceAfter: 22,
      }),
    });
    const created = createdBoost();
    expect(created).toMatchObject({ source: 'TOKENS', tokensSpent: 8, days: 7 });
    expect(created.endsAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(prismaMock.listing.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { boostedUntil: created.endsAt },
    });
    expect(await res.json()).toMatchObject({ tokenBalance: 30, boostCredits: 0 });
  });

  it('charges 14 and 24 tokens for 15 and 30 days', async () => {
    const fifteen = makePost({ days: 15 });
    await POST(fifteen.req, fifteen.ctx);
    expect(prismaMock.tokenWallet.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 14 } } }),
    );
    const thirty = makePost({ days: 30 });
    await POST(thirty.req, thirty.ctx);
    expect(prismaMock.tokenWallet.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 24 } } }),
    );
  });

  it('422 INSUFFICIENT_TOKENS (same body shape as unlock-contact) when the balance is too low', async () => {
    prismaMock.tokenWallet.findUnique.mockResolvedValue({ balance: 3 } as never);
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: 'INSUFFICIENT_TOKENS',
      required: 8,
      balance: 3,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('422 when a concurrent spend drains the wallet between the check and the debit', async () => {
    prismaMock.tokenWallet.update.mockResolvedValue({ balance: -2 } as never);
    const { req, ctx } = makePost({ days: 7 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('INSUFFICIENT_TOKENS');
  });

  it('422 when the user has no wallet at all', async () => {
    prismaMock.tokenWallet.findUnique.mockResolvedValue(null);
    const { req, ctx } = makePost({ days: 7 });
    expect((await POST(req, ctx)).status).toBe(422);
  });
});

describe('POST /api/listings/[id]/boost — included boosts', () => {
  it('consumes one included boost atomically and spends no token', async () => {
    const { req, ctx } = makePost({ days: 7, useIncluded: true });
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', boostCredits: { gte: 1 } },
      data: { boostCredits: { decrement: 1 } },
    });
    expect(prismaMock.tokenWallet.update).not.toHaveBeenCalled();
    expect(createdBoost()).toMatchObject({ source: 'INCLUDED', tokensSpent: 0, days: 7 });
  });

  it('409 NO_INCLUDED_BOOST when none is left (the concurrent loser of the last credit)', async () => {
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    const { req, ctx } = makePost({ days: 7, useIncluded: true });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('NO_INCLUDED_BOOST');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
    expect(prismaMock.listing.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/listings/[id]/boost — extension and horizon', () => {
  it('adds the duration to a boost still running', async () => {
    const until = new Date(Date.now() + 10 * DAY);
    prismaMock.listing.findUnique.mockResolvedValue(listing({ boostedUntil: until }));
    const { req, ctx } = makePost({ days: 15 });
    expect((await POST(req, ctx)).status).toBe(201);
    const created = createdBoost();
    expect(created.startsAt.getTime()).toBe(until.getTime());
    expect(created.endsAt.getTime()).toBe(until.getTime() + 15 * DAY);
  });

  it('starts from now when the previous boost already ended', async () => {
    const past = new Date(Date.now() - 3 * DAY);
    prismaMock.listing.findUnique.mockResolvedValue(listing({ boostedUntil: past }));
    const before = Date.now();
    const { req, ctx } = makePost({ days: 7 });
    await POST(req, ctx);
    const created = createdBoost();
    expect(created.startsAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(created.endsAt.getTime() - created.startsAt.getTime()).toBe(7 * DAY);
  });

  it('409 BOOST_HORIZON beyond 60 days from now, without spending anything', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(
      listing({ boostedUntil: new Date(Date.now() + 50 * DAY) }),
    );
    const { req, ctx } = makePost({ days: 15 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('BOOST_HORIZON');
    expect(prismaMock.boost.create).not.toHaveBeenCalled();
  });

  it('allows up to 60 days', async () => {
    prismaMock.listing.findUnique.mockResolvedValue(
      listing({ boostedUntil: new Date(Date.now() + 30 * DAY - 1000) }),
    );
    const { req, ctx } = makePost({ days: 30 });
    expect((await POST(req, ctx)).status).toBe(201);
  });
});
