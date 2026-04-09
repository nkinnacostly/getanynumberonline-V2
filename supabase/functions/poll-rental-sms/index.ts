// ============================================================
// Edge Function: poll-rental-sms
// POST /functions/v1/poll-rental-sms
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { rental_id } = await req.json();
    if (!rental_id) return errorResponse("rental_id is required", 400);

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .select("id, user_id, smspool_rental_code, status")
      .eq("id", rental_id)
      .single();

    if (rentalError || !rental) return errorResponse("Rental not found", 404);
    if (rental.user_id !== user.id) return errorResponse("Forbidden", 403);
    if (!rental.smspool_rental_code) {
      return errorResponse("Rental not ready — missing rental code", 400);
    }

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;
    const msgFd = new FormData();
    msgFd.append("key", smsPoolKey);
    msgFd.append("rental_code", rental.smspool_rental_code);

    const msgRes = await fetch("https://api.smspool.net/rental/retrieve_messages", {
      method: "POST",
      body: msgFd,
    });
    const msgJson = await msgRes.json();
    if (!msgRes.ok) {
      console.error("SMSPool retrieve_messages failed:", msgJson);
      return errorResponse("Could not fetch messages from SMSPool", 502);
    }

    const rawList: unknown[] = Array.isArray(msgJson)
      ? msgJson
      : Array.isArray(msgJson?.messages)
        ? msgJson.messages
        : Array.isArray(msgJson?.data)
          ? msgJson.data
          : [];

    const { data: existingRows } = await supabase
      .from("rental_messages")
      .select("full_sms, received_at")
      .eq("rental_id", rental_id);

    const existing = new Set(
      (existingRows ?? []).map((r) => keyFor(r.full_sms, r.received_at)),
    );

    for (const m of rawList) {
      const row = m as Record<string, unknown>;
      const full_sms = String(
        row.full_sms ?? row.message ?? row.sms ?? row.text ?? "",
      );
      const received_at = normalizeReceivedAt(
        row.received_at ?? row.time ?? row.date ?? row.timestamp,
      );
      const sender = row.sender != null ? String(row.sender) : null;
      const code = String(row.code ?? extractCode(full_sms));

      if (!full_sms) continue;

      const k = keyFor(full_sms, received_at);
      if (existing.has(k)) continue;

      const { data: ins, error: insErr } = await supabase
        .from("rental_messages")
        .insert({
          rental_id,
          user_id: user.id,
          sender,
          full_sms,
          code: code || extractCode(full_sms),
          received_at,
        })
        .select()
        .single();

      if (!insErr && ins) {
        existing.add(k);
      }
    }

    const { data: allMessages } = await supabase
      .from("rental_messages")
      .select("id, sender, full_sms, code, received_at")
      .eq("rental_id", rental_id)
      .order("received_at", { ascending: true });

    return jsonResponse({ messages: allMessages ?? [] });
  } catch (err) {
    console.error("poll-rental-sms unhandled error:", err);
    return errorResponse("Internal server error", 500);
  }
});

function keyFor(full_sms: string, received_at: string): string {
  return `${full_sms}||${received_at}`;
}

function normalizeReceivedAt(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === "number") {
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  const s = String(v);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

function extractCode(sms: string): string {
  const match = sms.match(/\b\d{4,8}\b/);
  return match ? match[0] : "";
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
