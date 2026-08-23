import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/JsonLd";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import PriceRow, { PriceTableHeader } from "@/components/site/PriceRow";
import {
  countriesBySlugs,
  flagEmoji,
  PRICING_COUNTRY_SLUGS,
  PRICING_SERVICE_SLUGS,
  servicesBySlugs,
} from "@/lib/seo/catalog";
import { SITE_NAME } from "@/lib/seo/config";
import { breadcrumbSchema, productSchema } from "@/lib/seo/jsonld";
import {
  cheapest,
  formatPrice,
  getServicePrices,
  type ServicePrice,
} from "@/lib/seo/pricing";

/** Prices move; regenerate hourly so the page stays honest without rebuilding. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing — Temporary Phone Number Costs Per SMS",
  description:
    "Live per-SMS pricing for temporary phone numbers across popular services and countries. Pay only when a verification code arrives — automatic refund if it doesn't.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: `Pricing — Temporary Phone Number Costs Per SMS | ${SITE_NAME}`,
    description:
      "Live per-SMS pricing across popular services and countries. Pay only when a code arrives.",
    url: "/pricing",
    type: "website",
  },
};

export default async function PricingPage() {
  const services = servicesBySlugs(PRICING_SERVICE_SLUGS);
  const countries = countriesBySlugs(PRICING_COUNTRY_SLUGS);

  // One row per service, priced across every column country.
  const table: { service: (typeof services)[number]; rows: ServicePrice[] }[] =
    await Promise.all(
      services.map(async (service) => ({
        service,
        rows: await getServicePrices(service, countries),
      })),
    );

  const allQuotes = table.flatMap((t) => t.rows);
  const low = cheapest(allQuotes);
  const priced = allQuotes.filter((r) => r.quote !== null);
  const high = priced
    .map((r) => r.quote!.price)
    .sort((a, b) => b - a)[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
          ...(low
            ? [
                productSchema({
                  name: "Temporary phone number for SMS verification",
                  description:
                    "A real SIM-based temporary phone number that receives one SMS verification code. Charged per code received, with an automatic refund if no code arrives.",
                  path: "/pricing",
                  lowPrice: low.price,
                  highPrice: high,
                  offerCount: priced.length,
                }),
              ]
            : []),
        ]}
      />

      <main>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Pricing
          </h1>
          <p className="text-muted text-base sm:text-lg max-w-2xl">
            You pay per verification code received — never a subscription.
            {low && (
              <>
                {" "}
                Numbers start at{" "}
                <span className="font-mono text-accent">
                  {formatPrice(low.price)}
                </span>{" "}
                per SMS.
              </>
            )}{" "}
            If no code arrives within the 20-minute window, your balance is
            refunded automatically.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-ink font-semibold rounded-md hover:bg-accent/90 transition-colors text-sm"
            >
              Get a number&nbsp;&rarr;
            </Link>
          </div>
        </section>

        {/* Price matrix, one block per service so it reads on mobile. */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2 className="sr-only">Price per SMS by service and country</h2>

          <div className="space-y-10">
            {table.map(({ service, rows }) => {
              const serviceLow = cheapest(rows);
              return (
                <div key={service.slug}>
                  <div className="flex items-baseline justify-between gap-4 mb-3">
                    <h3 className="font-sans text-lg font-bold">
                      <Link
                        href={`/receive-sms/${service.slug}`}
                        className="hover:text-accent transition-colors"
                      >
                        {service.name}
                      </Link>
                    </h3>
                    {serviceLow && (
                      <span className="font-mono text-xs text-muted">
                        from{" "}
                        <span className="text-accent">
                          {formatPrice(serviceLow.price)}
                        </span>
                      </span>
                    )}
                  </div>

                  <PriceTableHeader first="Country" />
                  {rows.map(({ country, quote }) => (
                    <PriceRow
                      key={country.slug}
                      label={`${flagEmoji(country.iso)} ${country.name}`}
                      href={`/numbers/${country.slug}`}
                      quote={quote}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted mt-10 leading-relaxed">
            Prices are live wholesale rates plus our margin, refreshed hourly,
            and shown in USD. The exact price is always displayed before you
            confirm an order. Rows marked <span className="font-mono">n/a</span>{" "}
            have no stock for that combination right now — check back or pick a
            different country. Success rate is the provider&apos;s recent
            delivery rate for that service and country.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
