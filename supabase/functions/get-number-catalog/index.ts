// ============================================================
// Edge Function: get-number-catalog
// POST /functions/v1/get-number-catalog
//
// Body:
//   { }                                  -> { services, countries }
//   { scope: "catalog" }                 -> same
//   { country: "1", service: "395" }     -> { price, success_rate }
//
// Why this exists: OrderForm used to call api.smspool.net straight from the
// browser. That is forbidden by CLAUDE.md §9, and it also stopped working —
// SMSPool answers a cross-origin request with Access-Control-Allow-Methods and
// Access-Control-Allow-Headers but NO Access-Control-Allow-Origin, so every
// browser blocks the response. Nothing client-side can fix that; the call has
// to happen server-side, which is where it belonged anyway.
//
// `price` comes back ALREADY MARKED UP (§12), so the number the form shows is
// the number order-number deducts — it re-fetches and applies the same
// formula at purchase time, so the two cannot drift.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CatalogItem {
  ID: string;
  name: string;
}

/**
 * The same tiered markup as order-number and src/lib/pricing.ts.
 *
 * Deliberately duplicated rather than imported: Edge Functions bundle from
 * `_shared/`, which cannot reach into `src/`, and order-number already keeps
 * its own copy for the same reason. §12 is the contract that keeps the three
 * in step — change one, change all three.
 */
function applyMarkup(rawPrice: number): number {
  let markup: number;
  if (rawPrice < 0.1) markup = 0.4;
  else if (rawPrice <= 0.3) markup = 0.3;
  else markup = 0.2;
  return Math.ceil(rawPrice * (1 + markup) * 100) / 100;
}

// The service and country lists change rarely and every dashboard visit asks
// for them, so cache per isolate. Isolates are short-lived, which keeps this
// from going stale for long.
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: { services: CatalogItem[]; countries: CatalogItem[] } } | null =
  null;

/** SMSPool returns either a bare array or an object wrapping one. */
function extractList(json: unknown, keys: string[]): CatalogItem[] {
  const raw = Array.isArray(json)
    ? json
    : json && typeof json === "object"
      ? (keys
          .map((k) => (json as Record<string, unknown>)[k])
          .find(Array.isArray) as unknown[] | undefined) ?? []
      : [];

  return (raw as Record<string, unknown>[])
    .map((r) => ({
      ID: String(r.ID ?? r.id ?? ""),
      name: String(r.name ?? ""),
    }))
    .filter((r) => r.ID !== "" && r.name !== "");
}

async function smsPool(
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  const body = new FormData();
  for (const [k, v] of Object.entries(params)) body.append(k, v);

  const res = await fetch(`https://api.smspool.net/${endpoint}`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(`SMSPool ${endpoint} failed with status ${res.status}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Signed-in callers only, matching get-esim-catalog. The data is not
    // secret — the public pricing pages render the same numbers server-side —
    // but an unauthenticated proxy is a free rate-limit sink pointed at our
    // SMSPool key.
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

    const smsPoolKey = Deno.env.get("SMSPOOL_API_KEY");
    if (!smsPoolKey) {
      // Loud, not silent: a missing secret otherwise reads as an empty
      // dropdown, which looks like SMSPool having no services.
      console.error("ALERT get-number-catalog: SMSPOOL_API_KEY is not set");
      return errorResponse("Number catalog is temporarily unavailable", 503);
    }

    const body = (await req.json().catch(() => ({}))) as {
      scope?: string;
      country?: string;
      service?: string;
    };

    // ── One price ───────────────────────────────────────────
    if (body.country && body.service) {
      const json = (await smsPool("request/price", {
        key: smsPoolKey,
        country: String(body.country),
        service: String(body.service),
      })) as { price?: string | number; success_rate?: string | number };

      const raw = parseFloat(String(json?.price ?? ""));
      return jsonResponse({
        price: Number.isFinite(raw) ? applyMarkup(raw) : null,
        success_rate:
          json?.success_rate != null
            ? parseFloat(String(json.success_rate))
            : null,
      });
    }

    // ── The two lists ───────────────────────────────────────
    if (cache && Date.now() - cache.at < TTL_MS) {
      return jsonResponse(cache.data);
    }

    const [svcJson, ctyJson] = await Promise.all([
      smsPool("service/retrieve_all", { key: smsPoolKey }),
      smsPool("country/retrieve_all", { key: smsPoolKey }),
    ]);

    const data = {
      services: extractList(svcJson, ["services", "data"]),
      countries: extractList(ctyJson, ["countries", "data"]),
    };

    // Only cache a usable answer — caching an empty list would hold the
    // dropdown empty for ten minutes after a transient upstream blip.
    if (data.services.length > 0 && data.countries.length > 0) {
      cache = { at: Date.now(), data };
    }

    return jsonResponse(data);
  } catch (err: unknown) {
    console.error("unhandled error:", err);
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
