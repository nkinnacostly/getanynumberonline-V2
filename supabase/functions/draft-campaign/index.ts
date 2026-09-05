// ============================================================
// Edge Function: draft-campaign
// POST /functions/v1/draft-campaign
// Body: { brief, mode?: "single" | "plan", count?, start_offset? }
//
// Writes campaign copy in the house voice with DeepSeek. Admin-gated, and the
// API key never leaves Supabase Edge secrets (CLAUDE.md §6).
//
// It NEVER sends and never schedules. "single" returns a draft for the
// composer to fill in; "plan" saves several drafts with PROPOSED dates that an
// admin still has to approve. Nothing this function creates can reach an inbox
// without a human pressing approve — dispatch_due_campaigns re-checks that at
// send time.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type DraftMode, systemPrompt } from "../_shared/persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
/** Overridable, because provider model names move — these already have once. */
const MODEL = Deno.env.get("DEEPSEEK_MODEL") ?? "deepseek-v4-pro";
/** Generous: a weekly digest plus JSON envelope runs long, and a truncated
 *  JSON string is unparseable rather than merely short. */
const MAX_TOKENS = 4000;
const MAX_PLAN = 6;

/** Only our own pages. A campaign must never link somewhere we don't control. */
const ALLOWED_HOSTS = ["www.getanynumberonline.com", "getanynumberonline.com"];

interface Draft {
  template: "promo" | "weekly";
  subject: string;
  preheader: string;
  headline: string;
  cta_label: string;
  cta_url: string;
  body: string;
  day_offset?: number;
  rationale?: string;
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
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: me } = await supabase
      .from("profiles")
      .select("is_admin, is_banned")
      .eq("id", user.id)
      .maybeSingle();
    if (!me?.is_admin || me.is_banned) {
      console.error(`draft-campaign denied for user ${user.id}`);
      return errorResponse("Forbidden", 403);
    }

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      // Loud, never a dead button: a missing key is an operator problem and
      // the admin needs to be told which one.
      console.error("ALERT draft-campaign: DEEPSEEK_API_KEY is not set");
      return errorResponse(
        "DEEPSEEK_API_KEY is not configured in Supabase Edge secrets",
        500,
      );
    }

    const body = await req.json().catch(() => ({}));
    const brief = String(body.brief ?? "").trim();
    if (brief.length < 8) {
      return errorResponse("Tell the writer what the email is about", 400);
    }
    const mode: DraftMode = body.mode === "plan" ? "plan" : "single";
    const count = Math.min(Math.max(Number(body.count ?? 3), 1), MAX_PLAN);

    const userPrompt = mode === "plan"
      ? `Write a plan of ${count} campaigns as json.\n\nBrief from the admin:\n${brief}`
      : `Write one campaign as json.\n\nBrief from the admin:\n${brief}`;

    const raw = await askDeepSeek(apiKey, systemPrompt(mode), userPrompt);
    if (!raw) return errorResponse("The writer returned nothing — try again", 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("draft-campaign: unparseable model output:", raw.slice(0, 400));
      return errorResponse("The writer returned malformed output — try again", 502);
    }

    if (mode === "single") {
      const draft = clean(parsed as Record<string, unknown>);
      if (!draft) return errorResponse("The writer returned an empty draft", 502);
      return jsonResponse({ success: true, draft });
    }

    // ── plan: persist as drafts carrying a PROPOSED date ─────
    const list = (parsed as { campaigns?: unknown[] })?.campaigns ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return errorResponse("The writer returned no campaigns", 502);
    }

    const startOffset = Math.max(Number(body.start_offset ?? 1), 0);
    const created: Record<string, unknown>[] = [];

    for (const [i, item] of list.slice(0, count).entries()) {
      const draft = clean(item as Record<string, unknown>);
      if (!draft) continue;

      const { data: id, error } = await supabase.rpc("admin_create_campaign", {
        p_admin_id: user.id,
        p_subject: draft.subject,
        p_body: draft.body,
        p_audience: "all",
        p_target_user_id: null,
        p_template: draft.template,
        p_preheader: draft.preheader,
        p_headline: draft.headline,
        p_cta_label: draft.cta_label,
        p_cta_url: draft.cta_url,
        p_hero_image: null,
      });
      if (error) {
        console.error("draft-campaign: could not save draft:", error.message);
        continue;
      }

      // A date on a row that is still `draft` is a PROPOSAL. The dispatcher
      // only ever looks at status = 'scheduled', so this cannot send on its
      // own however far in the past the date drifts.
      const when = new Date();
      when.setUTCDate(
        when.getUTCDate() + startOffset + (draft.day_offset ?? i * 7),
      );
      when.setUTCHours(9, 0, 0, 0);

      await supabase
        .from("email_campaigns")
        .update({
          source: "ai",
          ai_brief: brief,
          scheduled_for: when.toISOString(),
        })
        .eq("id", id);

      created.push({
        campaign_id: id,
        subject: draft.subject,
        proposed_for: when.toISOString(),
        rationale: draft.rationale ?? null,
      });
    }

    if (created.length === 0) {
      return errorResponse("Nothing usable came back — try again", 502);
    }
    return jsonResponse({ success: true, created });
  } catch (err) {
    console.error("draft-campaign unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
});

/**
 * One call, retried once.
 *
 * DeepSeek documents that JSON mode "may occasionally return empty content".
 * A single retry turns that from a visible failure into a slower success.
 */
async function askDeepSeek(
  apiKey: string,
  system: string,
  user: string,
): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        // Enough warmth for readable prose, not enough to start inventing.
        temperature: 0.7,
        max_tokens: MAX_TOKENS,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`ALERT deepseek ${res.status}:`, detail.slice(0, 300));
      // 4xx is deterministic — the same request will fail identically.
      if (res.status < 500) return null;
      continue;
    }

    const json = await res.json().catch(() => null);
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    if (content.trim()) return stripFences(content.trim());
    console.error(`deepseek returned empty content (attempt ${attempt})`);
  }
  return null;
}

/** Models add ```json fences even when told not to. */
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Everything the model produced is untrusted input, not a result.
 *
 * The body is re-escaped downstream by renderBody, so markup cannot get
 * through, but the CTA is emitted as an href — so it is checked against our
 * own hosts here rather than merely being checked for looking like a URL.
 */
function clean(o: Record<string, unknown> | null): Draft | null {
  if (!o || typeof o !== "object") return null;

  const subject = str(o.subject).slice(0, 200);
  const bodyText = str(o.body);
  if (!subject || !bodyText) return null;

  let cta = str(o.cta_url);
  try {
    const u = new URL(cta);
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname)) cta = "";
  } catch {
    cta = "";
  }

  const offset = Number(o.day_offset);

  return {
    template: o.template === "weekly" ? "weekly" : "promo",
    subject,
    preheader: str(o.preheader).slice(0, 300),
    headline: str(o.headline).slice(0, 200),
    cta_label: cta ? (str(o.cta_label).slice(0, 60) || "Open your dashboard") : "",
    cta_url: cta,
    body: bodyText,
    day_offset: Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : undefined,
    rationale: str(o.rationale).slice(0, 300) || undefined,
  };
}

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
