// PUT /api/admin/pricing — SUPERADMIN only. Replaces the live pricing config
// (plan prices + quotas, token base rate, pack discounts). Every change is
// audited with the before/after snapshot.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { PricingDataSchema } from '@/lib/pricing';
import { logAdminAction } from '@/lib/server/admin/audit';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPricing, savePricing } from '@/lib/server/pricing';
import { prisma } from '@/lib/server/prisma';

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = PricingDataSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid pricing', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const before = await getPricing();
    await savePricing(parsed.data, auth.admin.id);
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'PRICING_UPDATED',
      targetType: 'PricingConfig',
      targetId: 'default',
      metadata: { before, after: parsed.data },
    });

    return NextResponse.json(
      { pricing: parsed.data },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
