"use client";

import Image from "next/image";

/**
 * One swatch in the banner grid.
 *
 * Drawn as a button rather than a radio because the grid also holds an upload
 * control and a delete affordance, and a radio group cannot contain either.
 * `aria-pressed` carries the selected state instead.
 */
export default function BannerTile({
  selected,
  onClick,
  label,
  src,
  onDelete,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  /** Omitted for the "None" tile, which draws its own word. */
  src?: string;
  /** Present only on uploaded banners — built-ins ship with the app. */
  onDelete?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-pressed={selected}
        className="relative rounded-[6px] overflow-hidden w-full disabled:opacity-50"
        style={{
          height: 52,
          border: `2px solid ${selected ? "var(--accent)" : "var(--line-strong)"}`,
          backgroundColor: "var(--field)",
        }}
      >
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="120px"
            className="object-cover"
            style={{ opacity: selected ? 1 : 0.75 }}
          />
        ) : (
          <span
            className="absolute inset-0 flex items-center justify-center text-[11px]"
            style={{ color: selected ? "var(--accent)" : "var(--muted)" }}
          >
            {label}
          </span>
        )}
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          title="Delete this banner"
          aria-label={`Delete ${label}`}
          className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center disabled:opacity-50"
          style={{
            backgroundColor: "var(--background)",
            border: "1px solid var(--line-strong)",
            color: "var(--muted)",
            lineHeight: 0,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M1 1l8 8M9 1l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
