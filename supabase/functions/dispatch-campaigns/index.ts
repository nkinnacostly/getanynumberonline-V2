// ============================================================
// Edge Function: dispatch-campaigns
// POST /functions/v1/dispatch-campaigns   (cron, x-reconcile-secret)
//
// Two jobs, in order:
//   1. queue every approved campaign whose scheduled time has passed
//   2. keep draining anything already in flight
//
// Authenticated by a shared secret, not a JWT — pg_cron has no session. Same
// pattern as reconcile-esims.
//
// It never sends anything a human has not approved: dispatch_due_campaigns
// re-checks approved_at at the moment of sending, not at the moment a date
// was picked, because approval can be withdrawn in between.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { drainCampaign, loadCampaign } from "../_shared/campaign-drain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
};

/** Campaigns drained per tick. The cron comes back for the rest. */
const MAX_CAMPAIGNS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("RECONCILE_SECRET");
    if (!secret) {
      console.error("ALERT dispatch-campaigns: RECONCILE_SECRET is not set");
      return errorResponse("Not configured", 500);
    }
    if (req.headers.get("x-reconcile-secret") !== secret) {
      return errorResponse("Unauthorized", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Anything due and approved becomes queued.
    const { data: dispatched, error: dispatchErr } = await supabase.rpc(
      "dispatch_due_campaigns",
      { p_limit: MAX_CAMPAIGNS },
    );
    if (dispatchErr) {
      console.error("ALERT dispatch_due_campaigns failed:", dispatchErr);
      return errorResponse("Could not dispatch", 500);
    }

    // 2. Drain whatever is in flight, including what step 1 just queued.
    const { data: inFlight, error: flightErr } = await supabase.rpc(
      "campaigns_in_flight",
      { p_limit: MAX_CAMPAIGNS },
    );
    if (flightErr) {
      console.error("ALERT campaigns_in_flight failed:", flightErr);
      return errorResponse("Could not list campaigns", 500);
    }

    const drained: Record<string, unknown>[] = [];
    for (const row of (inFlight ?? []) as { id: string }[]) {
      const loaded = await loadCampaign(supabase, row.id);
      if (!loaded) continue;
      try {
        const result = await drainCampaign(supabase, row.id, loaded.content);
        drained.push({ campaign_id: row.id, ...result });
      } catch (err) {
        // One campaign failing must not stop the others, and the cron will
        // come back — so record the reason and move on rather than 500ing.
        console.error(`ALERT drain failed for ${row.id}:`, err);
        await supabase
          .from("email_campaigns")
          .update({ last_error: String(err) })
          .eq("id", row.id);
        drained.push({ campaign_id: row.id, error: String(err) });
      }
    }

    return jsonResponse({
      success: true,
      queued: (dispatched as { queued?: unknown[] })?.queued ?? [],
      drained,
    });
  } catch (err) {
    console.error("dispatch-campaigns unhandled error:", err);
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
