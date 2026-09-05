// ============================================================
// The queue drain, shared by the manual send and the scheduler.
//
// Both paths must behave identically — the same batching, the same claim,
// the same recording — because a campaign the cron sends at 9am and one an
// admin sends by hand are the same campaign. Keeping one implementation is
// what makes that true rather than merely intended.
// ============================================================

import { type EmailContent, MAX_BATCH, sendBatch } from "./email.ts";

// deno-lint-ignore no-explicit-any
type Supabase = any;

/** Batches per invocation. 3 x 100 keeps us well inside the timeout. */
export const BATCHES_PER_RUN = 3;

export interface DrainResult {
  sent: number;
  failed: number;
  remaining: number;
  done: boolean;
}

/** The campaign's content, assembled once so a test and a real send agree. */
export async function loadCampaign(
  supabase: Supabase,
  campaignId: string,
): Promise<{ content: EmailContent; status: string } | null> {
  const { data } = await supabase
    .from("email_campaigns")
    .select(
      "id, subject, body_markdown, status, template, preheader, headline, cta_label, cta_url, hero_image",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!data) return null;

  return {
    status: data.status as string,
    content: {
      subject: data.subject as string,
      body: data.body_markdown as string,
      template: (data.template as EmailContent["template"]) ?? "basic",
      preheader: data.preheader as string | null,
      headline: data.headline as string | null,
      ctaLabel: data.cta_label as string | null,
      ctaUrl: data.cta_url as string | null,
      heroImage: data.hero_image as string | null,
    },
  };
}

/**
 * Send up to `batches` batches, then report what is left.
 *
 * Throws on a claim or record failure rather than returning a partial success:
 * a batch that went out but was not recorded would be re-sent on the next
 * pass, which is the one inconsistency here that costs twice.
 */
export async function drainCampaign(
  supabase: Supabase,
  campaignId: string,
  content: EmailContent,
  batches = BATCHES_PER_RUN,
): Promise<DrainResult> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < batches; i++) {
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "claim_email_deliveries",
      { p_campaign_id: campaignId, p_limit: MAX_BATCH },
    );
    if (claimErr) {
      console.error("ALERT claim_email_deliveries failed:", claimErr);
      throw new Error("Could not claim recipients");
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
      console.error("ALERT record_email_results failed:", recErr);
      throw new Error("Sent but could not record results");
    }

    sent += results.filter((r) => r.status === "sent").length;
    failed += results.filter((r) => r.status === "failed").length;
  }

  const { count: remaining } = await supabase
    .from("email_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "sending"]);

  return {
    sent,
    failed,
    remaining: remaining ?? 0,
    done: (remaining ?? 0) === 0,
  };
}
