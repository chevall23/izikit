// GET /api/pricing — public. Live plan prices, listing quotas and token rates
// so the UI never hard-codes numbers the server may have changed.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getPricing } from '@/lib/server/pricing';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const pricing = await getPricing();
    return NextResponse.json({ pricing }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
