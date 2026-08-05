/**
 * Wallet top-up limits — the single source of truth.
 *
 * These bounds were previously duplicated as magic numbers across useTopup,
 * FundShortfall, WalletClient and FirstRunGuide, so changing the minimum meant
 * finding seven separate `5`s and hoping. Import from here instead: the input
 * `min`, the validation, the shortfall arithmetic and the user-facing copy all
 * have to agree, or someone gets a rejected payment with no explanation.
 */

/** Smallest top-up we accept, in USD. */
export const TOPUP_MIN = 1;

/** Largest single top-up, in USD. */
export const TOPUP_MAX = 500;

/**
 * One-tap amounts on the wallet page. Must start at TOPUP_MIN.
 * Typed as plain numbers, not a literal union — callers do membership tests
 * against arbitrary user input.
 */
export const QUICK_AMOUNTS: readonly number[] = [1, 5, 10, 20, 50];

/** Default offered to a brand-new user who has never funded. */
export const TOPUP_SUGGESTED = 5;

/** True when `amount` is a fundable value. */
export function isValidTopup(amount: number): boolean {
  return (
    Number.isFinite(amount) && amount >= TOPUP_MIN && amount <= TOPUP_MAX
  );
}

/**
 * The smallest permitted top-up that still covers a shortfall.
 * Rounded up to a whole dollar so the customer is never left a cent short.
 */
export function shortfallTopup(price: number, balance: number): number {
  return Math.min(TOPUP_MAX, Math.max(TOPUP_MIN, Math.ceil(price - balance)));
}

/** "between $1 and $500" — shared so copy can't drift from the validation. */
export const TOPUP_RANGE_LABEL = `between $${TOPUP_MIN} and $${TOPUP_MAX}`;
