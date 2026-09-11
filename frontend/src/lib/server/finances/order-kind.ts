// Derives a UI-facing "kind" from `Order.metadata` — the only two revenue
// streams this starter actually generates orders for (see
// fulfillPaidOrder in lib/server/payments/fulfill-order.ts):
//   metadata.kind === 'token_purchase'          → jetons
//   metadata.kind === 'subscription_plan_change' → abonnement
// Anything else (missing/garbled metadata, a future order kind) falls back
// to OTHER rather than throwing — admin read paths tolerate malformed data.
//
// `Order.commissionAmount` / `netAmount` exist on the schema but no route
// in this codebase ever populates them (computeCommission() has zero
// callers) — there is no real "commission" revenue stream to report here,
// so the finances backend doesn't fabricate one.
import 'server-only';

export type OrderKind = 'TOKEN_PURCHASE' | 'SUBSCRIPTION' | 'OTHER';

export function orderKind(metadata: unknown): OrderKind {
  const kind = (metadata as { kind?: unknown } | null)?.kind;
  if (kind === 'token_purchase') return 'TOKEN_PURCHASE';
  if (kind === 'subscription_plan_change') return 'SUBSCRIPTION';
  return 'OTHER';
}
