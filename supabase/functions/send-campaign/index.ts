// ============================================================
// Edge Function: send-campaign
// POST /functions/v1/send-campaign
// Body: { campaign_id, test?: boolean }
//
// Drains a queued campaign through Resend in batches. Bounded per invocation
// so one call cannot exceed the function timeout — the response says whether
// work remains, and the caller (or the cron) comes back for the rest.
//
// test:true sends one copy to the calling admin and marks the campaign tested.
// A campaign addressed to everyone cannot be queued until that has happened —
// enforced by admin_queue_campaign, not by the UI.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBatch } from "../_shared/email.ts";
import { drainCampaign, loadCampaign } from "../_shared/campaign-drain.ts";

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
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin check with the service role, never the caller's client — same
    // reasoning as admin-api.
    const { data: me } = await supabase
      .from("profiles")
      .select("is_admin, is_banned, email")
      .eq("id", user.id)
      .maybeSingle();
    if (!me?.is_admin || me.is_banned) {
      console.error(`send-campaign denied for user ${user.id}`);
      return errorResponse("Forbidden", 403);
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body.campaign_id ?? "").trim();
    if (!campaignId) return errorResponse("campaign_id is required", 400);

    const loaded = await loadCampaign(supabase, campaignId);
    if (!loaded) return errorResponse("Campaign not found", 404);
    const { content, status } = loaded;

    // ── Test send ────────────────────────────────────────────
    if (body.test === true) {
      if (!me.email) return errorResponse("Your account has no email", 400);

      const [result] = await sendBatch(
        [{ deliveryId: campaignId, userId: user.id, to: me.email as string }],
        { ...content, subject: `[TEST] ${content.subject}` },
      );
      if (result.status === "failed") {
        return errorResponse(result.error ?? "Test send failed", 502);
      }

      await supabase.rpc("mark_campaign_tested", {
        p_admin_id: user.id,
        p_campaign_id: campaignId,
      });
      return jsonResponse({ success: true, test: true, sent_to: me.email });
    }

    // ── Drain ────────────────────────────────────────────────
    if (status !== "queued" && status !== "sending") {
      return errorResponse(`Campaign is ${status}, not queued`, 400);
    }

    const result = await drainCampaign(supabase, campaignId, content);
    return jsonResponse({ success: true, ...result });
  } catch (err) {
    console.error("send-campaign unhandled error:", err);
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
