import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_PRICING } from '@/lib/pricing';

vi.mock('@/lib/server/pricing', () => ({ getPricing: vi.fn(async () => DEFAULT_PRICING) }));

import { GET } from './route';

describe('GET /api/pricing', () => {
  it('is public and returns the live pricing', async () => {
    const res = await GET(new NextRequest('http://test/api/pricing'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pricing: typeof DEFAULT_PRICING };
    expect(body.pricing.token.baseFcfa).toBe(300);
  });
});
