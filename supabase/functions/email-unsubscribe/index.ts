// ============================================================
// Edge Function: email-unsubscribe  (PUBLIC — no JWT)
//
// POST ?u=<user_id>&t=<token>  → performs the opt-out, answers a bare 2xx.
//   Two callers: Gmail/Yahoo's RFC 8058 one-click, and the /unsubscribe page
//   on the app domain, which calls this server-side.
//
// GET  ?u=…&t=…               → 302 to that page.
//   This function cannot render the confirmation itself: Supabase's gateway
//   rewrites Content-Type to text/plain, so an HTML body arrives as source.
//   Verified against the deployed function — a custom header passed through
//   untouched while content-type did not.
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

function appUrl(): string {
  return (Deno.env.get("APP_URL") ?? "https://www.getanynumberonline.com")
    .replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";

  // A human followed the link. Send them to the page that can actually render.
  if (req.method === "GET") {
    const q = `?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
    return new Response(null, {
      status: 302,
      headers: { ...cors, Location: `${appUrl()}/unsubscribe${q}` },
    });
  }

  try {
    if (!userId || !token || !(await verifyUnsubscribe(userId, token))) {
      return new Response("invalid", { status: 400, headers: cors });
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
      return new Response("error", { status: 500, headers: cors });
    }

    // Mailbox providers expect a bare 2xx from one-click, not a document.
    return new Response("ok", { status: 200, headers: cors });
  } catch (err) {
    console.error("email-unsubscribe unhandled error:", err);
    return new Response("error", { status: 500, headers: cors });
  }
});
