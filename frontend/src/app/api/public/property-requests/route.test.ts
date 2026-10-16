// PUBLIC-PROPERTY-REQUEST-01 — POST /api/public/property-requests tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/requests/review-notify', () => ({
  notifyAdminsOfReviewRequest: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/alerts/matching', () => ({
  runMatchingForNewRequest: vi.fn().mockResolvedValue(undefined),
}));

import { POST, GET } from './route';
import { runMatchingForNewRequest } from '@/lib/server/alerts/matching';
import { notifyAdminsOfReviewRequest } from '@/lib/server/requests/review-notify';

function makePost(body: unknown, opts: { ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = {
    'x-forwarded-for': opts.ip ?? `test-ip-${Math.random()}`,
  };
  return new NextRequest('http://test/api/public/property-requests', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/public/property-requests');
}

const validBody = {
  transactionType: 'VENTE',
  propertyType: 'VILLA',
  country: "Côte d'Ivoire",
  city: 'Abidjan',
  financing: 'Comptant',
  delay: 'Immédiat',
  bedrooms: '3 chambres',
  salons: '1 salon',
  budgetMin: 80_000_000,
  budgetMax: 200_000_000,
  clientName: 'Awa Diop',
  clientPhone: '+225 07 48 29 61 53',
  clientEmail: 'awa.diop@gmail.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.propertyRequest.create.mockResolvedValue({
    id: 'preq-1',
    status: 'EN_ATTENTE',
    createdAt: new Date(),
  } as never);
});

describe('POST /api/public/property-requests', () => {
  it('400s on invalid body', async () => {
    const res = await POST(makePost({ transactionType: 'VENTE' }));
    expect(res.status).toBe(400);
  });

  it.each([
    ['the budget', { budgetMin: undefined, budgetMax: undefined }],
    ['the maximum budget', { budgetMax: undefined }],
    ['the email', { clientEmail: undefined }],
    ['bedrooms and salons on a villa', { bedrooms: undefined, salons: undefined }],
  ])('400s when %s is missing', async (_label, patch) => {
    const res = await POST(makePost({ ...validBody, ...patch }));
    expect(res.status).toBe(400);
    expect(prismaMock.propertyRequest.create).not.toHaveBeenCalled();
  });

  it('400s when the maximum budget is below the minimum', async () => {
    const res = await POST(makePost({ ...validBody, budgetMin: 200, budgetMax: 100 }));
    expect(res.status).toBe(400);
  });

  it('400s on an implausible phone number or name', async () => {
    expect((await POST(makePost({ ...validBody, clientPhone: '12' }))).status).toBe(400);
    expect((await POST(makePost({ ...validBody, clientName: '12345' }))).status).toBe(400);
  });

  it('requires the surface for land and the capacity for halls', async () => {
    const land = { ...validBody, propertyType: 'PARCELLE', bedrooms: undefined, salons: undefined };
    expect((await POST(makePost(land))).status).toBe(400);
    expect((await POST(makePost({ ...land, surfaceMin: 600 }))).status).toBe(201);
    const hall = { ...land, propertyType: 'SALLE_FETE' };
    expect((await POST(makePost(hall))).status).toBe(400);
    expect((await POST(makePost({ ...hall, capacity: 200 }))).status).toBe(201);
  });

  it('creates the request with userId=null and source="Site web"', async () => {
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    expect(prismaMock.propertyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          transactionType: 'VENTE',
          propertyType: 'VILLA',
          clientName: 'Awa Diop',
          source: 'Site web',
        }),
      }),
    );
  });

  it('merges surface min/max into notes and stores the min as surfaceM2', async () => {
    await POST(makePost({ ...validBody, surfaceMin: 150, surfaceMax: 350 }));
    expect(prismaMock.propertyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          surfaceM2: 150,
          notes: expect.stringContaining('150 – 350 m²'),
        }),
      }),
    );
  });

  it('stores the trust assessment with the request and the phone key', async () => {
    await POST(makePost(validBody));
    expect(prismaMock.propertyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trustStatus: 'TRUSTED',
          trustScore: 100,
          trustFlags: [],
          clientPhoneKey: '48296153',
        }),
      }),
    );
  });

  it('saves a doubtful request for review and keeps it away from agents', async () => {
    const res = await POST(
      makePost({
        ...validBody,
        clientPhone: '+225 00 00 00 00 00',
        clientEmail: 'x@mailinator.com',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.propertyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trustStatus: 'REVIEW', trustFlags: expect.any(Array) }),
      }),
    );
    expect(runMatchingForNewRequest).not.toHaveBeenCalled();
    expect(notifyAdminsOfReviewRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'preq-1', city: 'Abidjan' }),
      expect.arrayContaining(['PHONE_PATTERN']),
    );
  });

  it('does not notify the admins for a trusted request nor for a bot', async () => {
    await POST(makePost(validBody));
    await POST(makePost({ ...validBody, website: 'http://spam.example' }));
    expect(notifyAdminsOfReviewRequest).not.toHaveBeenCalled();
  });

  it('answers a bot (honeypot filled) like a normal visitor but marks it REJECTED', async () => {
    const res = await POST(makePost({ ...validBody, website: 'http://spam.example' }));
    expect(res.status).toBe(201);
    expect(prismaMock.propertyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ trustStatus: 'REJECTED' }) }),
    );
    expect(runMatchingForNewRequest).not.toHaveBeenCalled();
  });

  it('runs alert matching for the new request', async () => {
    await POST(makePost(validBody));
    expect(runMatchingForNewRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'preq-1', userId: null }),
    );
  });

  it('still returns 201 when matching throws', async () => {
    vi.mocked(runMatchingForNewRequest).mockRejectedValueOnce(new Error('matching down'));
    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
  });

  it('rejects a 6th request from the same IP within the window', async () => {
    const ip = 'fixed-rate-limit-ip-property-request';
    for (let i = 0; i < 5; i++) {
      const res = await POST(makePost(validBody, { ip }));
      expect(res.status).toBe(201);
    }
    const res = await POST(makePost(validBody, { ip }));
    expect(res.status).toBe(429);
  });
});

describe('GET /api/public/property-requests', () => {
  function makeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'preq-1',
      transactionType: 'VENTE',
      propertyType: 'VILLA',
      country: "Côte d'Ivoire",
      city: 'Abidjan',
      budgetMin: 80_000_000,
      budgetMax: 200_000_000,
      status: 'EN_ATTENTE',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      ...overrides,
    };
  }

  it('returns the 6 most recent requests, newest first', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce([makeRow()] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(prismaMock.propertyRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 6,
      }),
    );
  });

  it('never selects or leaks client contact info', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce([makeRow()] as never);
    const res = await GET(makeGet());
    const args = prismaMock.propertyRequest.findMany.mock.calls[0]?.[0];
    expect(args?.select).not.toHaveProperty('clientName');
    expect(args?.select).not.toHaveProperty('clientPhone');
    expect(args?.select).not.toHaveProperty('clientEmail');
    expect(args?.select).not.toHaveProperty('notes');
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/clientName|clientPhone|clientEmail/i);
  });

  it('maps rows to the flat DTO shape', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce([makeRow()] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.items).toEqual([
      {
        id: 'preq-1',
        transactionType: 'VENTE',
        propertyType: 'VILLA',
        country: "Côte d'Ivoire",
        city: 'Abidjan',
        budgetMin: 80_000_000,
        budgetMax: 200_000_000,
        status: 'EN_ATTENTE',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list when there are no requests yet', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValueOnce([] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.items).toEqual([]);
  });
});
