"use client";

import { useEffect, useState } from "react";
import { type CampaignDraft, previewCampaign } from "@/lib/admin-api";

/**
 * The campaign as it will actually arrive, rendered by the Edge Function that
 * sends it and dropped into a sandboxed iframe.
 *
 * The HTML is never built here on purpose: a second copy of the email markup in
 * React would drift from the one that goes out, and a preview you cannot trust
 * is worse than no preview. `sandbox` with no allow-* tokens means the frame
 * can neither run scripts nor navigate the panel.
 */
export default function EmailPreview({ draft }: { draft: CampaignDraft }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  // Debounced: a render per keystroke would be one Edge call per keystroke.
  const key = JSON.stringify(draft);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await previewCampaign(JSON.parse(key) as CampaignDraft);
        if (!cancelled) {
          setHtml(res.html);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not render preview");
        }
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          Preview
        </span>
        <div className="ml-auto flex gap-1">
          {(["desktop", "mobile"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              className="px-2.5 h-[28px] rounded-[4px] text-[11px] font-medium"
              style={{
                backgroundColor: width === w ? "var(--field)" : "transparent",
                color: width === w ? "var(--foreground)" : "var(--muted)",
                border: `1px solid ${
                  width === w ? "var(--line-strong)" : "transparent"
                }`,
              }}
            >
              {w === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div
        className="rounded-lg overflow-hidden mx-auto w-full"
        style={{
          border: "1px solid var(--line)",
          maxWidth: width === "mobile" ? 390 : "100%",
        }}
      >
        {html === null ? (
          <div
            className="h-[420px] flex items-center justify-center text-[12px]"
            style={{ backgroundColor: "var(--field)", color: "var(--muted)" }}
          >
            Rendering…
          </div>
        ) : (
          <iframe
            title="Email preview"
            srcDoc={html}
            sandbox=""
            className="w-full block"
            style={{ height: 620, backgroundColor: "#F5F3ED", border: 0 }}
          />
        )}
      </div>
    </div>
  );
}
