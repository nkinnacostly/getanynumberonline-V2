/**
 * Server-side price fetching for the public, crawlable pages.
 *
 * SMSPool has no bulk pricing endpoint — `request/price` is one call per
 * (service, country) pair. A 10x8 matrix is 80 calls, and the same pairs are
 * needed again by every service and country page, so this module memoises
 * aggressively and bounds concurrency.
 *
 * Why this calls SMSPool directly rather than going through an edge function
 * (cf. CLAUDE.md §9): `request/price`, `service/retrieve_all` and
 * `country/retrieve_all` take NO API key — the existing OrderForm already
 * calls them straight from the browser via `fetchSMSPool`. Doing it from the
 * Next server is strictly safer than that, keeps no secret anywhere, and is
 * the only way to get prices into statically rendered HTML that Google can
 * read. Nothing here touches a keyed endpoint.
 */

import { applyMarkup } from "@/lib/pricing";
import type { CountryEntry, ServiceEntry } from "@/lib/seo/catalog";

const SMSPOOL = "https://api.smspool.net";

/** How long a memoised price stays fresh, matched to the pages' ISR window. */
const TTL_MS = 60 * 60 * 1000;

export interface PriceQuote {
  /** Marked-up price in USD — what the customer actually pays. */
  price: number;
  /** SMSPool's reported delivery success rate, 0-100. */
  successRate: number | null;
}

interface CacheEntry {
  at: number;
  value: PriceQuote | null;
}

// Module-level, so the whole build shares one cache across every page render
// (React's `cache()` only dedupes within a single request).
const priceCache = new Map<string, CacheEntry>();

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * One price lookup, with retries.
 *
 * SMSPool's TLS layer intermittently drops connections mid-handshake, so a
 * single failure is not evidence the pair is unpriced. Returns null only after
 * the retries are exhausted; callers render "unavailable" rather than failing
 * the build — a missing price must never take a page down.
 */
async function fetchPrice(
  serviceId: number,
  countryId: number,
  attempts = 3,
): Promise<PriceQuote | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const body = new URLSearchParams({
        country: String(countryId),
        service: String(serviceId),
      });
      const res = await fetch(`${SMSPOOL}/request/price`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15_000),
        // Deliberately NOT `cache: "no-store"` — that marks the calling route
        // dynamic, which would render every pricing page per-request and put
        // an uncached SMSPool call in the critical path of real traffic.
        // Freshness comes from the page's `revalidate` window plus the
        // module-level memo above.
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as {
        price?: string | number;
        success_rate?: number;
      };
      const raw = typeof json.price === "number"
        ? json.price
        : parseFloat(String(json.price ?? ""));
      if (!isFinite(raw) || raw <= 0) return null;

      return {
        price: applyMarkup(raw),
        successRate: typeof json.success_rate === "number"
          ? json.success_rate
          : null,
      };
    } catch {
      if (attempt < attempts) await sleep(400 * 2 ** (attempt - 1));
    }
  }
  return null;
}

export async function getPrice(
  serviceId: number,
  countryId: number,
): Promise<PriceQuote | null> {
  const key = `${serviceId}:${countryId}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const value = await fetchPrice(serviceId, countryId);
  priceCache.set(key, { at: Date.now(), value });
  return value;
}

/** Run `task` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface ServicePrice {
  country: CountryEntry;
  quote: PriceQuote | null;
}

export interface CountryPrice {
  service: ServiceEntry;
  quote: PriceQuote | null;
}

/** Prices for one service across many countries. */
export async function getServicePrices(
  service: ServiceEntry,
  countries: CountryEntry[],
): Promise<ServicePrice[]> {
  return mapLimit(countries, 6, async (country) => ({
    country,
    quote: await getPrice(service.id, country.id),
  }));
}

/** Prices for one country across many services. */
export async function getCountryPrices(
  country: CountryEntry,
  services: ServiceEntry[],
): Promise<CountryPrice[]> {
  return mapLimit(services, 6, async (service) => ({
    service,
    quote: await getPrice(service.id, country.id),
  }));
}

/** The cheapest real quote in a list, for "from $X" copy and Offer schema. */
export function cheapest(
  rows: { quote: PriceQuote | null }[],
): PriceQuote | null {
  return rows
    .map((r) => r.quote)
    .filter((q): q is PriceQuote => q !== null)
    .sort((a, b) => a.price - b.price)[0] ?? null;
}

/** Mean success rate across available quotes, rounded — null if none. */
export function averageSuccessRate(
  rows: { quote: PriceQuote | null }[],
): number | null {
  const rates = rows
    .map((r) => r.quote?.successRate)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (rates.length === 0) return null;
  return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
}

export const formatPrice = (n: number) => `$${n.toFixed(2)}`;
