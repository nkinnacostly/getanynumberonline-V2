import { pageRange } from "@/lib/pagination";

/**
 * Running one page of a Supabase list query.
 *
 * PostgREST does not answer an offset past the end of the table with an empty
 * page — it answers 416 / PGRST103 "Requested range not satisfiable". `?page=`
 * is in the URL, so that is something anyone can type, arrive at from a stale
 * bookmark, or reach by deleting rows while on the last page. Left alone it
 * surfaces as "we could not load your orders", which is a lie: the query was
 * fine, the page just does not exist.
 *
 * So an out-of-range page lands on the last real one, and the caller is told
 * which page it actually got, so the pager highlights the truth rather than
 * the number that was asked for.
 */

/** A page of rows, as PostgREST returns it. */
export interface RangeResponse<T> {
  data: T[] | null;
  error: { code?: string; message: string } | null;
  count: number | null;
}

export type RangeFetch<T> = (from: number, to: number) => PromiseLike<RangeResponse<T>>;

export interface PagedResult<T> {
  rows: T[];
  total: number;
  /** The page actually served — not necessarily the one requested. */
  page: number;
  /** The query genuinely failed. An out-of-range page is NOT a failure. */
  failed: boolean;
}

/** PostgREST's code for "you asked for rows past the end". */
const RANGE_NOT_SATISFIABLE = "PGRST103";

export async function fetchPage<T>(
  run: RangeFetch<T>,
  page: number,
  pageSize: number,
): Promise<PagedResult<T>> {
  const { from, to } = pageRange(page, pageSize);
  const res = await run(from, to);

  if (res.error?.code === RANGE_NOT_SATISFIABLE) {
    // Only the out-of-range path pays for the extra round trip. Asking for a
    // single row is the cheapest way to be told the real count.
    const probe = await run(0, 0);
    const total = probe.count ?? 0;
    const last = Math.max(1, Math.ceil(total / pageSize));
    const lastRange = pageRange(last, pageSize);
    const retry = await run(lastRange.from, lastRange.to);
    return {
      rows: retry.data ?? [],
      total: retry.count ?? total,
      page: last,
      failed: !!retry.error,
    };
  }

  return {
    rows: res.data ?? [],
    total: res.count ?? 0,
    page,
    failed: !!res.error,
  };
}
