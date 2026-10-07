// Token spending guard. Routes check the balance up front for a friendly
// 422, but that read happens outside the transaction: two concurrent spends
// can both pass it. The wallet decrement itself is atomic (row lock), so the
// transaction re-checks the balance it produced and throws when it went
// negative — the whole transaction rolls back and the route answers 422.
import 'server-only';

export class InsufficientTokensError extends Error {
  constructor() {
    super('INSUFFICIENT_TOKENS');
    this.name = 'InsufficientTokensError';
  }
}

/** Call with the wallet row returned by the `{ decrement }` update, inside the tx. */
export function assertBalanceNotNegative(wallet: { balance: number }): void {
  if (wallet.balance < 0) throw new InsufficientTokensError();
}
