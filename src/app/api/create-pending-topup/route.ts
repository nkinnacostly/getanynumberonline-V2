import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { tx_ref, amount } = await request.json();
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "topup",
      amount,
      balance_before: profile?.balance ?? 0,
      balance_after: profile?.balance ?? 0,
      provider: "flutterwave",
      provider_ref: tx_ref,
      status: "pending",
      note: `Wallet top-up: $${amount}`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
