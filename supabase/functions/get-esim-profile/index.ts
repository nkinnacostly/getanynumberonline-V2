// ============================================================
// Edge Function: get-esim-profile
// POST /functions/v1/get-esim-profile
// Body: { esim_id }   (our esims.id — ownership is checked against it)
//
// Returns the live activation profile from eSIM Access (LPA string, QR image,
// SM-DP+ address, ICCID, PIN/PUK/APN, data used) and writes the volatile bits
// back to the row so History and the card can render without another upstream
// call.
//
// Doubles as the completion path for an order that was still provisioning when
// order-esim returned: the client polls this until status leaves 'pending'.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EsimAccessError,
  ERR_ALLOCATING,
  type EsimProfile,
  queryProfiles,
} from "../_shared/esimaccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
        "id, provider, provider_order_no, provider_tran_no, iccid, status",
      )
      .eq("id", esimId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!esim) return errorResponse("eSIM not found", 404);

    if (esim.provider === "smspool") {
      // SMSPool discontinued eSIMs; there is no upstream left to query.
      return errorResponse(
        "This eSIM was issued by a provider we no longer integrate with. Contact support for its activation details.",
        410,
      );
    }

    // esimTranNo is the recommended key — ICCIDs get recycled upstream.
    const filter = esim.provider_tran_no
      ? { esimTranNo: esim.provider_tran_no }
      : esim.provider_order_no
      ? { orderNo: esim.provider_order_no }
      : null;
    if (!filter) {
      return jsonResponse({ success: true, status: "pending", profile: null });
    }

    let profile: EsimProfile | undefined;
    try {
      [profile] = await queryProfiles(filter);
    } catch (err) {
      // 200010 = SM-DP+ still allocating. Not an error the user should see.
      if (err instanceof EsimAccessError && err.code === ERR_ALLOCATING) {
        return jsonResponse({
          success: true,
          status: "pending",
          profile: null,
        });
      }
      throw err;
    }

    if (!profile) {
      return jsonResponse({ success: true, status: "pending", profile: null });
    }

    // ── Write the volatile fields back ───────────────────────
    const { error: updErr } = await supabase
      .from("esims")
      .update({
        provider_tran_no: profile.esim_tran_no || esim.provider_tran_no,
        iccid: profile.iccid ?? esim.iccid,
        smdp_status: profile.smdp_status,
        status: profile.status,
        expires_at: profile.expires_at,
        total_bytes: profile.total_bytes || null,
        used_bytes: profile.used_bytes ?? 0,
        usage_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", esimId);
    if (updErr) {
      // Non-fatal: the live profile below is still correct for this response.
      console.error("Failed to sync esim row from profile:", updErr);
    }

    return jsonResponse({ success: true, status: profile.status, profile });
  } catch (err) {
    if (err instanceof EsimAccessError) {
      console.error("get-esim-profile provider error:", err.code, err.message);
      return errorResponse("Could not load eSIM activation details", err.httpStatus);
    }
    console.error("get-esim-profile unhandled error:", err);
    return errorResponse("Internal server error", 500);
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
