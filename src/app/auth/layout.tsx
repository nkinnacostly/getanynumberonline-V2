import type { Metadata } from "next";

/**
 * Sign-in and password pages are crawlable but never indexed.
 *
 * They used to be blocked in robots.txt instead, which is the weaker tool: a
 * disallowed URL that is linked sitewide (the nav's "Sign in") can still be
 * indexed URL-only, because Google is not allowed to fetch the page and see
 * that it shouldn't. It also showed up in Search Console as "Blocked by
 * robots.txt" forever. Letting the crawler in and telling it noindex removes
 * the page cleanly.
 *
 * /dashboard stays disallowed in robots.ts — it is auth-walled, so there is
 * nothing for a crawler to see there either way.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
