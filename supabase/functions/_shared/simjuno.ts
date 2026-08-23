// ============================================================
// Shared: SimJuno (simjuno.com) client + pricing/shaping
//
// Replaces eSIM Access for all NEW orders. Differences that matter:
//   • Auth is an `x-api-key` header (key starts `juno_`), NOT a POST body
//     header — and catalog endpoints are GET, not JSON POST.
//   • Prices are integers scaled x10,000 (26350 == $2.635) exactly like
//     eSIM Access — VERIFIED against the live API despite the OpenAPI doc
//     claiming "double". Data volumes are bytes.
//   • Destinations come PRE-GROUPED: GET /esim/destination returns Country[],
//     Region[] and Global[], each entry addressable by its slug. No client-side
//     grouping of regional bundles needed.
//   • Ordering is POST /esim/order { transaction_id, orderList:[{slug,count}] }
//     → { esim_ids } returned synchronously; profile allocation is still
//     asynchronous. Retrying with the SAME transaction_id + orderList is safe.
//   • The order call takes NO price — SimJuno debits the reseller wallet at the
//     listed price, so there is no price-mismatch guard to send upstream.
//   • Day-pass plans (dataType 2-4) would need a periodNum SimJuno doesn't
//     accept, so they are filtered out of every listing.
//   • GET /esim/{id} exposes NO ICCID and NO smdpStatus — those only arrive via
//     webhook events (SMDP_EVENT). Activation details are `ac`, `qrCodeUrl`,
//     `shortUrl`.
//   • Webhooks carry a real HMAC-SHA256 signature (see simjuno-webhook).
//   • Rate limit 8 req/s per key; bursts occasionally answer 403 instead of 429.
//
// Catalog and purchase paths must agree on markup and package shape, so both
// live here — used by get-esim-catalog, order-esim, get-esim-profile,
// simjuno-webhook and reconcile-esims.
// ============================================================

const BASE = "https://api.simjuno.com/v1";

/** Price scaling factor: the API quotes 26350 for $2.635. */
const PRICE_SCALE = 10_000;
const BYTES_PER_GB = 1024 ** 3;

export class SimJunoError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    /** Transport/5xx/429 failures may succeed on retry with the same inputs. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SimJunoError";
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Provider integer price (26350) -> dollars (2.635). */
export function toDollars(scaled: unknown): number {
  const n = num(scaled);
  return isNaN(n) ? 0 : n / PRICE_SCALE;
}

/**
 * Normalize a data volume that may be bytes or GB.
 *
 * Webhook DATA_USAGE events document bytes explicitly, but GET /esim/{id}
 * types `totalData`/`dataUsage` as bare doubles with no unit documented. GB
 * values for any real plan stay below 1e6, byte values for any real plan sit
 * above it — so the threshold separates them safely.
 */
export function normalizeVolume(v: unknown): number {
  const n = num(v);
  if (!n) return 0;
  return n >= 1e6 ? n : n * BYTES_PER_GB;
}

/** Bytes -> GB, rounded to 2dp for display. */
export function bytesToGb(bytes: unknown): number {
  return Math.round((num(bytes) / BYTES_PER_GB) * 100) / 100;
}

/**
 * Tiered markup — IDENTICAL to the retired applyEsimMarkup in
 * _shared/esimaccess.ts and to §12 of CLAUDE.md. Cheap plans carry a higher %
 * so the absolute margin is worthwhile; large plans stay competitive.
 */
export function applyEsimMarkup(raw: number): number {
  let m: number;
  if (raw < 1) m = 0.5;
  else if (raw <= 5) m = 0.4;
  else m = 0.3;
  return Math.ceil(raw * (1 + m) * 100) / 100;
}

// ── Transport ───────────────────────────────────────────────

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const apiKey = Deno.env.get("SIMJUNO_API_KEY");
  if (!apiKey) {
    // Loud, not silent: a missing secret must not look like "no plans found".
    throw new SimJunoError("SIMJUNO_API_KEY is not configured", 500, false);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "x-api-key": apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw new SimJunoError(
      `Network error calling ${path}: ${err instanceof Error ? err.message : err}`,
      502,
      true,
    );
  }

  const json = (await res.json().catch(() => null)) as T | null;

  // Rate limiting answers 429 and (via Cloudflare) sometimes 403 — both are
  // transient and worth one clean retry by the caller, not a hard failure.
  if (res.status === 429 || res.status === 403) {
    throw new SimJunoError(`${path} was rate limited (${res.status})`, res.status, true);
  }
  if (!res.ok || !json) {
    throw new SimJunoError(
      `${path} returned HTTP ${res.status}`,
      res.status >= 500 ? 502 : res.status,
      res.status >= 500,
    );
  }
  return json;
}

// ── Destinations (/esim/destination) ────────────────────────

export interface EsimDestination {
  /** Destination slug ('mexico', 'europe', 'global139') — what we order with. */
  code: string;
  name: string;
  kind: "country" | "region" | "global";
  /** Cheapest wholesale price in the destination (dollars), when given. */
  from_price: number;
}

interface RawDestination {
  name?: string;
  slug?: string;
  from?: number;
}

function shapeDestination(row: RawDestination, kind: EsimDestination["kind"]): EsimDestination {
  return {
    code: str(row.slug).trim(),
    name: str(row.name).trim(),
    kind,
    from_price: toDollars(row.from),
  };
}

export async function listDestinations(): Promise<{
  countries: EsimDestination[];
  regions: EsimDestination[];
  globals: EsimDestination[];
}> {
  const obj = await call<Record<string, RawDestination[] | undefined>>(
    "GET",
    "/esim/destination?sortBy=alphabetical",
  );
  const pick = (k: string, kind: EsimDestination["kind"]) =>
    (obj[k] ?? [])
      .map((d) => shapeDestination(d, kind))
      .filter((d) => d.code && d.name)
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    countries: pick("Country", "country"),
    regions: pick("Region", "region"),
    globals: pick("Global", "global"),
  };
}

// ── Packages (/esim/destination/{slug}) ─────────────────────

export interface EsimCoverage {
  name: string;
  logo: string | null;
  operators: { operatorName: string; networkType: string }[];
}

export interface EsimPackage {
  code: string; // packageCode — provider identifier
  slug: string; // what we order with
  name: string;
  description: string;
  price: number; // marked-up USD — display == charge
  raw_price: number; // wholesale USD
  data_gb: number;
  total_bytes: number;
  duration_days: number | null;
  duration_unit: string;
  /** Days the profile stays installable before it expires unused. */
  unused_valid_days: number | null;
  location_code: string; // first ISO covered, for single-country plans
  /** ISO codes the package covers. */
  location_codes: string[];
  speed: string;
  /**
   * True for day-pass plans (dataType 2-4). SimJuno's order endpoint has no
   * periodNum, so these cannot be priced or ordered correctly — the catalog
   * filters them out before they ever reach the UI.
   */
  is_day_pass: boolean;
  /** 1 = activates on install, 2 = activates on first network connection. */
  active_type: number;
  supports_topup: boolean;
  /** Speed after the full-speed allowance is used, if the plan has an FUP. */
  fup_policy: string | null;
  ip_export: string | null;
  coverage: EsimCoverage[];
}

interface RawPackage {
  packageCode?: string;
  slug?: string;
  name?: string;
  description?: string;
  price?: number;
  volume?: number;
  dataType?: number;
  unusedValidTime?: number;
  duration?: number;
  durationUnit?: string;
  location?: string;
  activeType?: number;
  speed?: string;
  supportTopUpType?: number;
  fupPolicy?: string;
  ipExport?: string;
  locationNetworkList?: Record<string, unknown>[];
}

export function shapePackage(row: RawPackage): EsimPackage {
  const raw = toDollars(row.price);
  const bytes = num(row.volume);
  const locations = str(row.location)
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const nets = Array.isArray(row.locationNetworkList)
    ? row.locationNetworkList
    : [];

  return {
    code: str(row.packageCode),
    slug: str(row.slug),
    name: str(row.name),
    description: str(row.description),
    price: applyEsimMarkup(raw),
    raw_price: raw,
    data_gb: bytesToGb(bytes),
    total_bytes: bytes,
    duration_days: row.duration === undefined || row.duration === null
      ? null
      : num(row.duration),
    duration_unit: str(row.durationUnit) || "DAY",
    unused_valid_days: row.unusedValidTime === undefined ||
        row.unusedValidTime === null
      ? null
      : num(row.unusedValidTime),
    location_code: locations[0] ?? "",
    location_codes: locations,
    speed: str(row.speed),
    is_day_pass: num(row.dataType) >= 2,
    active_type: num(row.activeType) || 1,
    // supportTopUpType: 1 = no, 2 = yes, 3 = yes with periodNum
    supports_topup: num(row.supportTopUpType) >= 2,
    fup_policy: row.fupPolicy ? str(row.fupPolicy) : null,
    ip_export: row.ipExport ? str(row.ipExport) : null,
    coverage: nets.map((n) => ({
      name: str(n.locationName),
      logo: n.locationLogo ? str(n.locationLogo) : null,
      operators: Array.isArray(n.operatorList)
        ? (n.operatorList as Record<string, unknown>[]).map((o) => ({
          operatorName: str(o.operatorName),
          networkType: str(o.networkType),
        }))
        : [],
    })),
  };
}

/** Packages for one destination slug, cheapest first, sellable ones only. */
export async function listPackages(destinationSlug: string): Promise<EsimPackage[]> {
  const obj = await call<{ packages?: RawPackage[] }>(
    "GET",
    `/esim/destination/${encodeURIComponent(destinationSlug)}`,
  );
  return (obj.packages ?? [])
    .map(shapePackage)
    // dataType >= 2 (day passes) take a periodNum SimJuno can't order — sell
    // fixed-allowance plans only rather than quote something we can't deliver.
    .filter((p) => p.slug && p.code && !p.is_day_pass && p.raw_price > 0)
    .sort((a, b) => a.price - b.price);
}

/** Current wholesale truth for one package — the pre-order price check. */
export async function getPackage(slug: string): Promise<EsimPackage | null> {
  const obj = await call<RawPackage>(
    "GET",
    `/esim/package/${encodeURIComponent(slug)}`,
  );
  const pkg = shapePackage(obj);
  return pkg.slug && pkg.raw_price > 0 && !pkg.is_day_pass ? pkg : null;
}

// ── Allocated profiles (/esim/{id}) ─────────────────────────

export interface EsimProfile {
  esim_id: string; // SimJuno's identifier — our provider_tran_no
  transaction_id: string; // echoed back on webhook events, not this endpoint
  name: string;
  slug: string;
  iccid: string | null; // not exposed by SimJuno — always null here
  /** LPA:1$<SM-DP+ address>$<matching id> — the full activation string. */
  activation_string: string | null;
  /** Split out of the LPA string for manual entry on Android. */
  smdp_address: string | null;
  activation_code: string | null;
  qr_code_url: string | null;
  short_url: string | null;
  smdp_status: string | null; // only arrives via SMDP_EVENT webhooks
  esim_status: string | null;
  /** Mapped onto our own vocabulary — see mapEsimStatus. */
  status: string;
  active_type: number;
  expires_at: string | null;
  total_bytes: number;
  used_bytes: number;
  unused_valid_days: number | null;
}

/** Pull the SM-DP+ address and matching id out of `LPA:1$host$code`. */
export function parseActivationString(
  ac: string | null,
): { smdp: string | null; code: string | null } {
  if (!ac) return { smdp: null, code: null };
  const parts = ac.split("$");
  if (parts.length < 3) return { smdp: null, code: null };
  return { smdp: parts[1] || null, code: parts[2] || null };
}

/**
 * Map the provider's esimStatus onto the `esims.status` CHECK vocabulary.
 * SimJuno relays eSIM Access status values unchanged:
 *   GOT_RESOURCE, IN_USE                  -> active
 *   USED_UP, USED_EXPIRED, UNUSED_EXPIRED -> expired
 *   CANCEL, REVOKED                       -> cancelled
 *   SUSPENDED                             -> suspended
 *   anything else                         -> pending (still provisioning)
 */
export function mapEsimStatus(esimStatus: unknown): string {
  switch (str(esimStatus).toUpperCase()) {
    case "GOT_RESOURCE":
    case "IN_USE":
      return "active";
    case "USED_UP":
    case "USED_EXPIRED":
    case "UNUSED_EXPIRED":
      return "expired";
    case "CANCEL":
    case "CANCELLED":
    case "REVOKE":
    case "REVOKED":
      return "cancelled";
    case "SUSPENDED":
      return "suspended";
    default:
      return "pending";
  }
}

interface RawEsim {
  id?: string;
  name?: string;
  slug?: string;
  esimStatus?: string;
  expired_time?: string;
  qrCodeUrl?: string;
  shortUrl?: string;
  ac?: string;
  totalData?: number;
  dataUsage?: number;
  unused_valid_time?: number;
  lastDataUsageUpdateTime?: string;
}

export function shapeProfile(row: RawEsim, transactionId = ""): EsimProfile {
  const ac = row.ac ? str(row.ac) : null;
  const { smdp, code } = parseActivationString(ac);

  return {
    esim_id: str(row.id),
    transaction_id: transactionId,
    name: str(row.name),
    slug: str(row.slug),
    iccid: null,
    activation_string: ac,
    smdp_address: smdp,
    activation_code: code,
    qr_code_url: row.qrCodeUrl ? str(row.qrCodeUrl) : null,
    short_url: row.shortUrl ? str(row.shortUrl) : null,
    smdp_status: null,
    esim_status: row.esimStatus ? str(row.esimStatus) : null,
    status: mapEsimStatus(row.esimStatus),
    active_type: 2,
    expires_at: row.expired_time ? new Date(str(row.expired_time)).toISOString() : null,
    total_bytes: normalizeVolume(row.totalData),
    used_bytes: normalizeVolume(row.dataUsage),
    unused_valid_days: row.unused_valid_time === undefined ||
        row.unused_valid_time === null
      ? null
      : num(row.unused_valid_time),
  };
}

/**
 * One allocated eSIM by its SimJuno id. A profile whose activation details are
 * still being allocated has no `ac`/`qrCodeUrl` yet — callers poll until they
 * appear instead of treating that as an error.
 */
export async function getEsim(esimId: string): Promise<EsimProfile | null> {
  if (!esimId) return null;
  const row = await call<RawEsim>("GET", `/esim/${encodeURIComponent(esimId)}`);
  return row.id ? shapeProfile(row) : null;
}

// ── Balance (/reseller/balance) ─────────────────────────────

/**
 * Our own wallet balance at SimJuno, in dollars.
 *
 * Checked BEFORE accepting an order: charging a customer and only then
 * discovering we cannot fulfil is the failure this prevents.
 */
export async function queryBalance(): Promise<number> {
  const obj = await call<{ balance?: number }>("GET", "/reseller/balance");
  return toDollars(obj.balance ?? 0);
}

// ── Ordering with recovery (/esim/order) ────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Place an order, retrying transport failures with the SAME transactionId.
 *
 * SimJuno documents that reusing transaction_id + orderList retries safely —
 * a timed-out attempt either completed once or completes now; it can never
 * create a second order. Provider-side rejections (unknown slug, empty wallet)
 * are NOT retried — they are deterministic and would fail identically.
 *
 * Returns the first esim_id (we always order count:1). The ids come back
 * synchronously even though the PROFILE is allocated later.
 */
export async function placeOrderIdempotent(
  transactionId: string,
  slug: string,
  attempts = 3,
): Promise<{ esimId: string; attempts: number }> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const obj = await call<{
        transaction_id?: string;
        esim_ids?: string[];
      }>("POST", "/esim/order", {
        transaction_id: transactionId,
        orderList: [{ slug, count: 1 }],
      });
      const esimId = (obj.esim_ids ?? [])[0] ?? "";
      if (!esimId) {
        throw new SimJunoError("No esim_ids returned by /esim/order", 502, false);
      }
      return { esimId, attempts: attempt };
    } catch (err) {
      lastErr = err;

      // A definite answer from the provider — retrying changes nothing.
      if (err instanceof SimJunoError && !err.retryable) throw err;

      if (attempt < attempts) {
        await sleep(500 * 2 ** (attempt - 1)); // 500ms, 1s
      }
    }
  }

  throw lastErr;
}

/** Cancel an unactivated eSIM; eligible refunds land in the reseller wallet. */
export async function cancelEsim(
  esimId: string,
): Promise<{ success: boolean; refundedAmount: number }> {
  const obj = await call<{ success?: boolean; refundedAmount?: number }>(
    "POST",
    `/esim/${encodeURIComponent(esimId)}/cancel`,
    {},
  );
  return { success: obj.success === true, refundedAmount: toDollars(obj.refundedAmount ?? 0) };
}

/** Parse `t=<unix>,v1=<hex>` from the simjuno-signature header. */
export function parseSignatureHeader(
  header: string | null,
): { timestamp: string; signature: string } | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = "";
  let signature = "";
  for (const part of parts) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v ?? "";
    if (k === "v1") signature = v ?? "";
  }
  return timestamp && signature ? { timestamp, signature } : null;
}

/** Constant-time hex equality so webhook timing leaks nothing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** HMAC-SHA256 of `message` keyed with `secret`, as lowercase hex. */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
