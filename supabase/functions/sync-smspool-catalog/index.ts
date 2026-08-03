// ============================================================
// Edge Function: sync-smspool-catalog  (maintenance / cron)
//
// Seeds the smspool_services + smspool_countries lookup tables from SMSPool's
// catalog, then runs backfill_reference_names() to repair historical orders /
// rentals whose *_name columns hold numeric IDs. Idempotent — safe to re-run.
//
// PROTECTED: caller must send header  x-reconcile-secret: <RECONCILE_SECRET>
//   supabase secrets set RECONCILE_SECRET=<a-long-random-string>
//   curl -X POST "https://<proj>.supabase.co/functions/v1/sync-smspool-catalog" \
//     -H "x-reconcile-secret: <RECONCILE_SECRET>" \
//     -H "apikey: <anon-key>"
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CATALOG, fetchCatalogByKind } from "../_shared/smspool-names.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Gate: shared admin secret ────────────────────────────
    const secret = Deno.env.get("RECONCILE_SECRET");
    if (!secret || req.headers.get("x-reconcile-secret") !== secret) {
      return errorResponse("Forbidden", 403);
    }

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Seed both catalogs ───────────────────────────────────
    const seeded: Record<string, number> = {};
    for (const kind of ["service", "country"] as const) {
      const rows = await fetchCatalogByKind(smsPoolKey, kind);
      if (rows.length === 0) {
        return errorResponse(`SMSPool returned no ${kind} catalog`, 502);
      }
      const stamp = new Date().toISOString();
      const { error } = await supabase
        .from(CATALOG[kind].table)
        .upsert(
          rows.map((r) => ({ id: r.id, name: r.name, updated_at: stamp })),
          { onConflict: "id" },
        );
      if (error) {
        console.error(`upsert ${CATALOG[kind].table} failed:`, error);
        return errorResponse(`Failed to seed ${kind} catalog`, 500);
      }
      seeded[kind] = rows.length;
    }

    // ── Backfill historical rows ─────────────────────────────
    const { data: backfill, error: backfillErr } = await supabase.rpc(
      "backfill_reference_names",
    );
    if (backfillErr) {
      console.error("backfill_reference_names failed:", backfillErr);
      return errorResponse("Seeded catalog but backfill failed", 500);
    }

    return jsonResponse({ success: true, seeded, backfill });
  } catch (err) {
    console.error("sync-smspool-catalog unhandled error:", err);
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
