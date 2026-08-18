-- Carry the flag state through to the user detail page.
--
-- The flagged queue links each row to /admin/users/<id>, but the summary RPC
-- predates flagging and returns is_banned/is_admin only — so an admin followed
-- the link to review a flag and the page said nothing about it.
--
-- Only two keys are added; everything else is unchanged from
-- 20260818120000_admin_user_detail.sql.

CREATE OR REPLACE FUNCTION public.admin_user_summary_by_id(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id  uuid := p_user_id;
  v_out jsonb;
BEGIN
  IF v_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id) THEN
    RETURN jsonb_build_object('found', false, 'user_id', p_user_id);
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'user_id', v_id,
    'email', (SELECT email FROM public.profiles WHERE id = v_id),
    'joined', (SELECT created_at FROM public.profiles WHERE id = v_id),
    'balance', (SELECT round(balance, 2) FROM public.profiles WHERE id = v_id),
    'is_banned', (SELECT is_banned FROM public.profiles WHERE id = v_id),
    'is_admin', (SELECT is_admin FROM public.profiles WHERE id = v_id),
    'is_flagged', (SELECT is_flagged FROM public.profiles WHERE id = v_id),
    'flag_reason', (SELECT flag_reason FROM public.profiles WHERE id = v_id),

    -- Money in, split by source. An admin credit is not a deposit, and
    -- conflating them makes a refunded customer look like a paying one.
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
    'pending_topups', (
      SELECT count(*) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'pending'),

    -- Money out, and how much came back.
    'total_deducted', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'deduction' AND status = 'completed'), 0),
    'total_refunded', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'refund' AND status = 'completed'), 0),

    -- One-time numbers. A code counts as delivered only if a messages row
    -- exists: order status alone is not proof, since a row can sit at 'active'
    -- while the SMS write failed.
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

    -- Other product lines.
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

REVOKE ALL ON FUNCTION public.admin_user_summary_by_id(uuid)
  FROM PUBLIC, anon, authenticated;
