"use client";

import {
  type EsimPackage,
  packagePrice,
  packageSummary,
} from "@/lib/esim-api";

const DAY_OPTIONS = [1, 3, 7, 15, 30] as const;

/**
 * Step 2 of the eSIM buy flow: pick a plan.
 *
 * Two plan shapes come back from eSIM Access. Fixed plans are a pot of data
 * over a fixed validity. Day passes (dataType 2-4) bill a daily allowance, so
 * they need a day count before a price can be shown at all — the selector
 * appears inline on the selected card and the price updates with it.
 */
export default function PackagePicker({
  packages,
  loading,
  selected,
  onSelect,
  days,
  onDaysChange,
  emptyLabel,
}: {
  packages: EsimPackage[];
  loading: boolean;
  selected: EsimPackage | null;
  onSelect: (p: EsimPackage) => void;
  days: number;
  onDaysChange: (d: number) => void;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span
          className="auth-spinner"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <p className="text-[13px] py-2" style={{ color: "var(--muted)" }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {packages.map((p) => {
        const active = selected?.code === p.code;
        const price = packagePrice(p, active ? days : 1);
        return (
          <div
            key={p.code}
            className="rounded-[6px] transition-colors"
            style={{
              backgroundColor: "var(--field)",
              border: `1px solid ${active ? "var(--accent)" : "var(--line-strong)"}`,
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="w-full text-left p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="font-mono text-[15px] font-bold"
                  style={{ color: "var(--foreground)" }}
                >
                  {p.data_type === 4 ? "Unlimited" : `${p.data_gb} GB`}
                </span>
                <span
                  className="font-mono text-[14px] font-bold shrink-0"
                  style={{ color: "var(--accent)" }}
                >
                  ${price.toFixed(2)}
                  {p.is_day_pass && !active && (
                    <span
                      className="text-[10px] font-normal"
                      style={{ color: "var(--muted)" }}
                    >
                      {" "}
                      /day
                    </span>
                  )}
                </span>
              </div>
              <div
                className="font-mono text-[11px] mt-1"
                style={{ color: "var(--muted)" }}
              >
                {packageSummary(p, active ? days : 1)}
                {p.speed ? ` · ${p.speed}` : ""}
              </div>
              {p.fup_policy && (
                <div
                  className="font-mono text-[10px] mt-1"
                  style={{ color: "var(--warning)" }}
                >
                  Then {p.fup_policy}
                </div>
              )}
            </button>

            {/* Day passes are priced per day — the count has to be chosen. */}
            {active && p.is_day_pass && (
              <div
                className="px-3 pb-3 pt-1"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <p className="text-[11px] mb-2 mt-2" style={{ color: "var(--muted)" }}>
                  How many days?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onDaysChange(d)}
                      className="h-[32px] min-w-[44px] px-2 rounded-[4px] font-mono text-[12px] transition-colors"
                      style={{
                        backgroundColor: days === d ? "var(--accent)" : "var(--surface)",
                        color: days === d ? "var(--background)" : "var(--foreground)",
                        border: `1px solid ${days === d ? "var(--accent)" : "var(--line-strong)"}`,
                      }}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
