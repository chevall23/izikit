// Trust assessment of a property request, run before it is saved.
//
// It does NOT prove a request is genuine — nothing can without a phone/e-mail
// code. It catches the obvious junk (bots, fake numbers, throw-away e-mails,
// absurd budgets, repeated submissions) and gives agents an indicator they can
// rely on: a request whose score is under TRUST_THRESHOLD is saved but kept
// away from agents (alert matching, public list) until an admin approves it.
//
//   score = 100 − sum of the penalties of the flags raised
//   TRUSTED  score >= TRUST_THRESHOLD
//   REVIEW   score <  TRUST_THRESHOLD   (waits in /admin/demandes)
//   REJECTED honeypot filled (bot) or rejected by an admin
//
// A single mild flag (≤ 30) leaves the request TRUSTED; one strong flag or two
// mild ones send it to REVIEW.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { phoneDigits } from '@/lib/request-validation';

export type TrustStatus = 'TRUSTED' | 'REVIEW' | 'REJECTED';

export const TRUST_THRESHOLD = 70;

export const TRUST_PENALTY = {
  PHONE_PATTERN: 40, // 0000000, 1234567…
  DISPOSABLE_EMAIL: 40, // mailinator, yopmail…
  EMAIL_PATTERN: 25, // test@…, @example.com
  NAME_JUNK: 40, // "test", "aaaa", "azerty"
  NAME_SINGLE: 10, // a single word
  BUDGET_IMPLAUSIBLE: 30, // far from the market, or below an absolute floor
  DUPLICATE: 35, // same phone + same search within a week
  PHONE_FLOOD: 40, // same phone, 3+ requests within a day
} as const;

export type TrustFlag = keyof typeof TRUST_PENALTY | 'HONEYPOT';

export interface TrustInput {
  clientName: string;
  clientPhone: string;
  clientEmail?: string | undefined;
  transactionType: string;
  propertyType: string;
  country: string;
  city: string;
  budgetMin?: number | undefined;
  budgetMax?: number | undefined;
  /** Hidden form field: a human never fills it. */
  honeypot?: string | undefined;
}

export interface TrustResult {
  score: number;
  status: TrustStatus;
  flags: TrustFlag[];
  /** Phone key stored on the request for duplicate detection (null if too short). */
  phoneKey: string | null;
}

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'yopmail.com',
  'yopmail.fr',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'trashmail.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'throwawaymail.com',
  'fakeinbox.com',
]);

const PLACEHOLDER_DOMAINS = new Set(['example.com', 'example.org', 'test.com', 'email.com']);

const JUNK_WORD =
  /^(test|tester|testing|azerty|qwerty|asdf+|abc+|aaa+|xxx+|fake|inconnu|anonyme|nom|name|none|null)$/i;

export function phoneKeyOf(phone: string): string | null {
  const digits = phoneDigits(phone);
  return digits.length >= 8 ? digits.slice(-8) : null;
}

function phoneLooksFake(phone: string): boolean {
  const digits = phoneDigits(phone);
  if (digits.length < 8) return false;
  const national = digits.slice(-8);
  if (/^(\d)\1+$/.test(national)) return true; // 00000000
  if (/(\d)\1{5,}/.test(digits)) return true; // six identical digits in a row
  const asc = '01234567890123456789';
  const desc = '98765432109876543210';
  return asc.includes(national.slice(-7)) || desc.includes(national.slice(-7));
}

function emailFlags(email: string | undefined): TrustFlag[] {
  if (!email) return [];
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  if (DISPOSABLE_DOMAINS.has(domain)) return ['DISPOSABLE_EMAIL'];
  if (
    PLACEHOLDER_DOMAINS.has(domain) ||
    /^(test|tester|aaa+|abc+|xxx+|qwerty|azerty|asdf+|fake|none|noemail|email|mail)\d*$/.test(local)
  ) {
    return ['EMAIL_PATTERN'];
  }
  return [];
}

function nameFlags(name: string): TrustFlag[] {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return ['NAME_JUNK'];
  if (words.some((w) => JUNK_WORD.test(w)) || /(.)\1{3,}/u.test(name)) return ['NAME_JUNK'];
  if (words.length === 1) return ['NAME_SINGLE'];
  return [];
}

// Below these, a budget is not a real search (FCFA, smallest unit).
const BUDGET_FLOOR: Record<string, number> = {
  VENTE: 500_000,
  LOCATION: 5_000,
  SEJOUR: 1_000,
  AUBERGE: 1_000,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Pure part of the budget check; `marketMedian` is null when the sample is too small. */
export function budgetFlags(
  input: Pick<TrustInput, 'transactionType' | 'budgetMin' | 'budgetMax'>,
  marketMedian: number | null,
): TrustFlag[] {
  const { budgetMin, budgetMax, transactionType } = input;
  const floor = BUDGET_FLOOR[transactionType];
  if (floor !== undefined && budgetMax !== undefined && budgetMax < floor) {
    return ['BUDGET_IMPLAUSIBLE'];
  }
  if (marketMedian !== null) {
    if (budgetMax !== undefined && budgetMax < marketMedian * 0.05) return ['BUDGET_IMPLAUSIBLE'];
    if (budgetMin !== undefined && budgetMin > marketMedian * 20) return ['BUDGET_IMPLAUSIBLE'];
  }
  return [];
}

export function scoreFlags(flags: TrustFlag[]): Pick<TrustResult, 'score' | 'status'> {
  if (flags.includes('HONEYPOT')) return { score: 0, status: 'REJECTED' };
  const penalty = flags.reduce((sum, f) => sum + TRUST_PENALTY[f as keyof typeof TRUST_PENALTY], 0);
  const score = Math.max(0, 100 - penalty);
  return { score, status: score >= TRUST_THRESHOLD ? 'TRUSTED' : 'REVIEW' };
}

/** Median asking price of comparable VERIFIED listings, or null if fewer than 5. */
async function marketMedian(prisma: PrismaClient, input: TrustInput): Promise<number | null> {
  const where = {
    status: 'VERIFIED',
    country: input.country,
    propertyType: input.propertyType,
    transactionType: input.transactionType,
  };
  const inCity = await prisma.listing.findMany({
    where: { ...where, city: input.city },
    select: { price: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  });
  let prices = inCity.map((l) => l.price);
  if (prices.length < 5) {
    const inCountry = await prisma.listing.findMany({
      where,
      select: { price: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
    prices = inCountry.map((l) => l.price);
  }
  return prices.length >= 5 ? median(prices) : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function assessRequestTrust(
  prisma: PrismaClient,
  input: TrustInput,
  now: number = Date.now(),
): Promise<TrustResult> {
  const phoneKey = phoneKeyOf(input.clientPhone);
  const flags: TrustFlag[] = [];

  if (input.honeypot && input.honeypot.trim() !== '') flags.push('HONEYPOT');
  if (phoneLooksFake(input.clientPhone)) flags.push('PHONE_PATTERN');
  flags.push(...emailFlags(input.clientEmail));
  flags.push(...nameFlags(input.clientName));

  // Database-backed checks. They must never block a submission: if one fails,
  // the request is judged on the static signals only.
  try {
    flags.push(...budgetFlags(input, await marketMedian(prisma, input)));

    if (phoneKey) {
      const lastDay = await prisma.propertyRequest.count({
        where: { clientPhoneKey: phoneKey, createdAt: { gte: new Date(now - DAY_MS) } },
      });
      if (lastDay >= 3) flags.push('PHONE_FLOOD');

      const sameSearch = await prisma.propertyRequest.count({
        where: {
          clientPhoneKey: phoneKey,
          country: input.country,
          city: input.city,
          propertyType: input.propertyType,
          transactionType: input.transactionType,
          createdAt: { gte: new Date(now - 7 * DAY_MS) },
        },
      });
      if (sameSearch >= 1) flags.push('DUPLICATE');
    }
  } catch {
    // keep the static result
  }

  return { ...scoreFlags(flags), flags, phoneKey };
}
