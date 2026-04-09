// ============================================================
// Edge Function: order-number
// POST /functions/v1/order-number
//
// Flow:
// 1. Verify user JWT
// 2. Get price from SMSPool
// 3. Atomically deduct balance + create order (DB transaction)
// 4. Call SMSPool to purchase the number
// 5. Update order with the real phone number
// 6. Return order details to client
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function applyMarkup(rawPrice: number): number {
  let markup: number;
  if (rawPrice < 0.1) markup = 0.4;
  else if (rawPrice <= 0.3) markup = 0.3;
  else markup = 0.2;
  return Math.ceil(rawPrice * (1 + markup) * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --------------------------------------------------------
    // 1. Authenticate the user
    // --------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization header", 401);
    }

    // Use anon key + JWT to identify the user
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    // Service role client — bypasses RLS for writes
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --------------------------------------------------------
    // 2. Parse and validate request body
    // --------------------------------------------------------
    const body = await req.json();
    const { country, service, pool, max_price } = body;

    if (!country || !service) {
      return errorResponse("country and service are required", 400);
    }

    // --------------------------------------------------------
    // 3. Check if user is banned
    // --------------------------------------------------------
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, is_banned, currency")
      .eq("id", user.id)
      .single();

    if (!profile) return errorResponse("Profile not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    // --------------------------------------------------------
    // 4. Get price from SMSPool before deducting balance
    // --------------------------------------------------------
    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;
    const priceData = new FormData();
    priceData.append("key", smsPoolKey);
    priceData.append("country", country);
    priceData.append("service", service);
    if (pool) priceData.append("pool", pool);

    const priceRes = await fetch("https://api.smspool.net/request/price", {
      method: "POST",
      body: priceData,
    });
    const priceJson = await priceRes.json();

    // SMSPool returns price as a string or number
    const rawPrice = parseFloat(priceJson.price);
    if (isNaN(rawPrice) || rawPrice <= 0) {
      return errorResponse("Could not retrieve pricing for this service", 502);
    }
    const cost = applyMarkup(rawPrice);
    if (isNaN(cost) || cost <= 0) {
      return errorResponse("Could not retrieve pricing for this service", 502);
    }

    // Respect max_price if client passed one
    if (max_price && cost > parseFloat(max_price)) {
      return errorResponse(
        `Price $${cost} exceeds your max $${max_price}`,
        400,
      );
    }

    // --------------------------------------------------------
    // 5. Atomically deduct balance + create order
    // This uses FOR UPDATE locking — race-condition safe
    // --------------------------------------------------------
    const { data: orderId, error: deductError } = await supabase.rpc(
      "deduct_balance_and_create_order",
      {
        p_user_id: user.id,
        p_cost: cost,
        p_country: country,
        p_country_name: priceJson.country_name ?? country,
        p_service: service,
        p_service_name: priceJson.service_name ?? service,
        p_pool: pool ?? null,
      },
    );

    if (deductError) {
      // Insufficient balance error comes through here
      if (deductError.message?.includes("Insufficient balance")) {
        return errorResponse(
          "Insufficient balance. Please top up your wallet.",
          402,
        );
      }
      console.error("deduct_balance_and_create_order error:", deductError);
      return errorResponse("Failed to create order", 500);
    }

    // --------------------------------------------------------
    // 6. Purchase number from SMSPool
    // If this fails, we refund the user
    // --------------------------------------------------------
    const orderData = new FormData();
    orderData.append("key", smsPoolKey);
    orderData.append("country", country);
    orderData.append("service", service);
    if (pool) orderData.append("pool", pool);
    if (max_price) orderData.append("max_price", String(max_price));

    const orderRes = await fetch("https://api.smspool.net/purchase/sms", {
      method: "POST",
      body: orderData,
    });
    const orderJson = await orderRes.json();

    // SMSPool failed — refund the user and mark order failed
    if (!orderJson.success || !orderJson.number) {
      console.error("SMSPool purchase failed:", orderJson);

      // Refund
      await supabase.rpc("credit_balance", {
        p_user_id: user.id,
        p_amount: cost,
        p_type: "refund",
        p_order_id: orderId,
        p_note: "Auto-refund: SMSPool number unavailable",
      });

      // Mark order as expired
      await supabase
        .from("orders")
        .update({ status: "expired" })
        .eq("id", orderId);

      return errorResponse(
        orderJson.message ??
          "No numbers available for this service. Try a different country.",
        503,
      );
    }

    // --------------------------------------------------------
    // 7. Store the SMSPool order details
    // --------------------------------------------------------
    await supabase.rpc("update_order_smspool_details", {
      p_order_id: orderId,
      p_smspool_order_id: String(orderJson.order_code ?? orderJson.orderid),
      p_smspool_number: orderJson.number,
    });

    // --------------------------------------------------------
    // 8. Return to client
    // --------------------------------------------------------
    return jsonResponse({
      success: true,
      order_id: orderId,
      phone_number: orderJson.number,
      service,
      country,
      cost,
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error("order-number unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────
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
