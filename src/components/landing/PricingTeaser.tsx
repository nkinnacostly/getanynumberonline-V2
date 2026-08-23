import Link from "next/link";
import { ArrowRight } from "./icons";

/**
 * Pricing teaser on the light surface — three sample rows in a single white
 * card, then the link to the full pricing page. Prices here are illustrative
 * examples; the canonical markup math lives in CLAUDE.md §12 and the catalog
 * functions, not on this page. Green prices use the light-background emerald
 * (#0F8A57) — raw mint fails contrast on paper.
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
        <h2 className="font-sans text-3xl sm:text-4xl font-bold tracking-tight text-foreground mb-3">
          No surprises.
        </h2>
        <p className="text-muted text-base">
          You only pay when an SMS is received. Nothing else.
        </p>
      </div>

      <div className="max-w-2xl mx-auto bg-surface border border-line rounded-lg px-6 sm:px-8 py-2">
        {PRICING_ROWS.map((row) => (
          <div
            key={row.service}
            className="flex items-center justify-between gap-4 py-4 border-b border-line last:border-0 font-mono text-sm"
          >
            <span className="text-foreground">{row.service}</span>
            <span className="text-muted hidden sm:block text-xs">
              {row.country}
            </span>
            <span className="text-accent">{row.price}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted mt-6 text-center">
        Prices vary by service and country. You always see the price before
        you pay.
      </p>

      <div className="text-center mt-8">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 min-h-[44px] text-sm text-accent border border-accent/30 hover:border-accent rounded-full px-6 transition-colors font-medium"
        >
          View all pricing
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
