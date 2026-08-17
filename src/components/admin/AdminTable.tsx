"use client";

import type { ReactNode } from "react";

/**
 * Shared chrome for the admin tables. Four pages render the same card +
 * horizontal-scroll + loading/empty states, so it lives here once.
 *
 * Responsive strategy: real <table> semantics (screen readers and copy-paste
 * both depend on them) inside an overflow-x container, with less critical
 * columns given `hidden sm:table-cell` / `hidden md:table-cell` by the caller.
 * The page body never scrolls sideways — only the table does.
 */

export function StatusBadge({ status }: { status: string }) {
  const tone = badgeTone(status);
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase whitespace-nowrap"
      style={{ backgroundColor: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
    >
      {status}
    </span>
  );
}

/** Status colours per CLAUDE.md §13. */
function badgeTone(status: string) {
  switch (status.toLowerCase()) {
    case "active":
    case "completed":
    case "success":
      return { bg: "#0A1F0A", fg: "#00FF94", border: "rgba(0,255,148,0.32)" };
    case "pending":
    case "refunded":
    case "refund":
    case "suspended":
      return { bg: "#1A1500", fg: "#F5A623", border: "rgba(245,166,35,0.32)" };
    case "cancelled":
    case "failed":
    case "banned":
      return { bg: "#1A0000", fg: "#FF4444", border: "rgba(255,68,68,0.32)" };
    default:
      // expired and anything unrecognised
      return { bg: "#141414", fg: "#555555", border: "#242424" };
  }
}

export function AdminCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      {children}
    </div>
  );
}

export function TableShell({
  head,
  children,
  loading,
  empty,
  emptyLabel = "Nothing to show",
  colSpan,
}: {
  head: ReactNode;
  children: ReactNode;
  loading: boolean;
  empty: boolean;
  emptyLabel?: string;
  colSpan: number;
}) {
  return (
    <AdminCard>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr style={{ borderBottom: "1px solid #1A1A1A" }}>{head}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="py-12">
                  <div className="flex justify-center">
                    <span
                      className="auth-spinner"
                      style={{ borderColor: "#00FF94", borderTopColor: "transparent" }}
                    />
                  </div>
                </td>
              </tr>
            ) : empty ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="py-12 text-center text-sm"
                  style={{ color: "#555555" }}
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );
}

/** Header cell. `hide` controls the responsive breakpoint it appears at. */
export function Th({
  children,
  hide,
  align = "left",
}: {
  children: ReactNode;
  hide?: "sm" | "md" | "lg";
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`${hideClass(hide)} px-4 py-3 text-[10px] font-mono font-medium uppercase tracking-wider whitespace-nowrap ${
        align === "right" ? "text-right" : "text-left"
      }`}
      style={{ color: "#555555" }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  hide,
  align = "left",
  mono,
  color = "#F5F5F5",
}: {
  children: ReactNode;
  hide?: "sm" | "md" | "lg";
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
}) {
  return (
    <td
      className={`${hideClass(hide)} px-4 py-3 text-[13px] ${
        mono ? "font-mono" : ""
      } ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color }}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr style={{ borderBottom: "1px solid #1A1A1A" }}>{children}</tr>;
}

function hideClass(hide?: "sm" | "md" | "lg") {
  if (hide === "sm") return "hidden sm:table-cell";
  if (hide === "md") return "hidden md:table-cell";
  if (hide === "lg") return "hidden lg:table-cell";
  return "";
}
