// ============================================================
// Edge Function: order-esim
// POST /functions/v1/order-esim
// Body: {
//   slug,                         // SimJuno package slug — what we order with
//   catalog_scope,                // "country" | "region" | "global"
//   destination_slug,             // destination the client picked it from
//   location_name,                // display label (country/region/global name)
//   raw_price?                    // optional client mismatch guard (USD)
// }
//
// Flow (mirrors order-number / rent-number, plus async provisioning):
//   1. Auth + ban check
//   2. Re-fetch the package from SimJuno and price it server-side — never
//      trust the client's price
//   3. Atomically deduct + create the esim row ('pending') with our own
//      transaction_id as the idempotency key
//   4. Check the reseller wallet BEFORE touching ours; refuse if we can't fill
//   5. POST /esim/order (idempotent on transaction_id); deterministic
//      rejections refund immediately, transport failures stay 'pending' —
//      simjuno-webhook (transactionId+esimId) or reconcile-esims resolves them
//   6. Briefly poll GET /esim/{id} so the common case returns a ready eSIM
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyEsimMarkup,
  getEsim,
  getPackage,
  placeOrderIdempotent,
  queryBalance,
  type EsimProfile,
  SimJunoError,
} from "../_shared/simjuno.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const slug = String(body?.slug ?? "").trim();
    const scope = String(body?.catalog_scope ?? "country").trim();
    const destinationSlug = String(body?.destination_slug ?? "").trim();
    const clientRaw = body?.raw_price;

    if (!slug) return errorResponse("slug is required", 400);
    if (!["country", "region", "global"].includes(scope)) {
      return errorResponse("catalog_scope must be country, region or global", 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, is_banned")
      .eq("id", user.id)
      .single();
    if (!profile) return errorResponse("Profile not found", 404);
    if (profile.is_banned) return errorResponse("Account suspended", 403);

    // ── Re-fetch the package and price it server-side ────────
    let pkg: Awaited<ReturnType<typeof getPackage>>;
    try {
      pkg = await getPackage(slug);
    } catch (err) {
      if (err instanceof SimJunoError && !err.retryable) {
        // Unknown slug etc. — a definite "no".
        return errorResponse("Plan is no longer available", 404);
      }
      throw err;
    }
    if (!pkg) return errorResponse("Plan is no longer available", 404);

    if (clientRaw !== undefined && clientRaw !== null) {
      const sent = parseFloat(String(clientRaw));
      if (!isNaN(sent) && Math.abs(sent - pkg.raw_price) > 0.001) {
        return errorResponse("Price changed — refresh and try again", 409);
      }
    }

    const cost = applyEsimMarkup(pkg.raw_price);
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
      console.error("reseller/balance failed before order:", err);
      return errorResponse(
        "eSIMs are temporarily unavailable. Please try again shortly.",
        503,
      );
    }
    if (providerBalance < pkg.raw_price) {
      // Operator problem, not the customer's — and no charge was made.
      console.error(
        `ALERT esim provider balance too low: have $${providerBalance}, ` +
          `need $${pkg.raw_price.toFixed(2)}`,
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
        .eq("provider", "simjuno");
      return errorResponse(
        "eSIMs are temporarily unavailable. No charge was made.",
        503,
      );
    }

    const locationName = String(body?.location_name ?? "").trim() ||
      pkg.description || destinationSlug || slug;
    // Single-country packages carry their ISO in `location`; regional/global
    // ones cover many countries, so record the destination slug instead.
    const storedLocation = scope === "country" && pkg.location_codes.length === 1
      ? pkg.location_codes[0]
      : destinationSlug;

    // Our own idempotency key. SimJuno treats a repeated transaction_id with
    // the same orderList as the same order, and its webhooks echo it back so
    // late events can find the row even before an esim id is stored.
    const transactionId = crypto.randomUUID();

    // ── Deduct + create (pending) ────────────────────────────
    const { data: esimId, error: deductError } = await supabase.rpc(
      "deduct_balance_and_create_esim",
      {
        p_user_id: user.id,
        p_cost: cost,
        p_country: storedLocation,
        p_country_name: locationName,
        p_plan_id: slug,
        p_data_gb: pkg.data_gb,
        p_duration_days: pkg.duration_days,
        p_provider_txn_id: transactionId,
        p_total_bytes: pkg.total_bytes,
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

    /** Persist whatever an allocated profile told us. */
    const applyProfile = async (found: EsimProfile) => {
      await supabase
        .from("esims")
        .update({
          provider_tran_no: found.esim_id,
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
    };

    // ── Place the order ──────────────────────────────────────
    // Retries reuse `transactionId`, which SimJuno treats as the same request —
    // so a timeout can never buy two eSIMs.
    let esimProviderId: string;
    try {
      const placed = await placeOrderIdempotent(transactionId, slug);
      esimProviderId = placed.esimId;
    } catch (err) {
      const provider = err instanceof SimJunoError ? err : null;
      console.error("esim/order failed:", provider?.httpStatus, String(err));

      if (provider && !provider.retryable) {
        // Deterministic rejection (unknown slug, empty reseller wallet, …).
        // The order definitely did not land, so refund immediately.
        await refund(`eSIM order rejected by supplier (${provider.httpStatus})`);

        if (provider.httpStatus === 402 || /balance/i.test(provider.message)) {
          await supabase
            .from("esim_provider_status")
            .update({
              available: false,
              note: "order rejected: insufficient provider balance",
              updated_at: new Date().toISOString(),
            })
            .eq("provider", "simjuno");
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

      // Transport failure: NOT proof the order didn't land, and SimJuno offers
      // no lookup-by-transaction API. Leave the row 'pending' — the webhook
      // carries transactionId+esimId and reconcile-esims refunds within ~15
      // minutes if nothing ever arrives. Refunding blind would hand out an
      // eSIM we paid for AND refund the customer.
      console.error("ALERT esim/order transport failure for", esimId, String(err));
      await supabase
        .from("esims")
        .update({
          last_error: "order call failed; awaiting webhook/reconcile",
          updated_at: new Date().toISOString(),
        })
        .eq("id", esimId);
      return errorResponse(
        "We couldn't confirm your eSIM order. It's being checked automatically — you'll be refunded within minutes if it didn't go through.",
        503,
      );
    }

    // The esim id IS the handle for every later query/cancel — store first.
    await supabase
      .from("esims")
      .update({
        provider_tran_no: esimProviderId,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", esimId);

    // ── Wait briefly for profile allocation ──────────────────
    // Allocation usually lands within seconds but can take up to ~30s. Poll
    // just long enough to make the common case feel synchronous, then hand off
    // to the webhook / client polling rather than holding the request open.
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(2500);
      try {
        const found = await getEsim(esimProviderId);
        if (!found?.activation_string && !found?.qr_code_url) continue;

        await applyProfile(found);
        return jsonResponse({
          success: true,
          esim_id: esimId,
          provider_esim_id: esimProviderId,
          status: "active",
          cost,
        });
      } catch (err) {
        // Rate limits and hiccups while polling are fine — keep waiting.
        console.error("getEsim while polling order:", err);
        break;
      }
    }

    // Still provisioning — the row stays 'pending' and the UI shows that.
    return jsonResponse({
      success: true,
      esim_id: esimId,
      provider_esim_id: esimProviderId,
      status: "pending",
      cost,
    });
  } catch (err) {
    if (err instanceof SimJunoError) {
      console.error("order-esim provider error:", err.message);
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
