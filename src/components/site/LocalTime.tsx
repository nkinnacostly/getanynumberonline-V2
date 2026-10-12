"use client";

import { useIsHydrated } from "@/hooks/useIsHydrated";

/**
 * A timestamp shown in the reader's own timezone, without a hydration mismatch.
 *
 * Server-rendered markup has no idea what zone the reader is in, so any
 * `toLocaleDateString` without an explicit `timeZone` produces one string on
 * Vercel (UTC) and a different one in the browser. React compares them during
 * hydration, finds them different, and throws error #418 — which is exactly
 * what /dashboard/wallet and /dashboard/history were doing on every load.
 *
 * So: UTC for the server and the hydration render, the reader's zone from the
 * commit onwards. The text can change once, a frame in, which is invisible and
 * is the point — the alternative is showing everyone UTC.
 *
 * `<time dateTime>` carries the unambiguous instant for anything parsing the
 * page, regardless of which of the two strings is on screen.
 */
export default function LocalTime({
  iso,
  options,
  className,
  style,
}: {
  iso: string | null | undefined;
  /** Intl options. Pass a module-level constant — a new object each render is wasted work. */
  options: Intl.DateTimeFormatOptions;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hydrated = useIsHydrated();
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const text = new Intl.DateTimeFormat("en-US", {
    ...options,
    // undefined = the reader's zone. Only ever reached after hydration.
    timeZone: hydrated ? undefined : "UTC",
  }).format(date);

  return (
    <time dateTime={iso} className={className} style={style}>
      {text}
    </time>
  );
}

/** The format every row-level timestamp in the dashboard uses. */
export const SHORT_DATETIME: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
