// PUT /api/admin/pricing — SUPERADMIN-only pricing replacement + audit.
import '@/test-utils/prisma-mock';
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
  getPricing: vi.fn(),
  savePricing: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { getPricing, savePricing } from '@/lib/server/pricing';
import { DEFAULT_PRICING, type PricingData } from '@/lib/pricing';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';
import { PUT } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockGetPricing = vi.mocked(getPricing);
const mockSavePricing = vi.mocked(savePricing);

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
  mockGetPricing.mockResolvedValue(DEFAULT_PRICING);
  mockSavePricing.mockResolvedValue(undefined);
});

describe('PUT /api/admin/pricing', () => {
  it('returns the requireSuperadmin response for a non-SUPERADMIN and saves nothing', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
    );
    const res = await PUT(makePut(validBody()));
    expect(res.status).toBe(403);
    expect(mockSavePricing).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('rejects when CSRF fails, before auth', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await PUT(makePut(validBody()));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
    expect(mockSavePricing).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_FAILED when the FREE price is not 0', async () => {
    const body = validBody();
    (body.plans.FREE as { priceFcfa: number }).priceFcfa = 1000;
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(mockSavePricing).not.toHaveBeenCalled();
  });

  it('returns 400 when a pack discount exceeds 90', async () => {
    const body = validBody();
    body.token.packs.PRO.discountPct = 95;
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(mockSavePricing).not.toHaveBeenCalled();
  });

  it('returns 400 when a quota is fractional', async () => {
    const body = validBody();
    body.plans.PRO_AGENT.maxActiveListings = 2.5;
    const res = await PUT(makePut(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
    expect(mockSavePricing).not.toHaveBeenCalled();
  });

  it('returns 400 on a non-JSON body', async () => {
    const req = new NextRequest('http://test/api/admin/pricing', {
      method: 'PUT',
      body: 'not json',
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(mockSavePricing).not.toHaveBeenCalled();
  });

  it('saves a valid body, audits before/after and returns 200', async () => {
    const body = validBody();
    const res = await PUT(makePut(body));
    expect(res.status).toBe(200);
    expect((await res.json()).pricing).toEqual(body);
    expect(mockSavePricing).toHaveBeenCalledWith(body, 'superadmin_1');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'superadmin_1',
        action: 'PRICING_UPDATED',
        targetType: 'PricingConfig',
        targetId: 'default',
        metadata: { before: DEFAULT_PRICING, after: body },
      }),
    );
  });
});
