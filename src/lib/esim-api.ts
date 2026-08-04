import { callEdgeFunction } from "@/lib/api";

// eSIM Access (esimaccess.com) — replaces the discontinued SMSPool eSIM API.
//
// Prices returned by the catalog edge function are ALREADY marked up (the edge
// is the single source of truth), so the client just displays them — there is
// no client-side markup to drift out of sync with what gets charged.
//
// The provider quotes data in bytes and prices as integers scaled x10,000;
// both are normalised to GB / dollars before they reach here.

export type CatalogScope = "country" | "regional" | "global";

export interface EsimCoverage {
  name: string;
  logo: string | null;
  operators: { operatorName: string; networkType: string }[];
}

export interface EsimDestination {
  code: string;
  name: string;
  kind: "country" | "region";
  sub_locations: { code: string; name: string }[];
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
  /** The package's own location: Alpha-2 for a country plan, or a region code. */
  location_code: string;
  location_codes: string[];
  speed: string;
  data_type: number;
  is_day_pass: boolean;
  active_type: number;
  supports_topup: boolean;
  fup_policy: string | null;
  ip_export: string | null;
  coverage: EsimCoverage[];
}

/** Regional packages grouped by coverage area (the API returns them flat). */
export interface EsimRegionGroup {
  key: string;
  label: string;
  location_codes: string[];
  from_price: number;
  packages: EsimPackage[];
}

export interface EsimProfile {
  esim_tran_no: string;
  order_no: string;
  transaction_id: string;
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
  duration_days: number | null;
  duration_unit: string;
  pin: string | null;
  puk: string | null;
  apn: string | null;
  packages: { name: string; code: string; slug: string; location: string }[];
}

export async function fetchEsimDestinations(): Promise<{
  countries: EsimDestination[];
  regions: EsimDestination[];
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
    available: data.available !== false,
    unavailableNote: (data.unavailable_note ?? null) as string | null,
  };
}

export async function fetchEsimPackages(
  locationCode: string,
): Promise<EsimPackage[]> {
  const data = await callEdgeFunction("get-esim-catalog", {
    location_code: locationCode,
  });
  return (data.packages ?? []) as EsimPackage[];
}

export async function fetchRegionalGroups(): Promise<EsimRegionGroup[]> {
  const data = await callEdgeFunction("get-esim-catalog", {
    scope: "regional",
  });
  return (data.groups ?? []) as EsimRegionGroup[];
}

export async function fetchGlobalPackages(): Promise<EsimPackage[]> {
  const data = await callEdgeFunction("get-esim-catalog", { scope: "global" });
  return (data.packages ?? []) as EsimPackage[];
}

export async function purchaseEsim(input: {
  package_code: string;
  catalog_scope: CatalogScope;
  location_code: string;
  location_name: string;
  raw_price: number;
  period_num?: number;
}): Promise<{
  esim_id: string;
  order_no: string;
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

/**
 * Day-pass plans (dataType 2-4) bill a daily allowance rather than a pot of
 * data, so both price and volume scale with the number of days chosen.
 *
 * MUST mirror applyEsimMarkup in supabase/functions/_shared/esimaccess.ts —
 * display has to equal what order-esim actually charges.
 */
export function packagePrice(pkg: EsimPackage, days: number): number {
  if (!pkg.is_day_pass) return pkg.price;
  const raw = pkg.raw_price * days;
  const markup = raw < 1 ? 0.5 : raw <= 5 ? 0.4 : 0.3;
  return Math.ceil(raw * (1 + markup) * 100) / 100;
}

/** One-line summary of what a package gives you. */
export function packageSummary(pkg: EsimPackage, days: number): string {
  const volume = formatBytes(pkg.total_bytes);
  if (pkg.is_day_pass) {
    const kind = pkg.data_type === 4 ? "Unlimited" : volume;
    return `${kind}/day · ${days} day${days === 1 ? "" : "s"}`;
  }
  const duration = pkg.duration_days
    ? ` · ${pkg.duration_days} ${pkg.duration_unit.toLowerCase()}s`
    : "";
  return `${volume}${duration}`;
}
