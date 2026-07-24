// ============================================================
// Edge Function: reconcile-topups  (one-off / maintenance)
//
// Credits wallet top-ups that were paid on Flutterwave but never credited
// (rows stuck at status='pending') — e.g. because the webhook forwarding was
// misconfigured. Each row is re-verified against Flutterwave before crediting;
// abandoned/failed payments are skipped. Idempotent: safe to run repeatedly
// (credit_balance no-ops anything already completed).
//
// PROTECTED: caller must send header  x-reconcile-secret: <RECONCILE_SECRET>
// Set the secret first:
//   supabase secrets set RECONCILE_SECRET=<a-long-random-string>
// Invoke:
//   curl -X POST "https://<proj>.supabase.co/functions/v1/reconcile-topups" \
//     -H "x-reconcile-secret: <RECONCILE_SECRET>" \
//     -H "apikey: <anon-key>"
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
};

interface PendingTx {
  id: string;
  user_id: string;
  amount: number;
  provider_ref: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Gate: shared admin secret ────────────────────────────
    const secret = Deno.env.get("RECONCILE_SECRET");
    if (!secret || req.headers.get("x-reconcile-secret") !== secret) {
      return errorResponse("Forbidden", 403);
    }

    const flwSecret = Deno.env.get("FLUTTERWAVE_SECRET_KEY")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Find flutterwave top-ups still pending ───────────────
    const { data: pending, error: fetchErr } = await supabase
      .from("transactions")
      .select("id, user_id, amount, provider_ref")
      .eq("provider", "flutterwave")
      .eq("type", "topup")
      .eq("status", "pending");

    if (fetchErr) {
      console.error("reconcile: fetch failed", fetchErr);
      return errorResponse("Failed to fetch pending top-ups", 500);
    }

    const report = {
      scanned: pending?.length ?? 0,
      credited: [] as string[],
      skipped: [] as { tx_ref: string | null; reason: string }[],
      errors: [] as { tx_ref: string | null; error: string }[],
    };

    for (const tx of (pending ?? []) as PendingTx[]) {
      const txRef = tx.provider_ref;
      try {
        if (!txRef) {
          report.skipped.push({ tx_ref: null, reason: "no provider_ref" });
          continue;
        }

        // Verify with Flutterwave by reference — never trust the DB row alone.
        const verifyRes = await fetch(
          `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
          { headers: { Authorization: `Bearer ${flwSecret}` } },
        );
        const verifyJson = await verifyRes.json();

        if (verifyJson.data?.status !== "successful") {
          report.skipped.push({
            tx_ref: txRef,
            reason: `flw status: ${verifyJson.data?.status ?? verifyJson.status ?? "unknown"}`,
          });
          continue;
        }
        if (verifyJson.data?.tx_ref !== txRef) {
          report.skipped.push({ tx_ref: txRef, reason: "tx_ref mismatch" });
          continue;
        }

        const verifiedAmount = parseFloat(verifyJson.data.amount);
        const currency = verifyJson.data.currency ?? "USD";

        const { error: creditError } = await supabase.rpc("credit_balance", {
          p_user_id: tx.user_id,
          p_amount: verifiedAmount,
          p_type: "topup",
          p_order_id: null,
          p_provider: "flutterwave",
          p_provider_ref: txRef,
          p_note: `Wallet top-up (reconciled): $${verifiedAmount} ${currency}`,
        });

        if (creditError) {
          report.errors.push({ tx_ref: txRef, error: creditError.message });
          continue;
        }

        await supabase
          .from("transactions")
          .update({ provider_meta: verifyJson.data })
          .eq("provider_ref", txRef)
          .eq("status", "completed");

        report.credited.push(txRef);
        console.log("reconcile: credited", { txRef, verifiedAmount });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push({ tx_ref: txRef, error: msg });
        console.error("reconcile: error on", txRef, msg);
      }
    }

    return jsonResponse({ success: true, ...report });
  } catch (err: unknown) {
    console.error("reconcile-topups error:", err);
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
