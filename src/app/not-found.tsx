import Link from "next/link";
import type { Metadata } from "next";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import { COUNTRIES, SERVICES } from "@/lib/seo/catalog";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo/config";

/**
 * 404.
 *
 * Renders INSIDE the root layout, so it must not emit its own <html>/<head>/
 * <body> — doing that produced two of each in the response, which is invalid
 * markup and breaks hydration. Only `global-not-found.tsx` owns the document.
 *
 * It also carries the shared nav and footer rather than three bare buttons:
 * a 404 is a page Google crawls like any other, and the footer's links are the
 * cheapest way to hand a lost crawler (or reader) somewhere real to go.
 */
export const metadata: Metadata = {
  title: `Page Not Found — ${SITE_NAME}`,
  description: SITE_DESCRIPTION,
  // No `robots` override here on purpose. The 404 status code is what keeps
  // this out of the index, and setting it as well emitted a second, competing
  // <meta name="robots"> alongside the root layout's.
};

export default function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <SiteNav />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <p className="font-mono text-sm text-accent mb-3">404</p>
        <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
          That page doesn&apos;t exist
        </h1>
        <p className="text-muted text-base sm:text-lg leading-relaxed max-w-xl mb-8">
          The link may be out of date, or the page may have moved. Everything we
          sell is one of the three below.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/numbers"
            className="inline-flex items-center gap-2 px-5 py-3 bg-accent text-accent-ink font-semibold rounded-md hover:bg-accent/90 transition-colors text-sm"
          >
            Numbers in {COUNTRIES.length} countries&nbsp;&rarr;
          </Link>
          <Link
            href="/receive-sms"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-line-strong text-sm font-medium hover:border-accent/40 transition-colors"
          >
            SMS for {SERVICES.length} services
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-line-strong text-sm font-medium hover:border-accent/40 transition-colors"
          >
            Pricing
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
