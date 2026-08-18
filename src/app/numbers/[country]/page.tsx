import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import Faq from "@/components/site/Faq";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import PriceRow, { PriceTableHeader } from "@/components/site/PriceRow";
import {
  COUNTRIES,
  type CountryEntry,
  findCountry,
  flagEmoji,
  PRICING_SERVICE_SLUGS,
  searchName,
  servicesBySlugs,
  TOP_COUNTRY_SLUGS,
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
  type CountryPrice,
  formatPrice,
  getCountryPrices,
} from "@/lib/seo/pricing";

export const revalidate = 3600;

export function generateStaticParams() {
  return TOP_COUNTRY_SLUGS.map((country) => ({ country }));
}

function load(slug: string): CountryEntry {
  const country = findCountry(slug);
  if (!country) notFound();
  return country;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const { country: slug } = await params;
  const country = findCountry(slug);
  if (!country) return {};

  const services = servicesBySlugs(PRICING_SERVICE_SLUGS);
  const rows = await getCountryPrices(country, services);
  const low = cheapest(rows);
  const available = rows.filter((r) => r.quote).length;

  const short = searchName(country);
  const title = `Temporary ${short} Phone Numbers \u2014 Receive SMS Online`;
  const description = low
    ? `Receive SMS online with a temporary ${short} phone number from ${formatPrice(low.price)} per code. Real ${country.name} SIM, ${available}+ services including WhatsApp, Telegram and Google. Automatic refund if no code arrives.`
    : `Receive SMS online with a real SIM-based temporary ${short} phone number. Genuine ${country.name} mobile line, pay per code received, automatic refund if none arrives.`;

  return {
    title,
    description,
    alternates: { canonical: `/numbers/${country.slug}` },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `/numbers/${country.slug}`,
      type: "article",
    },
  };
}

/** Deterministic per-country intro so the 25 country pages don't read alike. */
function introCopy(
  country: CountryEntry,
  lowPrice: string | null,
  serviceCount: number,
  successRate: number | null,
): string {
  const price = lowPrice ? `from ${lowPrice} per code` : "priced per code received";
  const success = successRate
    ? ` Recent delivery rate across these services averages ${successRate}%.`
    : "";

  const variants = [
    `A temporary ${country.adjective} number gives you a local ${flagEmoji(country.iso)} ${country.iso} mobile line that receives SMS just like a physical phone. We currently price ${serviceCount} services on ${country.name} numbers, ${price}.${success}`,
    `Some platforms only accept a local number, or behave differently depending on where the number is registered. These ${country.name} numbers come from real SIM cards in ${country.name}, cover ${serviceCount} services, and are ${price}.${success}`,
    `Verifying an account that expects a ${country.adjective} number? Pick a service below, get a real ${country.name} SIM-based number in about three seconds, and read the code in your dashboard. ${serviceCount} services priced, ${price}.${success}`,
    `${country.name} numbers on this page are real SIMs, not VoIP lines — which matters because most major platforms now reject VoIP. ${serviceCount} services are currently priced for ${country.name}, ${price}.${success}`,
  ];

  const index = country.slug
    .split("")
    .reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % variants.length;
  return variants[index];
}

function buildFaq(
  country: CountryEntry,
  rows: CountryPrice[],
  lowPrice: string | null,
): FaqItem[] {
  const available = rows.filter((r) => r.quote);
  const names = available.slice(0, 5).map((r) => r.service.name).join(", ");

  return [
    {
      question: `How much does a ${country.name} phone number cost?`,
      answer: lowPrice
        ? `${country.name} numbers start at ${lowPrice} per SMS received, and the exact price depends on which service you're verifying. You pay only when a code is delivered — if none arrives inside the 20-minute window, the charge is refunded to your wallet automatically.`
        : `${country.name} numbers are priced per SMS received and vary by service. The price is always shown before you confirm, and you're only charged when a code arrives.`,
    },
    {
      question: `Which services work with a ${country.name} number?`,
      answer: available.length
        ? `${available.length} of the services we price are currently in stock for ${country.name}, including ${names}. Stock moves throughout the day, so the table on this page is the live view.`
        : `Service availability for ${country.name} changes as stock moves. The table on this page shows what is currently in stock.`,
    },
    {
      question: `Is this a real ${country.adjective} SIM or a VoIP number?`,
      answer: `A real SIM. The numbers are issued from physical SIM cards on ${country.adjective} mobile networks, which is why they pass the VoIP checks that platforms like Telegram, Tinder and Google apply. VoIP numbers are routinely rejected by those services.`,
    },
    {
      question: `Can I keep a ${country.name} number long term?`,
      answer: `The pay-per-SMS numbers on this page are single-use and stay active for 20 minutes. If you need the same ${country.adjective} number for days or weeks — for an account you'll log into repeatedly — we also offer long-term rentals, available from your dashboard once you sign in.`,
    },
  ];
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country: slug } = await params;
  const country = load(slug);

  const services = servicesBySlugs(PRICING_SERVICE_SLUGS);
  const rows = await getCountryPrices(country, services);
  const low = cheapest(rows);
  const lowPrice = low ? formatPrice(low.price) : null;
  const available = rows.filter((r) => r.quote);
  const successRate = averageSuccessRate(rows);
  const faq = buildFaq(country, rows, lowPrice);

  const otherCountries = COUNTRIES.filter((c) => c.slug !== country.slug).slice(0, 10);

  return (
    <div className="min-h-screen bg-[#080808] text-[#F5F5F5]">
      <SiteNav />

      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Numbers", path: "/pricing" },
            { name: country.name, path: `/numbers/${country.slug}` },
          ]),
          faqSchema(faq),
          ...(low
            ? [
                productSchema({
                  name: `Temporary ${country.name} phone number`,
                  description: `A real SIM-based temporary ${country.adjective} mobile number for receiving SMS verification codes.`,
                  path: `/numbers/${country.slug}`,
                  lowPrice: low.price,
                  offerCount: available.length,
                }),
              ]
            : []),
        ]}
      />

      <main>
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-[#555555]">
            <Link href="/" className="hover:text-[#00FF94]">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/pricing" className="hover:text-[#00FF94]">Numbers</Link>
            <span className="mx-2">/</span>
            <span className="text-[#F5F5F5]">{country.name}</span>
          </nav>

          <h1 className="font-sans text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-[1.1]">
            Temporary {searchName(country)} Phone Numbers for SMS Verification
          </h1>

          <p className="text-[#555555] text-base sm:text-lg leading-relaxed max-w-2xl">
            {introCopy(country, lowPrice, available.length, successRate)}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#00FF94] text-[#080808] font-semibold rounded-md hover:bg-[#00FF94]/90 transition-colors text-sm"
            >
              Get a {country.name} number&nbsp;&rarr;
            </Link>
            {lowPrice && (
              <span className="font-mono text-sm text-[#555555]">
                from <span className="text-[#00FF94]">{lowPrice}</span> per SMS
              </span>
            )}
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-14">
          <h2 className="font-sans text-2xl font-bold mb-1">
            Services available on {country.name} numbers
          </h2>
          <p className="text-sm text-[#555555] mb-6">
            Live rates, refreshed hourly.
          </p>

          <PriceTableHeader first="Service" />
          {rows.map(({ service, quote }) => (
            <PriceRow
              key={service.slug}
              label={service.name}
              href={`/receive-sms/${service.slug}`}
              quote={quote}
            />
          ))}
        </section>

        <Faq items={faq} heading={`${country.name} number FAQ`} headingId="country-faq" />

        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <h2 className="font-sans text-lg font-bold mb-4">Numbers in other countries</h2>
          <div className="flex flex-wrap gap-2">
            {otherCountries.map((c) => (
              <Link
                key={c.slug}
                href={`/numbers/${c.slug}`}
                className="font-mono text-xs px-3 py-2 rounded-md border border-[#1A1A1A] bg-[#0F0F0F] text-[#555555] hover:text-[#00FF94] hover:border-[#00FF94]/40 transition-colors"
              >
                {flagEmoji(c.iso)} {c.name}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
