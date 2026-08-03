// ============================================================
// Edge Function: get-esim-catalog
// POST /functions/v1/get-esim-catalog
// Body:
//   { }                      -> list countries (esim/pricing)
//   { country: "US" }        -> list plans for a country (esim/plans)
// Optional for countries: { start, length, search }
//
// Prices are returned already marked up, so the client shows exactly what it
// will be charged (display == charge). No DB access — pure SMSPool proxy.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shapeCountry, shapePlan } from "../_shared/esim.ts";

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

    const body = await req.json().catch(() => ({}));
    const country =
      typeof body?.country === "string" ? body.country.trim() : "";

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;

    // ── Plans for a country ──────────────────────────────────
    if (country) {
      const fd = new FormData();
      fd.append("key", smsPoolKey);
      fd.append("country", country);
      const res = await fetch("https://api.smspool.net/esim/plans", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("esim/plans failed:", json);
        return errorResponse("Could not load eSIM plans", 502);
      }
      const rows: Record<string, unknown>[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : [];
      return jsonResponse({ plans: rows.map(shapePlan) });
    }

    // ── Country list ─────────────────────────────────────────
    const fd = new FormData();
    fd.append("key", smsPoolKey);
    if (body?.start !== undefined) fd.append("start", String(body.start));
    if (body?.length !== undefined) fd.append("length", String(body.length));
    if (body?.search) fd.append("Search", String(body.search));

    const res = await fetch("https://api.smspool.net/esim/pricing", {
      method: "POST",
      body: fd,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("esim/pricing failed:", json);
      return errorResponse("Could not load eSIM countries", 502);
    }
    const rows: Record<string, unknown>[] = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
        ? json
        : [];
    return jsonResponse({ countries: rows.map(shapeCountry) });
  } catch (err) {
    console.error("get-esim-catalog unhandled error:", err);
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
