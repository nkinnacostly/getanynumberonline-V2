import Link from "next/link";
import { ArrowRight } from "./icons";

/**
 * Pricing teaser — three sample rows in a single bordered card, then the
 * link to the full pricing page. Prices here are illustrative examples;
 * the canonical markup math lives in CLAUDE.md §12 and the catalog
 * functions, not on this page.
 */

const PRICING_ROWS = [
  { service: "Google verification", country: "United States", price: "$0.15" },
  { service: "WhatsApp activation", country: "United Kingdom", price: "$0.22" },
  { service: "Telegram sign-in", country: "India", price: "$0.08" },
];

export default function PricingTeaser() {
  return (
    <section id="pricing" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <h2 className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F5F5] mb-3">
          No surprises.
        </h2>
        <p className="text-[#555555] text-base">
          You only pay when an SMS is received. Nothing else.
        </p>
      </div>

      <div className="max-w-2xl mx-auto bg-[#0F0F0F] border border-[#1A1A1A] rounded-lg px-6 sm:px-8 py-2">
        {PRICING_ROWS.map((row) => (
          <div
            key={row.service}
            className="flex items-center justify-between gap-4 py-4 border-b border-[#1A1A1A] last:border-0 font-mono text-sm"
          >
            <span className="text-[#F5F5F5]">{row.service}</span>
            <span className="text-[#555555] hidden sm:block text-xs">
              {row.country}
            </span>
            <span className="text-[#00FF94]">{row.price}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-[#555555] mt-6 text-center">
        Prices vary by service and country. You always see the price before
        you pay.
      </p>

      <div className="text-center mt-8">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 min-h-[44px] text-sm text-[#00FF94] border border-[#00FF94]/30 hover:border-[#00FF94] rounded-md px-5 transition-colors font-medium"
        >
          View all pricing
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
