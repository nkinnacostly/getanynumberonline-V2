-- Per-user account summary, addressable by id.
--
-- admin_user_summary(text) was written for a one-off support question and keys
-- on email. The admin panel already holds the profile id, and email is the one
-- column a user can change — so the id form is the one the UI should call.
--
-- The logic is not duplicated: the uuid function is now the implementation and
-- the email form resolves and delegates. Same numbers from both, always.

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

-- The email form becomes a thin resolver over the same implementation, so the
-- two can never drift apart.
CREATE OR REPLACE FUNCTION public.admin_user_summary(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.profiles WHERE lower(email) = lower(p_email);
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'email', p_email);
  END IF;
  RETURN public.admin_user_summary_by_id(v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_summary(text)
  FROM PUBLIC, anon, authenticated;

-- The detail page filters each list by user_id and orders by created_at. Small
-- tables today, but these are the exact access paths the page uses on every
-- tab switch.
CREATE INDEX IF NOT EXISTS orders_user_created_idx
  ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rentals_user_created_idx
  ON public.rentals (user_id, created_at DESC);

-- Sanity check against a known account.
DO $$
DECLARE v_id uuid; j jsonb;
BEGIN
  SELECT id INTO v_id FROM public.profiles ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'no profiles to sample';
    RETURN;
  END IF;
  j := public.admin_user_summary_by_id(v_id);
  RAISE NOTICE '=== SAMPLE (%) ===', j->>'email';
  RAISE NOTICE '  balance=% deposited=% delivered=%/% refunded=%',
    j->>'balance', j->>'deposited_real',
    j->>'orders_delivered', j->>'orders_total', j->>'total_refunded';
END $$;
