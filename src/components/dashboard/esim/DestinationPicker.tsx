"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogScope, EsimDestination } from "@/lib/esim-api";

const SCOPES: { value: CatalogScope; label: string; hint: string }[] = [
  { value: "country", label: "Country", hint: "One destination" },
  { value: "region", label: "Regional", hint: "Multi-country" },
  { value: "global", label: "Global", hint: "Worldwide" },
];

/**
 * Step 1 of the eSIM buy flow: pick where the data should work.
 *
 * SimJuno pre-groups its catalog into countries, regional bundles and global
 * bundles — all addressed by the same slug — so every scope renders a picker
 * over one list: searchable cards for countries, tappable bundle cards for
 * regions/global. Picking any of them loads plans below.
 */
export default function DestinationPicker({
  scope,
  onScopeChange,
  destinations,
  destination,
  onDestinationChange,
  loading,
}: {
  scope: CatalogScope;
  onScopeChange: (s: CatalogScope) => void;
  destinations: EsimDestination[];
  destination: EsimDestination | null;
  onDestinationChange: (d: EsimDestination | null) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = search
    ? destinations.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : destinations;

  return (
    <div>
      <label className="block text-[12px] mb-1.5" style={{ color: "var(--muted)" }}>
        Step 1 — Where do you need data?
      </label>

      {/* Coverage type */}
      <div
        className="flex rounded-[6px] p-1 mb-3"
        style={{ backgroundColor: "var(--field)", border: "1px solid var(--line-strong)" }}
      >
        {SCOPES.map((s) => {
          const active = scope === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onScopeChange(s.value)}
              className="flex-1 h-[38px] rounded-[4px] text-[13px] font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--accent)" : "transparent",
                color: active ? "var(--background)" : "var(--muted)",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-2">
          <span
            className="auth-spinner"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-[12px]" style={{ color: "var(--muted)" }}>
            Loading destinations…
          </span>
        </div>
      )}

      {/* Country search */}
      {scope === "country" && !loading && (
        <div ref={dropRef} className="relative">
          <input
            type="text"
            value={destination ? destination.name : search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDrop(true);
              onDestinationChange(null);
            }}
            onFocus={() => setShowDrop(true)}
            placeholder="Search a country…"
            className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
            style={{
              backgroundColor: "var(--field)",
              border: "1px solid var(--line-strong)",
              color: "var(--foreground)",
            }}
          />
          {showDrop && (
            <div
              className="absolute z-20 w-full mt-1 rounded-[6px] max-h-[240px] overflow-y-auto"
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--line)",
              }}
            >
              {filtered.slice(0, 80).map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onDestinationChange(c);
                    setSearch("");
                    setShowDrop(false);
                  }}
                  className="w-full px-3 py-2 text-left text-[13px] hover:bg-line transition-colors flex justify-between gap-2"
                  style={{ color: "var(--foreground)" }}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span
                    className="font-mono text-[11px] shrink-0"
                    style={{ color: "var(--muted)" }}
                  >
                    from ${c.from_price.toFixed(2)}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div
                  className="px-3 py-3 text-[13px]"
                  style={{ color: "var(--muted)" }}
                >
                  No countries found
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Regional + global bundles */}
      {(scope === "region" || scope === "global") && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {destinations.map((d) => {
            const active = destination?.code === d.code;
            return (
              <button
                key={d.code}
                type="button"
                onClick={() => onDestinationChange(active ? null : d)}
                className="text-left rounded-[6px] p-3 transition-colors"
                style={{
                  backgroundColor: "var(--field)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--line-strong)"}`,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[13px] font-semibold min-w-0 truncate"
                    style={{ color: "var(--foreground)" }}
                  >
                    {d.name}
                  </span>
                  <span
                    className="font-mono text-[12px] font-bold shrink-0"
                    style={{ color: "var(--accent)" }}
                  >
                    ${d.from_price.toFixed(2)}
                  </span>
                </div>
              </button>
            );
          })}
          {destinations.length === 0 && (
            <p className="text-[13px] py-2" style={{ color: "var(--muted)" }}>
              No bundles available right now.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
