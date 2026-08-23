"use client";

import { useCallback } from "react";

/**
 * Light/dark switch. The visible glyph is chosen by CSS from the `dark`
 * class on <html> (see globals.css), so server and client render the same
 * markup — no hydration mismatch, and the correct icon shows even before
 * React hydrates because the pre-paint script in the root layout has
 * already set the class.
 *
 * Preference persists in localStorage ("gano-theme"); first visit defaults
 * to dark (the product's origin theme).
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("gano-theme", next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled — theme still applies for the session.
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      title="Toggle theme"
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full border border-line text-muted hover:text-foreground hover:border-line-strong transition-colors ${className}`}
    >
      {/* Sun — shown when the page is light */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="theme-sun w-[18px] h-[18px]"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      {/* Moon — shown when the page is dark */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="theme-moon w-[18px] h-[18px]"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}
