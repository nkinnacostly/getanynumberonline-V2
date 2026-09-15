"use client";

import { PAGE_SIZES } from "@/lib/pagination";

/**
 * Shared pager for server-paginated lists (wallet, history, every admin table).
 *
 * The parent owns navigation; this only reports what was asked for. Pair it
 * with `useTableParams` so both controls read and write the URL.
 *
 * The rows-per-page picker is optional, and shows only when there is more to
 * show than the smallest size — offering "10 / 25 / 50" above a three-row
 * table is a control with nothing to do.
 */
export default function Pager({
  page,
  totalPages,
  onPage,
  size,
  onSize,
  total,
  sizes = PAGE_SIZES,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  /** Current rows per page. Required for the size picker to render. */
  size?: number;
  onSize?: (s: number) => void;
  /** Total matching rows, so the picker can hide itself when it is pointless. */
  total?: number;
  /** Options in the picker. Defaults to the admin set. */
  sizes?: readonly number[];
}) {
  const showSize =
    !!onSize && size !== undefined && (total ?? 0) > Math.min(...sizes);

  if (totalPages <= 1 && !showSize) return null;

  const btn =
    "px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30";
  const btnStyle = {
    backgroundColor: "transparent",
    border: "1px solid var(--line)",
    color: "var(--foreground)",
  } as const;

  // A hand-typed ?size=37 is honoured, so it has to appear in the list or the
  // select would render blank and silently snap to 10 on the next change.
  const options =
    size !== undefined && !sizes.includes(size)
      ? [...sizes, size].sort((a, b) => a - b)
      : [...sizes];

  return (
    <div className="flex items-center justify-between gap-3 mt-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={btn}
        style={btnStyle}
      >
        ← Prev
      </button>

      <div className="flex items-center gap-3 min-w-0">
        {totalPages > 1 && (
          <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            Page {page} of {totalPages}
          </span>
        )}
        {showSize && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs sr-only sm:not-sr-only" style={{ color: "var(--muted)" }}>
              Rows
            </span>
            <select
              value={size}
              onChange={(e) => onSize(Number(e.target.value))}
              aria-label="Rows per page"
              className="h-[34px] px-2 rounded-lg font-mono text-xs outline-none"
              style={{
                backgroundColor: "var(--field)",
                border: "1px solid var(--line-strong)",
                color: "var(--foreground)",
              }}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className={btn}
        style={btnStyle}
      >
        Next →
      </button>
    </div>
  );
}
