// ADMIN-FEEDBACK-01 — GET /api/admin/request-feedback
//
// Read-only trace of the requester follow-up (/avis/<token>): who was asked,
// whether an agent made contact, the ratings left and the reminders sent.
// ?filter=no-contact | pending | answered | opted-out (default: all).
// Read-only, so no logAdminAction.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const filter = req.nextUrl.searchParams.get('filter');
    const where: Prisma.RequestFeedbackWhereInput =
      filter === 'no-contact'
        ? { contacted: false }
        : filter === 'pending'
          ? { submittedAt: null, optedOutAt: null }
          : filter === 'answered'
            ? { submittedAt: { not: null } }
            : filter === 'opted-out'
              ? { optedOutAt: { not: null } }
              : {};

    const [rows, total, noContact, pending, answered] = await Promise.all([
      prisma.requestFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIMIT,
        select: {
          id: true,
          contacted: true,
          comment: true,
          submittedAt: true,
          optedOutAt: true,
          reminderCount: true,
          lastSentAt: true,
          createdAt: true,
          request: {
            select: {
              id: true,
              clientName: true,
              city: true,
              country: true,
              propertyType: true,
              transactionType: true,
            },
          },
          reviews: {
            select: { rating: true, agent: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.requestFeedback.count(),
      prisma.requestFeedback.count({ where: { contacted: false } }),
      prisma.requestFeedback.count({ where: { submittedAt: null, optedOutAt: null } }),
      prisma.requestFeedback.count({ where: { submittedAt: { not: null } } }),
    ]);

    return NextResponse.json(
      { items: rows, counts: { total, noContact, pending, answered } },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
