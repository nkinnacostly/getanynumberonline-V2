// ============================================================
// Edge Function: get-esim-catalog
// POST /functions/v1/get-esim-catalog
//
// Body:
//   { }                            -> destinations (countries + regions + global)
//   { scope: "destinations" }      -> same
//   { location_code: "mexico" }    -> packages for one destination slug
//                                     (works for country, region AND global
//                                     slugs — SimJuno pre-groups them)
//
// Prices come back already marked up, so the client displays exactly what it
// will be charged. No DB access — a pure SimJuno proxy that keeps the API key
// server-side.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  listDestinations,
  listPackages,
  type EsimDestination,
  SimJunoError,
} from "../_shared/simjuno.ts";

interface DestinationBuckets {
  countries: EsimDestination[];
  regions: EsimDestination[];
  global: EsimDestination[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// SimJuno allows 8 req/s per key (and answers bursts with 403/429), while the
// catalog barely changes — so cache per isolate. Isolates are short-lived,
// which keeps this from going stale for long.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
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
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const body = await req.json().catch(() => ({}));
    const destinationSlug = typeof body?.location_code === "string"
      ? body.location_code.trim().toLowerCase()
      : "";

    // Packages for any destination slug — country, region or global.
    if (destinationSlug) {
      return jsonResponse({
        packages: await cached(`pkg:${destinationSlug}`, () =>
          listPackages(destinationSlug)),
      });
    }

    // Availability rides along with the destination list (the first call the
    // buy page makes) so the storefront can go "back soon" BEFORE anyone picks
    // a plan, rather than failing at checkout after a wallet debit.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const [dest, { data: status }] = await Promise.all([
      cached<DestinationBuckets>("destinations", async () => {
        const d = await listDestinations();
        return {
          countries: d.countries,
          regions: d.regions,
          global: d.globals,
        };
      }),
      supabaseAdmin
        .from("esim_provider_status")
        .select("available, note")
        .eq("provider", "simjuno")
        .maybeSingle(),
    ]);

    return jsonResponse({
      countries: dest.countries,
      regions: dest.regions,
      global: dest.global,
      // Default to available: a missing status row must not take the shop down.
      available: status?.available ?? true,
      unavailable_note: status?.available === false ? status.note : null,
    });
  } catch (err) {
    if (err instanceof SimJunoError) {
      console.error("get-esim-catalog provider error:", err.message);
      return errorResponse(
        "Could not load the eSIM catalog. Please try again.",
        err.httpStatus,
      );
    }
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
