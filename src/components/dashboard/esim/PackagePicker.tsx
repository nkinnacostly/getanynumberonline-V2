"use client";

import { type EsimPackage, packageSummary } from "@/lib/esim-api";

/**
 * Step 2 of the eSIM buy flow: pick a plan.
 *
 * SimJuno's sellable plans are all fixed-allowance — a pot of data over a
 * fixed validity, priced up front. (Day-pass plans exist upstream but can't be
 * ordered through its API, so the catalog filters them out before they get
 * here.)
 */
export default function PackagePicker({
  packages,
  loading,
  selected,
  onSelect,
  emptyLabel,
}: {
  packages: EsimPackage[];
  loading: boolean;
  selected: EsimPackage | null;
  onSelect: (p: EsimPackage) => void;
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
        const active = selected?.slug === p.slug;
        return (
          <div
            key={p.slug}
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
                  {p.data_gb} GB
                </span>
                <span
                  className="font-mono text-[14px] font-bold shrink-0"
                  style={{ color: "var(--accent)" }}
                >
                  ${p.price.toFixed(2)}
                </span>
              </div>
              <div
                className="font-mono text-[11px] mt-1"
                style={{ color: "var(--muted)" }}
              >
                {packageSummary(p)}
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
          </div>
        );
      })}
    </div>
  );
}
