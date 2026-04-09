// ============================================================
// Edge Function: cancel-order
// POST /functions/v1/cancel-order
//
// Flow:
// 1. Verify user JWT + order ownership
// 2. Only allow cancellation of 'pending' orders
// 3. Cancel with SMSPool
// 4. Refund balance
// 5. Update order status
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
    // 2. Validate the order
    // --------------------------------------------------------
    const { order_id } = await req.json()
    if (!order_id) return errorResponse('order_id is required', 400)

    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, smspool_order_id, status, cost, service_name, country_name')
      .eq('id', order_id)
      .single()

    if (!order) return errorResponse('Order not found', 404)
    if (order.user_id !== user.id) return errorResponse('Forbidden', 403)

    // Can only cancel pending orders
    if (order.status !== 'pending') {
      return errorResponse(
        `Cannot cancel an order with status: ${order.status}`,
        400
      )
    }

    // --------------------------------------------------------
    // 3. Cancel with SMSPool
    // SMSPool cancel returns { success: 1 } or { success: 0 }
    // We proceed with our refund regardless — SMSPool may
    // already have expired the number on their end
    // --------------------------------------------------------
    let smsPoolCancelled = false

    if (order.smspool_order_id) {
      const smsPoolKey = Deno.env.get('SMSPOOL_API_KEY')!
      const cancelData = new FormData()
      cancelData.append('key', smsPoolKey)
      cancelData.append('orderid', order.smspool_order_id)

      try {
        const cancelRes = await fetch('https://api.smspool.net/sms/cancel', {
          method: 'POST',
          body: cancelData,
        })
        const cancelJson = await cancelRes.json()
        smsPoolCancelled = cancelJson.success === 1
      } catch (e) {
        // SMSPool unreachable — still mark our side as cancelled
        console.error('SMSPool cancel call failed:', e)
      }
    }

    // --------------------------------------------------------
    // 4. Update order status to cancelled
    // --------------------------------------------------------
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order_id)

    // --------------------------------------------------------
    // 5. Refund the balance
    // --------------------------------------------------------
    await supabase.rpc('credit_balance', {
      p_user_id:  user.id,
      p_amount:   order.cost,
      p_type:     'refund',
      p_order_id: order_id,
      p_note:     `Refund: cancelled order (${order.service_name}, ${order.country_name})`,
    })

    return jsonResponse({
      success: true,
      refunded: order.cost,
      smspool_cancelled: smsPoolCancelled,
    })

  } catch (err) {
    console.error('cancel-order unhandled error:', err)
    return errorResponse('Internal server error', 500)
  }
})

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