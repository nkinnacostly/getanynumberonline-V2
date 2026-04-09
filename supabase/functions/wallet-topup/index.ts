// ============================================================
// Edge Function: wallet-topup
// Two endpoints in one function:
//
// POST /functions/v1/wallet-topup/initiate
//   → Called by client to start a Flutterwave payment
//   → Returns a payment link URL
//
// POST /functions/v1/wallet-topup/webhook
//   → Called by Flutterwave after payment completes
//   → Verifies payment, credits user balance
//
// Flutterwave webhook setup:
//   Dashboard → Settings → Webhooks
//   URL: https://your-project.supabase.co/functions/v1/wallet-topup
//   Secret hash: set as FLUTTERWAVE_WEBHOOK_SECRET in Edge Function secrets
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  if (action === 'initiate') {
    return handleInitiate(req)
  }

  // Default: treat all other POST as webhook
  return handleWebhook(req)
})


// ============================================================
// INITIATE — client calls this to get a payment link
// ============================================================
async function handleInitiate(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', 401)

    const { amount } = await req.json()

    // Minimum top-up $1, maximum $500
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 500) {
      return errorResponse('Amount must be between $1 and $500', 400)
    }

    const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY')!
    const txRef = `topup_${user.id}_${Date.now()}`

    const payload = {
      tx_ref:       txRef,
      amount:       parsedAmount,
      currency:     'USD',
      redirect_url: `${Deno.env.get('APP_URL')}/dashboard?topup=success`,
      customer: {
        email: user.email,
      },
      customizations: {
        title:       'Wallet Top-up',
        description: 'Add funds to your SMS verification wallet',
      },
      meta: {
        user_id: user.id,
      },
    }

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${flwSecret}`,
      },
      body: JSON.stringify(payload),
    })

    const flwJson = await flwRes.json()

    if (flwJson.status !== 'success') {
      console.error('Flutterwave initiate failed:', flwJson)
      return errorResponse('Failed to initiate payment', 502)
    }

    // Create a pending transaction record
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get current balance for snapshot
    const { data: profile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single()

    await supabase.from('transactions').insert({
      user_id:        user.id,
      type:           'topup',
      amount:         parsedAmount,
      balance_before: profile?.balance ?? 0,
      balance_after:  profile?.balance ?? 0, // updated on webhook success
      provider:       'flutterwave',
      provider_ref:   txRef,
      status:         'pending',
      note:           `Wallet top-up: $${parsedAmount}`,
    })

    return jsonResponse({
      success:      true,
      payment_link: flwJson.data.link,
      tx_ref:       txRef,
    })

  } catch (err) {
    console.error('wallet-topup/initiate error:', err)
    return errorResponse('Internal server error', 500)
  }
}


// ============================================================
// WEBHOOK — Flutterwave calls this when payment completes
// ============================================================
async function handleWebhook(req: Request) {
  try {
    // ── Verify webhook authenticity ──────────────────────────
    const webhookSecret = Deno.env.get('FLUTTERWAVE_WEBHOOK_SECRET')
    const signature     = req.headers.get('verif-hash')

    if (!webhookSecret || signature !== webhookSecret) {
      console.error('Invalid webhook signature')
      return new Response('Forbidden', { status: 403 })
    }

    const event = await req.json()

    // Only process successful charge events
    if (event.event !== 'charge.completed' || event.data?.status !== 'successful') {
      return new Response('OK', { status: 200 })
    }

    const { tx_ref, amount, currency, id: flwTransactionId } = event.data
    const userId = event.data?.meta?.user_id

    if (!tx_ref || !userId) {
      console.error('Webhook missing tx_ref or user_id:', event)
      return new Response('Bad payload', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Idempotency: check if already processed ──────────────
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('provider_ref', tx_ref)
      .single()

    if (existingTx?.status === 'completed') {
      // Already credited — Flutterwave sometimes sends duplicate webhooks
      return new Response('OK', { status: 200 })
    }

    // ── Verify with Flutterwave directly (never trust webhook alone) ──
    const flwSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY')!
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${flwTransactionId}/verify`,
      { headers: { Authorization: `Bearer ${flwSecret}` } }
    )
    const verifyJson = await verifyRes.json()

    if (
      verifyJson.data?.status !== 'successful' ||
      verifyJson.data?.tx_ref !== tx_ref
    ) {
      console.error('Flutterwave verification failed:', verifyJson)
      return new Response('Verification failed', { status: 400 })
    }

    const verifiedAmount = parseFloat(verifyJson.data.amount)

    // ── Credit the balance ───────────────────────────────────
    await supabase.rpc('credit_balance', {
      p_user_id:      userId,
      p_amount:       verifiedAmount,
      p_type:         'topup',
      p_order_id:     null,
      p_provider:     'flutterwave',
      p_provider_ref: tx_ref,
      p_note:         `Wallet top-up: $${verifiedAmount} ${currency}`,
    })

    // ── Update the pending transaction to completed ──────────
    await supabase
      .from('transactions')
      .update({
        status:          'completed',
        balance_after:   verifyJson.data.amount, // will be slightly off, acceptable
        provider_meta:   verifyJson.data,
      })
      .eq('provider_ref', tx_ref)

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('wallet-topup/webhook error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}


// ── Helpers ──────────────────────────────────────────────────
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}