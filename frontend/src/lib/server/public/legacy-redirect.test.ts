import { prismaMock } from '@/test-utils/prisma-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyAgentTarget, legacyListingTarget } from './legacy-redirect';

beforeEach(() => vi.clearAllMocks());

describe('legacyListingTarget', () => {
  it('sends an imported, live listing to its canonical page', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce({
      id: 'cmlisting1',
      status: 'VERIFIED',
      propertyType: 'VILLA',
      transactionType: 'VENTE',
      city: 'Cotonou',
      bedrooms: 4,
    } as never);
    await expect(legacyListingTarget('1234')).resolves.toBe(
      '/annonces/villa-4-chambres-a-vendre-cotonou-cmlisting1',
    );
    expect(prismaMock.listing.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { legacyId: 'ann:1234' } }),
    );
  });

  it('falls back to the search page for unknown, hidden or malformed ids', async () => {
    prismaMock.listing.findUnique.mockResolvedValueOnce({ status: 'DRAFT' } as never);
    await expect(legacyListingTarget('99')).resolves.toBe('/annonces');
    prismaMock.listing.findUnique.mockResolvedValueOnce(null as never);
    await expect(legacyListingTarget('98')).resolves.toBe('/annonces');
    await expect(legacyListingTarget('1 OR 1=1')).resolves.toBe('/annonces');
    expect(prismaMock.listing.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('legacyAgentTarget', () => {
  it('sends an imported agent to their profile, anything else to the directory', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'cmagent1',
      accountType: 'OWNER_AGENT',
    } as never);
    await expect(legacyAgentTarget('42')).resolves.toBe('/agents/cmagent1');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { legacyId: 'dem:42' } }),
    );
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'x',
      accountType: 'TENANT_BUYER',
    } as never);
    await expect(legacyAgentTarget('43')).resolves.toBe('/agents');
    await expect(legacyAgentTarget('abc')).resolves.toBe('/agents');
  });
});
