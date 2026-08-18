// ============================================================
// Shared fraud / velocity controls for the buy-flow Edge Functions.
//
// order-number and rent-number both have to answer the same two questions —
// "is this user ordering too fast?" and "does this order change how risky they
// look?" — so the logic lives here once rather than being pasted into each.
//
// Every function here is deliberately fail-OPEN. These are abuse controls, not
// correctness controls: if platform_settings is unreachable or an RPC errors,
// refusing to sell would turn a monitoring blip into an outage. A missed
// velocity check costs one order; a false 429 costs every order.
// ============================================================

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Supabase = ReturnType<typeof createClient>;

/** Used when platform_settings can't be read. Matches the seeded row. */
const DEFAULT_MAX_ORDERS_PER_HOUR = 10;

/**
 * Read one numeric lever from platform_settings.
 *
 * Service-role only (RLS on, no policies), so this must be called with the
 * service client — the caller's own client returns nothing.
 */
export async function getSetting(
  supabase: Supabase,
  key: string,
  fallback: number,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`getSetting(${key}) failed:`, error);
      return fallback;
    }
    const value = Number((data as { value?: number } | null)?.value);
    return Number.isFinite(value) ? value : fallback;
  } catch (err) {
    console.error(`getSetting(${key}) threw:`, err);
    return fallback;
  }
}

/**
 * Rolling-hour purchase velocity, counting orders AND rentals.
 *
 * Returns null when the user may proceed, or a ready-to-send message when they
 * are at or over the limit. One shared budget across both paths, so neither can
 * be used to sidestep the other. eSIMs are not counted — order-esim is not
 * gated by this check, and counting an unlimited purchase would throttle number
 * ordering for a reason the user cannot see.
 */
export async function checkVelocity(
  supabase: Supabase,
  userId: string,
): Promise<string | null> {
  try {
    const limit = await getSetting(
      supabase,
      "max_orders_per_hour",
      DEFAULT_MAX_ORDERS_PER_HOUR,
    );

    // A limit of zero would take the product offline; admin_update_setting
    // forbids it, but never trust a value read back from a table.
    if (!Number.isFinite(limit) || limit < 1) return null;

    const { data, error } = await supabase.rpc("check_order_velocity", {
      p_user_id: userId,
    });

    if (error) {
      console.error("check_order_velocity failed:", error);
      return null; // fail open
    }

    const recent = Number(data);
    if (!Number.isFinite(recent)) return null;

    if (recent >= limit) {
      console.error(
        `velocity block: user ${userId} has ${recent} order(s) in the last hour (limit ${limit})`,
      );
      return "Too many orders in a short time. Please wait before ordering again.";
    }
    return null;
  } catch (err) {
    console.error("checkVelocity threw:", err);
    return null;
  }
}

/**
 * Re-score the user after an order completes, flagging them for admin review
 * if their cancel/refund rate is now over the threshold. Flags only — never
 * bans.
 *
 * Fire-and-forget: the customer's response must not wait on it, and a failure
 * here must never fail their order. waitUntil keeps the isolate alive past the
 * response so the work actually finishes; without it the promise is dropped
 * when the function returns.
 */
export function evaluateFraudInBackground(
  supabase: Supabase,
  userId: string,
): void {
  const work = supabase
    .rpc("evaluate_user_fraud", { p_user_id: userId })
    .then(({ error }: { error: unknown }) => {
      if (error) console.error("evaluate_user_fraud failed:", error);
    })
    .catch((err: unknown) => console.error("evaluate_user_fraud threw:", err));

  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(work);
  }
  // No waitUntil available (local `functions serve`): the promise is left
  // running. It is not awaited either way — this must not delay the response.
}
