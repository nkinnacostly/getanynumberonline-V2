// ============================================================
// Edge Function: simjuno-webhook
// POST /functions/v1/simjuno-webhook
//
// SimJuno pushes lifecycle events here. Register the URL once in the SimJuno
// Dashboard (Settings → Webhook); saving it queues a CHECK_HEALTH probe that
// must answer 2xx. Set SIMJUNO_WEBHOOK_SECRET (whsec_…) via
// `supabase secrets set` BEFORE registering.
//
// Auth: HMAC-SHA256 over "<timestamp>.<raw_request_body>", hex-encoded, in the
// simjuno-signature header as "t=<unix>,v1=<hex>". The raw bytes are verified
// before any JSON parsing; signatures are compared in constant time and stale
// timestamps (>5 min) are rejected to limit replay. This function does its own
// auth and MUST be deployed with --no-verify-jwt (no JWT is present).
//
// Events handled (docs.simjuno.com/webhook):
//   CHECK_HEALTH    save-time connectivity probe — ack only
//   ORDER_STATUS    every eSIM in the order is allocated → refresh from
//                   GET /esim/{id} (event carries transactionId but NOT ids)
//   SMDP_EVENT      profile install transitions; carries esimId + smdpStatus —
//                   this is also how a row whose order response was lost gets
//                   its provider_tran_no filled in
//   ESIM_STATUS     lifecycle transitions (IN_USE, USED_UP, CANCEL, …)
//   DATA_USAGE      consumption thresholds — totalVolume/orderUsage/remain in BYTES
//   VALIDITY_USAGE  expiry warnings — carries expiredTime
//
// Always answers 2xx once the event is stored: delivery failures are visible
// in the function logs, while a non-2xx would make SimJuno mark the delivery
// failed (it does not auto-retry).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getEsim,
  hmacSha256Hex,
  mapEsimStatus,
  parseSignatureHeader,
  timingSafeEqual,
} from "../_shared/simjuno.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Reject timestamps older/newer than this — replay protection. */
const MAX_CLOCK_SKEW_S = 300;

type Supabase = ReturnType<typeof createClient>;

interface WebhookEvent {
  id?: string;
  type?: string;
  version?: string;
  created_at?: string;
  data?: Record<string, unknown>;
}

interface RowLite {
  id: string;
  status: string;
  provider_tran_no: string | null;
  iccid: string | null;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Locate our row for an event. transactionId is OUR uuid echoed back by
 * SimJuno, so it wins; the SimJuno esimId (our provider_tran_no) is the
 * fallback for events that arrive without a transactionId.
 */
async function findEsim(
  supabase: Supabase,
  transactionId: string,
  esimId: string,
): Promise<RowLite | null> {
  const lookups: [string, string][] = [
    ["provider_txn_id", transactionId],
    ["provider_tran_no", esimId],
  ];
  for (const [column, value] of lookups) {
    if (!value) continue;
    const { data } = await supabase
      .from("esims")
      .select("id, status, provider_tran_no, iccid")
      .eq("provider", "simjuno")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as unknown as RowLite;
  }
  return null;
}

/** Pull the allocated profile's details into our row. */
async function syncFromProfile(supabase: Supabase, row: RowLite) {
  if (!row.provider_tran_no) return;
  const profile = await getEsim(row.provider_tran_no);
  if (!profile) return;

  const stillAllocating =
    !profile.activation_string && !profile.qr_code_url;

  await supabase
    .from("esims")
    .update({
      status: stillAllocating
        ? "pending"
        : profile.status === "pending"
        ? "active"
        : profile.status,
      expires_at: profile.expires_at,
      total_bytes: profile.total_bytes || null,
      used_bytes: profile.used_bytes ?? 0,
      usage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

/** SMDP_EVENT / ESIM_STATUS / DATA_USAGE / VALIDITY_USAGE: apply what they carried. */
async function handleStatusEvent(supabase: Supabase, data: Record<string, unknown>) {
  const row = await findEsim(
    supabase,
    str(data.transactionId),
    str(data.esimId),
  );
  if (!row) {
    console.error(
      "webhook event for unknown eSIM:",
      str(data.transactionId),
      str(data.esimId),
    );
    return;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // An SMDP_EVENT that names an esim we never managed to store means an order
  // whose response was lost has now become recoverable — link it first so all
  // future events (and GET /esim/{id}) can find the row.
  const esimId = str(data.esimId);
  if (esimId && !row.provider_tran_no) patch.provider_tran_no = esimId;

  if (str(data.smdpStatus)) patch.smdp_status = str(data.smdpStatus);

  const expiredTime = str((data.expiredTime ?? data.expired_time) as string);
  if (expiredTime) {
    const d = new Date(expiredTime);
    if (!isNaN(d.getTime())) patch.expires_at = d.toISOString();
  }

  // DATA_USAGE documents totalVolume/orderUsage/remain explicitly in BYTES.
  const totalVolume = typeof data.totalVolume === "number" ? data.totalVolume : null;
  const orderUsage = typeof data.orderUsage === "number" ? data.orderUsage : null;
  const remain = typeof data.remain === "number" ? data.remain : null;
  if (orderUsage !== null) {
    patch.used_bytes = orderUsage;
    patch.usage_updated_at = new Date().toISOString();
  } else if (remain !== null && totalVolume !== null) {
    patch.used_bytes = Math.max(0, totalVolume - remain);
    patch.usage_updated_at = new Date().toISOString();
  }
  if (totalVolume !== null && totalVolume > 0) patch.total_bytes = totalVolume;

  // ESIM_STATUS lifecycle beats the low-level SM-DP+ view when both appear.
  if (str(data.esimStatus)) patch.status = mapEsimStatus(data.esimStatus);

  // A cancelled/expired eSIM must not be dragged back to 'active' by a late
  // low-level SMDP_EVENT arriving out of order.
  const terminal = ["cancelled", "expired"];
  if (terminal.includes(row.status) && patch.status === "active") {
    delete patch.status;
  }

  await supabase.from("esims").update(patch).eq("id", row.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("SIMJUNO_WEBHOOK_SECRET");
    if (!secret) {
      console.error("SIMJUNO_WEBHOOK_SECRET is not configured");
      return errorResponse("Webhook not configured", 500);
    }

    // Verify the signature over the UNMODIFIED request bytes before parsing.
    const rawBody = await req.text();
    const parsed = parseSignatureHeader(req.headers.get("simjuno-signature"));
    if (!parsed) {
      console.error("simjuno-webhook rejected: missing signature header");
      return errorResponse("Unauthorized", 401);
    }

    const ageS = Math.abs(Date.now() / 1000 - Number(parsed.timestamp));
    if (!Number.isFinite(ageS) || ageS > MAX_CLOCK_SKEW_S) {
      console.error("simjuno-webhook rejected: stale timestamp", parsed.timestamp);
      return errorResponse("Unauthorized", 401);
    }

    const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`);
    if (!timingSafeEqual(expected, parsed.signature.toLowerCase())) {
      console.error("simjuno-webhook rejected: bad signature");
      return errorResponse("Unauthorized", 401);
    }

    const event = JSON.parse(rawBody) as WebhookEvent;
    const type = str(event.type);
    const eventId = str(event.id);
    const data = event.data ?? {};

    // The save-time probe carries no content and must succeed, or SimJuno
    // refuses to store the endpoint.
    if (type === "CHECK_HEALTH") {
      return jsonResponse({ success: true });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Deduplicate first: claiming the event id is what makes handling
    // exactly-once across retries and concurrent deliveries ("process every
    // event idempotently" per SimJuno's docs).
    if (eventId) {
      const { error } = await supabase
        .from("esim_webhook_events")
        .insert({ notify_id: eventId, notify_type: type, payload: event });
      if (error) {
        // 23505 = unique violation: already processed, ack and move on.
        if (error.code === "23505") return jsonResponse({ success: true });
        console.error("Failed to record webhook event:", error);
      }
    }

    switch (type) {
      case "ORDER_STATUS": {
        // Every eSIM in the order is allocated now. The event carries only our
        // transactionId, so find the row and pull the live profile.
        const row = await findEsim(supabase, str(data.transactionId), "");
        if (!row) {
          console.error("ORDER_STATUS for unknown order:", str(data.transactionId));
          break;
        }
        await syncFromProfile(supabase, row);
        break;
      }
      case "SMDP_EVENT":
      case "ESIM_STATUS":
      case "DATA_USAGE":
      case "VALIDITY_USAGE":
        await handleStatusEvent(supabase, data);
        break;
      default:
        console.error("Unhandled SimJuno webhook type:", type);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("simjuno-webhook unhandled error:", err);
    // 200 on purpose once verified: the payload was accepted, and a non-2xx
    // here makes SimJuno record a failure that needs manual retrying.
    // Failures are visible in the function logs instead.
    return jsonResponse({ success: true, handled: false });
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
