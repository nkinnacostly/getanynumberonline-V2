"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CatalogScope,
  EsimDestination,
  EsimRegionGroup,
} from "@/lib/esim-api";

const SCOPES: { value: CatalogScope; label: string; hint: string }[] = [
  { value: "country", label: "Country", hint: "One destination" },
  { value: "regional", label: "Regional", hint: "Multi-country" },
  { value: "global", label: "Global", hint: "Worldwide" },
];

/**
 * Step 1 of the eSIM buy flow: pick where the data should work.
 *
 * eSIM Access sells three kinds of coverage from the same catalog, so the
 * segmented control below swaps the picker rather than the page: a searchable
 * country list, a list of regional bundles, or nothing at all for global
 * (which goes straight to packages).
 */
export default function DestinationPicker({
  scope,
  onScopeChange,
  countries,
  country,
  onCountryChange,
  groups,
  group,
  onGroupChange,
  loading,
}: {
  scope: CatalogScope;
  onScopeChange: (s: CatalogScope) => void;
  countries: EsimDestination[];
  country: EsimDestination | null;
  onCountryChange: (c: EsimDestination | null) => void;
  groups: EsimRegionGroup[];
  group: EsimRegionGroup | null;
  onGroupChange: (g: EsimRegionGroup | null) => void;
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
    ? countries.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : countries;

  return (
    <div>
      <label className="block text-[12px] mb-1.5" style={{ color: "#888888" }}>
        Step 1 — Where do you need data?
      </label>

      {/* Coverage type */}
      <div
        className="flex rounded-[6px] p-1 mb-3"
        style={{ backgroundColor: "#141414", border: "1px solid #222222" }}
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
                backgroundColor: active ? "#00FF94" : "transparent",
                color: active ? "#080808" : "#888888",
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
            style={{ borderColor: "#00FF94", borderTopColor: "transparent" }}
          />
          <span className="text-[12px]" style={{ color: "#555555" }}>
            Loading destinations…
          </span>
        </div>
      )}

      {/* Country search */}
      {scope === "country" && !loading && (
        <div ref={dropRef} className="relative">
          <input
            type="text"
            value={country ? country.name : search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDrop(true);
              onCountryChange(null);
            }}
            onFocus={() => setShowDrop(true)}
            placeholder="Search a country…"
            className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
            style={{
              backgroundColor: "#141414",
              border: "1px solid #222222",
              color: "#F5F5F5",
            }}
          />
          {showDrop && (
            <div
              className="absolute z-20 w-full mt-1 rounded-[6px] max-h-[240px] overflow-y-auto"
              style={{
                backgroundColor: "#0F0F0F",
                border: "1px solid #1A1A1A",
              }}
            >
              {filtered.slice(0, 80).map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onCountryChange(c);
                    setSearch("");
                    setShowDrop(false);
                  }}
                  className="w-full px-3 py-2 text-left text-[13px] hover:bg-[#1A1A1A] transition-colors flex justify-between gap-2"
                  style={{ color: "#F5F5F5" }}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span
                    className="font-mono text-[11px] shrink-0"
                    style={{ color: "#555555" }}
                  >
                    {c.code}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div
                  className="px-3 py-3 text-[13px]"
                  style={{ color: "#555555" }}
                >
                  No countries found
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Regional bundles */}
      {scope === "regional" && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map((g) => {
            const active = group?.key === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => onGroupChange(active ? null : g)}
                className="text-left rounded-[6px] p-3 transition-colors"
                style={{
                  backgroundColor: "#141414",
                  border: `1px solid ${active ? "#00FF94" : "#222222"}`,
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[13px] font-semibold min-w-0 truncate"
                    style={{ color: "#F5F5F5" }}
                  >
                    {g.label}
                  </span>
                  <span
                    className="font-mono text-[12px] font-bold shrink-0"
                    style={{ color: "#00FF94" }}
                  >
                    ${g.from_price.toFixed(2)}
                  </span>
                </div>
                <div
                  className="font-mono text-[11px] mt-1"
                  style={{ color: "#555555" }}
                >
                  {g.location_codes.length} countries · {g.packages.length} plans
                </div>
              </button>
            );
          })}
          {groups.length === 0 && (
            <p className="text-[13px] py-2" style={{ color: "#555555" }}>
              No regional bundles available right now.
            </p>
          )}
        </div>
      )}

      {scope === "global" && !loading && (
        <p className="text-[13px]" style={{ color: "#555555" }}>
          Worldwide coverage — pick a plan below.
        </p>
      )}
    </div>
  );
}
