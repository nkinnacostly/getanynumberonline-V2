-- Per-user account summary for support and admin work.
--
-- Answers the question you actually get asked — "what has this person paid in,
-- and what did they get for it?" — without hand-writing a five-way join every
-- time. Deliberately separates real deposits from admin credits, and separates
-- spend that DELIVERED from spend that was refunded, because "they spent $40"
-- means nothing if $30 of it bounced back.
--
-- A code counts as delivered only if a messages row exists for the order.
-- Order status alone is not proof: a row can sit at 'active' while the SMS
-- write failed.

CREATE OR REPLACE FUNCTION public.admin_user_summary(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id  uuid;
  v_out jsonb;
BEGIN
  SELECT id INTO v_id FROM public.profiles WHERE lower(email) = lower(p_email);
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'email', p_email);
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'email', p_email,
    'user_id', v_id,
    'joined', (SELECT created_at FROM public.profiles WHERE id = v_id),
    'balance', (SELECT round(balance, 2) FROM public.profiles WHERE id = v_id),
    'is_banned', (SELECT is_banned FROM public.profiles WHERE id = v_id),

    -- Money in, split by source.
    'deposited_real', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'completed'
        AND (provider IS NULL OR provider <> 'admin')), 0),
    'credited_by_admin', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'completed'
        AND provider = 'admin'), 0),
    'deposit_count', (
      SELECT count(*) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'completed'
        AND (provider IS NULL OR provider <> 'admin')),

    -- Money out, and how much came back.
    'total_deducted', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'deduction' AND status = 'completed'), 0),
    'total_refunded', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'refund' AND status = 'completed'), 0),

    -- One-time numbers. "Delivered" requires an actual messages row.
    'orders_total', (SELECT count(*) FROM public.orders WHERE user_id = v_id),
    'orders_delivered', (
      SELECT count(DISTINCT o.id) FROM public.orders o
      JOIN public.messages m ON m.order_id = o.id
      WHERE o.user_id = v_id),
    'spent_on_delivered', COALESCE((
      SELECT round(sum(o.cost), 2) FROM public.orders o
      WHERE o.user_id = v_id
        AND EXISTS (SELECT 1 FROM public.messages m WHERE m.order_id = o.id)), 0),
    'orders_by_status', COALESCE((
      SELECT jsonb_object_agg(s, n) FROM (
        SELECT status::text AS s, count(*) AS n
        FROM public.orders WHERE user_id = v_id GROUP BY status) x), '{}'::jsonb),

    -- Other product lines, for completeness.
    'rentals_total', (SELECT count(*) FROM public.rentals WHERE user_id = v_id),
    'spent_on_rentals', COALESCE((
      SELECT round(sum(cost), 2) FROM public.rentals
      WHERE user_id = v_id AND status <> 'cancelled'), 0),
    'esims_total', (SELECT count(*) FROM public.esims WHERE user_id = v_id),
    'spent_on_esims', COALESCE((
      SELECT round(sum(cost), 2) FROM public.esims
      WHERE user_id = v_id AND status <> 'failed'), 0)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_summary(text)
  FROM PUBLIC, anon, authenticated;

-- One-off report for a support question.
DO $$
DECLARE j jsonb; k text; v jsonb;
BEGIN
  j := public.admin_user_summary('jooj65062@gmail.com');
  RAISE NOTICE '=== USER SUMMARY ===';
  FOR k, v IN SELECT * FROM jsonb_each(j) LOOP
    RAISE NOTICE '  %: %', rpad(k, 20), v;
  END LOOP;
END $$;
