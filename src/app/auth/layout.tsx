import type { Metadata } from "next";
import ThemeToggle from "@/components/site/ThemeToggle";

/**
 * The auth pages are client components and can't export metadata themselves,
 * so it lives here.
 *
 * noindex in addition to the robots.txt disallow: robots.txt stops a crawl but
 * does not prevent Google indexing a URL it discovers via an external link, so
 * the meta tag covers that case if the disallow is ever relaxed.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Mirrors the fixed auth logo in AuthCard — theme switch top-right. */}
      <div className="fixed top-0 right-0 p-5 z-10">
        <ThemeToggle />
      </div>
      {children}
    </>
  );
}
