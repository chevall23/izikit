// PUT /api/admin/pricing — SUPERADMIN-only pricing replacement + audit.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/pricing', () => ({
  readStoredPricing: vi.fn(),
  writePricing: vi.fn(),
  invalidatePricingCache: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { invalidatePricingCache, readStoredPricing, writePricing } from '@/lib/server/pricing';
import { DEFAULT_PRICING, type PricingData } from '@/lib/pricing';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';
import { PUT } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockRead = vi.mocked(readStoredPricing);
const mockWrite = vi.mocked(writePricing);
const mockInvalidate = vi.mocked(invalidatePricingCache);
const tx = { tag: 'tx' };
const order: string[] = [];

const superadminUser = seedSuperadmin({ id: 'superadmin_1', email: 'superadmin@test.local' });
const superadminCtx = {
  user: { sub: superadminUser.id, email: superadminUser.email },
  admin: { id: superadminUser.id, email: superadminUser.email, role: 'SUPERADMIN' as const },
};

function makePut(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/pricing', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(): PricingData {
  const copy = structuredClone(DEFAULT_PRICING);
  copy.plans.PRO_AGENT.priceFcfa = 12_345;
  return copy;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLogAdminAction.mockResolvedValue(undefined);
  order.length = 0;
  mockRead.mockImplementation(async () => {
    order.push('read');
    return DEFAULT_PRICING;
  });
  mockWrite.mockImplementation(async () => {
    order.push('write');
  });
  mockLogAdminAction.mockImplementation(async () => {
    order.push('audit');
  });
  prismaMock.$transaction.mockImplementation(
    (cb: unknown) => (cb as (t: unknown) => Promise<unknown>)(tx) as never,
  );
});

describe('PUT /api/admin/pricing', () => {
  it('returns the requireSuperadmin response for a non-SUPERADMIN and saves nothing', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    );
    const res = await PUT(makePut(validBody()));
    expect(res.status).toBe(403);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('rejects when CSRF fails, before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await PUT(makePut(validBody()));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_FAILED when the FREE price is not 0', async () => {
    const body = validBody();
    (body.plans.FREE as { priceFcfa: number }).priceFcfa = 1000;
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns 400 when a pack discount exceeds 90', async () => {
    const body = validBody();
    body.token.packs.PRO.discountPct = 95;
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns 400 when a quota is fractional', async () => {
    const body = validBody();
    body.plans.PRO_AGENT.maxActiveListings = 2.5;
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-JSON body', async () => {
    const req = new NextRequest('http://test/api/admin/pricing', {
      method: 'PUT',
      body: 'not json',
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('saves a valid body, audits before/after and returns 200', async () => {
    const body = validBody();
    const res = await PUT(makePut(body));
    expect(res.status).toBe(200);
    expect((await res.json()).pricing).toEqual(body);
    expect(mockWrite).toHaveBeenCalledWith(tx, body, 'superadmin_1');
    expect(mockRead).toHaveBeenCalledWith(tx);
    expect(order).toEqual(['read', 'write', 'audit']);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'superadmin_1',
        action: 'PRICING_UPDATED',
        targetType: 'PricingConfig',
        targetId: 'default',
        metadata: { before: DEFAULT_PRICING, after: body },
      }),
    );
  });

  it('takes the audit "before" from the stored row read in the transaction', async () => {
    const stored = structuredClone(DEFAULT_PRICING);
    stored.token.baseFcfa = 777;
    mockRead.mockResolvedValueOnce(stored);
    const body = validBody();
    const res = await PUT(makePut(body));
    expect(res.status).toBe(200);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ metadata: { before: stored, after: body } }),
    );
  });

  it('propagates the failure (Next answers 500) and keeps the cache when the audit insert fails', async () => {
    mockLogAdminAction.mockRejectedValueOnce(new Error('audit down'));
    await expect(PUT(makePut(validBody()))).rejects.toThrow('audit down');
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('returns the limiter response without saving', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 }),
    );
    const res = await PUT(makePut(validBody()));
    expect(res.status).toBe(429);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
