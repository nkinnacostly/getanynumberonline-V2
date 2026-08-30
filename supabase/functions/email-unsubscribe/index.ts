// ============================================================
// Edge Function: email-unsubscribe  (PUBLIC — no JWT)
// GET  /functions/v1/email-unsubscribe?u=<user_id>&t=<token>
// POST same URL — RFC 8058 one-click, called by Gmail/Yahoo directly
//
// Authenticated by an HMAC over the user id, not a session: the person
// clicking is in their mail client, and requiring a login to unsubscribe is
// both hostile and non-compliant.
//
// Deploy with --no-verify-jwt, or the gateway rejects the mailbox provider's
// one-click POST before this code runs.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyUnsubscribe } from "../_shared/email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

function page(title: string, message: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#F5F3ED;font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:440px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #E4E0D6;border-radius:8px;text-align:center">
<div style="font:700 18px/1 inherit;color:#0C2E22;margin-bottom:20px">getanynumberonline</div>
<h1 style="font-size:18px;margin:0 0 10px;color:${ok ? "#0F8A57" : "#B4231F"}">${title}</h1>
<p style="margin:0;color:#4A4A4A">${message}</p>
</div></body></html>`,
    { status: ok ? 200 : 400, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("u") ?? "";
    const token = url.searchParams.get("t") ?? "";

    if (!userId || !token || !(await verifyUnsubscribe(userId, token))) {
      // One-click callers get a status code, humans get a page.
      if (req.method === "POST") {
        return new Response("invalid", { status: 400, headers: cors });
      }
      return page(
        "Link not valid",
        "This unsubscribe link is incomplete or has been altered. Reply to any of our emails and we will remove you.",
        false,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await supabase.rpc("set_marketing_opt_out", {
      p_user_id: userId,
    });

    if (error) {
      console.error("ALERT unsubscribe failed for", userId, error);
      if (req.method === "POST") {
        return new Response("error", { status: 500, headers: cors });
      }
      return page("Something went wrong", "Please try again in a moment.", false);
    }

    // Gmail/Yahoo expect a plain 2xx from the one-click POST, not HTML.
    if (req.method === "POST") {
      return new Response("ok", { status: 200, headers: cors });
    }
    return page(
      "You're unsubscribed",
      "You won't receive marketing email from us again. Account and security emails — password resets and order updates — will still be sent.",
      true,
    );
  } catch (err) {
    console.error("email-unsubscribe unhandled error:", err);
    return page("Something went wrong", "Please try again in a moment.", false);
  }
});
