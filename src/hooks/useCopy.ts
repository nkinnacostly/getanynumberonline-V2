"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Copy-to-clipboard with per-target "copied" feedback.
 *
 * Numbers, codes and references are the whole product — this centralizes the
 * one interaction they all share, instead of re-implementing it per component.
 *
 * Note: clipboard writes require a user gesture (a click/tap) in every major
 * browser, so `copy()` must be called from an event handler — never fired
 * automatically, which would silently fail and falsely report "copied".
 */
export function useCopy(resetMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (text: string, key = "default"): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopiedKey(null), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs],
  );

  const isCopied = useCallback(
    (key = "default") => copiedKey === key,
    [copiedKey],
  );

  return { copy, isCopied };
}
