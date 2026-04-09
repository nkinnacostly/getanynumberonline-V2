import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { transaction_id, tx_ref } = await request.json();
    if (!transaction_id || !tx_ref) {
      console.error("verify-payment: Missing params", {
        transaction_id,
        tx_ref,
      });
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const parts = tx_ref.split("_");
    if (parts[0] !== "topup") {
      console.error("verify-payment: Invalid tx_ref", tx_ref);
      return NextResponse.json({ error: "Invalid tx_ref" }, { status: 400 });
    }
    const userId = parts.slice(1, -1).join("_");

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("provider_ref", tx_ref)
      .single();

    if (existing?.status === "completed") {
      return NextResponse.json({ success: true, already_processed: true });
    }

    console.log("verify-payment: Verifying with Flutterwave", {
      transaction_id,
      tx_ref,
      userId,
    });

    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      },
    );
    const verifyData = await verifyRes.json();

    console.log(
      "verify-payment: Flutterwave response",
      JSON.stringify(verifyData, null, 2),
    );

    if (
      verifyData.status !== "success" ||
      verifyData.data?.status !== "successful" ||
      verifyData.data?.tx_ref !== tx_ref
    ) {
      console.error("verify-payment: Verification failed", {
        verifyData,
        expected_tx_ref: tx_ref,
      });
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 400 },
      );
    }

    const amount = parseFloat(verifyData.data.amount);

    const { error: creditError } = await supabase.rpc("credit_balance", {
      p_user_id: userId,
      p_amount: amount,
      p_type: "topup",
      p_order_id: null,
      p_provider: "flutterwave",
      p_provider_ref: tx_ref,
      p_note: `Wallet top-up: $${amount}`,
    });

    if (creditError) {
      return NextResponse.json(
        { error: "Failed to credit balance" },
        { status: 500 },
      );
    }

    await supabase
      .from("transactions")
      .update({ status: "completed" })
      .eq("provider_ref", tx_ref);

    return NextResponse.json({ success: true, amount });
  } catch (error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
