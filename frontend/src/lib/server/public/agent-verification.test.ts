import { beforeEach, describe, expect, it, vi } from 'vitest';

const groupBy = vi.fn();

vi.mock('@/lib/server/prisma', () => ({
  prisma: { legalDocument: { groupBy: (...args: unknown[]) => groupBy(...args) } },
}));
vi.mock('@/app/api/legal-documents/route', () => ({
  LEGAL_DOCUMENT_TYPES: ['RCCM', 'TAX_CERTIFICATE', 'ID_CARD'],
}));

import { verifiedAgentIds } from './agent-verification';

beforeEach(() => groupBy.mockReset());

describe('verifiedAgentIds', () => {
  it('returns only agents whose 3 required documents are all validated', async () => {
    groupBy.mockResolvedValue([
      { userId: 'a', _count: { _all: 3 } },
      { userId: 'b', _count: { _all: 2 } },
      { userId: 'c', _count: { _all: 1 } },
    ]);
    const result = await verifiedAgentIds(['a', 'b', 'c', 'd']);
    expect([...result]).toEqual(['a']);
  });

  it('only counts VERIFIED documents of the required types', async () => {
    groupBy.mockResolvedValue([]);
    await verifiedAgentIds(['a', 'a', 'b']);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: ['a', 'b'] },
          status: 'VERIFIED',
          type: { in: ['RCCM', 'TAX_CERTIFICATE', 'ID_CARD'] },
        },
      }),
    );
  });

  it('does not query when there is no agent', async () => {
    expect((await verifiedAgentIds([])).size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
