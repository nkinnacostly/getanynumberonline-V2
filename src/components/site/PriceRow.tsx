import Link from "next/link";
import type { PriceQuote } from "@/lib/seo/pricing";
import { formatPrice } from "@/lib/seo/pricing";

/**
 * One priced row of a service/country table. Shared by /pricing,
 * /receive-sms/[service] and /numbers/[country] so the three tables can't
 * drift in how they show an unavailable price or a success rate.
 */
export default function PriceRow({
  label,
  sublabel,
  href,
  quote,
}: {
  label: string;
  sublabel?: string;
  href?: string;
  quote: PriceQuote | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line font-mono text-sm">
      <span className="min-w-0 flex-1 truncate">
        {href ? (
          <Link href={href} className="text-foreground hover:text-accent transition-colors">
            {label}
          </Link>
        ) : (
          <span className="text-foreground">{label}</span>
        )}
      </span>

      {sublabel && (
        <span className="text-muted hidden sm:block shrink-0">{sublabel}</span>
      )}

      <span className="text-muted hidden md:block shrink-0 w-20 text-right">
        {quote?.successRate ? `${quote.successRate}%` : "—"}
      </span>

      <span className="shrink-0 w-20 text-right">
        {quote ? (
          <span className="text-accent">{formatPrice(quote.price)}</span>
        ) : (
          // A failed lookup must read as "not right now", never as free.
          <span className="text-muted">n/a</span>
        )}
      </span>
    </div>
  );
}

export function PriceTableHeader({ first, second }: { first: string; second?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 pb-2 border-b border-line font-mono text-xs text-muted uppercase tracking-wider">
      <span className="min-w-0 flex-1">{first}</span>
      {second && <span className="hidden sm:block shrink-0">{second}</span>}
      <span className="hidden md:block shrink-0 w-20 text-right">Success</span>
      <span className="shrink-0 w-20 text-right">Price</span>
    </div>
  );
}
