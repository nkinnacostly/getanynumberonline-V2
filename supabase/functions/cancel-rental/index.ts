// ============================================================
// Edge Function: cancel-rental
// POST /functions/v1/cancel-rental
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

    const { rental_id } = await req.json();
    if (!rental_id) return errorResponse("rental_id is required", 400);

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .select(
        "id, user_id, status, cost, smspool_rental_code, service_name, country_name",
      )
      .eq("id", rental_id)
      .single();

    if (rentalError || !rental) return errorResponse("Rental not found", 404);
    if (rental.user_id !== user.id) return errorResponse("Forbidden", 403);
    if (rental.status !== "active") {
      return errorResponse(
        `Cannot cancel a rental with status: ${rental.status}`,
        400,
      );
    }

    let smspoolRefundOk = false;
    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;

    if (rental.smspool_rental_code) {
      const refundFd = new FormData();
      refundFd.append("key", smsPoolKey);
      refundFd.append("rental_code", rental.smspool_rental_code);

      try {
        const refundRes = await fetch(
          "https://api.smspool.net/rental/refund",
          { method: "POST", body: refundFd },
        );
        const refundJson = await refundRes.json();
        smspoolRefundOk =
          refundJson.success === 1 ||
          refundJson.success === true ||
          refundJson.status === "success";
        if (!smspoolRefundOk) {
          console.error("SMSPool rental refund declined:", refundJson);
        }
      } catch (e) {
        console.error("SMSPool rental refund request failed:", e);
      }
    }

    await supabase
      .from("rentals")
      .update({ status: "cancelled" })
      .eq("id", rental_id);

    let refundedAmount: number | null = null;

    if (smspoolRefundOk && rental.cost > 0) {
      await supabase.rpc("credit_balance", {
        p_user_id: user.id,
        p_amount: rental.cost,
        p_type: "refund",
        p_order_id: null,
        p_note:
          `Refund: cancelled rental ${rental.id} (${rental.service_name}, ${rental.country_name})`,
      });
      refundedAmount = rental.cost;
    }

    return jsonResponse({
      success: true,
      refunded: smspoolRefundOk,
      amount: refundedAmount,
    });
  } catch (err) {
    console.error("cancel-rental unhandled error:", err);
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
