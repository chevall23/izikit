// Buyer leads: public property requests whose contact details agents buy with
// tokens. Rules shared by the /api/leads routes. See the 1C spec.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { leadTokenCost, type PricingData } from '@/lib/pricing';

export const MAX_BUYERS = 3;
export const REPORT_WINDOW_MS = 72 * 3_600_000;
export const REFUND_CAP = 2;
export const REFUND_WINDOW_MS = 30 * 86_400_000;
export const LEAD_REPORTED_FLAG = 'LEAD_REPORTED_INVALID_NUMBER';

export function sellableWhere(): Prisma.PropertyRequestWhereInput {
  return { userId: null, trustStatus: 'TRUSTED', status: { not: 'CLOTUREE' } };
}

export function isSellable(r: { userId: string | null; trustStatus: string; status: string }) {
  return r.userId === null && r.trustStatus === 'TRUSTED' && r.status !== 'CLOTUREE';
}

// Fields visible BEFORE buying. No name, phone, e-mail, client type or notes.
export const PREVIEW_SELECT = {
  id: true,
  propertyType: true,
  transactionType: true,
  country: true,
  city: true,
  landmark: true,
  budgetMin: true,
  budgetMax: true,
  priority: true,
  delay: true,
  financing: true,
  createdAt: true,
} satisfies Prisma.PropertyRequestSelect;

export type PreviewRow = Prisma.PropertyRequestGetPayload<{ select: typeof PREVIEW_SELECT }>;

export interface LeadPreview extends PreviewRow {
  price: number;
  slotsLeft: number;
  purchased: boolean;
}

export function previewOf(
  row: PreviewRow,
  pricing: PricingData,
  activeCount: number,
  purchased: boolean,
): LeadPreview {
  return {
    id: row.id,
    propertyType: row.propertyType,
    transactionType: row.transactionType,
    country: row.country,
    city: row.city,
    landmark: row.landmark,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    priority: row.priority,
    delay: row.delay,
    financing: row.financing,
    createdAt: row.createdAt,
    price: leadTokenCost(pricing, row.priority),
    slotsLeft: Math.max(0, MAX_BUYERS - activeCount),
    purchased,
  };
}

export function contactOf(r: {
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  clientType: string;
  notes: string | null;
}) {
  return {
    clientName: r.clientName,
    clientPhone: r.clientPhone,
    clientEmail: r.clientEmail,
    clientType: r.clientType,
    notes: r.notes,
  };
}

export async function isAgent(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } });
  return u?.accountType === 'OWNER_AGENT';
}

export const AGENT_ONLY_BODY = {
  error: 'AGENT_ONLY',
  message: 'Réservé aux comptes agent.',
} as const;
