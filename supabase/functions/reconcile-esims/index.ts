// ============================================================
// Edge Function: reconcile-esims  (cron / maintenance)
//
// The safety net for eSIM fulfilment. Two jobs, both driven by the same rule:
// a customer whose wallet was debited must end up with either an eSIM or their
// money back, without anyone having to notice.
//
//   1. Refresh our SimJuno reseller balance into esim_provider_status. Below
//      min_balance the storefront flips to "back soon", so we stop ACCEPTING
//      orders we cannot fill instead of refunding them afterwards.
//
//   2. Sweep esims stuck at 'pending':
//        • provisioned upstream  -> link the profile id and activate
//        • genuinely absent, and older than REFUND_AFTER_MIN -> auto-refund
//        • unresolvable after MAX_ATTEMPTS -> refund and dead-letter with
//          last_error set, so an operator can query what gave up and why
//
//   Both providers still in the data are swept:
//        simjuno    — current provider. A row whose order response was lost has
//                     no upstream handle until a webhook fills provider_tran_no,
//                     so until then all it can do is wait for its refund window.
//        esimaccess — retired provider; sweeps only the pending rows that
//                     predate the switch. Delete this leg once they drain out.
//
// Idempotent and safe to run repeatedly: refund_failed_esim only acts on a
// row that is still 'pending' (under a row lock), and credit_balance is
// idempotent on provider_ref.
//
// PROTECTED: caller must send header  x-reconcile-secret: <RECONCILE_SECRET>
// Invoke:
//   curl -X POST "https://<proj>.supabase.co/functions/v1/reconcile-esims" \
//     -H "x-reconcile-secret: <RECONCILE_SECRET>" -H "apikey: <anon-key>"
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findProfilesByTransactionId,
  queryProfiles,
} from "../_shared/esimaccess.ts";
import { getEsim, queryBalance } from "../_shared/simjuno.ts";
import { isReconcileAuthorized } from "../_shared/reconcile-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
};

/** Leave very fresh rows alone — order-esim may still be polling them. */
const GRACE_MIN = 2;
/** Past this, an unprovisioned order is presumed dead and is refunded. */
const REFUND_AFTER_MIN = 15;
/** Dead-letter threshold: stop looking and refund. */
const MAX_ATTEMPTS = 8;
/** Bound the work per run so one bad batch can't blow the function timeout. */
const BATCH = 50;

interface PendingEsim {
  id: string;
  user_id: string;
  cost: number;
  provider: string;
  provider_txn_id: string | null;
  provider_order_no: string | null;
  provider_tran_no: string | null;
  created_at: string;
  reconcile_attempts: number;
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

    const report = {
      balance: null as number | null,
      available: null as boolean | null,
      scanned: 0,
      activated: [] as string[],
      refunded: [] as { id: string; reason: string }[],
      still_pending: [] as string[],
      errors: [] as { id: string; error: string }[],
    };

    // ── 1. Provider balance ──────────────────────────────────
    const { data: status } = await supabase
      .from("esim_provider_status")
      .select("min_balance")
      .eq("provider", "simjuno")
      .maybeSingle();
    const minBalance = Number(status?.min_balance ?? 20);

    try {
      const balance = await queryBalance();
      const available = balance >= minBalance;
      report.balance = balance;
      report.available = available;

      if (!available) {
        // The one line an operator alert should key off.
        console.error(
          `ALERT esim provider balance $${balance.toFixed(2)} is below the ` +
            `$${minBalance.toFixed(2)} floor — storefront disabled`,
        );
      }

      await supabase
        .from("esim_provider_status")
        .update({
          balance,
          available,
          note: available ? null : "balance below minimum",
          checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "simjuno");
    } catch (err) {
      console.error("ALERT reseller/balance failed during reconcile:", err);
      report.errors.push({ id: "balance", error: String(err) });
    }

    // ── 2. Sweep stuck 'pending' eSIMs ───────────────────────
    const graceCutoff = new Date(Date.now() - GRACE_MIN * 60_000)
      .toISOString();

    const { data: pending, error: fetchErr } = await supabase
      .from("esims")
      .select(
        "id, user_id, cost, provider, provider_txn_id, provider_order_no, provider_tran_no, created_at, reconcile_attempts",
      )
      .in("provider", ["simjuno", "esimaccess"])
      .eq("status", "pending")
      .lt("created_at", graceCutoff)
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (fetchErr) {
      console.error("reconcile-esims: fetch failed", fetchErr);
      return errorResponse("Failed to fetch pending eSIMs", 500);
    }

    report.scanned = pending?.length ?? 0;

    for (const row of (pending ?? []) as PendingEsim[]) {
      const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60_000;
      const attempts = row.reconcile_attempts + 1;

      await supabase
        .from("esims")
        .update({ reconcile_attempts: attempts })
        .eq("id", row.id);

      try {
        let provisioned = false;

        if (row.provider === "simjuno") {
          // The stored esim id is the only reliable handle — SimJuno has no
          // lookup-by-transaction API. Rows without one are waiting on a
          // webhook (SMDP_EVENT carries transactionId+esimId) or their refund.
          if (row.provider_tran_no) {
            const found = await getEsim(row.provider_tran_no);
            const ready = found?.activation_string || found?.qr_code_url;
            if (found && ready && found.status !== "pending") {
              await supabase
                .from("esims")
                .update({
                  status: found.status,
                  expires_at: found.expires_at,
                  total_bytes: found.total_bytes || null,
                  used_bytes: found.used_bytes ?? 0,
                  usage_updated_at: new Date().toISOString(),
                  last_error: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", row.id);
              provisioned = true;
            }
          }
        } else {
          // Legacy eSIM Access rows: prefer the orderNo; fall back to scanning
          // by our own transactionId, which is the only handle we have if the
          // order call never returned.
          let profile;
          if (row.provider_order_no) {
            [profile] = await queryProfiles({ orderNo: row.provider_order_no });
          } else if (row.provider_txn_id) {
            [profile] = await findProfilesByTransactionId(
              row.provider_txn_id,
              Math.min(Math.ceil(ageMin) + 10, 60 * 24),
            );
          }

          if (profile?.iccid) {
            await supabase
              .from("esims")
              .update({
                provider_order_no: profile.order_no || row.provider_order_no,
                provider_tran_no: profile.esim_tran_no,
                iccid: profile.iccid,
                smdp_status: profile.smdp_status,
                status: profile.status === "pending" ? "active" : profile.status,
                expires_at: profile.expires_at,
                total_bytes: profile.total_bytes || null,
                used_bytes: profile.used_bytes ?? 0,
                usage_updated_at: new Date().toISOString(),
                last_error: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            provisioned = true;
          }
        }

        if (provisioned) {
          report.activated.push(row.id);
          continue;
        }

        // Not provisioned. Refund once it's clearly not coming, or once we've
        // given up looking.
        const giveUp = attempts >= MAX_ATTEMPTS;
        if (ageMin >= REFUND_AFTER_MIN || giveUp) {
          const reason = giveUp
            ? `no profile after ${attempts} reconcile attempts`
            : `not provisioned within ${REFUND_AFTER_MIN} minutes`;
          const { data: refunded, error: refundErr } = await supabase.rpc(
            "refund_failed_esim",
            { p_esim_id: row.id, p_reason: reason },
          );
          if (refundErr) {
            console.error("ALERT refund_failed_esim errored for", row.id, refundErr);
            report.errors.push({ id: row.id, error: refundErr.message });
          } else if (refunded) {
            console.error(`auto-refunded stuck eSIM ${row.id}: ${reason}`);
            report.refunded.push({ id: row.id, reason });
          }
          continue;
        }

        report.still_pending.push(row.id);
      } catch (err) {
        console.error("reconcile-esims: row failed", row.id, err);
        report.errors.push({ id: row.id, error: String(err) });
        await supabase
          .from("esims")
          .update({ last_error: String(err).slice(0, 500) })
          .eq("id", row.id);
      }
    }

    // Ops health rides along in the response so this endpoint answers "is the
    // cron actually firing?" without needing SQL access.
    const { data: health } = await supabase
      .from("esim_ops_health")
      .select("cron_active, cron_schedule, cron_last_run, cron_last_status, pending_overdue")
      .maybeSingle();

    return jsonResponse({ success: true, ...report, health: health ?? null });
  } catch (err) {
    console.error("reconcile-esims unhandled error:", err);
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
