// ============================================================
// Edge Function: rent-number
// POST /functions/v1/rent-number
// Body: { rental_id, days, raw_price? } — raw_price must match catalog (optional check).
// Pricing comes from catalog item.pricing[days], not retrieve_pricing.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function applyRentalMarkup(raw: number): number {
  return Math.ceil(raw * 1.35 * 100) / 100;
}

function readRawFromCatalogItem(
  item: Record<string, unknown>,
  days: number,
): number | null {
  const p = item.pricing as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const v = p[String(days)];
  if (v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
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

    const body = await req.json();
    const rental_id = body?.rental_id;
    const days = Number(body?.days);
    const clientRaw = body?.raw_price;
    const service_id = body?.service_id as string | undefined;

    if (!rental_id) return errorResponse("rental_id is required", 400);
    if (isNaN(days) || days <= 0) {
      return errorResponse("days must be a positive number", 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, is_banned")
      .eq("id", user.id)
      .single();

    if (!profile) return errorResponse("Profile not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;

    const listFd = new FormData();
    listFd.append("key", smsPoolKey);
    listFd.append("type", "1");
    const listRes = await fetch("https://api.smspool.net/rental/retrieve_all", {
      method: "POST",
      body: listFd,
    });
    const listJson = await listRes.json();
    if (!listRes.ok) {
      console.error("SMSPool retrieve_all failed:", listJson);
      return errorResponse("Could not load rental catalog from SMSPool", 502);
    }
    const list: Record<string, unknown>[] = Array.isArray(listJson)
      ? listJson
      : Array.isArray(listJson?.data)
        ? listJson.data
        : Array.isArray(listJson?.rentals)
          ? listJson.rentals
          : [];

    const item = list.find(
      (r) => String(r.ID ?? r.id) === String(rental_id),
    ) as Record<string, unknown> | undefined;

    if (!item) {
      return errorResponse("Rental listing not found in catalog", 404);
    }

    const country =
      String(item.country ?? item.country_id ?? item.Country ?? "");
    const country_name = String(
      item.country_name ?? item.countryName ?? item.Country ?? "—",
    );
    const service = String(item.service ?? item.service_id ?? "");
    const service_name = String(item.name ?? item.service_name ?? "Rental");

    const raw = readRawFromCatalogItem(item, days);
    if (raw === null) {
      return errorResponse(
        "No price for this rental and duration in catalog",
        400,
      );
    }

    if (clientRaw !== undefined && clientRaw !== null) {
      const sent = parseFloat(String(clientRaw));
      if (!isNaN(sent) && Math.abs(sent - raw) > 0.001) {
        return errorResponse("Price mismatch — refresh and try again", 400);
      }
    }

    const cost = applyRentalMarkup(raw);
    if (isNaN(cost) || cost <= 0) {
      return errorResponse("Invalid computed price", 500);
    }

    if (profile.balance < cost) {
      return errorResponse(
        "Insufficient balance. Please top up your wallet.",
        402,
      );
    }

    const { data: rentalUuid, error: deductError } = await supabase.rpc(
      "deduct_balance_and_create_rental",
      {
        p_user_id: user.id,
        p_cost: cost,
        p_country: country || "—",
        p_country_name: country_name,
        p_service: service || String(rental_id),
        p_service_name: service_name,
        p_days: days,
        p_rental_id: String(rental_id),
      },
    );

    if (deductError) {
      if (deductError.message?.includes("Insufficient balance")) {
        return errorResponse(
          "Insufficient balance. Please top up your wallet.",
          402,
        );
      }
      console.error("deduct_balance_and_create_rental error:", deductError);
      return errorResponse("Failed to create rental", 500);
    }

    const purchaseFd = new FormData();
    purchaseFd.append("key", smsPoolKey);
    purchaseFd.append("id", String(rental_id));
    purchaseFd.append("days", String(days));
    if (service_id) purchaseFd.append("service_id", service_id);

    const purchaseRes = await fetch(
      "https://api.smspool.net/purchase/rental",
      { method: "POST", body: purchaseFd },
    );
    const purchaseJson = await purchaseRes.json();

    const ok =
      purchaseJson.success === true ||
      purchaseJson.success === 1 ||
      purchaseJson.status === "success";
    const rental_code = String(
      purchaseJson.rental_code ?? purchaseJson.rentalcode ?? "",
    );
    const phone_number = String(
      purchaseJson.phonenumber ??
        purchaseJson.phone_number ??
        purchaseJson.number ??
        "",
    );

    if (!ok || !rental_code || !phone_number) {
      console.error("SMSPool rental purchase failed:", purchaseJson);

      await supabase.rpc("credit_balance", {
        p_user_id: user.id,
        p_amount: cost,
        p_type: "refund",
        p_order_id: null,
        p_note: `Auto-refund: SMSPool rental purchase failed (rental ${rentalUuid})`,
      });

      await supabase
        .from("rentals")
        .update({ status: "cancelled" })
        .eq("id", rentalUuid);

      return errorResponse(
        purchaseJson.message ??
          "Could not complete rental purchase. Your balance was refunded.",
        503,
      );
    }

    const { error: updErr } = await supabase
      .from("rentals")
      .update({
        smspool_rental_code: rental_code,
        phone_number,
      })
      .eq("id", rentalUuid);

    if (updErr) {
      console.error("Failed to update rental row:", updErr);
      await supabase.rpc("credit_balance", {
        p_user_id: user.id,
        p_amount: cost,
        p_type: "refund",
        p_order_id: null,
        p_note: `Auto-refund: failed to store rental details (${rentalUuid})`,
      });
      await supabase
        .from("rentals")
        .update({ status: "cancelled" })
        .eq("id", rentalUuid);
      return errorResponse("Failed to finalize rental", 500);
    }

    const { data: row } = await supabase
      .from("rentals")
      .select("expires_at, phone_number")
      .eq("id", rentalUuid)
      .single();

    return jsonResponse({
      success: true,
      rental_id: rentalUuid,
      phone_number: row?.phone_number ?? phone_number,
      expires_at: row?.expires_at,
      cost,
      raw_price: raw,
    });
  } catch (err) {
    console.error("rent-number unhandled error:", err);
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
