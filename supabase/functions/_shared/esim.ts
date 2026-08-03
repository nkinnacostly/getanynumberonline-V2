// ============================================================
// Shared: eSIM pricing + catalog shaping for edge functions
//
// SMSPool eSIM endpoints return raw wholesale prices and a `network` field
// that is a JSON-ENCODED STRING (not an object). Both the catalog and the
// purchase paths must agree on the markup and on how a plan/country row is
// shaped, so that logic lives here — used by get-esim-catalog and order-esim.
// ============================================================

/**
 * Tiered markup, same rounding as the one-time-number formula. Cheap plans
 * carry a higher % so the absolute margin is worthwhile; large plans stay
 * competitive. Keep IN SYNC with the client copy used for display.
 */
export function applyEsimMarkup(raw: number): number {
  let m: number;
  if (raw < 1) m = 0.5;
  else if (raw <= 5) m = 0.4;
  else m = 0.3;
  return Math.ceil(raw * (1 + m) * 100) / 100;
}

export interface NetworkCoverage {
  country: string;
  operators: { operatorName: string; networkType: string }[];
}

/** Parse SMSPool's JSON-encoded `network` string into structured coverage. */
export function parseNetwork(network: unknown): NetworkCoverage[] {
  if (typeof network !== "string" || network.trim() === "") return [];
  try {
    const parsed = JSON.parse(network);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry: Record<string, unknown>) => ({
        country: String(entry.country ?? ""),
        operators: Array.isArray(entry.network)
          ? (entry.network as Record<string, unknown>[]).map((op) => ({
              operatorName: String(op.operatorName ?? ""),
              networkType: String(op.networkType ?? ""),
            }))
          : [],
      }))
      .filter((c) => c.country !== "");
  } catch {
    return [];
  }
}

export interface EsimPlan {
  id: string;
  price: number; // marked-up, display == charge
  raw_price: number;
  data_gb: number;
  duration_days: number | null;
  speed: string;
  ip: string | null;
  extendable: boolean;
  coverage: NetworkCoverage[];
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

/** Normalize a raw SMSPool plan row (from esim/plans) into an EsimPlan. */
export function shapePlan(row: Record<string, unknown>): EsimPlan {
  const raw = num(row.price);
  return {
    id: String(row.ID ?? row.id ?? ""),
    price: applyEsimMarkup(raw),
    raw_price: raw,
    data_gb: num(row.dataInGb),
    duration_days:
      row.duration === undefined || row.duration === null
        ? null
        : num(row.duration),
    speed: String(row.speed ?? ""),
    ip: row.ip === undefined || row.ip === null ? null : String(row.ip),
    extendable: num(row.extendable) > 1,
    coverage: parseNetwork(row.network),
  };
}

export interface EsimCountry {
  id: string;
  name: string;
  country_code: string;
  from_price: number; // marked-up representative price
  raw_price: number;
  data_gb: number;
  speed: string;
  coverage: NetworkCoverage[];
}

/** Normalize a raw SMSPool country row (from esim/pricing) into an EsimCountry. */
export function shapeCountry(row: Record<string, unknown>): EsimCountry {
  const raw = num(row.price);
  return {
    id: String(row.ID ?? row.id ?? ""),
    name: String(row.name ?? ""),
    country_code: String(row.countryCode ?? "").toUpperCase(),
    from_price: applyEsimMarkup(raw),
    raw_price: raw,
    data_gb: num(row.dataInGb),
    speed: String(row.speed ?? ""),
    coverage: parseNetwork(row.network),
  };
}
