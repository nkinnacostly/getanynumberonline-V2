/**
 * Where a freshly-signed-in session is allowed to land.
 *
 * Three callers need the same answer and must not disagree about it: the auth
 * page after a password sign-in, the Google button when it builds its callback
 * URL, and the OAuth callback route when it reads that URL back. The callback
 * is the one that matters — it takes a path straight off the query string of a
 * URL a stranger can send someone, so the guard below is a security boundary,
 * not a tidy-up.
 *
 * No browser APIs here on purpose: the callback route runs on the server.
 */

/**
 * A path we are willing to redirect to, or null.
 *
 * Only same-origin absolute paths. The three rejections that matter:
 *   "https://evil.com"  — absolute URL, obviously
 *   "//evil.com"        — protocol-relative, which a browser treats as absolute
 *   "/\evil.com"        — backslash, which some browsers normalise to "//"
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

/**
 * Where to go once there is a session, from the query string on /auth.
 *
 * The middleware appends ?next=<path> when it bounces someone out of a
 * protected page, so signing in returns them to the page they asked for
 * instead of dropping everyone on /dashboard.
 */
export function destinationFrom(params: URLSearchParams): string | null {
  if (params.get("topup") === "success") {
    return `/dashboard/wallet?${params.toString()}`;
  }
  return safeNextPath(params.get("next"));
}
