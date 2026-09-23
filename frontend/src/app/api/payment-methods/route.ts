// PAYMETH-01 — GET /api/payment-methods
//
// Lists the current user's saved Mobile Money preferences (/settings
// "Abonnement & paiement" > "Méthodes de paiement" card). Not a real
// payment-method vault — Bictorys exposes no tokenization API, so this only
// stores a non-sensitive operator + phone pair to pre-fill future checkouts.
// No pagination: a user is expected to have a handful of entries at most.
//
// PAYMETH-02 — POST /api/payment-methods
//
// Creates a preference. The first one a user saves is automatically the
// default; `isDefault: true` on creation demotes any prior default in the
// same transaction (Prisma has no partial-unique-index we can rely on
// across every target DB, so "at most one default" is enforced here).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const OPERATORS = ['ORANGE_MONEY', 'WAVE', 'FREE_MONEY'] as const;

const SELECT = {
  id: true,
  operator: true,
  phone: true,
  label: true,
  isDefault: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const methods = await prisma.paymentMethodPreference.findMany({
      where: { userId: auth.user.sub },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: SELECT,
    });

    return NextResponse.json({ methods }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

const CreateBody = z.object({
  operator: z.enum(OPERATORS),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^\+?[0-9 ]+$/, 'Invalid phone number'),
  label: z.string().trim().min(1).max(60).optional(),
  isDefault: z.boolean().default(false),
});

const MAX_METHODS_PER_USER = 10;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existingCount = await prisma.paymentMethodPreference.count({
      where: { userId: auth.user.sub },
    });
    if (existingCount >= MAX_METHODS_PER_USER) {
      return NextResponse.json(
        { error: 'TOO_MANY_PAYMENT_METHODS', message: `Limit of ${MAX_METHODS_PER_USER} reached` },
        { status: 422, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // First saved method is always the default, regardless of what the
    // client sent — there's no meaningful "not default" state with zero
    // prior entries.
    const makeDefault = parsed.data.isDefault || existingCount === 0;

    const method = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.paymentMethodPreference.updateMany({
          where: { userId: auth.user.sub, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.paymentMethodPreference.create({
        data: {
          userId: auth.user.sub,
          operator: parsed.data.operator,
          phone: parsed.data.phone,
          ...(parsed.data.label ? { label: parsed.data.label } : {}),
          isDefault: makeDefault,
        },
        select: SELECT,
      });
    });

    return NextResponse.json(
      { method },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
