"use client";

import Image from "next/image";
import { HERO_IMAGES, heroImageUrl } from "@/lib/admin-api";

/**
 * The banner at the top of a campaign.
 *
 * Thumbnails are loaded from the local path so they work in development, but
 * the value stored is always the absolute production URL — an email client has
 * no origin to resolve a relative src against.
 */
export default function HeroImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const custom =
    value !== "" && !HERO_IMAGES.some((h) => heroImageUrl(h.file) === value);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <Tile
          selected={value === ""}
          onClick={() => onChange("")}
          label="None"
        />
        {HERO_IMAGES.map((h) => {
          const url = heroImageUrl(h.file);
          return (
            <Tile
              key={h.file}
              selected={value === url}
              onClick={() => onChange(url)}
              label={h.label}
              src={`/images/email/${h.file}`}
            />
          );
        })}
      </div>

      <input
        value={custom ? value : ""}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="…or paste an image URL"
        aria-label="Custom banner image URL"
        inputMode="url"
        className="h-[40px] px-3 text-[13px] rounded-[6px] outline-none font-mono"
        style={{
          backgroundColor: "var(--field)",
          border: `1px solid ${custom ? "var(--accent)" : "var(--line-strong)"}`,
          color: "var(--foreground)",
        }}
      />
    </div>
  );
}

function Tile({
  selected,
  onClick,
  label,
  src,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  src?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className="relative rounded-[6px] overflow-hidden"
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
          None
        </span>
      )}
    </button>
  );
}
