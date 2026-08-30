import type { Metadata } from "next";
import Link from "next/link";
import DirectoryGrid from "@/components/seo/DirectoryGrid";
import JsonLd from "@/components/seo/JsonLd";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import { COUNTRIES, flagEmoji, searchName } from "@/lib/seo/catalog";
import { absoluteUrl, SITE_NAME } from "@/lib/seo/config";
import { breadcrumbSchema } from "@/lib/seo/jsonld";

/**
 * The country hub.
 *
 * This page exists for the link graph as much as for the reader. Every
 * /numbers/<country> page was previously reachable only from the sitemap and
 * from its siblings — no path led into the set from the homepage — which is
 * exactly the shape Google reports as "Discovered, currently not indexed".
 * Home -> hub -> leaf gives the crawler a reason to go there.
 */
export const metadata: Metadata = {
  title: `Temporary Phone Numbers by Country — ${SITE_NAME}`,
  description:
    "Every country we sell temporary SMS numbers in — USA, UK, Nigeria, India, Germany and more. Pick a country to see live prices and which services work on it.",
  alternates: { canonical: absoluteUrl("/numbers") },
  openGraph: {
    title: `Temporary Phone Numbers by Country — ${SITE_NAME}`,
    description:
      "Every country we sell temporary SMS numbers in, with live prices per country.",
    url: absoluteUrl("/numbers"),
    type: "website",
  },
};

export default function NumbersHubPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteNav />
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Numbers by country", path: "/numbers" },
          ]),
        ]}
      />

      <main>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
          <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-muted">
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">Numbers by country</span>
          </nav>

          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-[1.1]">
            Temporary Phone Numbers by Country
          </h1>

          <p className="text-muted text-base sm:text-lg leading-relaxed max-w-2xl">
            Real SIM-based numbers in {COUNTRIES.length} countries, rented by the
            message or by the month. Every number receives SMS verification codes
            from the services that work in that country — pick one to see live
            prices and success rates.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <h2 className="font-sans text-lg font-bold mb-4">
            All {COUNTRIES.length} countries
          </h2>
          <DirectoryGrid
            items={COUNTRIES.map((c) => ({
              href: `/numbers/${c.slug}`,
              label: `${flagEmoji(c.iso)} ${searchName(c)} numbers`,
              sub: `Receive SMS on a ${c.adjective} number`,
            }))}
          />
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="rounded-lg border border-line bg-surface p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <p className="text-sm text-muted flex-1">
              Looking for a particular app instead? Browse by the service you
              need to verify.
            </p>
            <Link
              href="/receive-sms"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-line-strong text-sm font-medium hover:border-accent/40 transition-colors whitespace-nowrap"
            >
              Browse by service&nbsp;&rarr;
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
