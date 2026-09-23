// PAYMETH-03/04 tests — PATCH/DELETE /api/payment-methods/[id].
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

// vi.mock factories are hoisted above all other top-level code, so the
// mocks they close over must be created via vi.hoisted() (see
// payment-methods/route.test.ts for the same note).
const { findUnique, txClient, $transaction } = vi.hoisted(() => {
  const txClient = {
    paymentMethodPreference: {
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  return {
    findUnique: vi.fn(),
    txClient,
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  };
});

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    paymentMethodPreference: { findUnique },
    $transaction,
  },
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { PATCH, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://test/api/payment-methods/pm-1', {
    method,
    headers: { 'x-csrf-token': 'tok', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const ctx = { params: Promise.resolve({ id: 'pm-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('PATCH /api/payment-methods/[id]', () => {
  it('403 when CSRF fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await PATCH(makeReq('PATCH', { isDefault: true }), ctx);
    expect(res.status).toBe(403);
  });

  it('404 when the method does not belong to the caller', async () => {
    findUnique.mockResolvedValue({ userId: 'someone-else' });
    const res = await PATCH(makeReq('PATCH', { isDefault: true }), ctx);
    expect(res.status).toBe(404);
  });

  it('404 when the method does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq('PATCH', { isDefault: true }), ctx);
    expect(res.status).toBe(404);
  });

  it('sets the method as default, demoting the prior one', async () => {
    findUnique.mockResolvedValue({ userId: 'user-1' });
    txClient.paymentMethodPreference.update.mockResolvedValue({
      id: 'pm-1',
      operator: 'WAVE',
      phone: '+221771234567',
      label: null,
      isDefault: true,
      createdAt: new Date(),
    });
    const res = await PATCH(makeReq('PATCH', { isDefault: true }), ctx);
    expect(res.status).toBe(200);
    expect(txClient.paymentMethodPreference.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isDefault: true } }),
    );
    expect(txClient.paymentMethodPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pm-1' }, data: { isDefault: true } }),
    );
  });

  it('400 when isDefault is not literally true', async () => {
    findUnique.mockResolvedValue({ userId: 'user-1' });
    const res = await PATCH(makeReq('PATCH', { isDefault: false }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/payment-methods/[id]', () => {
  it('404 when not owned', async () => {
    findUnique.mockResolvedValue({ userId: 'someone-else', isDefault: false });
    const res = await DELETE(makeReq('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('deletes a non-default method without touching others', async () => {
    findUnique.mockResolvedValue({ userId: 'user-1', isDefault: false });
    const res = await DELETE(makeReq('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(txClient.paymentMethodPreference.delete).toHaveBeenCalledWith({ where: { id: 'pm-1' } });
    expect(txClient.paymentMethodPreference.findFirst).not.toHaveBeenCalled();
  });

  it('promotes the most recent remaining method to default when deleting the default', async () => {
    findUnique.mockResolvedValue({ userId: 'user-1', isDefault: true });
    txClient.paymentMethodPreference.findFirst.mockResolvedValue({ id: 'pm-2' });
    const res = await DELETE(makeReq('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(txClient.paymentMethodPreference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(txClient.paymentMethodPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pm-2' }, data: { isDefault: true } }),
    );
  });

  it('does nothing extra when deleting the default with no other methods left', async () => {
    findUnique.mockResolvedValue({ userId: 'user-1', isDefault: true });
    txClient.paymentMethodPreference.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(txClient.paymentMethodPreference.update).not.toHaveBeenCalled();
  });
});
