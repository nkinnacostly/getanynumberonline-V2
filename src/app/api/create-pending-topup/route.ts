import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidTopup, TOPUP_MAX, TOPUP_MIN } from "@/lib/wallet";

/**
 * Pre-flight for a wallet top-up: called before the Flutterwave modal opens.
 *
 * Its job is to enforce the minimum FIRST deposit. That rule cannot live in the
 * client — the amount and "is this my first top-up?" would both be the caller's
 * word — so the decision is made in Postgres by check_first_topup_minimum,
 * which reads auth.uid() itself and answers from the ledger.
 *
 * Why an RPC rather than the service role: platform_settings is service-role
 * only (RLS on, no policies), and Vercel deliberately holds no service-role key
 * (CLAUDE.md §6). A SECURITY DEFINER function answers this one question without
 * putting that key in Vercel or opening the settings table to clients.
 *
 * Blocking here is a real gate, not decoration: nothing credits a balance
 * except /api/verify-payment and the webhook, both of which re-verify against
 * Flutterwave. Skipping this route only skips the friendly error.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const amount = Number(body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "A valid amount is required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // The wallet's own range still applies on the server; the client checks it
    // too, but that check is advisory.
    if (!isValidTopup(amount)) {
      return NextResponse.json(
        { error: `Amount must be between $${TOPUP_MIN} and $${TOPUP_MAX}.` },
        { status: 400 },
      );
    }

    // A banned user should not be able to fund an account they can't spend from.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_banned) {
      return NextResponse.json({ error: "Account suspended" }, { status: 403 });
    }

    const { data, error } = await supabase.rpc("check_first_topup_minimum", {
      p_amount: amount,
    });

    if (error) {
      // Fail OPEN. This is an anti-abuse minimum, not a correctness control —
      // a settings read failing must not stop paying customers from topping up.
      console.error("check_first_topup_minimum failed:", error);
      return NextResponse.json({ ok: true, checked: false });
    }

    const result = data as {
      allowed: boolean;
      is_first: boolean;
      min_first_deposit: number;
    } | null;

    if (result && !result.allowed) {
      const min = Number(result.min_first_deposit);
      return NextResponse.json(
        {
          error: `Minimum first deposit is $${min.toFixed(2)}.`,
          min_first_deposit: min,
          is_first: true,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      checked: true,
      is_first: result?.is_first ?? false,
    });
  } catch (err) {
    console.error("create-pending-topup unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
