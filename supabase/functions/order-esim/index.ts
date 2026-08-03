// ============================================================
// Edge Function: order-esim
// POST /functions/v1/order-esim
// Body: { plan_id, country (ISO code), raw_price? }
//
// Flow (mirrors order-number / rent-number):
//   1. Auth + ban check
//   2. Re-fetch the plan from SMSPool and price it server-side (never trust the
//      client's price — raw_price is only an optional mismatch guard)
//   3. Atomically deduct + create the esim row (status 'pending')
//   4. Purchase from SMSPool; on failure refund and mark 'failed'
//   5. On success store transactionId + flip to 'active'
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyEsimMarkup } from "../_shared/esim.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
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
    const planId = String(body?.plan_id ?? "").trim();
    const country = String(body?.country ?? "").trim();
    const clientRaw = body?.raw_price;

    if (!planId) return errorResponse("plan_id is required", 400);
    if (!country) return errorResponse("country is required", 400);

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, is_banned")
      .eq("id", user.id)
      .single();
    if (!profile) return errorResponse("Profile not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;

    // ── Re-fetch the plan and price it server-side ───────────
    const planFd = new FormData();
    planFd.append("key", smsPoolKey);
    planFd.append("country", country);
    const planRes = await fetch("https://api.smspool.net/esim/plans", {
      method: "POST",
      body: planFd,
    });
    const planJson = await planRes.json().catch(() => null);
    if (!planRes.ok) {
      console.error("esim/plans failed:", planJson);
      return errorResponse("Could not load eSIM plans", 502);
    }
    const plans: Record<string, unknown>[] = Array.isArray(planJson)
      ? planJson
      : Array.isArray(planJson?.data)
        ? planJson.data
        : [];
    const plan = plans.find((p) => String(p.ID ?? p.id) === planId);
    if (!plan) return errorResponse("Plan not found for this country", 404);

    const raw = num(plan.price);
    if (raw <= 0) return errorResponse("Invalid plan price", 502);

    if (clientRaw !== undefined && clientRaw !== null) {
      const sent = parseFloat(String(clientRaw));
      if (!isNaN(sent) && Math.abs(sent - raw) > 0.001) {
        return errorResponse("Price changed — refresh and try again", 409);
      }
    }

    const cost = applyEsimMarkup(raw);
    if (isNaN(cost) || cost <= 0) {
      return errorResponse("Invalid computed price", 500);
    }
    if (profile.balance < cost) {
      return errorResponse(
        "Insufficient balance. Please top up your wallet.",
        402,
      );
    }

    const dataGb = num(plan.dataInGb);
    const duration =
      plan.duration === undefined || plan.duration === null
        ? null
        : num(plan.duration);
    // esim/plans rows carry no country name — take it from the client's catalog
    // selection (the country list provides `name`), falling back to the ISO code.
    const countryName = String(body?.country_name ?? country).trim() || country;

    // ── Deduct + create (pending) ────────────────────────────
    const { data: esimId, error: deductError } = await supabase.rpc(
      "deduct_balance_and_create_esim",
      {
        p_user_id: user.id,
        p_cost: cost,
        p_country: country,
        p_country_name: countryName,
        p_plan_id: planId,
        p_data_gb: dataGb,
        p_duration_days: duration,
      },
    );
    if (deductError) {
      if (deductError.message?.includes("Insufficient balance")) {
        return errorResponse(
          "Insufficient balance. Please top up your wallet.",
          402,
        );
      }
      console.error("deduct_balance_and_create_esim error:", deductError);
      return errorResponse("Failed to create eSIM order", 500);
    }

    // ── Purchase from SMSPool ────────────────────────────────
    const buyFd = new FormData();
    buyFd.append("key", smsPoolKey);
    buyFd.append("plan", planId);
    const buyRes = await fetch("https://api.smspool.net/esim/purchase", {
      method: "POST",
      body: buyFd,
    });
    const buyJson = await buyRes.json().catch(() => null);

    const ok = buyJson?.success === 1 || buyJson?.success === true;
    const transactionId = String(buyJson?.transactionId ?? "");

    if (!ok || !transactionId) {
      console.error("esim/purchase failed:", buyJson);
      await supabase.rpc("credit_balance", {
        p_user_id: user.id,
        p_amount: cost,
        p_type: "refund",
        p_order_id: null,
        p_note: `Auto-refund: eSIM purchase failed (${esimId})`,
      });
      await supabase
        .from("esims")
        .update({ status: "failed" })
        .eq("id", esimId);
      return errorResponse(
        buyJson?.message ??
          "Could not complete the eSIM purchase. Your balance was refunded.",
        503,
      );
    }

    const { error: updErr } = await supabase
      .from("esims")
      .update({ smspool_transaction_id: transactionId, status: "active" })
      .eq("id", esimId);
    if (updErr) {
      // Purchased at SMSPool but we failed to record it — don't refund (the
      // eSIM exists); surface so it can be reconciled from esim/history.
      console.error("Failed to store eSIM transactionId:", updErr);
    }

    return jsonResponse({
      success: true,
      esim_id: esimId,
      transaction_id: transactionId,
      cost,
    });
  } catch (err) {
    console.error("order-esim unhandled error:", err);
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
