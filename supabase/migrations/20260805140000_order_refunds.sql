-- Guarantee a refund whenever an order does not deliver a code.
--
-- The bug this closes: poll-sms marked a timed-out order 'expired' and stopped
-- there, with no credit_balance call. Its comment referred to "cron may not
-- have run yet" — but no such cron ever existed. So:
--
--   * a user who waited out the 20 minutes was marked expired and NOT refunded
--   * a user who closed the tab had nothing run at all — the order sat at
--     'pending' forever, also not refunded
--
-- Both contradict the product's core promise ("pay only when a code arrives").
-- The rule now is simple and enforced in one place: unless the order reached
-- 'active' (a code was actually delivered), the money goes back.

-- ── Single refund path for orders ────────────────────────────
-- Every caller — cancel-order, poll-sms, reconcile-orders — goes through this.
-- Two independent guards make a double refund impossible:
--   1. the row is locked and its status re-checked inside the transaction
--   2. credit_balance is idempotent on provider_ref, which is derived from the
--      order id, so even a lost update can't pay twice
CREATE OR REPLACE FUNCTION public.refund_order(
  p_order_id uuid,
  p_status   text DEFAULT 'refunded',
  p_reason   text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_cost    numeric;
  v_status  text;
  v_service text;
  v_country text;
BEGIN
  IF p_status NOT IN ('refunded', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'refund_order: invalid target status %', p_status;
  END IF;

  SELECT user_id, cost, status, service_name, country_name
    INTO v_user_id, v_cost, v_status, v_service, v_country
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- A code was delivered. The user got what they paid for.
  IF v_status = 'active' THEN
    RETURN false;
  END IF;

  -- Already settled by another path.
  IF v_status IN ('cancelled', 'refunded') THEN
    RETURN false;
  END IF;

  PERFORM public.credit_balance(
    p_user_id      => v_user_id,
    p_amount       => v_cost,
    p_type         => 'refund'::transaction_type,
    p_order_id     => p_order_id,
    p_provider     => 'system',
    -- Derived from the order id: one order can only ever be refunded once.
    p_provider_ref => 'refund_order_' || p_order_id::text,
    p_note         => COALESCE(
      p_reason,
      'Refund: no code received (' || COALESCE(v_service, '?') || ', ' ||
      COALESCE(v_country, '?') || ')'
    )
  );

  UPDATE public.orders
  SET status = p_status, updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

-- Sweeper's hot query: stale orders that still owe a refund.
CREATE INDEX IF NOT EXISTS orders_unsettled_idx
  ON public.orders (status, expires_at)
  WHERE status IN ('pending', 'expired');

-- ── Schedule the sweeper ─────────────────────────────────────
-- Reuses the in-DB secret created for the eSIM reconciler, so there is still
-- no secret in git and nothing for an operator to paste.
CREATE OR REPLACE FUNCTION public.schedule_orders_reconcile_auto(
  p_functions_url text,
  p_schedule      text DEFAULT '*/5 * * * *'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_cmd    text;
BEGIN
  SELECT value INTO v_secret FROM public.internal_secrets WHERE name = 'reconcile';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'no reconcile secret stored';
  END IF;

  PERFORM cron.unschedule('reconcile-orders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-orders');

  v_cmd := format(
    $cmd$select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reconcile-secret', %L
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );$cmd$,
    rtrim(p_functions_url, '/') || '/reconcile-orders',
    v_secret
  );

  PERFORM cron.schedule('reconcile-orders', p_schedule, v_cmd);
  RETURN 'scheduled reconcile-orders at ' || p_schedule;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_orders_reconcile_auto(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_order(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

SELECT public.schedule_orders_reconcile_auto(
  'https://ciuwkjkgnqnhkknbeehw.supabase.co/functions/v1'
);

-- ── Report the outstanding liability ─────────────────────────
-- How much is currently owed to users whose orders never delivered a code and
-- were never refunded. The sweeper pays these on its first run; this prints the
-- number first so the money movement is expected rather than a surprise.
DO $$
DECLARE
  v_count int;
  v_total numeric;
  r record;
BEGIN
  SELECT count(*), COALESCE(sum(o.cost), 0) INTO v_count, v_total
  FROM public.orders o
  WHERE o.status IN ('pending', 'expired')
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.provider_ref = 'refund_order_' || o.id::text
        AND t.status = 'completed'
    );

  RAISE NOTICE 'UNREFUNDED ORDERS: % orders, $% owed', v_count, round(v_total, 2);

  FOR r IN
    SELECT o.status, count(*) AS n, round(sum(o.cost), 2) AS amt
    FROM public.orders o
    WHERE o.status IN ('pending', 'expired')
    GROUP BY o.status
  LOOP
    RAISE NOTICE '  status=% count=% total=$%', r.status, r.n, r.amt;
  END LOOP;

  FOR r IN
    SELECT cron.job.jobname, cron.job.schedule, cron.job.active
    FROM cron.job WHERE jobname = 'reconcile-orders'
  LOOP
    RAISE NOTICE 'CRON INSTALLED: % | % | active=%', r.jobname, r.schedule, r.active;
  END LOOP;
END $$;
