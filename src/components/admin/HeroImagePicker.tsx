"use client";

import { useRef, useState } from "react";
import BannerTile from "@/components/admin/BannerTile";
import { useEmailBanners } from "@/hooks/useEmailBanners";
import { HERO_IMAGES, heroImageUrl } from "@/lib/admin-api";
import { BANNER_TYPES } from "@/lib/email-banners";

/**
 * The banner at the top of a campaign.
 *
 * Three ways to get one, in the order an admin reaches for them: the images we
 * ship, anything they have uploaded before, and a new upload. Thumbnails for
 * the shipped set are loaded from the local path so they work in development,
 * but the value stored is always the absolute production URL — an email client
 * has no origin to resolve a relative src against.
 */
export default function HeroImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { banners, loading, busy, error, upload, remove } = useEmailBanners();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const known = [
    ...HERO_IMAGES.map((h) => heroImageUrl(h.file)),
    ...banners.map((b) => b.url),
  ];
  const custom = value !== "" && !known.includes(value);

  const take = async (files: FileList | null) => {
    const added = await upload(Array.from(files ?? []));
    if (added) onChange(added.url);
  };

  /**
   * Deleting a banner cannot be undone and reaches backwards: the URL is
   * already inside every copy of every campaign that used it, so the image
   * breaks in inboxes too. That is what the confirmation has to say.
   */
  const askDelete = async (name: string, url: string) => {
    if (
      !confirm(
        "Delete this banner? Emails already sent with it will show a broken " +
          "image. This cannot be undone.",
      )
    ) {
      return;
    }
    await remove(name);
    if (value === url) onChange("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void take(e.dataTransfer.files);
        }}
        className="grid grid-cols-3 sm:grid-cols-5 gap-2 rounded-[6px]"
        style={{
          outline: dragging ? "2px dashed var(--accent)" : "none",
          outlineOffset: 4,
        }}
      >
        <BannerTile
          selected={value === ""}
          onClick={() => onChange("")}
          label="None"
        />

        {HERO_IMAGES.map((h) => {
          const url = heroImageUrl(h.file);
          return (
            <BannerTile
              key={h.file}
              selected={value === url}
              onClick={() => onChange(url)}
              label={h.label}
              src={`/images/email/${h.file}`}
            />
          );
        })}

        {banners.map((b) => (
          <BannerTile
            key={b.name}
            selected={value === b.url}
            onClick={() => onChange(b.url)}
            label="Uploaded banner"
            src={b.url}
            disabled={busy}
            onDelete={() => void askDelete(b.name, b.url)}
          />
        ))}

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-label="Upload a banner image"
          className="rounded-[6px] flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
          style={{
            height: 52,
            border: "2px dashed var(--line-strong)",
            backgroundColor: "var(--field)",
            color: "var(--muted)",
          }}
        >
          {busy ? (
            <span className="auth-spinner" />
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M7 2.5v9M2.5 7h9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[10px]">Upload</span>
            </>
          )}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={BANNER_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          void take(e.target.files);
          // Cleared so re-picking the same file fires change again.
          e.target.value = "";
        }}
      />

      {error && (
        <p className="text-[12px]" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          Loading your uploaded banners…
        </p>
      )}

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
