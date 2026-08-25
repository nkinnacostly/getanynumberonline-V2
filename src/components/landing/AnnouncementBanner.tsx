"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const DISMISSED_KEY = "gano-esim-banner-dismissed";

/**
 * localStorage is external state, so it is read through useSyncExternalStore
 * rather than an effect: no hydration mismatch (the server snapshot shows the
 * banner), no setState-in-effect, and dismissal is one store write away.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const getSnapshot = () => localStorage.getItem(DISMISSED_KEY) === "1";
const getServerSnapshot = () => false;

/**
 * Landing-page announcement: we sell data-only eSIMs and a three-step summary
 * of how they work. Sticks directly under the sticky nav while scrolling
 * (top-14 = the nav's height) until the user dismisses it. Pine + mint are
 * fixed brand tokens, so the strip reads identically in both themes.
 * Dismissal persists in localStorage.
 */
export default function AnnouncementBanner() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable — nothing to persist.
    }
    // storage events only fire cross-tab; notify this tab directly.
    window.dispatchEvent(new Event("storage"));
  };

  if (dismissed) return null;

  return (
    <div
      className="sticky top-14 z-40 bg-pine text-paper border-b border-pine-deep"
      role="region"
      aria-label="eSIM announcement"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-mint" />
          <span className="font-mono text-[11px] font-bold tracking-widest text-mint uppercase">
            New
          </span>
        </span>

        {/* Claim + how it works */}
        <p className="text-[13px] leading-relaxed min-w-0 flex-1">
          <strong className="font-semibold">
            Data-only eSIMs are here — instant data in 190+ countries.
          </strong>{" "}
          <span className="text-paper/70">
            Pick a destination, pay from your wallet, scan the QR and turn on
            roaming. No physical SIM, no contract.
          </span>
        </p>

        {/* CTA */}
        <Link
          href="/dashboard/esim"
          className="shrink-0 inline-flex items-center min-h-9 px-4 rounded-full bg-mint text-pine-deep text-[13px] font-bold hover:bg-paper transition-colors"
        >
          Get an eSIM&nbsp;&rarr;
        </Link>

        {/* Dismiss */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="shrink-0 w-8 h-8 -mr-1 inline-flex items-center justify-center rounded-full text-paper/60 hover:text-paper hover:bg-paper/10 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
