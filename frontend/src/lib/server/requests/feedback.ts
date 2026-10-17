// Requester feedback ("avis du demandeur").
//
// Whoever submitted a PropertyRequest gets an e-mail asking whether an agent
// got in touch and how it went. The first e-mail goes out
// FEEDBACK_FIRST_DELAY_MS after the request, then a reminder every
// FEEDBACK_REMINDER_INTERVAL_MS until the requester answers or opts out.
//
// The answer becomes AgentReview rows (so the ratings feed the agents' public
// profile) plus the RequestFeedback row kept for the admin trace. A
// "no agent contacted me" answer alerts the admins.
//
// Sending is OFF unless REQUEST_FEEDBACK_ENABLED=1, and only considers
// requests created on/after REQUEST_FEEDBACK_SINCE (ISO date, optional) —
// so deploying never mass-mails old requests by surprise. Requests imported
// from the legacy site (legacyId set) are never contacted.
import 'server-only';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '../logger';
import { createNotification } from '../notifications';
import { requestNoContactNotification } from '../notifications/templates';
import { getEmailQueue } from '../queues/email-queue-singleton';
import { requestFeedbackEmail } from '../emails/templates';
import { PROPERTY_TYPE_LABEL, TRANSACTION_TYPE_LABEL } from '@/lib/listings';

const log = createLogger();

const DAY_MS = 86_400_000;
export const FEEDBACK_FIRST_DELAY_MS = 3 * DAY_MS;
export const FEEDBACK_REMINDER_INTERVAL_MS = 7 * DAY_MS;
export const FEEDBACK_BATCH_SIZE = 50;

export function newFeedbackToken(): string {
  return randomBytes(24).toString('base64url');
}

/** "Awa Sossou" → "Awa S." — what the public profile shows for an anonymous requester. */
export function authorLabelFor(clientName: string): string {
  const parts = clientName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'Un client';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export interface FeedbackRequestInfo {
  transactionType: string;
  propertyType: string;
  country: string;
  city: string;
}

export function requestSummary(r: FeedbackRequestInfo): string {
  const property = PROPERTY_TYPE_LABEL[r.propertyType] ?? r.propertyType;
  const transaction = TRANSACTION_TYPE_LABEL[r.transactionType] ?? r.transactionType;
  return `${property} · ${transaction} · ${r.city}, ${r.country}`;
}

export function feedbackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REQUEST_FEEDBACK_ENABLED === '1';
}

function eligibleSince(env: NodeJS.ProcessEnv = process.env): Date | null {
  const raw = (env.REQUEST_FEEDBACK_SINCE ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ───────────────────────────────────────────────────────────────────────
// Which agents can be rated
// ───────────────────────────────────────────────────────────────────────

export interface InvolvedAgent {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Agents who got access to the requester: they bought the lead (ACTIVE
 * purchase) or opened the request from an alert match. Only these can be
 * rated through the requester's form.
 */
export async function involvedAgents(
  prisma: PrismaClient,
  requestId: string,
): Promise<InvolvedAgent[]> {
  const [purchases, matches] = await Promise.all([
    prisma.leadPurchase.findMany({
      where: { requestId, status: 'ACTIVE' },
      select: { agentId: true },
    }),
    prisma.alertMatch.findMany({
      where: { propertyRequestId: requestId, viewedAt: { not: null } },
      select: { alert: { select: { userId: true } } },
    }),
  ]);
  const ids = [
    ...new Set([...purchases.map((p) => p.agentId), ...matches.map((m) => m.alert.userId)]),
  ];
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids }, accountType: 'OWNER_AGENT' },
    select: { id: true, name: true, avatarUrl: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

// ───────────────────────────────────────────────────────────────────────
// Sending (called by the cron)
// ───────────────────────────────────────────────────────────────────────

export interface SendResult {
  /** `false` when the feature is off or the mailer is not configured. */
  active: boolean;
  first: number;
  reminders: number;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

export async function sendDueFeedbackEmails(
  prisma: PrismaClient,
  now: Date = new Date(),
  limit: number = FEEDBACK_BATCH_SIZE,
): Promise<SendResult> {
  const off: SendResult = { active: false, first: 0, reminders: 0 };
  if (!feedbackEnabled()) return off;

  const base = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) {
    log.warn('request-feedback: APP_URL not set — the e-mail links would be empty, not sending');
    return off;
  }
  const queue = getEmailQueue();
  if (!queue) {
    log.warn('request-feedback: e-mail queue not configured — nothing sent');
    return off;
  }

  const since = eligibleSince();
  const result: SendResult = { active: true, first: 0, reminders: 0 };

  async function send(
    to: string,
    token: string,
    request: FeedbackRequestInfo & { clientName: string },
    reminder: boolean,
  ): Promise<void> {
    await queue!.enqueue({
      to,
      ...requestFeedbackEmail({
        name: request.clientName,
        summary: requestSummary(request),
        token,
        reminder,
        stopUrl: `${base}/avis/${token}?stop=1`,
      }),
    });
  }

  // 1. First e-mail — requests old enough that never got one.
  const fresh = await prisma.propertyRequest.findMany({
    where: {
      feedback: null,
      legacyId: null,
      trustStatus: 'TRUSTED',
      AND: [{ clientEmail: { not: null } }, { clientEmail: { not: '' } }],
      createdAt: {
        lte: new Date(now.getTime() - FEEDBACK_FIRST_DELAY_MS),
        ...(since ? { gte: since } : {}),
      },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      clientName: true,
      clientEmail: true,
      transactionType: true,
      propertyType: true,
      country: true,
      city: true,
    },
  });

  for (const r of fresh) {
    if (!r.clientEmail) continue;
    const token = newFeedbackToken();
    // Claim first (unique requestId): a concurrent run loses the insert and skips.
    let feedbackId: string;
    try {
      const row = await prisma.requestFeedback.create({
        data: { requestId: r.id, token, reminderCount: 1, lastSentAt: now },
        select: { id: true },
      });
      feedbackId = row.id;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
    try {
      await send(r.clientEmail, token, r, false);
      result.first++;
    } catch (err) {
      await prisma.requestFeedback.delete({ where: { id: feedbackId } }).catch(() => undefined);
      log.warn('request-feedback: first e-mail failed', {
        requestId: r.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Reminders — every 7 days until answered or opted out.
  const remaining = Math.max(0, limit - fresh.length);
  if (remaining === 0) return result;
  const due = await prisma.requestFeedback.findMany({
    where: {
      submittedAt: null,
      optedOutAt: null,
      lastSentAt: { lte: new Date(now.getTime() - FEEDBACK_REMINDER_INTERVAL_MS) },
      request: {
        trustStatus: 'TRUSTED',
        AND: [{ clientEmail: { not: null } }, { clientEmail: { not: '' } }],
      },
    },
    orderBy: { lastSentAt: 'asc' },
    take: remaining,
    select: {
      id: true,
      token: true,
      lastSentAt: true,
      request: {
        select: {
          clientName: true,
          clientEmail: true,
          transactionType: true,
          propertyType: true,
          country: true,
          city: true,
        },
      },
    },
  });

  for (const f of due) {
    const to = f.request.clientEmail;
    if (!to || !f.lastSentAt) continue;
    // Claim by compare-and-swap on lastSentAt: only one runner wins.
    const claimed = await prisma.requestFeedback.updateMany({
      where: { id: f.id, submittedAt: null, optedOutAt: null, lastSentAt: f.lastSentAt },
      data: { lastSentAt: now, reminderCount: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    try {
      await send(to, f.token, f.request, true);
      result.reminders++;
    } catch (err) {
      await prisma.requestFeedback
        .update({
          where: { id: f.id },
          data: { lastSentAt: f.lastSentAt, reminderCount: { decrement: 1 } },
        })
        .catch(() => undefined);
      log.warn('request-feedback: reminder failed', {
        feedbackId: f.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────
// Public form (token = the secret)
// ───────────────────────────────────────────────────────────────────────

export interface FeedbackForm {
  firstName: string;
  summary: string;
  submitted: boolean;
  optedOut: boolean;
  agents: InvolvedAgent[];
}

export async function loadFeedbackForm(
  prisma: PrismaClient,
  token: string,
): Promise<FeedbackForm | null> {
  const feedback = await prisma.requestFeedback.findUnique({
    where: { token },
    select: {
      requestId: true,
      submittedAt: true,
      optedOutAt: true,
      request: {
        select: {
          clientName: true,
          transactionType: true,
          propertyType: true,
          country: true,
          city: true,
        },
      },
    },
  });
  if (!feedback) return null;
  const submitted = feedback.submittedAt !== null;
  return {
    firstName: feedback.request.clientName.trim().split(/\s+/)[0] ?? '',
    summary: requestSummary(feedback.request),
    submitted,
    optedOut: feedback.optedOutAt !== null,
    agents: submitted ? [] : await involvedAgents(prisma, feedback.requestId),
  };
}

export interface FeedbackAnswer {
  contacted: boolean;
  ratings: { agentId: string; rating: number }[];
  comment?: string | undefined;
}

export type SubmitOutcome =
  | { ok: true }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'ALREADY_SUBMITTED' | 'AGENT_NOT_ALLOWED' | 'RATING_REQUIRED' | 'INVALID';
    };

export async function submitFeedback(
  prisma: PrismaClient,
  token: string,
  answer: FeedbackAnswer,
): Promise<SubmitOutcome> {
  const feedback = await prisma.requestFeedback.findUnique({
    where: { token },
    select: {
      id: true,
      requestId: true,
      submittedAt: true,
      request: {
        select: {
          clientName: true,
          transactionType: true,
          propertyType: true,
          country: true,
          city: true,
        },
      },
    },
  });
  if (!feedback) return { ok: false, code: 'NOT_FOUND' };
  if (feedback.submittedAt) return { ok: false, code: 'ALREADY_SUBMITTED' };

  const agentIds = answer.ratings.map((r) => r.agentId);
  if (new Set(agentIds).size !== agentIds.length) return { ok: false, code: 'INVALID' };
  if (!answer.contacted && answer.ratings.length > 0) return { ok: false, code: 'INVALID' };

  const allowed = await involvedAgents(prisma, feedback.requestId);
  const allowedIds = new Set(allowed.map((a) => a.id));
  if (agentIds.some((id) => !allowedIds.has(id))) return { ok: false, code: 'AGENT_NOT_ALLOWED' };
  // Someone was involved: a "yes, contacted" answer must say how it went.
  if (answer.contacted && allowed.length > 0 && answer.ratings.length === 0) {
    return { ok: false, code: 'RATING_REQUIRED' };
  }

  const comment = (answer.comment ?? '').trim();
  const label = authorLabelFor(feedback.request.clientName);

  const won = await prisma.$transaction(async (tx) => {
    // Compare-and-swap on submittedAt: a double submit creates the reviews once.
    const claimed = await tx.requestFeedback.updateMany({
      where: { id: feedback.id, submittedAt: null },
      data: { contacted: answer.contacted, comment: comment || null, submittedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    for (const r of answer.ratings) {
      await tx.agentReview.create({
        data: {
          agentId: r.agentId,
          requestFeedbackId: feedback.id,
          authorLabel: label,
          rating: r.rating,
          comment,
        },
      });
    }
    return true;
  });
  if (!won) return { ok: false, code: 'ALREADY_SUBMITTED' };

  if (!answer.contacted) await notifyAdminsNoContact(prisma, feedback.requestId, feedback.request);
  return { ok: true };
}

/** Unsubscribe from the reminders (also the target of the one-click link). */
export async function optOutOfFeedback(prisma: PrismaClient, token: string): Promise<boolean> {
  const res = await prisma.requestFeedback.updateMany({
    where: { token, optedOutAt: null },
    data: { optedOutAt: new Date() },
  });
  if (res.count === 1) return true;
  // Already opted out counts as success; an unknown token does not.
  const existing = await prisma.requestFeedback.findUnique({
    where: { token },
    select: { id: true },
  });
  return existing !== null;
}

/** "Nobody called me" → tell the admins so they can follow up. Never throws. */
async function notifyAdminsNoContact(
  prisma: PrismaClient,
  requestId: string,
  request: FeedbackRequestInfo,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
      select: { id: true },
    });
    const summary = requestSummary(request);
    for (const admin of admins) {
      await createNotification(prisma, requestNoContactNotification(admin.id, requestId, summary));
    }
  } catch (err) {
    log.warn('request-feedback: admin notify failed', {
      requestId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
