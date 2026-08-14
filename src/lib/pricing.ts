/**
 * One-time number pricing — the single source of truth for the client.
 *
 * Previously this lived only inside OrderForm, which meant the new public
 * pricing pages would have needed a second copy. Two copies of a markup
 * formula is how you end up advertising one price and charging another.
 *
 * MUST stay in sync with the server-side markup in the order-number edge
 * function (see CLAUDE.md §12).
 */

/**
 * Tiered markup on SMSPool's wholesale price. Cheap numbers carry a higher
 * percentage so the absolute margin is worth the transaction; expensive ones
 * stay competitive. Rounded up to the nearest cent.
 */
export function applyMarkup(rawPrice: number): number {
  let markup: number;
  if (rawPrice < 0.1) markup = 0.4;
  else if (rawPrice <= 0.3) markup = 0.3;
  else markup = 0.2;
  return Math.ceil(rawPrice * (1 + markup) * 100) / 100;
}
