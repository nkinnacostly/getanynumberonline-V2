// ============================================================
// Edge Function: get-esim-profile
// POST /functions/v1/get-esim-profile
// Body: { transaction_id }
//
// Returns SMSPool's live activation profile (LPA/QR string, PIN/PUK, APN,
// remaining data). Ownership is verified first: a user can only read a profile
// for an esim row that belongs to them.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const transactionId = String(body?.transaction_id ?? "").trim();
    if (!transactionId) return errorResponse("transaction_id is required", 400);

    // ── Ownership check ──────────────────────────────────────
    const { data: esim } = await supabase
      .from("esims")
      .select("id")
      .eq("user_id", user.id)
      .eq("smspool_transaction_id", transactionId)
      .maybeSingle();
    if (!esim) return errorResponse("eSIM not found", 404);

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;
    const fd = new FormData();
    fd.append("key", smsPoolKey);
    fd.append("transactionId", transactionId);
    const res = await fetch("https://api.smspool.net/esim/profile", {
      method: "POST",
      body: fd,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      console.error("esim/profile failed:", json);
      return errorResponse("Could not load eSIM profile", 502);
    }

    // Pass through the activation fields the UI needs (QR string is `ac`).
    return jsonResponse({
      success: true,
      activated: json.activated ?? 0,
      activation_string: json.ac ?? null,
      activation_code: json.activationCode ?? null,
      smdp: json.smdp ?? null,
      pin: json.pin ?? null,
      puk: json.puk ?? null,
      apn: json.apn ?? null,
      country_code: json.countryCode ?? null,
      remaining_data: json.remainingData ?? null,
      total_data: json.totalData ?? null,
    });
  } catch (err) {
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
