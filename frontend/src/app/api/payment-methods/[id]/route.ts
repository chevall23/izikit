// PAYMETH-03 — PATCH /api/payment-methods/[id]
//
// Sets a saved Mobile Money preference as the default ("Définir par défaut"
// action). Only the `isDefault: true` transition is supported through this
// route — operator/phone are immutable after creation (delete + recreate
// instead, same posture as listings PATCH being narrow-purpose).
//
// PAYMETH-04 — DELETE /api/payment-methods/[id]
//
// Deletes an owned preference ("Supprimer" action). Only the owning user can
// mutate their own rows — 404 (not 403) on mismatch/missing, same convention
// as /api/alerts/[id].
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SELECT = {
  id: true,
  operator: true,
  phone: true,
  label: true,
  isDefault: true,
  createdAt: true,
} as const;

const PatchBody = z.object({
  isDefault: z.literal(true),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.paymentMethodPreference.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing || existing.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'PAYMENT_METHOD_NOT_FOUND', message: 'Payment method not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const method = await prisma.$transaction(async (tx) => {
      await tx.paymentMethodPreference.updateMany({
        where: { userId: auth.user.sub, isDefault: true },
        data: { isDefault: false },
      });
      return tx.paymentMethodPreference.update({
        where: { id },
        data: { isDefault: true },
        select: SELECT,
      });
    });

    return NextResponse.json({ method }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    const existing = await prisma.paymentMethodPreference.findUnique({
      where: { id },
      select: { userId: true, isDefault: true },
    });
    if (!existing || existing.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'PAYMENT_METHOD_NOT_FOUND', message: 'Payment method not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentMethodPreference.delete({ where: { id } });
      // Promote the most recently created remaining entry to default so the
      // user never ends up with saved methods but none marked default.
      if (existing.isDefault) {
        const next = await tx.paymentMethodPreference.findFirst({
          where: { userId: auth.user.sub },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (next) {
          await tx.paymentMethodPreference.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
