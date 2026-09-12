// AGENT-REVIEWS-01/02 — POST/DELETE /api/agents/[id]/reviews tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { POST, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeReq(
  method: 'POST' | 'DELETE',
  id = 'agent-1',
  body?: Record<string, unknown>,
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/agents/${id}/reviews`, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx as never);
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'agent-1',
    accountType: 'OWNER_AGENT',
  } as never);
});

describe('POST /api/agents/[id]/reviews', () => {
  it('returns 401 when requireAuth bails', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const { req, ctx } = makeReq('POST', 'agent-1', { rating: 5, comment: 'Top' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('refuses self-reviews', async () => {
    const { req, ctx } = makeReq('POST', 'user-1', { rating: 5, comment: 'Top' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CANNOT_REVIEW_SELF');
  });

  it('404s when the target is not an OWNER_AGENT', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'agent-1',
      accountType: 'TENANT_BUYER',
    } as never);
    const { req, ctx } = makeReq('POST', 'agent-1', { rating: 5, comment: 'Top' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('rejects an out-of-range rating', async () => {
    const { req, ctx } = makeReq('POST', 'agent-1', { rating: 6, comment: 'Top' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('upserts on the (agentId, authorId) unique constraint', async () => {
    prismaMock.agentReview.upsert.mockResolvedValueOnce({
      id: 'review-1',
      rating: 5,
      comment: 'Excellent',
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      author: { id: 'user-1', name: 'Ama', avatarUrl: null },
    } as never);

    const { req, ctx } = makeReq('POST', 'agent-1', { rating: 5, comment: 'Excellent' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.agentReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId_authorId: { agentId: 'agent-1', authorId: 'user-1' } },
      }),
    );
  });
});

describe('DELETE /api/agents/[id]/reviews', () => {
  it('404s when the user has no review to delete', async () => {
    prismaMock.agentReview.findUnique.mockResolvedValueOnce(null);
    const { req, ctx } = makeReq('DELETE', 'agent-1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('deletes the caller own review', async () => {
    prismaMock.agentReview.findUnique.mockResolvedValueOnce({ id: 'review-1' } as never);
    const { req, ctx } = makeReq('DELETE', 'agent-1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(prismaMock.agentReview.delete).toHaveBeenCalledWith({ where: { id: 'review-1' } });
  });
});
