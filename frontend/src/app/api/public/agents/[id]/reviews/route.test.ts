// PUBLIC-AGENT-REVIEWS-01 — GET /api/public/agents/[id]/reviews tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(
  id = 'agent-1',
  query = '',
): { req: NextRequest; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new NextRequest(`http://test/api/public/agents/${id}/reviews${query}`),
    ctx: { params: Promise.resolve({ id }) },
  };
}

const mockFindUnique = vi.mocked(prismaMock.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue({ id: 'agent-1', accountType: 'OWNER_AGENT' } as never);
  prismaMock.agentReview.findMany.mockResolvedValue([] as never);
  prismaMock.agentReview.count.mockResolvedValue(0 as never);
  prismaMock.agentReview.aggregate.mockResolvedValue({ _avg: { rating: null } } as never);
  vi.mocked(prismaMock.agentReview.groupBy).mockResolvedValue([] as never);
});

describe('GET /api/public/agents/[id]/reviews', () => {
  it('404s when the target does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const { req, ctx } = makeGet('missing');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('404s when the target is not an OWNER_AGENT', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'user-1', accountType: 'TENANT_BUYER' } as never);
    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('returns paginated items with the average rating', async () => {
    prismaMock.agentReview.findMany.mockResolvedValueOnce([
      {
        id: 'review-1',
        rating: 5,
        comment: 'Excellent',
        createdAt: new Date('2026-02-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
        author: { id: 'user-1', name: 'Ama', avatarUrl: null },
      },
    ] as never);
    prismaMock.agentReview.count.mockResolvedValueOnce(1);
    prismaMock.agentReview.aggregate.mockResolvedValueOnce({ _avg: { rating: 5 } } as never);
    vi.mocked(prismaMock.agentReview.groupBy).mockResolvedValueOnce([
      { rating: 5, _count: { _all: 1 } },
    ] as never);

    const { req, ctx } = makeGet();
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.avgRating).toBe(5);
    expect(body.ratingBreakdown).toEqual({ '5': 1, '4': 0, '3': 0, '2': 0, '1': 0 });
    expect(body.items).toEqual([
      {
        id: 'review-1',
        rating: 5,
        comment: 'Excellent',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        author: { id: 'user-1', name: 'Ama', avatarUrl: null },
      },
    ]);
  });

  it('scopes the query to the requested agent', async () => {
    const { req, ctx } = makeGet('agent-1');
    await GET(req, ctx);
    expect(prismaMock.agentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentId: 'agent-1' } }),
    );
  });
});
