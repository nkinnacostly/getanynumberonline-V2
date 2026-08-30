import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import Faq from "@/components/site/Faq";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import PriceRow, { PriceTableHeader } from "@/components/site/PriceRow";
import {
  countriesBySlugs,
  findService,
  flagEmoji,
  PRICING_COUNTRY_SLUGS,
  SERVICES,
  TOP_SERVICE_SLUGS,
  type ServiceEntry,
} from "@/lib/seo/catalog";
import { SITE_NAME } from "@/lib/seo/config";
import {
  breadcrumbSchema,
  faqSchema,
  type FaqItem,
  productSchema,
} from "@/lib/seo/jsonld";
import {
  averageSuccessRate,
  cheapest,
  formatPrice,
  getServicePrices,
  type ServicePrice,
} from "@/lib/seo/pricing";

export const revalidate = 3600;

/**
 * Top services are prerendered at build; the rest of the curated list renders
 * on first request and is then cached by ISR. `dynamicParams` stays on for
 * that, and the page 404s anything outside the curated list so we never
 * generate thin pages for the other ~1,340 SMSPool services.
 */
export function generateStaticParams() {
  return TOP_SERVICE_SLUGS.map((service) => ({ service }));
}

function load(slug: string): ServiceEntry {
  const service = findService(slug);
  if (!service) notFound();
  return service;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: slug } = await params;
  const service = findService(slug);
  if (!service) return {};

  const countries = countriesBySlugs(PRICING_COUNTRY_SLUGS);
  const rows = await getServicePrices(service, countries);
  const low = cheapest(rows);
  const available = rows.filter((r) => r.quote).length;

  const title = `Receive ${service.name} SMS Verification Code Online`;
  const description = low
    ? `Get a real SIM ${service.name} verification number from ${formatPrice(low.price)} per SMS, across ${available} countries. Code arrives in seconds — automatic refund if it doesn't.`
    : `Get a real SIM-based temporary number to receive your ${service.name} verification code. Pay per SMS, with an automatic refund if no code arrives.`;

  return {
    title,
    description,
    alternates: { canonical: `/receive-sms/${service.slug}` },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `/receive-sms/${service.slug}`,
      type: "article",
    },
  };
}

/**
 * Rotate the opening sentence so 34 service pages don't share one templated
 * paragraph — near-duplicate intros across a programmatic set is exactly what
 * gets them filtered out of the index. Selection is deterministic per slug, and
 * every variant interpolates that page's real price and availability.
 */
function introCopy(
  service: ServiceEntry,
  lowPrice: string | null,
  countryCount: number,
  successRate: number | null,
): string {
  const price = lowPrice ? `from ${lowPrice} per code` : "priced per code received";
  const reach = `${countryCount} ${countryCount === 1 ? "country" : "countries"}`;
  const success = successRate ? ` Recent delivery rate across those countries averages ${successRate}%.` : "";

  const variants = [
    `Need a number to ${service.purpose}? Pick a country, get a real SIM-based mobile number in about three seconds, and read the ${service.name} code straight from your dashboard. Numbers are ${price} across ${reach}.${success}`,
    `${service.name} sends its verification code by SMS, which means you need a number that actually receives one. Ours are real SIMs — not VoIP — available across ${reach} and ${price}. Use one to ${service.purpose}.${success}`,
    `To ${service.purpose}, you need a working mobile number for the SMS step. This page shows live ${service.name} pricing across ${reach}, ${price}. The number is assigned instantly and the code appears in your dashboard as it arrives.${success}`,
    `Use a temporary ${service.name} number when you'd rather not ${service.purpose.startsWith("verify") ? "use your personal SIM" : "hand over your personal number"}. Real SIM-based numbers across ${reach}, ${price}, and you only pay once a code actually lands.${success}`,
  ];

  const index = service.slug
    .split("")
    .reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % variants.length;
  return variants[index];
}

function buildFaq(
  service: ServiceEntry,
  rows: ServicePrice[],
  lowPrice: string | null,
): FaqItem[] {
  const available = rows.filter((r) => r.quote);
  const countryList = available
    .slice(0, 5)
    .map((r) => r.country.name)
    .join(", ");

  return [
    {
      question: `How much does a ${service.name} verification number cost?`,
      answer: lowPrice
        ? `${service.name} numbers start at ${lowPrice} per SMS received. The exact price depends on the country you choose and is always shown before you confirm the order. You are only charged when a code is delivered — if none arrives within the 20-minute window, your balance is refunded automatically.`
        : `${service.name} numbers are priced per SMS received and vary by country. The exact price is shown before you confirm, and you are only charged when a code is delivered.`,
    },
    {
      question: `Which countries can I use for ${service.name}?`,
      answer: available.length
        ? `${service.name} numbers are currently available in ${available.length} of the countries we list, including ${countryList}. Availability changes as stock moves, so the live table on this page is the accurate view.`
        : `Country availability for ${service.name} changes as stock moves. The live table on this page shows which countries are currently in stock.`,
    },
    {
      question: `Will ${service.name} accept a temporary number?`,
      answer: `Our numbers come from real SIM cards rather than VoIP gateways, which is what most platforms check for when they reject a number. That is why real-SIM numbers pass verification where VoIP numbers are refused. We cannot guarantee any individual verification will succeed, which is why an undelivered code is refunded automatically rather than charged.`,
    },
    {
      question: `How long do I have to receive the ${service.name} code?`,
      answer: `Each number stays active for 20 minutes. The code appears in your dashboard the moment it arrives, usually within a few seconds of requesting it from ${service.name}. You can cancel before the code lands and your balance is restored immediately; if the window expires with no code, the refund is automatic.`,
    },
  ];
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service: slug } = await params;
  const service = load(slug);

  const countries = countriesBySlugs(PRICING_COUNTRY_SLUGS);
  const rows = await getServicePrices(service, countries);
  const low = cheapest(rows);
  const lowPrice = low ? formatPrice(low.price) : null;
  const available = rows.filter((r) => r.quote);
  const successRate = averageSuccessRate(rows);
  const faq = buildFaq(service, rows, lowPrice);

  const otherServices = SERVICES.filter((s) => s.slug !== service.slug).slice(0, 8);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Receive SMS", path: "/pricing" },
            { name: service.name, path: `/receive-sms/${service.slug}` },
          ]),
          faqSchema(faq),
          ...(low
            ? [
                productSchema({
                  name: `${service.name} SMS verification number`,
                  description: `A real SIM-based temporary phone number for receiving ${service.name} verification codes.`,
                  path: `/receive-sms/${service.slug}`,
                  lowPrice: low.price,
                  offerCount: available.length,
                }),
              ]
            : []),
        ]}
      />

      <main>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-muted">
            <Link href="/" className="hover:text-accent">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/pricing" className="hover:text-accent">Receive SMS</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{service.name}</span>
          </nav>

          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-[1.1]">
            Receive {service.name} SMS Verification Code Online
          </h1>

          <p className="text-muted text-base sm:text-lg leading-relaxed max-w-2xl">
            {introCopy(service, lowPrice, available.length, successRate)}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-ink font-semibold rounded-md hover:bg-accent/90 transition-colors text-sm"
            >
              Get a {service.name} number&nbsp;&rarr;
            </Link>
            {lowPrice && (
              <span className="font-mono text-sm text-muted">
                from <span className="text-accent">{lowPrice}</span> per SMS
              </span>
            )}
          </div>
        </section>

        {/* Live prices by country */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <h2 className="font-sans text-2xl font-bold mb-1">
            {service.name} number prices by country
          </h2>
          <p className="text-sm text-muted mb-6">
            Live rates, refreshed hourly. You always see the exact price before
            you confirm.
          </p>

          <PriceTableHeader first="Country" />
          {rows.map(({ country, quote }) => (
            <PriceRow
              key={country.slug}
              label={`${flagEmoji(country.iso)} ${country.name}`}
              href={`/numbers/${country.slug}`}
              quote={quote}
            />
          ))}
        </section>

        {/* How it works */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <h2 className="font-sans text-2xl font-bold mb-6">
            How to get your {service.name} code
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Pick a country",
                d: `Choose ${service.name} and any country from the table above. The price is shown up front.`,
              },
              {
                n: "02",
                t: "Get the number",
                d: "A real SIM-based number is assigned to you in about three seconds.",
              },
              {
                n: "03",
                t: "Read the code",
                d: `Request the code from ${service.name}. It appears live in your dashboard — copy and you're done.`,
              },
            ].map((step) => (
              <li
                key={step.n}
                className="bg-surface border border-line rounded-lg p-6"
              >
                <span className="font-mono text-accent text-xs mb-3 block">
                  {step.n}
                </span>
                <h3 className="font-sans text-base font-bold mb-2">{step.t}</h3>
                <p className="text-sm text-muted leading-relaxed">{step.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <Faq items={faq} heading={`${service.name} verification FAQ`} headingId="service-faq" />

        {/* Interlinking */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <h2 className="font-sans text-lg font-bold">
              Other services you can verify
            </h2>
            <Link href="/receive-sms" className="font-mono text-xs text-muted hover:text-accent whitespace-nowrap">
              All {SERVICES.length} services &rarr;
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {otherServices.map((s) => (
              <Link
                key={s.slug}
                href={`/receive-sms/${s.slug}`}
                className="font-mono text-xs px-3 py-2 rounded-md border border-line bg-surface text-muted hover:text-accent hover:border-accent/40 transition-colors"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
