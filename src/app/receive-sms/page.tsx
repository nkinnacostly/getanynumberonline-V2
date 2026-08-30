import type { Metadata } from "next";
import Link from "next/link";
import DirectoryGrid from "@/components/seo/DirectoryGrid";
import JsonLd from "@/components/seo/JsonLd";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import { SERVICES } from "@/lib/seo/catalog";
import { absoluteUrl, SITE_NAME } from "@/lib/seo/config";
import { breadcrumbSchema } from "@/lib/seo/jsonld";

/**
 * The service hub. Same reasoning as /numbers — see that file.
 *
 * It also repairs a dead link: the 404 page has always pointed at
 * /receive-sms, which until now did not exist.
 */
export const metadata: Metadata = {
  title: `Receive SMS Online — Every Service — ${SITE_NAME}`,
  description:
    "Receive SMS verification codes for WhatsApp, Telegram, Google, Instagram, TikTok and more. Pick a service to see which countries work and what a code costs.",
  alternates: { canonical: absoluteUrl("/receive-sms") },
  openGraph: {
    title: `Receive SMS Online — Every Service — ${SITE_NAME}`,
    description:
      "Every app we deliver SMS verification codes for, with live prices per service.",
    url: absoluteUrl("/receive-sms"),
    type: "website",
  },
};

export default function ReceiveSmsHubPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteNav />
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Receive SMS by service", path: "/receive-sms" },
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
            <span className="text-foreground">Receive SMS by service</span>
          </nav>

          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-[1.1]">
            Receive SMS Online for Any Service
          </h1>

          <p className="text-muted text-base sm:text-lg leading-relaxed max-w-2xl">
            {SERVICES.length} services, each on a real SIM-based number rather
            than a shared public inbox. Pick the app you need to verify to see
            which countries deliver reliably and what a code costs.
          </p>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <h2 className="font-sans text-lg font-bold mb-4">
            All {SERVICES.length} services
          </h2>
          <DirectoryGrid
            items={SERVICES.map((s) => ({
              href: `/receive-sms/${s.slug}`,
              label: `${s.name} verification`,
              sub: s.purpose,
            }))}
          />
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <div className="rounded-lg border border-line bg-surface p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <p className="text-sm text-muted flex-1">
              Need a number from somewhere specific? Browse by country instead.
            </p>
            <Link
              href="/numbers"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-line-strong text-sm font-medium hover:border-accent/40 transition-colors whitespace-nowrap"
            >
              Browse by country&nbsp;&rarr;
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
