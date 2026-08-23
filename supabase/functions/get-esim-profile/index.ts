// ============================================================
// Edge Function: get-esim-profile
// POST /functions/v1/get-esim-profile
// Body: { esim_id }   (our esims.id — ownership is checked against it)
//
// Returns the live activation profile (LPA string, QR image, SM-DP+ address,
// usage counters) and writes the volatile bits back to the row so History and
// the card can render without another upstream call.
//
// Doubles as the completion path for an order that was still provisioning when
// order-esim returned: the client polls this until status leaves 'pending'.
//
// Provider routing:
//   simjuno    — GET /esim/{provider_tran_no}. SimJuno exposes no ICCID and no
//                smdpStatus on this endpoint; both stay whatever the webhooks
//                last wrote.
//   esimaccess — legacy rows keep reading eSIM Access until they expire; new
//                orders never go there.
//   smspool    — upstream discontinued, nothing to query.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EsimAccessError, queryProfiles } from "../_shared/esimaccess.ts";
import { getEsim } from "../_shared/simjuno.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EsimRowLite {
  id: string;
  provider: string;
  provider_order_no: string | null;
  provider_tran_no: string | null;
  iccid: string | null;
  smdp_status: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Missing authorization header", 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const esimId = String(body?.esim_id ?? "").trim();
    if (!esimId) return errorResponse("esim_id is required", 400);

    // ── Ownership check ──────────────────────────────────────
    const { data: esim } = await supabase
      .from("esims")
      .select(
        "id, provider, provider_order_no, provider_tran_no, iccid, smdp_status",
      )
      .eq("id", esimId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!esim) return errorResponse("eSIM not found", 404);
    const row = esim as unknown as EsimRowLite;

    if (row.provider === "smspool") {
      // SMSPool discontinued eSIMs; there is no upstream left to query.
      return errorResponse(
        "This eSIM was issued by a provider we no longer integrate with. Contact support for its activation details.",
        410,
      );
    }

    if (row.provider !== "simjuno" && row.provider !== "esimaccess") {
      return errorResponse(
        `Unknown eSIM provider '${row.provider}'. Contact support.`,
        422,
      );
    }

    if (row.provider === "simjuno") {
      return await serveSimJuno(supabase, row);
    }
    return await serveEsimAccess(supabase, row); // legacy read-only path
  } catch (err) {
    console.error("get-esim-profile unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
});

/** Current provider: GET /esim/{id}, keyed on our stored esim id. */
async function serveSimJuno(
  supabase: ReturnType<typeof createClient>,
  row: EsimRowLite,
): Promise<Response> {
  if (!row.provider_tran_no) {
    // The order call never returned an esim id and no webhook has filled it in
    // yet — genuinely still provisioning.
    return jsonResponse({ success: true, status: "pending", profile: null });
  }

  let profile;
  try {
    profile = await getEsim(row.provider_tran_no);
  } catch (err) {
    console.error("get-esim-profile simjuno error:", String(err));
    return errorResponse(
      "Could not load eSIM activation details. Try again shortly.",
      503,
    );
  }

  if (!profile) {
    return jsonResponse({ success: true, status: "pending", profile: null });
  }

  const stillAllocating = !profile.activation_string && !profile.qr_code_url;

  // Write the volatile fields back. While allocation is still running the
  // upstream status alone is not yet actionable — keep 'pending' so the card
  // keeps polling rather than showing a QR-less "active" eSIM.
  const { error: updErr } = await supabase
    .from("esims")
    .update({
      status: stillAllocating ? "pending" : profile.status,
      expires_at: profile.expires_at,
      total_bytes: profile.total_bytes || null,
      used_bytes: profile.used_bytes ?? 0,
      usage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) {
    // Non-fatal: the live profile below is still correct for this response.
    console.error("Failed to sync esim row from profile:", updErr);
  }

  if (stillAllocating) {
    return jsonResponse({ success: true, status: "pending", profile: null });
  }
  return jsonResponse({ success: true, status: profile.status, profile });
}

/**
 * Legacy path for pre-SimJuno rows. Read-only: it exists only so customers who
 * already bought an eSIM Access plan can still retrieve its activation
 * details. Remove once every esimaccess row has expired.
 */
async function serveEsimAccess(
  supabase: ReturnType<typeof createClient>,
  row: EsimRowLite,
): Promise<Response> {
  // esimTranNo was eSIM Access's recommended key — ICCIDs get recycled there.
  const filter = row.provider_tran_no
    ? { esimTranNo: row.provider_tran_no }
    : row.provider_order_no
    ? { orderNo: row.provider_order_no }
    : null;
  if (!filter) {
    return jsonResponse({ success: true, status: "pending", profile: null });
  }

  let profile;
  try {
    [profile] = await queryProfiles(filter);
  } catch (err) {
    if (err instanceof EsimAccessError && err.code === "200010") {
      // SM-DP+ still allocating — same answer as "not ready yet".
      return jsonResponse({ success: true, status: "pending", profile: null });
    }
    // Missing access code / upstream gone: these rows have no live source left.
    console.error("get-esim-profile legacy esimaccess error:", String(err));
    return errorResponse(
      "This eSIM's original provider is being phased out and its details couldn't be loaded. Contact support.",
      410,
    );
  }

  if (!profile) {
    return jsonResponse({ success: true, status: "pending", profile: null });
  }

  const { error: updErr } = await supabase
    .from("esims")
    .update({
      iccid: profile.iccid ?? row.iccid,
      smdp_status: profile.smdp_status ?? row.smdp_status,
      status: profile.status,
      expires_at: profile.expires_at,
      total_bytes: profile.total_bytes || null,
      used_bytes: profile.used_bytes ?? 0,
      usage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) {
    console.error("Failed to sync legacy esim row:", updErr);
  }

  return jsonResponse({ success: true, status: profile.status, profile });
}

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
