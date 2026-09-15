/**
 * How `page` and `size` are read out of a URL, in one place.
 *
 * Both halves of the app need the same answer. The dashboard tables parse
 * these in a Server Component to build the query; the admin tables parse them
 * in the browser to build the edge call. Two hand-rolled parsers would drift —
 * and they had already started to: the server pages clamped `page` and the
 * admin pages did not read it at all.
 *
 * No "use client" here on purpose, so a Server Component can import it.
 */

/** Rows per page offered in the picker. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * The dashboard tables sit under other content and default to a short list,
 * so they offer their own set rather than starting at 10.
 */
export const DASHBOARD_PAGE_SIZES = [8, 25, 50, 100] as const;

/** admin-api clamps `limit` to this; asking for more just gets this back. */
export const MAX_PAGE_SIZE = 100;

/** Rows per page on the admin tables. */
export const ADMIN_PAGE_SIZE = 25;

/** Rows per page on the wallet and history tables. */
export const DASHBOARD_PAGE_SIZE = 8;

/** A positive integer, or the fallback. Junk in a URL must not break a page. */
function positiveInt(raw: string | null | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** `?page=` → a 1-based page number. */
export function readPage(raw: string | null | undefined): number {
  return positiveInt(raw, 1);
}

/**
 * `?size=` → rows per page.
 *
 * Clamped rather than restricted to PAGE_SIZES: `?size=37` is a reasonable
 * thing to type by hand, and the server would clamp it anyway. The picker adds
 * the current value to its options so the control never renders blank.
 */
export function readSize(raw: string | null | undefined, fallback: number): number {
  return Math.min(positiveInt(raw, fallback), MAX_PAGE_SIZE);
}

/** The `.range(from, to)` pair a Supabase query wants. */
export function pageRange(page: number, size: number) {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}
