// AGENT-CONTACT-01 tests — POST /api/agents/[id]/unlock-contact.
// Mock strategy mirrors payment-methods/route.test.ts: vi.hoisted() so the
// synthetic $transaction tx client is safe to reference inside the hoisted
// vi.mock('@/lib/server/prisma') factory.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

const { userFindUnique, unlockFindUnique, walletFindUnique, txClient, $transaction } = vi.hoisted(
  () => {
    const txClient = {
      tokenWallet: { update: vi.fn() },
      tokenTransaction: { create: vi.fn() },
      agentContactUnlock: { create: vi.fn() },
    };
    return {
      userFindUnique: vi.fn(),
      unlockFindUnique: vi.fn(),
      walletFindUnique: vi.fn(),
      txClient,
      $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    };
  },
);

vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUnique },
    agentContactUnlock: { findUnique: unlockFindUnique },
    tokenWallet: { findUnique: walletFindUnique },
    $transaction,
  },
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const authedCtx = { user: { sub: 'viewer-1', email: 'v@example.com' } };

function makePost(): NextRequest {
  return new NextRequest('http://test/api/agents/agent-1/unlock-contact', {
    method: 'POST',
    headers: { 'x-csrf-token': 'tok' },
  });
}

const ctx = { params: Promise.resolve({ id: 'agent-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockVerifyCsrf.mockReturnValue(null);
  userFindUnique.mockResolvedValue({ id: 'agent-1', accountType: 'OWNER_AGENT' });
  unlockFindUnique.mockResolvedValue(null);
  walletFindUnique.mockResolvedValue({ balance: 5 });
  txClient.tokenWallet.update.mockResolvedValue({ balance: 4 });
});

describe('POST /api/agents/[id]/unlock-contact', () => {
  it('403 when CSRF fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(403);
  });

  it('401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'X' }, { status: 401 }));
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(401);
  });

  it('404 when the target is not an OWNER_AGENT', async () => {
    userFindUnique.mockResolvedValueOnce({ id: 'agent-1', accountType: 'TENANT_BUYER' });
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(404);
  });

  it('is free and does not touch the wallet when the agent views their own profile', async () => {
    mockRequireAuth.mockResolvedValueOnce({ user: { sub: 'agent-1', email: 'a@example.com' } });
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ unlocked: true, charged: false });
    expect($transaction).not.toHaveBeenCalled();
  });

  it('is free and does not touch the wallet when already unlocked', async () => {
    unlockFindUnique.mockResolvedValueOnce({ id: 'unlock-1' });
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ unlocked: true, charged: false });
    expect($transaction).not.toHaveBeenCalled();
  });

  it('422 INSUFFICIENT_TOKENS when the wallet balance is too low', async () => {
    walletFindUnique.mockResolvedValueOnce({ balance: 0 });
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('INSUFFICIENT_TOKENS');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('422 INSUFFICIENT_TOKENS when the wallet row does not exist', async () => {
    walletFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(422);
  });

  it('debits 1 token and records the unlock on first purchase', async () => {
    const res = await POST(makePost(), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ unlocked: true, charged: true });

    expect(txClient.tokenWallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'viewer-1' },
        data: { balance: { decrement: 1 } },
      }),
    );
    expect(txClient.tokenTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'viewer-1',
          type: 'USAGE',
          amount: -1,
          balanceAfter: 4,
        }),
      }),
    );
    expect(txClient.agentContactUnlock.create).toHaveBeenCalledWith({
      data: { userId: 'viewer-1', agentId: 'agent-1' },
    });
  });
});
