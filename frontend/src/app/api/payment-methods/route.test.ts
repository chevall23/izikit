// PAYMETH-01/02 tests — GET/POST /api/payment-methods.
// Mock strategy mirrors legal-documents/submit/route.test.ts: a synthetic
// $transaction tx client (see withdrawals/route.test.ts for the pattern).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

// vi.mock factories are hoisted above all other top-level code (including
// `import { GET, POST } from './route'` below, which triggers this factory
// as soon as route.ts imports '@/lib/server/prisma') — so the mocks it
// references must be created via vi.hoisted() to avoid a TDZ ReferenceError.
const { findMany, count, txClient, $transaction } = vi.hoisted(() => {
  const txClient = {
    paymentMethodPreference: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    findMany: vi.fn(),
    count: vi.fn(),
    txClient,
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  };
});

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    paymentMethodPreference: { findMany, count },
    $transaction,
  },
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/payment-methods', { method: 'GET' });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/payment-methods', {
    method: 'POST',
    headers: { 'x-csrf-token': 'tok', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/payment-methods', () => {
  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'X' }, { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('lists the caller own methods, default-first', async () => {
    findMany.mockResolvedValue([
      {
        id: 'pm-1',
        operator: 'ORANGE_MONEY',
        phone: '+22997123456',
        label: null,
        isDefault: true,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.methods).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });
});

describe('POST /api/payment-methods', () => {
  it('403 when CSRF fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost({ operator: 'WAVE', phone: '+221771234567' }));
    expect(res.status).toBe(403);
  });

  it('400 on invalid body', async () => {
    const res = await POST(makePost({ operator: 'BAD', phone: '+221771234567' }));
    expect(res.status).toBe(400);
  });

  it('creates the first method as default automatically', async () => {
    count.mockResolvedValue(0);
    txClient.paymentMethodPreference.create.mockResolvedValue({
      id: 'pm-1',
      operator: 'WAVE',
      phone: '+221771234567',
      label: null,
      isDefault: true,
      createdAt: new Date(),
    });
    const res = await POST(makePost({ operator: 'WAVE', phone: '+221771234567' }));
    expect(res.status).toBe(201);
    expect(txClient.paymentMethodPreference.updateMany).toHaveBeenCalled();
    expect(txClient.paymentMethodPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
    );
  });

  it('does not demote existing default when isDefault is not requested and one already exists', async () => {
    count.mockResolvedValue(1);
    txClient.paymentMethodPreference.create.mockResolvedValue({
      id: 'pm-2',
      operator: 'ORANGE_MONEY',
      phone: '+221771234568',
      label: null,
      isDefault: false,
      createdAt: new Date(),
    });
    const res = await POST(makePost({ operator: 'ORANGE_MONEY', phone: '+221771234568' }));
    expect(res.status).toBe(201);
    expect(txClient.paymentMethodPreference.updateMany).not.toHaveBeenCalled();
  });

  it('422 when the per-user cap is reached', async () => {
    count.mockResolvedValue(10);
    const res = await POST(makePost({ operator: 'WAVE', phone: '+221771234567' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('TOO_MANY_PAYMENT_METHODS');
  });
});
