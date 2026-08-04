// ============================================================
// Edge Function: esimaccess-webhook
// POST /functions/v1/esimaccess-webhook?token=<ESIMACCESS_WEBHOOK_SECRET>
//
// eSIM Access pushes lifecycle events here. Register the URL once with
// POST /api/v1/open/webhook/save (see register-webhook.sh in this folder).
//
// Auth: eSIM Access documents NO signature or shared-secret header on its
// notifications, so the URL itself is the secret — the `token` query param must
// match ESIMACCESS_WEBHOOK_SECRET. This function therefore does its own auth
// and MUST be deployed with --no-verify-jwt (no JWT is present on these calls).
//
// Events handled (see _shared/esimaccess-api-reference.md → Webhooks):
//   CHECK_HEALTH   connectivity probe fired when the webhook is saved
//   ORDER_STATUS   GOT_RESOURCE -> the profile is allocated; query for the ICCID
//   ESIM_STATUS    lifecycle transitions (IN_USE, USED_UP, CANCEL, …)
//   SMDP_EVENT     low-level SM-DP+ transitions — very high volume, cheap update
//   DATA_USAGE     consumption thresholds
//   VALIDITY_USAGE validity expiry warnings
//
// Always answers 200 once the payload is accepted: eSIM Access retries on
// non-2xx and will stop delivering to an endpoint that keeps failing.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mapEsimStatus,
  parseProviderTime,
  queryProfiles,
} from "../_shared/esimaccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Supabase = ReturnType<typeof createClient>;

interface Content {
  orderNo?: string;
  orderStatus?: string;
  transactionId?: string;
  esimTranNo?: string;
  iccid?: string;
  esimStatus?: string;
  smdpStatus?: string;
  totalVolume?: number;
  orderUsage?: number;
  remainVolume?: number;
  expiredTime?: string;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Locate our row for an event. transactionId is ours and never recycled, so it
 * wins; esimTranNo is the provider's stable per-profile key; ICCIDs get reused
 * upstream, so they are the last resort.
 */
async function findEsim(supabase: Supabase, c: Content) {
  const lookups: [string, string][] = [
    ["provider_txn_id", str(c.transactionId)],
    ["provider_tran_no", str(c.esimTranNo)],
    ["provider_order_no", str(c.orderNo)],
    ["iccid", str(c.iccid)],
  ];

  for (const [column, value] of lookups) {
    if (!value) continue;
    const { data } = await supabase
      .from("esims")
      .select("id, status, provider_tran_no, iccid, total_bytes")
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/** ORDER_STATUS GOT_RESOURCE: the profile exists now — pull it and fill the row. */
async function handleOrderStatus(supabase: Supabase, c: Content) {
  if (str(c.orderStatus).toUpperCase() !== "GOT_RESOURCE") return;

  const row = await findEsim(supabase, c);
  if (!row) {
    console.error("ORDER_STATUS for unknown order:", c.orderNo, c.transactionId);
    return;
  }

  // The ICCID is deliberately not in this event — it has to be queried.
  const orderNo = str(c.orderNo);
  if (!orderNo) return;

  const profiles = await queryProfiles({ orderNo });
  const profile = profiles.find((p) =>
    !c.transactionId || p.transaction_id === str(c.transactionId)
  ) ?? profiles[0];
  if (!profile) return;

  await supabase
    .from("esims")
    .update({
      provider_order_no: orderNo,
      provider_tran_no: profile.esim_tran_no,
      iccid: profile.iccid,
      smdp_status: profile.smdp_status,
      status: profile.status === "pending" ? "active" : profile.status,
      expires_at: profile.expires_at,
      total_bytes: profile.total_bytes || row.total_bytes,
      used_bytes: profile.used_bytes ?? 0,
      usage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

/** ESIM_STATUS / SMDP_EVENT: apply whatever the event actually carried. */
async function handleStatusEvent(supabase: Supabase, c: Content) {
  const row = await findEsim(supabase, c);
  if (!row) return;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (str(c.esimStatus)) patch.status = mapEsimStatus(c.esimStatus);
  if (str(c.smdpStatus)) patch.smdp_status = str(c.smdpStatus);
  if (str(c.iccid) && !row.iccid) patch.iccid = str(c.iccid);
  if (str(c.esimTranNo) && !row.provider_tran_no) {
    patch.provider_tran_no = str(c.esimTranNo);
  }
  if (str(c.expiredTime)) {
    const expires = parseProviderTime(c.expiredTime);
    if (expires) patch.expires_at = expires;
  }

  // Volume fields are only sometimes present — never overwrite with nothing.
  if (typeof c.totalVolume === "number") patch.total_bytes = c.totalVolume;
  if (typeof c.orderUsage === "number") {
    patch.used_bytes = c.orderUsage;
    patch.usage_updated_at = new Date().toISOString();
  } else if (
    typeof c.remainVolume === "number" && typeof c.totalVolume === "number"
  ) {
    patch.used_bytes = Math.max(0, c.totalVolume - c.remainVolume);
    patch.usage_updated_at = new Date().toISOString();
  }

  // A cancelled/expired eSIM must not be dragged back to 'active' by a late
  // low-level SMDP_EVENT arriving out of order.
  const terminal = ["cancelled", "expired"];
  if (terminal.includes(row.status as string) && patch.status === "active") {
    delete patch.status;
  }

  await supabase.from("esims").update(patch).eq("id", row.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("ESIMACCESS_WEBHOOK_SECRET");
    if (!secret) {
      console.error("ESIMACCESS_WEBHOOK_SECRET is not configured");
      return errorResponse("Webhook not configured", 500);
    }
    const token = new URL(req.url).searchParams.get("token");
    if (token !== secret) {
      console.error("esimaccess-webhook rejected: bad token");
      return errorResponse("Unauthorized", 401);
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return errorResponse("Invalid JSON body", 400);

    const notifyType = str(payload.notifyType);
    const notifyId = str(payload.notifyId);
    const content: Content = payload.content ?? {};

    // The save-time probe carries no content and must succeed, or eSIM Access
    // refuses to store the endpoint.
    if (notifyType === "CHECK_HEALTH") {
      return jsonResponse({ success: true });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Deduplicate first: claiming the notifyId is what makes handling
    // exactly-once across retries and concurrent deliveries.
    if (notifyId) {
      const { error } = await supabase
        .from("esim_webhook_events")
        .insert({ notify_id: notifyId, notify_type: notifyType, payload });
      if (error) {
        // 23505 = unique violation: already processed, ack and move on.
        if (error.code === "23505") return jsonResponse({ success: true });
        console.error("Failed to record webhook event:", error);
      }
    }

    switch (notifyType) {
      case "ORDER_STATUS":
        await handleOrderStatus(supabase, content);
        break;
      case "ESIM_STATUS":
      case "SMDP_EVENT":
      case "DATA_USAGE":
      case "VALIDITY_USAGE":
        await handleStatusEvent(supabase, content);
        break;
      default:
        console.error("Unhandled eSIM Access notifyType:", notifyType);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("esimaccess-webhook unhandled error:", err);
    // 200 on purpose: the payload was accepted and stored for dedupe, and a
    // non-2xx here makes eSIM Access retry a request that will fail the same
    // way. Failures are visible in the function logs instead.
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
