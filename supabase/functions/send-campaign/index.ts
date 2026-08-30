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
import { type EmailContent, MAX_BATCH, sendBatch } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Batches per invocation. 3 x 100 keeps us well inside the timeout. */
const BATCHES_PER_RUN = 3;

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

    const { data: campaign } = await supabase
      .from("email_campaigns")
      .select(
        "id, subject, body_markdown, status, template, preheader, headline, cta_label, cta_url, hero_image",
      )
      .eq("id", campaignId)
      .maybeSingle();
    if (!campaign) return errorResponse("Campaign not found", 404);

    // Assembled once, so the test and the real send cannot diverge.
    const content: EmailContent = {
      subject: campaign.subject as string,
      body: campaign.body_markdown as string,
      template: (campaign.template as EmailContent["template"]) ?? "basic",
      preheader: campaign.preheader as string | null,
      headline: campaign.headline as string | null,
      ctaLabel: campaign.cta_label as string | null,
      ctaUrl: campaign.cta_url as string | null,
      heroImage: campaign.hero_image as string | null,
    };

    // ── Test send ────────────────────────────────────────────
    if (body.test === true) {
      if (!me.email) return errorResponse("Your account has no email", 400);

      const [result] = await sendBatch(
        [{ deliveryId: campaign.id as string, userId: user.id, to: me.email as string }],
        { ...content, subject: `[TEST] ${content.subject}` },
      );
      if (result.status === "failed") {
        return errorResponse(result.error ?? "Test send failed", 502);
      }

      await supabase.rpc("mark_campaign_tested", {
        p_admin_id: user.id,
        p_campaign_id: campaign.id,
      });
      return jsonResponse({ success: true, test: true, sent_to: me.email });
    }

    // ── Drain ────────────────────────────────────────────────
    if (campaign.status !== "queued" && campaign.status !== "sending") {
      return errorResponse(`Campaign is ${campaign.status}, not queued`, 400);
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < BATCHES_PER_RUN; i++) {
      const { data: claimed, error: claimErr } = await supabase.rpc(
        "claim_email_deliveries",
        { p_campaign_id: campaignId, p_limit: MAX_BATCH },
      );
      if (claimErr) {
        console.error("ALERT claim_email_deliveries failed:", claimErr);
        return errorResponse("Could not claim recipients", 500);
      }

      const rows = (claimed ?? []) as { id: string; user_id: string; email: string }[];
      if (rows.length === 0) break;

      const results = await sendBatch(
        rows.map((r) => ({ deliveryId: r.id, userId: r.user_id, to: r.email })),
        content,
      );

      const { error: recErr } = await supabase.rpc("record_email_results", {
        p_campaign_id: campaignId,
        p_results: results,
      });
      if (recErr) {
        // The mail went out; failing to record it would re-send on the next
        // pass. Loud, because it is the one inconsistency that costs twice.
        console.error("ALERT record_email_results failed:", recErr);
        return errorResponse("Sent but could not record results", 500);
      }

      sent += results.filter((r) => r.status === "sent").length;
      failed += results.filter((r) => r.status === "failed").length;
    }

    const { count: remaining } = await supabase
      .from("email_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "sending"]);

    return jsonResponse({
      success: true,
      sent,
      failed,
      remaining: remaining ?? 0,
      done: (remaining ?? 0) === 0,
    });
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
