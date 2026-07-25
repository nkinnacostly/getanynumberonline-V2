"use client";

/**
 * Shared pager for server-paginated lists (wallet, history, …).
 * Renders nothing when there's only one page. The parent owns navigation;
 * this component only reports which page was requested via onPage.
 */
export default function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const btn =
    "px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30";
  const btnStyle = {
    backgroundColor: "transparent",
    border: "1px solid #1A1A1A",
    color: "#F5F5F5",
  } as const;

  return (
    <div className="flex items-center justify-between mt-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={btn}
        style={btnStyle}
      >
        ← Prev
      </button>
      <span className="font-mono text-xs" style={{ color: "#555555" }}>
        Page {page} of {totalPages}
      </span>
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
