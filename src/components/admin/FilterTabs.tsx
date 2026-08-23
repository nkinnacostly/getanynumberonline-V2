"use client";

/**
 * Filter selector for the admin tables. A segmented control on desktop where
 * there's room, and a native <select> under 640px — a row of six chips at
 * 375px either wraps badly or drops below the 44px touch target.
 */
export default function FilterTabs({
  options,
  value,
  onChange,
  label,
}: {
  /** "" is the all/no-filter option and must be first. */
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <>
      <div className="hidden sm:flex gap-2 mb-5" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className="px-4 h-[38px] rounded-[6px] text-[13px] font-medium capitalize transition-colors"
              style={{
                backgroundColor: active ? "var(--accent)" : "var(--field)",
                color: active ? "var(--background)" : "var(--muted)",
                border: `1px solid ${active ? "var(--accent)" : "var(--line-strong)"}`,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="sm:hidden mb-5">
        <label className="sr-only" htmlFor="admin-filter">{label}</label>
        <select
          id="admin-filter"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none capitalize"
          style={{ backgroundColor: "var(--field)", border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
