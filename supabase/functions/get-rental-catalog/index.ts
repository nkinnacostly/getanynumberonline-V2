// ============================================================
// Edge Function: get-rental-catalog
// POST /functions/v1/get-rental-catalog
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

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;
    const formData = new FormData();
    formData.append("key", smsPoolKey);
    formData.append("type", "1");

    const res = await fetch("https://api.smspool.net/rental/retrieve_all", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("SMSPool retrieve_all failed:", data);
      return errorResponse("Could not load rental catalog", 502);
    }

    return jsonResponse(data);
  } catch (err) {
    console.error("get-rental-catalog unhandled error:", err);
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
