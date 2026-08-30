// ============================================================
// Edge Function: resend-webhook  (PUBLIC — no JWT)
// POST /functions/v1/resend-webhook
//
// Receives delivery, open, click, bounce and complaint events from Resend and
// records them against the delivery row, joining on data.email_id — the id
// Resend returned when we sent, stored as email_deliveries.provider_id.
//
// Signed with Svix. Verified by hand rather than with the SDK, which is
// npm-only: signed content is `${svix-id}.${svix-timestamp}.${raw body}`,
// HMAC-SHA256 with the base64-decoded half of the whsec_ secret, compared
// constant-time against the v1 entries in svix-signature.
//
// Deploy with --no-verify-jwt — Resend sends a signature, not a Supabase JWT.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature",
};

/** Replay window. Svix's own default. */
const TOLERANCE_SECONDS = 300;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

/** Length-independent compare, so a signature can't be guessed byte by byte. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySvix(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
  header: string,
): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    console.error("resend-webhook: timestamp outside tolerance");
    return false;
  }

  const keyBytes = base64ToBytes(secret.replace(/^whsec_/, ""));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = `${id}.${timestamp}.${rawBody}`;
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signed),
  );
  const expected = bytesToBase64(mac);

  // The header carries space-separated `v<n>,<sig>` entries; any v1 match wins.
  return header
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => constantTimeEqual(part.slice(3), expected));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  try {
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!secret) {
      console.error("ALERT RESEND_WEBHOOK_SECRET is not configured");
      return new Response("not configured", { status: 500, headers: cors });
    }

    const id = req.headers.get("svix-id") ?? "";
    const timestamp = req.headers.get("svix-timestamp") ?? "";
    const signature = req.headers.get("svix-signature") ?? "";

    // Read the body ONCE as raw text. Parsing first and re-serialising would
    // change bytes and break the signature.
    const rawBody = await req.text();

    if (!id || !timestamp || !signature) {
      return new Response("missing signature headers", { status: 400, headers: cors });
    }
    if (!(await verifySvix(secret, id, timestamp, rawBody, signature))) {
      console.error("resend-webhook: signature verification failed");
      return new Response("invalid signature", { status: 401, headers: cors });
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      created_at?: string;
      data?: { email_id?: string };
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("record_email_event", {
      p_svix_id: id,
      p_email_id: event.data?.email_id ?? null,
      p_type: event.type ?? "unknown",
      p_at: event.created_at ?? null,
      p_detail: event.data ?? {},
    });

    if (error) {
      console.error("ALERT record_email_event failed:", error);
      // 500 so Svix retries — losing a bounce or complaint silently is how a
      // dead address stays on the list.
      return new Response("error", { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("resend-webhook unhandled error:", err);
    return new Response("error", { status: 500, headers: cors });
  }
});
