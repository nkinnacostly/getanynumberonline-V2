// ============================================================
// Shared email plumbing: Resend transport, unsubscribe signing,
// and the HTML wrapper every campaign is rendered into.
//
// The API key lives in Supabase Edge secrets only (CLAUDE.md §6) — this module
// is the single place it is read, and it is never returned to a caller.
// ============================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails/batch";
/** Resend's documented ceiling for one batch call. */
export const MAX_BATCH = 100;

export interface OutgoingEmail {
  deliveryId: string;
  userId: string;
  to: string;
}

export interface SendResult {
  id: string;
  status: "sent" | "failed";
  provider_id: string | null;
  error: string | null;
}

// ── Unsubscribe signing ──────────────────────────────────────
// A signed link rather than a stored token: nothing to provision per user, and
// a leaked link only ever unsubscribes the one person it was minted for.

async function hmac(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function unsubscribeToken(userId: string): Promise<string> {
  return hmac(userId, Deno.env.get("EMAIL_UNSUBSCRIBE_SECRET")!);
}

/** Constant-time compare, so a wrong token can't be found a byte at a time. */
export async function verifyUnsubscribe(
  userId: string,
  token: string,
): Promise<boolean> {
  const expected = await unsubscribeToken(userId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * The link a person clicks, on our own domain.
 *
 * A supabase.co URL in a marketing footer reads as phishing to both people and
 * filters, and Supabase's function gateway rewrites Content-Type to text/plain
 * so an HTML page served from there renders as source. The page at /unsubscribe
 * calls the function server-side instead.
 */
export function unsubscribeUrl(userId: string, token: string): string {
  const app = Deno.env.get("APP_URL") ?? "https://www.getanynumberonline.com";
  return `${app.replace(/\/$/, "")}/unsubscribe?u=${userId}&t=${token}`;
}

/**
 * The URL Gmail and Yahoo POST to for RFC 8058 one-click. That has to be an
 * endpoint that accepts POST and answers 2xx with no body — a Next page route
 * only handles GET, so the machine path stays on the Edge Function.
 */
export function unsubscribePostUrl(userId: string, token: string): string {
  const base = Deno.env.get("SUPABASE_URL")!;
  return `${base}/functions/v1/email-unsubscribe?u=${userId}&t=${token}`;
}

// ── Body rendering ───────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deliberately a small subset — paragraphs, bold, links. An admin writing a
 * campaign should not be able to paste arbitrary HTML into 315 inboxes, so the
 * body is escaped first and only these three forms are re-introduced.
 */
export function renderBody(markdown: string): string {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const html = escapeHtml(para.trim())
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          '<a href="$2" style="color:#0F8A57;text-decoration:underline">$1</a>',
        )
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`;
    })
    .join("");
}

export function plainText(markdown: string, unsubUrl: string): string {
  return `${markdown.trim()}\n\n---\nUnsubscribe: ${unsubUrl}`;
}

/**
 * Light background on purpose. The product UI is near-black, but a dark email
 * body renders unpredictably across clients and trips spam heuristics — this
 * is the one place the design system's ground is not the right answer.
 */
export function wrapHtml(bodyHtml: string, unsubUrl: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F3ED">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3ED;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E4E0D6;border-radius:8px">
<tr><td style="padding:28px 28px 8px">
<span style="font:700 18px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0C2E22">getanynumberonline</span>
</td></tr>
<tr><td style="padding:12px 28px 24px;font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1A1A1A">
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E4E0D6;font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#767676">
You are receiving this because you have an account at getanynumberonline.com.<br>
<a href="${unsubUrl}" style="color:#767676">Unsubscribe</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ── Transport ────────────────────────────────────────────────

/**
 * One batch through Resend. Returns a per-recipient outcome in the SAME order
 * as the input, because that is what maps provider ids back onto delivery rows.
 *
 * A whole-batch transport failure marks every row in it 'failed' rather than
 * leaving them 'sending' — a stuck row is invisible, a failed one is retryable.
 */
export async function sendBatch(
  emails: OutgoingEmail[],
  subject: string,
  bodyMarkdown: string,
): Promise<SendResult[]> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  // The From address only needs to exist on a verified domain — it needs no
  // inbox. Replies are routed here instead, to a mailbox someone actually
  // reads. A campaign nobody can reply to reads as spam to both people and
  // filters.
  const replyTo = Deno.env.get("EMAIL_REPLY_TO");
  if (!apiKey || !from) {
    return emails.map((e) => ({
      id: e.deliveryId, status: "failed" as const, provider_id: null,
      error: "RESEND_API_KEY or EMAIL_FROM is not configured",
    }));
  }

  const payload = await Promise.all(emails.map(async (e) => {
    const token = await unsubscribeToken(e.userId);
    const url = unsubscribeUrl(e.userId, token);
    const postUrl = unsubscribePostUrl(e.userId, token);
    return {
      from,
      ...(replyTo ? { reply_to: replyTo } : {}),
      to: [e.to],
      subject,
      html: wrapHtml(renderBody(bodyMarkdown), url),
      text: plainText(bodyMarkdown, url),
      // RFC 8058. Gmail and Yahoo reject bulk mail without these outright.
      headers: {
        "List-Unsubscribe": `<${postUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  }));

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = json?.message ?? `Resend returned ${res.status}`;
      console.error("ALERT resend batch failed:", msg);
      return emails.map((e) => ({
        id: e.deliveryId, status: "failed" as const, provider_id: null, error: msg,
      }));
    }

    const ids: { id?: string }[] = json?.data ?? [];
    return emails.map((e, i) => ({
      id: e.deliveryId,
      status: "sent" as const,
      provider_id: ids[i]?.id ?? null,
      error: null,
    }));
  } catch (err) {
    console.error("ALERT resend batch threw:", err);
    return emails.map((e) => ({
      id: e.deliveryId, status: "failed" as const, provider_id: null,
      error: String(err),
    }));
  }
}
