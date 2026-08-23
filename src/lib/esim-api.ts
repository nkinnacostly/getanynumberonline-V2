import { callEdgeFunction } from "@/lib/api";

// SimJuno (simjuno.com) — replaced eSIM Access for all new orders.
//
// Prices returned by the catalog edge function are ALREADY marked up (the edge
// is the single source of truth), so the client just displays them — there is
// no client-side markup to drift out of sync with what gets charged.
//
// The provider quotes data in bytes and prices as integers scaled x10,000;
// both are normalised to GB / dollars by the edge before they reach here.
// Destinations arrive pre-grouped (country / region / global), each addressed
// by its slug.

export type CatalogScope = "country" | "region" | "global";

export interface EsimDestination {
  /** Destination slug ('mexico', 'europe', 'global139') — the order key. */
  code: string;
  name: string;
  kind: CatalogScope;
  from_price: number;
}

export interface EsimCoverage {
  name: string;
  logo: string | null;
  operators: { operatorName: string; networkType: string }[];
}

export interface EsimPackage {
  code: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  raw_price: number;
  data_gb: number;
  total_bytes: number;
  duration_days: number | null;
  duration_unit: string;
  unused_valid_days: number | null;
  location_code: string;
  location_codes: string[];
  speed: string;
  is_day_pass: boolean;
  active_type: number;
  supports_topup: boolean;
  fup_policy: string | null;
  ip_export: string | null;
  coverage: EsimCoverage[];
}

export interface EsimProfile {
  esim_id: string;
  transaction_id: string;
  name: string;
  slug: string;
  iccid: string | null;
  activation_string: string | null;
  smdp_address: string | null;
  activation_code: string | null;
  qr_code_url: string | null;
  short_url: string | null;
  smdp_status: string | null;
  esim_status: string | null;
  status: string;
  active_type: number;
  expires_at: string | null;
  total_bytes: number;
  used_bytes: number;
  unused_valid_days: number | null;
}

export async function fetchEsimDestinations(): Promise<{
  countries: EsimDestination[];
  regions: EsimDestination[];
  global: EsimDestination[];
  /** False when our supplier account can't currently fulfil orders. */
  available: boolean;
  unavailableNote: string | null;
}> {
  const data = await callEdgeFunction("get-esim-catalog", {
    scope: "destinations",
  });
  return {
    countries: (data.countries ?? []) as EsimDestination[],
    regions: (data.regions ?? []) as EsimDestination[],
    global: (data.global ?? []) as EsimDestination[],
    available: data.available !== false,
    unavailableNote: (data.unavailable_note ?? null) as string | null,
  };
}

/** Packages for any destination slug — country, region or global. */
export async function fetchEsimPackages(
  destinationSlug: string,
): Promise<EsimPackage[]> {
  const data = await callEdgeFunction("get-esim-catalog", {
    location_code: destinationSlug,
  });
  return (data.packages ?? []) as EsimPackage[];
}

export async function purchaseEsim(input: {
  slug: string;
  catalog_scope: CatalogScope;
  destination_slug: string;
  location_name: string;
  raw_price: number;
}): Promise<{
  esim_id: string;
  provider_esim_id: string;
  status: "active" | "pending";
  cost: number;
}> {
  return callEdgeFunction("order-esim", input);
}

export async function fetchEsimProfile(esimId: string): Promise<{
  status: string;
  profile: EsimProfile | null;
}> {
  return callEdgeFunction("get-esim-profile", { esim_id: esimId });
}

// ── Display helpers ─────────────────────────────────────────

/** Bytes -> a compact "1.5 GB" / "820 MB" label. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb * 100) / 100} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
}

/** One-line summary of what a package gives you. */
export function packageSummary(pkg: EsimPackage): string {
  const volume = formatBytes(pkg.total_bytes);
  const duration = pkg.duration_days
    ? ` · ${pkg.duration_days} ${pkg.duration_unit.toLowerCase()}s`
    : "";
  return `${volume}${duration}`;
}
