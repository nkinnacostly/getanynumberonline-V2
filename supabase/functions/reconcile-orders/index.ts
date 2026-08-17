// ============================================================
// Edge Function: reconcile-orders  (cron / maintenance)
//
// Guarantees the product's core promise: you pay only when a code arrives.
//
// poll-sms only runs while the user has the tab open, so an order abandoned
// mid-wait was never settled — it sat at 'pending' (or was flagged 'expired')
// with the money still taken. This sweeps every order past its expiry and, for
// each one:
//
//   1. asks SMSPool one last time whether an SMS landed late — if it did, the
//      code is delivered and the order stands, because the user got what they
//      paid for
//   2. otherwise cancels the number at SMSPool so we stop paying for it
//   3. refunds the user via refund_order, which is locked and idempotent
//
// Safe to run repeatedly: refund_order re-checks the row status under a lock
// and credit_balance is idempotent on a provider_ref derived from the order id.
//
// PROTECTED: header x-reconcile-secret (env RECONCILE_SECRET, or the in-DB
// secret used by the cron). Deploy with --no-verify-jwt.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isReconcileAuthorized } from "../_shared/reconcile-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
};

/** Grace after expiry before we settle — lets poll-sms finish its last pass. */
const GRACE_MIN = 2;
/**
 * Past this age a late SMS is no longer plausible, so skip the SMSPool check
 * and refund directly. Keeps the historical backfill from making thousands of
 * pointless upstream calls.
 */
const LATE_CHECK_MAX_HOURS = 24;
/** Bounded so one run can't exceed the function timeout. */
const BATCH = 40;

interface StaleOrder {
  id: string;
  user_id: string;
  cost: number;
  status: string;
  smspool_order_id: string | null;
  expires_at: string | null;
  created_at: string;
}

function extractCode(sms: string): string {
  const match = sms.match(/\b\d{4,8}\b/);
  return match ? match[0] : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!(await isReconcileAuthorized(req, supabase))) {
      return errorResponse("Forbidden", 403);
    }

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;
    const cutoff = new Date(Date.now() - GRACE_MIN * 60_000).toISOString();

    const { data: stale, error } = await supabase
      .from("orders")
      .select("id, user_id, cost, status, smspool_order_id, expires_at, created_at")
      .in("status", ["pending", "expired"])
      .lt("expires_at", cutoff)
      .order("expires_at", { ascending: true })
      .limit(BATCH);

    if (error) {
      console.error("reconcile-orders: fetch failed", error);
      return errorResponse("Failed to fetch stale orders", 500);
    }

    const report = {
      scanned: stale?.length ?? 0,
      delivered_late: [] as string[],
      refunded: [] as { id: string; amount: number }[],
      already_settled: [] as string[],
      errors: [] as { id: string; error: string }[],
      refunded_total: 0,
    };

    for (const order of (stale ?? []) as StaleOrder[]) {
      try {
        const ageHours =
          (Date.now() - new Date(order.expires_at ?? order.created_at).getTime()) /
          3_600_000;

        // ── 1. Did a code arrive after we stopped watching? ──
        if (order.smspool_order_id && ageHours < LATE_CHECK_MAX_HOURS) {
          const fd = new FormData();
          fd.append("key", smsPoolKey);
          fd.append("orderid", order.smspool_order_id);

          try {
            const res = await fetch("https://api.smspool.net/sms/check", {
              method: "POST",
              body: fd,
            });
            const json = await res.json().catch(() => null);

            if (json && (json.status === 2 || json.sms)) {
              const fullSms = json.full_sms ?? json.sms ?? "";
              const code = json.sms ?? extractCode(fullSms);

              await supabase.rpc("deliver_sms_message", {
                p_order_id: order.id,
                p_user_id: order.user_id,
                p_sender: json.sender ?? null,
                p_full_sms: fullSms,
                p_code: code,
              });

              report.delivered_late.push(order.id);
              continue; // Code received — the charge stands.
            }
          } catch (err) {
            // Can't confirm either way. Fall through to refund: the user must
            // not be left paying because SMSPool was unreachable.
            console.error("sms/check failed for", order.id, err);
          }
        }

        // ── 2. Release the number at SMSPool ─────────────────
        // Best effort — we refund regardless. Holding a number we've already
        // refunded just costs us money.
        if (order.smspool_order_id) {
          try {
            const fd = new FormData();
            fd.append("key", smsPoolKey);
            fd.append("orderid", order.smspool_order_id);
            await fetch("https://api.smspool.net/sms/cancel", {
              method: "POST",
              body: fd,
            });
          } catch (err) {
            console.error("sms/cancel failed for", order.id, err);
          }
        }

        // ── 3. Refund ────────────────────────────────────────
        const { data: refunded, error: refundErr } = await supabase.rpc(
          "refund_order",
          {
            p_order_id: order.id,
            p_status: "refunded",
            p_reason: "Refund: no verification code received",
          },
        );

        if (refundErr) {
          console.error("ALERT refund_order failed for", order.id, refundErr);
          report.errors.push({ id: order.id, error: refundErr.message });
        } else if (refunded) {
          report.refunded.push({ id: order.id, amount: Number(order.cost) });
          report.refunded_total += Number(order.cost);
        } else {
          // Already active/cancelled/refunded — nothing owed.
          report.already_settled.push(order.id);
        }
      } catch (err) {
        console.error("reconcile-orders: row failed", order.id, err);
        report.errors.push({ id: order.id, error: String(err) });
      }
    }

    report.refunded_total = Math.round(report.refunded_total * 100) / 100;

    // How much is still outstanding, so a backlog is visible rather than
    // silently draining one batch at a time.
    const { count: remaining } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "expired"])
      .lt("expires_at", cutoff);

    if (report.refunded.length > 0) {
      console.error(
        `reconcile-orders refunded ${report.refunded.length} order(s), $${report.refunded_total}`,
      );
    }

    return jsonResponse({ success: true, ...report, remaining: remaining ?? 0 });
  } catch (err) {
    console.error("reconcile-orders unhandled error:", err);
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
