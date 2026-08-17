-- Audit: did the order-refund sweep pay some orders twice?
--
-- Suspicion: order-number's "SMSPool has no number" path already refunded the
-- user AND set status='expired'. refund_order only skipped orders already at
-- 'cancelled'/'refunded', so it treated those pre-refunded 'expired' rows as
-- unpaid. credit_balance's idempotency is keyed on provider_ref, and that old
-- refund passed none — so nothing stopped a second credit.
--
-- Report only. No money is moved here; a clawback debits real balances and is
-- a decision for a human, not a migration.

DO $$
DECLARE
  r record;
  v_orders int := 0;
  v_extra  numeric := 0;
BEGIN
  RAISE NOTICE '=== ORDERS WITH MORE THAN ONE COMPLETED REFUND ===';

  FOR r IN
    SELECT o.id,
           p.email,
           o.status::text AS status,
           o.cost,
           count(t.id)    AS refund_count,
           sum(t.amount)  AS refunded_total,
           sum(t.amount) - o.cost AS overpaid
    FROM public.orders o
    JOIN public.transactions t
      ON t.order_id = o.id AND t.type = 'refund' AND t.status = 'completed'
    LEFT JOIN public.profiles p ON p.id = o.user_id
    GROUP BY o.id, p.email, o.status, o.cost
    HAVING count(t.id) > 1
    ORDER BY sum(t.amount) - o.cost DESC
    LIMIT 25
  LOOP
    v_orders := v_orders + 1;
    v_extra  := v_extra + r.overpaid;
    RAISE NOTICE '  % | % | status=% | cost=% | refunds=% | paid=% | over=%',
      left(r.id::text, 8), r.email, r.status, r.cost,
      r.refund_count, r.refunded_total, r.overpaid;
  END LOOP;

  IF v_orders = 0 THEN
    RAISE NOTICE '  none — no order was refunded more than once';
  END IF;

  -- Whole-population totals, not just the 25 listed above.
  SELECT count(*), COALESCE(sum(extra), 0) INTO v_orders, v_extra
  FROM (
    SELECT sum(t.amount) - o.cost AS extra
    FROM public.orders o
    JOIN public.transactions t
      ON t.order_id = o.id AND t.type = 'refund' AND t.status = 'completed'
    GROUP BY o.id, o.cost
    HAVING count(t.id) > 1
  ) s;

  RAISE NOTICE '=== TOTAL: % orders double-refunded, $% overpaid ===',
    v_orders, round(v_extra, 2);

  -- How many users are affected, and by how much.
  RAISE NOTICE '=== AFFECTED USERS ===';
  FOR r IN
    SELECT p.email, count(*) AS orders, round(sum(s.extra), 2) AS overpaid
    FROM (
      SELECT o.id, o.user_id, sum(t.amount) - o.cost AS extra
      FROM public.orders o
      JOIN public.transactions t
        ON t.order_id = o.id AND t.type = 'refund' AND t.status = 'completed'
      GROUP BY o.id, o.user_id, o.cost
      HAVING count(t.id) > 1
    ) s
    JOIN public.profiles p ON p.id = s.user_id
    GROUP BY p.email
    ORDER BY sum(s.extra) DESC
    LIMIT 20
  LOOP
    RAISE NOTICE '  % | % orders | $% overpaid', r.email, r.orders, r.overpaid;
  END LOOP;
END $$;

-- ── Fix: never refund an order that already has one ──────────
-- The status check was the wrong guard, because the legacy refund paths left
-- the order at 'expired'. The reliable test is whether a completed refund
-- transaction already exists against this order id, whatever provider_ref it
-- carried.
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

  SELECT user_id, cost, status::text, service_name, country_name
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

  -- THE important guard: any completed refund against this order means the
  -- money is already back, regardless of which code path issued it or whether
  -- it set a provider_ref. Legacy refunds from order-number and the old
  -- cancel-order passed none, so provider_ref alone cannot catch them.
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE order_id = p_order_id
      AND type = 'refund'
      AND status = 'completed'
  ) THEN
    -- Bring the status in line so it stops being swept.
    UPDATE public.orders
    SET status = 'refunded'::order_status, updated_at = now()
    WHERE id = p_order_id;
    RETURN false;
  END IF;

  PERFORM public.credit_balance(
    p_user_id      => v_user_id,
    p_amount       => v_cost,
    p_type         => 'refund'::transaction_type,
    p_order_id     => p_order_id,
    p_provider     => 'system',
    p_provider_ref => 'refund_order_' || p_order_id::text,
    p_note         => COALESCE(
      p_reason,
      'Refund: no code received (' || COALESCE(v_service, '?') || ', ' ||
      COALESCE(v_country, '?') || ')'
    )
  );

  UPDATE public.orders
  SET status = p_status::order_status, updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_order(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
