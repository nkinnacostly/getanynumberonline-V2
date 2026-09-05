"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { startNavProgress } from "@/components/site/TopLoader";

/**
 * `router.push`, with the top loader started.
 *
 * The loader picks up link clicks on its own, but a navigation fired from a
 * button — a pagination control, a filter tab, sign-out — has no anchor for it
 * to see. Rather than have every one of those remember to call
 * startNavProgress(), they call this.
 *
 * Only push is wrapped. `router.refresh()` deliberately is not: it re-renders
 * the route that is already on screen, so the URL never changes and the bar
 * would have nothing to finish it.
 */
export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      startNavProgress();
      router.push(href);
    },
    [router],
  );
}
