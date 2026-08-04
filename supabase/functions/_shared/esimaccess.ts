// ============================================================
// Shared: eSIM Access (esimaccess.com) client + pricing/shaping
//
// Replaces the SMSPool eSIM integration. Differences that matter everywhere:
//   • JSON POST with an `RT-AccessCode` header — NOT SMSPool's FormData + key.
//   • Prices are integers scaled x10,000 (10000 == $1.00).
//   • Data volumes are in bytes, not GB.
//   • Every response is { success, errorCode, errorMsg, obj }; an HTTP 200 with
//     success:false is the normal failure shape, so status alone proves nothing.
//   • Rate limit is 8 req/s across the whole account.
//
// Catalog and purchase paths must agree on the markup and on how a package is
// shaped, so both live here — used by get-esim-catalog, order-esim,
// get-esim-profile and esimaccess-webhook.
// ============================================================

const BASE = "https://api.esimaccess.com/api/v1/open";

/** Price scaling factor: the API quotes 10000 for $1.00. */
const PRICE_SCALE = 10_000;
const BYTES_PER_GB = 1024 ** 3;

export class EsimAccessError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "EsimAccessError";
  }
}

interface Envelope<T> {
  success?: boolean;
  errorCode?: string | null;
  errorMsg?: string | null;
  obj?: T;
}

/**
 * POST a JSON body to an eSIM Access endpoint and unwrap `obj`.
 * Throws EsimAccessError on transport failure or on success:false.
 */
export async function callEsimAccess<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const accessCode = Deno.env.get("ESIMACCESS_ACCESS_CODE");
  if (!accessCode) {
    // Loud, not silent: a missing secret must not look like "no plans found".
    throw new EsimAccessError(
      "ESIMACCESS_ACCESS_CODE is not configured",
      null,
      500,
    );
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: {
        "RT-AccessCode": accessCode,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new EsimAccessError(
      `Network error calling ${path}: ${err instanceof Error ? err.message : err}`,
      null,
      502,
    );
  }

  const json = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!res.ok || !json) {
    throw new EsimAccessError(
      `${path} returned HTTP ${res.status}`,
      null,
      res.status >= 500 ? 502 : res.status,
    );
  }

  if (json.success !== true) {
    throw new EsimAccessError(
      json.errorMsg || `${path} failed (${json.errorCode ?? "unknown"})`,
      json.errorCode ?? null,
      502,
    );
  }

  return (json.obj ?? {}) as T;
}

/** SM-DP+ is still allocating profiles for the order — retry, don't fail. */
export const ERR_ALLOCATING = "200010";
/** Provider-side wallet is empty. Operator action needed, not a user error. */
export const ERR_PROVIDER_NO_FUNDS = "200007";

// ── Pricing ─────────────────────────────────────────────────

/**
 * Tiered markup. Cheap plans carry a higher % so the absolute margin is
 * worthwhile; large plans stay competitive. Keep IN SYNC with the client copy
 * used for display — display must equal charge.
 */
export function applyEsimMarkup(raw: number): number {
  let m: number;
  if (raw < 1) m = 0.5;
  else if (raw <= 5) m = 0.4;
  else m = 0.3;
  return Math.ceil(raw * (1 + m) * 100) / 100;
}

/** Provider integer price (10000) -> dollars (1.00). */
export function toDollars(scaled: unknown): number {
  const n = typeof scaled === "number" ? scaled : parseFloat(String(scaled));
  return isNaN(n) ? 0 : n / PRICE_SCALE;
}

/** Dollars (1.00) -> provider integer price (10000), for order price checks. */
export function toScaledPrice(dollars: number): number {
  return Math.round(dollars * PRICE_SCALE);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** Bytes -> GB, rounded to 2dp for display. */
export function bytesToGb(bytes: unknown): number {
  return Math.round((num(bytes) / BYTES_PER_GB) * 100) / 100;
}

/**
 * Normalize the provider's `2023-03-03T06:20:00+0000` timestamps.
 * The offset has no colon, which `new Date()` rejects in some runtimes.
 */
export function parseProviderTime(v: unknown): string | null {
  const s = str(v).trim();
  if (!s) return null;
  const normalized = s.replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Destinations (location/list) ────────────────────────────

export interface EsimDestination {
  code: string; // 'ES' for a country, 'NA-3' for a region
  name: string;
  /** 1 = single country, 2 = multi-country region */
  kind: "country" | "region";
  /** Member countries, regions only. */
  sub_locations: { code: string; name: string }[];
}

export function shapeDestination(
  row: Record<string, unknown>,
): EsimDestination {
  const subs = Array.isArray(row.subLocationList) ? row.subLocationList : [];
  return {
    code: str(row.code).trim(),
    name: str(row.name).trim(),
    kind: num(row.type) === 2 ? "region" : "country",
    sub_locations: (subs as Record<string, unknown>[]).map((s) => ({
      code: str(s.code).trim(),
      name: str(s.name).trim(),
    })),
  };
}

// ── Packages (package/list) ─────────────────────────────────

export interface EsimCoverage {
  name: string;
  logo: string | null;
  operators: { operatorName: string; networkType: string }[];
}

export interface EsimPackage {
  code: string; // packageCode — what we order with
  slug: string; // human alias, e.g. AU_1_7
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
  /**
   * The package's OWN location: an Alpha-2 code for a single-country plan, or
   * a region code ('NA-3', 'EU-42', 'GL-139') that resolves against
   * location/list. This is the correct grouping key — `description` is
   * per-package ("Europe 3GB 30Days"), not per-region.
   */
  location_code: string;
  /** Alpha-2 codes the package covers. */
  location_codes: string[];
  speed: string;
  /** 1 total | 2 daily capped (slowed) | 3 daily capped (cut off) | 4 daily unlimited */
  data_type: number;
  /** True for day-pass plans, which need `periodNum` at order time. */
  is_day_pass: boolean;
  /** 1 = activates on install, 2 = activates on first network connection. */
  active_type: number;
  supports_topup: boolean;
  /** Speed after the full-speed allowance is used, if the plan has an FUP. */
  fup_policy: string | null;
  ip_export: string | null;
  coverage: EsimCoverage[];
}

export function shapePackage(row: Record<string, unknown>): EsimPackage {
  const raw = toDollars(row.price);
  const bytes = num(row.volume);
  const dataType = num(row.dataType);
  const locations = str(row.location)
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const nets = Array.isArray(row.locationNetworkList)
    ? (row.locationNetworkList as Record<string, unknown>[])
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
    location_code: str(row.locationCode).toUpperCase(),
    location_codes: locations,
    speed: str(row.speed),
    data_type: dataType,
    // dataType 2/3/4 are daily allowances — those are the day-pass plans that
    // take periodNum at order time.
    is_day_pass: dataType >= 2,
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

// ── Allocated profiles (esim/query) ─────────────────────────

export interface EsimProfile {
  esim_tran_no: string;
  order_no: string;
  transaction_id: string;
  iccid: string | null;
  /** LPA:1$<SM-DP+ address>$<matching id> — the full activation string. */
  activation_string: string | null;
  /** Split out of the LPA string for manual entry on Android. */
  smdp_address: string | null;
  activation_code: string | null;
  qr_code_url: string | null;
  short_url: string | null;
  smdp_status: string | null;
  esim_status: string | null;
  /** Mapped onto our own vocabulary — see mapEsimStatus. */
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

/**
 * Pull the SM-DP+ address and matching id out of an activation string.
 * Format: `LPA:1$rsp-eu.redteamobile.com$451F98...`
 */
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
 * See the migration for the full table.
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
    case "REVOKE":
    case "REVOKED":
      return "cancelled";
    case "SUSPENDED":
      return "suspended";
    // CREATE / PAYING / PAID / GETTING_RESOURCE — still being provisioned
    default:
      return "pending";
  }
}

export function shapeProfile(row: Record<string, unknown>): EsimProfile {
  const ac = row.ac ? str(row.ac) : null;
  const { smdp, code } = parseActivationString(ac);
  const pkgs = Array.isArray(row.packageList)
    ? (row.packageList as Record<string, unknown>[])
    : [];

  return {
    esim_tran_no: str(row.esimTranNo),
    order_no: str(row.orderNo),
    transaction_id: str(row.transactionId),
    iccid: row.iccid ? str(row.iccid) : null,
    activation_string: ac,
    smdp_address: smdp,
    activation_code: code,
    qr_code_url: row.qrCodeUrl ? str(row.qrCodeUrl) : null,
    short_url: row.shortUrl ? str(row.shortUrl) : null,
    smdp_status: row.smdpStatus ? str(row.smdpStatus) : null,
    esim_status: row.esimStatus ? str(row.esimStatus) : null,
    status: mapEsimStatus(row.esimStatus),
    active_type: num(row.activeType) || 1,
    expires_at: parseProviderTime(row.expiredTime),
    total_bytes: num(row.totalVolume),
    used_bytes: num(row.orderUsage),
    duration_days: row.totalDuration === undefined || row.totalDuration === null
      ? null
      : num(row.totalDuration),
    duration_unit: str(row.durationUnit) || "DAY",
    // The API returns "" rather than null for absent PIN/PUK/APN.
    pin: str(row.pin).trim() || null,
    puk: str(row.puk).trim() || null,
    apn: str(row.apn).trim() || null,
    packages: pkgs.map((p) => ({
      name: str(p.packageName),
      code: str(p.packageCode),
      slug: str(p.slug),
      location: str(p.locationCode),
    })),
  };
}

/** Query allocated profiles by orderNo, esimTranNo or iccid. */
export async function queryProfiles(
  filter: { orderNo?: string; iccid?: string; esimTranNo?: string },
): Promise<EsimProfile[]> {
  const obj = await callEsimAccess<{ esimList?: Record<string, unknown>[] }>(
    "esim/query",
    { ...filter, pager: { pageNum: 1, pageSize: 50 } },
  );
  return (obj.esimList ?? []).map(shapeProfile);
}

// ── Balance ─────────────────────────────────────────────────

/**
 * Our own wallet balance at eSIM Access, in dollars.
 *
 * Checked BEFORE accepting an order: charging a customer and only then
 * discovering we cannot fulfil is the failure this prevents.
 */
export async function queryBalance(): Promise<number> {
  const obj = await callEsimAccess<{ balance?: number }>("balance/query", {});
  return toDollars(obj.balance ?? 0);
}

// ── Ordering with recovery ──────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OrderRequest {
  transactionId: string;
  amountScaled: number;
  packageCode: string;
  priceScaled: number;
  periodNum?: number | null;
}

/**
 * Find an order we already placed, by OUR transactionId.
 *
 * `esim/query` cannot filter on transactionId, but it returns it — so scan a
 * recent time window and match. This is what makes a timed-out order call
 * recoverable instead of a silent double-spend.
 */
export async function findProfilesByTransactionId(
  transactionId: string,
  withinMinutes = 30,
): Promise<EsimProfile[]> {
  const end = new Date();
  const start = new Date(end.getTime() - withinMinutes * 60_000);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");

  const obj = await callEsimAccess<{ esimList?: Record<string, unknown>[] }>(
    "esim/query",
    {
      startTime: iso(start),
      endTime: iso(end),
      pager: { pageNum: 1, pageSize: 500 },
    },
  );
  return (obj.esimList ?? [])
    .map(shapeProfile)
    .filter((p) => p.transaction_id === transactionId);
}

/**
 * Place an order, retrying on transport failure with the SAME transactionId.
 *
 * eSIM Access treats a repeated transactionId as the same request, so a retry
 * after a timeout either returns the original orderNo or places it once — it
 * can never create a second order. Retries are capped and backed off; anything
 * left over is the caller's problem to reconcile, not to retry forever.
 *
 * Provider-side rejections (bad price, no funds, unknown package) are NOT
 * retried — they are deterministic and would fail identically.
 */
export async function placeOrderIdempotent(
  req: OrderRequest,
  attempts = 3,
): Promise<{ orderNo: string; attempts: number }> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const obj = await callEsimAccess<{ orderNo?: string }>("esim/order", {
        transactionId: req.transactionId,
        amount: req.amountScaled,
        packageInfoList: [{
          packageCode: req.packageCode,
          count: 1,
          price: req.priceScaled,
          ...(req.periodNum ? { periodNum: req.periodNum } : {}),
        }],
      });
      const orderNo = String(obj.orderNo ?? "");
      if (!orderNo) throw new EsimAccessError("No orderNo returned", null, 502);
      return { orderNo, attempts: attempt };
    } catch (err) {
      lastErr = err;

      // A definite answer from the provider — retrying changes nothing.
      if (err instanceof EsimAccessError && err.code) throw err;

      if (attempt < attempts) {
        await sleep(500 * 2 ** (attempt - 1)); // 500ms, 1s
      }
    }
  }

  throw lastErr;
}
