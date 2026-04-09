// ============================================================
// Edge Function: poll-sms
// POST /functions/v1/poll-sms
//
// Called by the client every 5 seconds while waiting for OTP.
// Flow:
// 1. Verify user JWT
// 2. Validate they own this order
// 3. Check SMSPool for incoming SMS
// 4. If SMS arrived → write to DB (triggers Realtime to UI)
// 5. Return current status
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

  try {
    // --------------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // --------------------------------------------------------
    // 2. Get and validate the order
    // --------------------------------------------------------
    const { order_id } = await req.json()
    if (!order_id) return errorResponse('order_id is required', 400)

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, smspool_order_id, status, expires_at, cost')
      .eq('id', order_id)
      .single()

    if (orderError || !order) return errorResponse('Order not found', 404)

    // Security: user must own this order
    if (order.user_id !== user.id) return errorResponse('Forbidden', 403)

    // Already completed — return existing message
    if (order.status === 'active') {
      const { data: msg } = await supabase
        .from('messages')
        .select('code, full_sms, received_at')
        .eq('order_id', order_id)
        .order('received_at', { ascending: false })
        .limit(1)
        .single()

      return jsonResponse({ status: 'active', message: msg })
    }

    // Already cancelled/expired — stop polling
    if (['cancelled', 'expired', 'refunded'].includes(order.status)) {
      return jsonResponse({ status: order.status })
    }

    // Check if expired by time (cron may not have run yet)
    if (new Date(order.expires_at) < new Date()) {
      await supabase
        .from('orders')
        .update({ status: 'expired' })
        .eq('id', order.id)
      return jsonResponse({ status: 'expired' })
    }

    // --------------------------------------------------------
    // 3. Check SMSPool for incoming SMS
    // --------------------------------------------------------
    if (!order.smspool_order_id) {
      return jsonResponse({ status: 'pending' })
    }

    const smsPoolKey = Deno.env.get('SMSPOOL_API_KEY')!
    const checkData = new FormData()
    checkData.append('key', smsPoolKey)
    checkData.append('orderid', order.smspool_order_id)

    const checkRes = await fetch('https://api.smspool.net/sms/check', {
      method: 'POST',
      body: checkData,
    })
    const checkJson = await checkRes.json()

    // SMSPool status meanings:
    // status 1 = waiting for SMS
    // status 2 = SMS received (code in checkJson.sms or checkJson.full_sms)
    // status 3 = cancelled
    // status 4 = resent

    if (checkJson.status === 2 || checkJson.sms) {
      // ── SMS has arrived ──────────────────────────────────
      const fullSms = checkJson.full_sms ?? checkJson.sms ?? ''
      const code    = checkJson.sms ?? extractCode(fullSms)

      // Write to DB — this triggers Realtime push to the UI
      await supabase.rpc('deliver_sms_message', {
        p_order_id: order_id,
        p_user_id:  user.id,
        p_sender:   checkJson.sender ?? null,
        p_full_sms: fullSms,
        p_code:     code,
      })

      return jsonResponse({
        status:  'active',
        message: { code, full_sms: fullSms, received_at: new Date().toISOString() },
      })
    }

    // Still waiting
    return jsonResponse({ status: 'pending' })

  } catch (err) {
    console.error('poll-sms unhandled error:', err)
    return errorResponse('Internal server error', 500)
  }
})

// ── Extract OTP from full SMS text ───────────────────────────
// Looks for 4–8 digit sequences — covers most OTP formats
function extractCode(sms: string): string {
  const match = sms.match(/\b\d{4,8}\b/)
  return match ? match[0] : ''
}

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