// ============================================================
// Shared email plumbing: Resend transport, unsubscribe signing,
// and the templates every campaign is rendered into.
//
// The API key lives in Supabase Edge secrets only (CLAUDE.md §6) — this module
// is the single place it is read, and it is never returned to a caller.
//
// This file is ALSO the renderer behind the admin preview (admin-api's
// preview_campaign action). There is deliberately no second copy of the markup
// in the React app: a preview that is not byte-identical to the sent mail is
// worse than no preview at all.
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

// ── Brand tokens, fixed ──────────────────────────────────────
// Email does not get the app's flipping light/dark tokens: there is no
// stylesheet, no CSS variables worth relying on, and a dark body renders
// unpredictably across clients and trips spam heuristics. These are the fixed
// brand colours from CLAUDE.md §13 that read correctly on a light ground.

const PAPER = "#F5F3ED";
const CARD = "#FFFFFF";
const PINE = "#0C2E22";
const PINE_DEEP = "#081E16";
const MINT = "#00FF94";
const INK = "#1A1A1A";
const MUTED = "#767676";
const LINE = "#E4E0D6";
/** Mint is unreadable as text on white — links use the light-theme accent. */
const LINK = "#0F8A57";

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

const SITE = "https://www.getanynumberonline.com";
/**
 * The mark, as a PNG. Not the SVG the site uses — Gmail strips SVG — and not
 * the knockout version either: an email's backdrop is not ours to control
 * (dark-mode clients repaint it), so this one carries an explicit white plate
 * behind the G. 117x108 natural, drawn at a third of that.
 */
const LOGO = `${SITE}/images/email/logo.png`;
const INSTAGRAM = "https://instagram.com/getanynumberonline";
const IG_HANDLE = "@getanynumberonline";

export type EmailTemplate = "basic" | "promo" | "weekly";

/** Everything a campaign row contributes to the rendered mail. */
export interface EmailContent {
  subject: string;
  body: string;
  template: EmailTemplate;
  /** Inbox preview line. Falls back to the first words of the body. */
  preheader?: string | null;
  /** Large hero heading. Falls back to the subject. */
  headline?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Absolute URL of the banner image at the top of the card. */
  heroImage?: string | null;
}

// ── Body rendering ───────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline marks only: bold and links, on already-escaped text. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      `<a href="$2" style="color:${LINK};text-decoration:underline">$1</a>`,
    )
    .replace(/\n/g, "<br>");
}

/**
 * Deliberately a small subset — headings, bullets, rules, paragraphs, bold and
 * links. An admin writing a campaign should not be able to paste arbitrary HTML
 * into 300+ inboxes, so the body is escaped first and only these forms are
 * re-introduced.
 */
export function renderBody(markdown: string): string {
  return markdown
    .trim()
    .split(/\n{2,}/)
    .map((raw, i) => {
      const block = raw.trim();
      if (!block) return "";

      // A horizontal rule — the section break a weekly digest needs.
      if (/^(-{3,}|\*{3,})$/.test(block)) {
        return `<hr style="border:0;border-top:1px solid ${LINE};margin:28px 0">`;
      }

      // A heading. Two levels is as much hierarchy as an email can carry.
      const heading = block.match(/^(#{2,3})\s+(.*)$/s);
      if (heading) {
        const size = heading[1].length === 2 ? 19 : 16;
        // The first block sits directly under the heading the template drew,
        // which already carries its own spacing.
        return `<h2 style="margin:${i === 0 ? 0 : 28}px 0 10px;font:700 ${size}px/1.3 ${SANS};color:${PINE}">${
          inline(escapeHtml(heading[2].trim()))
        }</h2>`;
      }

      // A bullet list — every line must be a bullet, so a stray dash mid
      // paragraph stays a dash.
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map(
            (l) =>
              `<li style="margin:0 0 8px">${
                inline(escapeHtml(l.replace(/^\s*[-*]\s+/, "").trim()))
              }</li>`,
          )
          .join("");
        return `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.6">${items}</ul>`;
      }

      return `<p style="margin:0 0 16px;line-height:1.6">${inline(escapeHtml(block))}</p>`;
    })
    .join("");
}

/** Only ever emit a link we know is a link. */
function safeUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}

/** First plain sentence of the body, for the inbox preview line. */
function derivePreheader(markdown: string): string {
  const flat = markdown
    .replace(/^#{2,3}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
}

// ── Template pieces ──────────────────────────────────────────

/**
 * Hidden inbox-preview text. The trailing whitespace run stops Gmail pulling
 * the first line of the body in after it.
 */
function preheaderBlock(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${
    escapeHtml(text)
  }${"&#8199;&#65279;".repeat(60)}</div>`;
}

/** Table-based button: padding gives the 44px target without min-height. */
function button(label: string, url: string, onDark: boolean): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px"><tr>
<td align="center" bgcolor="${MINT}" style="border-radius:6px">
<a href="${url}" style="display:inline-block;padding:15px 30px;font:700 15px/1 ${SANS};color:${PINE_DEEP};text-decoration:none;border-radius:6px">${
    escapeHtml(label)
  }</a>
</td></tr></table>${onDark ? "" : ""}`;
}

/**
 * The banner image, when there is one.
 *
 * Width and display:block are attributes and inline style rather than CSS,
 * because Outlook ignores the stylesheet and Gmail strips <style>. The alt is
 * deliberately empty: the image is decorative, and a blocked-image placeholder
 * reading "banner" is worse than nothing — every word that matters is in the
 * heading below it, which is text.
 */
function imageBand(url: string): string {
  return `<tr><td style="padding:0;font-size:0;line-height:0">
<img src="${url}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px 8px 0 0;outline:none;text-decoration:none">
</td></tr>
<tr><td bgcolor="${MINT}" style="background:${MINT};height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>`;
}

/**
 * Promotional hero.
 *
 * With an image it follows the banner-then-heading order: the picture carries
 * the mood, the heading carries the message, and the email still reads if the
 * client blocks images. Without one, the pine band stands in so a promo never
 * arrives looking like a plain note.
 */
function promoHero(headline: string, image: string | null): string {
  if (image) {
    return `${imageBand(image)}
<tr><td style="padding:32px 32px 0">
<h1 style="margin:0;font:700 26px/1.25 ${SANS};color:${PINE}">${escapeHtml(headline)}</h1>
</td></tr>`;
  }
  return `<tr><td bgcolor="${PINE}" style="background:${PINE};border-radius:8px 8px 0 0;padding:38px 32px 34px">
<span style="display:inline-block;font:600 11px/1 ${MONO};letter-spacing:1.6px;text-transform:uppercase;color:${MINT}">GetAnyNumberOnline</span>
<div style="height:14px;line-height:14px">&nbsp;</div>
<h1 style="margin:0;font:700 27px/1.25 ${SANS};color:${PAPER}">${escapeHtml(headline)}</h1>
<div style="height:20px;line-height:20px">&nbsp;</div>
<div style="width:56px;height:3px;background:${MINT};line-height:3px;font-size:0">&nbsp;</div>
</td></tr>`;
}

/**
 * Weekly hero: quieter on purpose. A digest that shouts every week stops being
 * read; the mint rule and the dated eyebrow carry the brand instead.
 */
function weeklyHero(
  headline: string,
  dated: string,
  image: string | null,
): string {
  const eyebrow =
    `<span style="display:inline-block;font:600 11px/1 ${MONO};letter-spacing:1.6px;text-transform:uppercase;color:${LINK}">Weekly update &middot; ${
      escapeHtml(dated)
    }</span>`;

  if (image) {
    return `${imageBand(image)}
<tr><td style="padding:28px 32px 0">
${eyebrow}
<div style="height:12px;line-height:12px">&nbsp;</div>
<h1 style="margin:0;font:700 23px/1.3 ${SANS};color:${PINE}">${escapeHtml(headline)}</h1>
</td></tr>`;
  }

  return `<tr><td style="padding:0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td bgcolor="${MINT}" style="background:${MINT};height:4px;line-height:4px;font-size:0;border-radius:8px 8px 0 0">&nbsp;</td></tr>
<tr><td bgcolor="${PAPER}" style="background:${PAPER};padding:26px 32px 24px;border-bottom:1px solid ${LINE}">
${eyebrow}
<div style="height:12px;line-height:12px">&nbsp;</div>
<h1 style="margin:0;font:700 23px/1.3 ${SANS};color:${PINE}">${escapeHtml(headline)}</h1>
</td></tr>
</table>
</td></tr>`;
}

/** Plain header for `basic` — the wordmark, no hero. */
function basicHeader(): string {
  return `<tr><td style="padding:26px 32px 4px">
<a href="${SITE}" style="text-decoration:none">
<img src="${LOGO}" width="35" height="32" alt="GetAnyNumberOnline" style="display:block;width:35px;height:32px;border:0;outline:none">
</a>
</td></tr>`;
}

function footer(unsubUrl: string, to: string): string {
  const address = Deno.env.get("EMAIL_FOOTER_ADDRESS");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">
<tr><td bgcolor="${PINE}" style="background:${PINE};border-radius:8px;padding:24px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font:13px/1.6 ${SANS};color:${PAPER}" valign="top">
<strong style="font-weight:700">GetAnyNumberOnline</strong><br>
<a href="${SITE}" style="color:rgba(245,243,237,0.72);text-decoration:none">getanynumberonline.com</a>${
    address ? `<br><span style="color:rgba(245,243,237,0.6);font-size:12px">${escapeHtml(address)}</span>` : ""
  }
</td>
<td align="right" valign="top">
<a href="${INSTAGRAM}" aria-label="Instagram ${IG_HANDLE}" style="text-decoration:none">
<img src="${SITE}/images/email/instagram.png" width="24" height="24" alt="Instagram" title="Instagram ${IG_HANDLE}" style="display:inline-block;width:24px;height:24px;border:0;outline:none">
</a>
</td>
</tr></table>
<div style="height:18px;line-height:18px">&nbsp;</div>
<a href="${unsubUrl}" style="font:12px/1 ${SANS};color:rgba(245,243,237,0.75);text-decoration:underline">Unsubscribe</a>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:18px 12px 4px;font:11px/1.6 ${SANS};color:${MUTED}">
This email was sent to ${escapeHtml(to)} because you have an account at
getanynumberonline.com.<br>
Account and security email — password resets, order updates — is sent
separately and is not affected by unsubscribing.
</td></tr></table>`;
}

// ── The one renderer ─────────────────────────────────────────

/**
 * Light background on purpose. The product UI is near-black, but a dark email
 * body renders unpredictably across clients and trips spam heuristics — this
 * is the one place the design system's ground is not the right answer.
 */
export function renderEmail(
  content: EmailContent,
  opts: { unsubUrl: string; to: string; now?: Date },
): string {
  const template: EmailTemplate =
    content.template === "promo" || content.template === "weekly"
      ? content.template
      : "basic";

  const headline = (content.headline ?? "").trim() || content.subject;
  const preheader =
    (content.preheader ?? "").trim() || derivePreheader(content.body);
  const cta = safeUrl(content.ctaUrl);
  const ctaLabel = (content.ctaLabel ?? "").trim() || "Open GetAnyNumberOnline";

  const dated = (opts.now ?? new Date()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // A banner only belongs on the layouts that draw one, and only if it is a
  // real link — a broken image at the top of a campaign is the first thing
  // every recipient sees.
  const image = template === "basic" ? null : safeUrl(content.heroImage);

  const hero =
    template === "promo"
      ? promoHero(headline, image)
      : template === "weekly"
        ? weeklyHero(headline, dated, image)
        : basicHeader();

  // The wordmark sits above the card for the hero templates, matching the
  // reference layout; `basic` carries it inside the card instead.
  const brandBar =
    template === "basic"
      ? ""
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 4px 16px">
<a href="${SITE}" style="text-decoration:none">
<img src="${LOGO}" width="39" height="36" alt="GetAnyNumberOnline" style="display:block;width:39px;height:36px;border:0;outline:none">
</a>
</td></tr></table>`;

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%">
${preheaderBlock(preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td>
${brandBar}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${LINE};border-radius:8px">
${hero}
<tr><td style="padding:${image ? "18px" : "28px"} 32px 30px;font:15px/1.6 ${SANS};color:${INK}">
${renderBody(content.body)}
${cta ? button(ctaLabel, cta, false) : ""}
</td></tr>
</table>
${footer(opts.unsubUrl, opts.to)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function plainText(content: EmailContent, unsubUrl: string): string {
  const headline = (content.headline ?? "").trim();
  const cta = safeUrl(content.ctaUrl);
  const parts = [
    headline && headline !== content.subject ? `${headline}\n` : "",
    content.body.trim(),
    cta ? `\n${(content.ctaLabel ?? "Open").trim()}: ${cta}` : "",
    `\n---\nGetAnyNumberOnline — ${SITE}\nInstagram: ${INSTAGRAM}\nUnsubscribe: ${unsubUrl}`,
  ];
  return parts.filter(Boolean).join("\n");
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
  content: EmailContent,
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
      subject: content.subject,
      html: renderEmail(content, { unsubUrl: url, to: e.to }),
      text: plainText(content, url),
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
