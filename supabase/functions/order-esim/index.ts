// ============================================================
// Edge Function: order-esim
// POST /functions/v1/order-esim
// Body: {
//   package_code,                 // eSIM Access packageCode
//   catalog_scope,                // "country" | "regional" | "global"
//   location_code,                // ISO code when scope is "country"
//   location_name,                // display label (country or region name)
//   raw_price?,                   // optional client mismatch guard (USD)
//   period_num?                   // days, day-pass plans only
// }
//
// Flow (mirrors order-number / rent-number, plus the async provisioning step):
//   1. Auth + ban check
//   2. Re-fetch the package from eSIM Access and price it server-side — never
//      trust the client's price
//   3. Atomically deduct + create the esim row ('pending') with our own
//      transactionId as the idempotency key
//   4. POST esim/order; on failure refund and mark 'failed'
//   5. Provisioning is ASYNCHRONOUS — briefly poll esim/query so the common
//      case returns a ready eSIM. If the profile is not allocated yet the row
//      stays 'pending' and esimaccess-webhook (or client polling of
//      get-esim-profile) completes it.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyEsimMarkup,
  callEsimAccess,
  EsimAccessError,
  ERR_ALLOCATING,
  ERR_PROVIDER_NO_FUNDS,
  findProfilesByTransactionId,
  placeOrderIdempotent,
  queryBalance,
  queryProfiles,
  shapePackage,
  toScaledPrice,
} from "../_shared/esimaccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Which catalog list a package came from, so we can re-price it. */
function listCodeFor(scope: string, locationCode: string): string {
  if (scope === "regional") return "!RG";
  if (scope === "global") return "!GL";
  return locationCode;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const packageCode = String(body?.package_code ?? "").trim();
    const scope = String(body?.catalog_scope ?? "country").trim();
    const locationCode = String(body?.location_code ?? "").trim().toUpperCase();
    const clientRaw = body?.raw_price;

    if (!packageCode) return errorResponse("package_code is required", 400);
    if (scope === "country" && !locationCode) {
      return errorResponse("location_code is required", 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, is_banned")
      .eq("id", user.id)
      .single();
    if (!profile) return errorResponse("Profile not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    // ── Re-fetch the package and price it server-side ────────
    const obj = await callEsimAccess<
      { packageList?: Record<string, unknown>[] }
    >("package/list", {
      locationCode: listCodeFor(scope, locationCode),
      type: "BASE",
    });
    const pkg = (obj.packageList ?? [])
      .map(shapePackage)
      .find((p) => p.code === packageCode);
    if (!pkg) return errorResponse("Plan is no longer available", 404);
    if (pkg.raw_price <= 0) return errorResponse("Invalid plan price", 502);

    // Day passes are billed per day: the catalog quotes one day and the order
    // carries periodNum. `amount` below is verified upstream, so a wrong
    // multiplier fails the order and refunds rather than mischarging.
    let periodNum: number | null = null;
    if (pkg.is_day_pass) {
      const requested = Number(body?.period_num ?? pkg.duration_days ?? 1);
      if (!Number.isInteger(requested) || requested < 1 || requested > 365) {
        return errorResponse("period_num must be a whole number of days (1-365)", 400);
      }
      periodNum = requested;
    }
    const days = periodNum ?? 1;

    if (clientRaw !== undefined && clientRaw !== null) {
      const sent = parseFloat(String(clientRaw));
      if (!isNaN(sent) && Math.abs(sent - pkg.raw_price) > 0.001) {
        return errorResponse("Price changed — refresh and try again", 409);
      }
    }

    const cost = applyEsimMarkup(pkg.raw_price * days);
    if (isNaN(cost) || cost <= 0) {
      return errorResponse("Invalid computed price", 500);
    }
    if (profile.balance < cost) {
      return errorResponse(
        "Insufficient balance. Please top up your wallet.",
        402,
      );
    }

    // ── Can we actually fulfil this? ─────────────────────────
    // Checked BEFORE the wallet is touched. Taking money for an order we can't
    // fill means a refund at best, and a support ticket at worst.
    let providerBalance: number;
    try {
      providerBalance = await queryBalance();
    } catch (err) {
      console.error("balance/query failed before order:", err);
      return errorResponse(
        "eSIMs are temporarily unavailable. Please try again shortly.",
        503,
      );
    }
    if (providerBalance < pkg.raw_price * days) {
      // Operator problem, not the customer's — and no charge was made.
      console.error(
        `ALERT esim provider balance too low: have $${providerBalance}, ` +
          `need $${(pkg.raw_price * days).toFixed(2)}`,
      );
      await supabase
        .from("esim_provider_status")
        .update({
          balance: providerBalance,
          available: false,
          note: "insufficient balance to fulfil orders",
          checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "esimaccess");
      return errorResponse(
        "eSIMs are temporarily unavailable. No charge was made.",
        503,
      );
    }

    const locationName = String(body?.location_name ?? "").trim() ||
      pkg.description || locationCode;
    // For regional/global packages the ISO code is meaningless — record the
    // catalog bucket so the row can still be re-priced and displayed.
    const storedLocation = scope === "country"
      ? locationCode
      : listCodeFor(scope, locationCode);

    // Our own idempotency key. The provider treats a repeated transactionId as
    // the same order, and the webhook echoes it back so late events can find
    // the row even before an orderNo is stored.
    const transactionId = crypto.randomUUID();

    // ── Deduct + create (pending) ────────────────────────────
    const { data: esimId, error: deductError } = await supabase.rpc(
      "deduct_balance_and_create_esim",
      {
        p_user_id: user.id,
        p_cost: cost,
        p_country: storedLocation,
        p_country_name: locationName,
        p_plan_id: packageCode,
        p_data_gb: pkg.data_gb * days,
        p_duration_days: pkg.is_day_pass ? days : pkg.duration_days,
        p_provider_txn_id: transactionId,
        p_total_bytes: pkg.total_bytes * days,
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

    // Refund + fail atomically. The RPC re-checks that the row is still
    // 'pending' under a lock, so this can never race the reconcile sweeper into
    // a double refund, and credit_balance is idempotent on provider_ref.
    const refund = async (reason: string) => {
      const { error } = await supabase.rpc("refund_failed_esim", {
        p_esim_id: esimId,
        p_reason: reason,
      });
      if (error) {
        // Loud: the user is out of pocket until reconcile-esims retries this.
        console.error("ALERT refund_failed_esim FAILED for", esimId, error);
      }
    };

    // ── Place the order ──────────────────────────────────────
    // Retries reuse `transactionId`, which eSIM Access treats as the same
    // request — so a timeout can never buy two eSIMs.
    let orderNo: string;
    try {
      const placed = await placeOrderIdempotent({
        transactionId,
        amountScaled: toScaledPrice(pkg.raw_price * days),
        packageCode: pkg.code,
        priceScaled: toScaledPrice(pkg.raw_price),
        periodNum,
      });
      orderNo = placed.orderNo;
    } catch (err) {
      const provider = err instanceof EsimAccessError ? err : null;
      console.error("esim/order failed:", provider?.code, String(err));

      // CRITICAL: a transport failure is not proof the order didn't land. It
      // may have succeeded and only the response was lost. Refunding blind
      // would hand out an eSIM we paid for and refund the customer too, so
      // confirm the order really is absent first.
      if (!provider?.code) {
        try {
          const [recovered] = await findProfilesByTransactionId(transactionId);
          if (recovered) {
            console.error(
              `recovered orphaned eSIM order ${recovered.order_no} for`,
              esimId,
            );
            await supabase
              .from("esims")
              .update({
                provider_order_no: recovered.order_no,
                provider_tran_no: recovered.esim_tran_no,
                iccid: recovered.iccid,
                smdp_status: recovered.smdp_status,
                status: recovered.status === "pending"
                  ? "active"
                  : recovered.status,
                expires_at: recovered.expires_at,
                total_bytes: recovered.total_bytes || null,
                used_bytes: recovered.used_bytes ?? 0,
                usage_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", esimId);
            return jsonResponse({
              success: true,
              esim_id: esimId,
              order_no: recovered.order_no,
              status: "active",
              cost,
            });
          }
        } catch (lookupErr) {
          // Couldn't prove either way — leave the row 'pending' and let
          // reconcile-esims decide. Refunding on a guess is the worse error.
          console.error("ALERT order recovery lookup failed for", esimId, lookupErr);
          await supabase
            .from("esims")
            .update({
              last_error: "order call failed; recovery lookup failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", esimId);
          return errorResponse(
            "We couldn't confirm your eSIM order. It's being checked automatically — you'll be refunded within minutes if it didn't go through.",
            503,
          );
        }
      }

      await refund(`eSIM order failed (${provider?.code ?? "network"})`);

      // Our provider wallet being empty is an operator problem, not the user's.
      if (provider?.code === ERR_PROVIDER_NO_FUNDS) {
        await supabase
          .from("esim_provider_status")
          .update({
            available: false,
            note: "order rejected: insufficient provider balance",
            updated_at: new Date().toISOString(),
          })
          .eq("provider", "esimaccess");
        return errorResponse(
          "eSIMs are temporarily unavailable. Your balance was refunded.",
          503,
        );
      }
      return errorResponse(
        "Could not complete the eSIM purchase. Your balance was refunded.",
        503,
      );
    }

    await supabase
      .from("esims")
      .update({ provider_order_no: orderNo, updated_at: new Date().toISOString() })
      .eq("id", esimId);

    // ── Wait briefly for the SM-DP+ allocation ───────────────
    // Allocation usually lands in a few seconds but can take up to ~30s. Poll
    // just long enough to make the common case feel synchronous, then hand off
    // to the webhook / client polling rather than holding the request open.
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(2500);
      try {
        const [found] = await queryProfiles({ orderNo });
        if (!found?.iccid) continue;

        await supabase
          .from("esims")
          .update({
            provider_tran_no: found.esim_tran_no,
            iccid: found.iccid,
            smdp_status: found.smdp_status,
            status: found.status === "pending" ? "active" : found.status,
            expires_at: found.expires_at,
            total_bytes: found.total_bytes || null,
            used_bytes: found.used_bytes ?? 0,
            usage_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", esimId);

        return jsonResponse({
          success: true,
          esim_id: esimId,
          order_no: orderNo,
          status: "active",
          cost,
        });
      } catch (err) {
        // 200010 just means "still allocating" — keep waiting.
        if (err instanceof EsimAccessError && err.code === ERR_ALLOCATING) {
          continue;
        }
        console.error("esim/query while polling order:", err);
        break;
      }
    }

    // Still provisioning — the row stays 'pending' and the UI shows that.
    return jsonResponse({
      success: true,
      esim_id: esimId,
      order_no: orderNo,
      status: "pending",
      cost,
    });
  } catch (err) {
    if (err instanceof EsimAccessError) {
      console.error("order-esim provider error:", err.code, err.message);
      return errorResponse(
        "eSIM provider is unavailable right now. No charge was made.",
        err.httpStatus,
      );
    }
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
