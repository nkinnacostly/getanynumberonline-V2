// ============================================================
// Edge Function: get-esim-catalog
// POST /functions/v1/get-esim-catalog
//
// Body:
//   { }                            -> destinations (countries + regions)
//   { scope: "destinations" }      -> same
//   { location_code: "US" }        -> packages covering one country
//   { scope: "regional" }          -> regional packages, grouped by coverage
//   { scope: "global" }            -> global packages
//
// Prices come back already marked up, so the client displays exactly what it
// will be charged. No DB access — a pure eSIM Access proxy that keeps the
// AccessCode server-side.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callEsimAccess,
  EsimAccessError,
  type EsimDestination,
  type EsimPackage,
  shapeDestination,
  shapePackage,
} from "../_shared/esimaccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// eSIM Access allows 8 req/s for the whole account and the catalog barely
// changes, so cache per isolate. Isolates are short-lived, which keeps this
// from going stale for long.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function loadPackages(locationCode: string): Promise<EsimPackage[]> {
  return cached(`pkg:${locationCode}`, async () => {
    const obj = await callEsimAccess<
      { packageList?: Record<string, unknown>[] }
    >("package/list", { locationCode, type: "BASE" });
    return (obj.packageList ?? [])
      .map(shapePackage)
      .filter((p) => p.code && p.raw_price > 0)
      .sort((a, b) => a.price - b.price);
  });
}

async function loadDestinations(): Promise<EsimDestination[]> {
  return cached("destinations", async () => {
    const obj = await callEsimAccess<
      { locationList?: Record<string, unknown>[] }
    >("location/list", {});
    return (obj.locationList ?? [])
      .map(shapeDestination)
      .filter((d) => d.code && d.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

/**
 * Regional packages all come back from one `!RG` call, so they have to be
 * grouped client-side.
 *
 * The grouping key is the package's own `locationCode` ('NA-3', 'EU-42'), which
 * resolves against location/list for a human name. NOT `description` — that is
 * per-package ("Europe 3GB 30Days"), so grouping on it yields one group per
 * package (286 groups for 286 packages) instead of the ~33 real regions.
 */
function groupRegional(
  packages: EsimPackage[],
  destinations: EsimDestination[],
) {
  const names = new Map(destinations.map((d) => [d.code, d]));
  const groups = new Map<string, {
    key: string;
    label: string;
    location_codes: string[];
    from_price: number;
    packages: EsimPackage[];
  }>();

  for (const p of packages) {
    const key = p.location_code || p.location_codes.join(",");
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.packages.push(p);
      existing.from_price = Math.min(existing.from_price, p.price);
      // Widest coverage in the group wins as the region's country list.
      if (p.location_codes.length > existing.location_codes.length) {
        existing.location_codes = p.location_codes;
      }
    } else {
      const dest = names.get(key);
      groups.set(key, {
        key,
        label: dest?.name || p.description.trim() ||
          `${p.location_codes.length} countries`,
        location_codes: dest?.sub_locations.length
          ? dest.sub_locations.map((s) => s.code)
          : p.location_codes,
        from_price: p.price,
        packages: [p],
      });
    }
  }

  // Widest coverage first — that is what people scanning a regional list want.
  return [...groups.values()].sort((a, b) =>
    a.location_codes.length === b.location_codes.length
      ? a.label.localeCompare(b.label)
      : b.location_codes.length - a.location_codes.length
  );
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
    const scope = typeof body?.scope === "string" ? body.scope.trim() : "";
    const locationCode = typeof body?.location_code === "string"
      ? body.location_code.trim().toUpperCase()
      : "";

    if (scope === "global") {
      return jsonResponse({ packages: await loadPackages("!GL") });
    }

    if (scope === "regional") {
      const [regionalPackages, destinations] = await Promise.all([
        loadPackages("!RG"),
        loadDestinations(),
      ]);
      return jsonResponse({
        groups: groupRegional(regionalPackages, destinations),
      });
    }

    if (locationCode) {
      return jsonResponse({ packages: await loadPackages(locationCode) });
    }

    // Availability rides along with the destination list (the first call the
    // buy page makes) so the storefront can go "back soon" BEFORE anyone picks
    // a plan, rather than failing at checkout after a wallet debit.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const [destinations, { data: status }] = await Promise.all([
      loadDestinations(),
      supabaseAdmin
        .from("esim_provider_status")
        .select("available, note")
        .eq("provider", "esimaccess")
        .maybeSingle(),
    ]);

    return jsonResponse({
      countries: destinations.filter((d) => d.kind === "country"),
      regions: destinations.filter((d) => d.kind === "region"),
      // Default to available: a missing status row must not take the shop down.
      available: status?.available ?? true,
      unavailable_note: status?.available === false ? status.note : null,
    });
  } catch (err) {
    if (err instanceof EsimAccessError) {
      console.error("get-esim-catalog provider error:", err.code, err.message);
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
