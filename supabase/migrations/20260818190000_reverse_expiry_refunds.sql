-- Reverse the expiry refunds issued by the reconcile-orders sweep.
--
-- These are DIFFERENT from the duplicate refunds reversed in
-- 20260818180000. Those were money credited twice by a bug. These were first
-- and only refunds on ~201 orders that expired without ever delivering an SMS
-- code — money the sweeper paid back deliberately.
--
-- Reversing them is an explicit business decision by the operator, taken after
-- the consequence was put in writing: the customer paid, received nothing, and
-- is now being charged for it anyway. Recorded here so the reason this money
-- moved is not a mystery to whoever reads this later.
--
-- SCOPE — only refunds whose note marks them as "no code received":
--   included: 'Refund: no verification code received'  (reconcile-orders)
--             'Refund: no code received%'              (refund_order default)
--   excluded: user-initiated cancels (the user chose to stop; charging them
--             for a number they cancelled is a different question)
--   excluded: 'Auto-refund: SMSPool number unavailable' (no number was ever
--             issued — there is nothing to charge for)
--   excluded: the duplicate-refund rows, already reclassified to 'topup'
--
-- Order status is deliberately LEFT at 'refunded'. Setting it back to 'expired'
-- would put these rows straight back into the reconcile-orders sweep, which
-- would refund them all over again. The original refund row also stays in
-- history, which keeps refund_order's "already refunded" guard tripped — two
-- independent reasons the cron cannot undo this.

CREATE OR REPLACE FUNCTION public.reverse_expiry_refunds(p_execute boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r              record;
  v_users        int     := 0;
  v_orders       int     := 0;
  v_owed_total   numeric := 0;
  v_taken_total  numeric := 0;
  v_short_total  numeric := 0;
  v_taken        numeric;
  v_short        numeric;
  v_balance      numeric;
  v_detail       jsonb   := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT t.user_id,
           p.email,
           count(*)      AS refund_rows,
           sum(t.amount) AS owed
    FROM public.transactions t
    JOIN public.profiles p ON p.id = t.user_id
    WHERE t.type = 'refund'
      AND t.status = 'completed'
      AND (t.note = 'Refund: no verification code received'
           OR t.note LIKE 'Refund: no code received%')
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions x
        WHERE x.user_id = t.user_id
          AND x.provider_ref = 'expiry_reversal_' || t.user_id::text
      )
    GROUP BY t.user_id, p.email
    ORDER BY sum(t.amount) DESC
  LOOP
    SELECT balance INTO v_balance
    FROM public.profiles WHERE id = r.user_id FOR UPDATE;

    -- Never below zero. Most of these accounts have long since spent the
    -- refund, so partial recovery is the normal case here, not the exception.
    v_taken := LEAST(r.owed, GREATEST(v_balance, 0));
    v_short := r.owed - v_taken;

    v_users       := v_users + 1;
    v_orders      := v_orders + r.refund_rows;
    v_owed_total  := v_owed_total + r.owed;
    v_taken_total := v_taken_total + v_taken;
    v_short_total := v_short_total + v_short;

    v_detail := v_detail || jsonb_build_object(
      'email', r.email, 'orders', r.refund_rows, 'owed', round(r.owed, 2),
      'balance_before', round(v_balance, 2),
      'reclaimed', round(v_taken, 2),
      'shortfall', round(v_short, 2),
      'balance_after', round(v_balance - v_taken, 2));

    IF p_execute AND v_taken > 0 THEN
      INSERT INTO public.transactions (
        user_id, type, amount, balance_before, balance_after,
        provider, provider_ref, status, note
      ) VALUES (
        r.user_id, 'deduction'::transaction_type, v_taken,
        v_balance, v_balance - v_taken,
        'admin', 'expiry_reversal_' || r.user_id::text, 'completed',
        'Reversal of ' || r.refund_rows || ' expiry refund(s)'
        || CASE WHEN v_short > 0
                THEN ' (partial: $' || round(v_short, 2) || ' not reclaimable)'
                ELSE '' END
      );

      UPDATE public.profiles
      SET balance = v_balance - v_taken, updated_at = now()
      WHERE id = r.user_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'executed', p_execute,
    'users', v_users,
    'refund_rows', v_orders,
    'owed', round(v_owed_total, 2),
    'reclaimed', round(v_taken_total, 2),
    'shortfall', round(v_short_total, 2),
    'detail', v_detail
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_expiry_refunds(boolean)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  plan  jsonb;
  done  jsonb;
  integ jsonb;
  d     jsonb;
  r     record;
  n     int := 0;
BEGIN
  -- What refund categories exist, so the scoping above can be checked against
  -- reality rather than taken on trust.
  RAISE NOTICE '=== ALL COMPLETED REFUNDS BY CATEGORY ===';
  FOR r IN
    SELECT CASE
             WHEN note = 'Refund: no verification code received' THEN 'expiry (sweeper)'
             WHEN note LIKE 'Refund: no code received%'          THEN 'expiry (default)'
             WHEN note LIKE 'Refund: cancelled order%'           THEN 'user cancelled'
             WHEN note LIKE 'Auto-refund%'                       THEN 'supplier unavailable'
             ELSE 'other / legacy'
           END AS bucket,
           count(*) AS rows, round(sum(amount), 2) AS total
    FROM public.transactions
    WHERE type = 'refund' AND status = 'completed'
    GROUP BY 1 ORDER BY 3 DESC
  LOOP
    RAISE NOTICE '  % | % rows | $%', rpad(r.bucket, 22), r.rows, r.total;
  END LOOP;

  plan := public.reverse_expiry_refunds(false);

  RAISE NOTICE '=== REVERSAL PLAN (expiry refunds only) ===';
  RAISE NOTICE '  users=%  refund rows=%  owed=$%',
    plan->>'users', plan->>'refund_rows', plan->>'owed';
  RAISE NOTICE '  reclaimable=$%  NOT reclaimable=$%',
    plan->>'reclaimed', plan->>'shortfall';

  FOR d IN SELECT * FROM jsonb_array_elements(plan->'detail') LOOP
    n := n + 1;
    IF n <= 30 THEN
      RAISE NOTICE '  % | % ord | owed $% | bal $% -> $% | take $% %',
        rpad(COALESCE(d->>'email', '?'), 30), d->>'orders', d->>'owed',
        d->>'balance_before', d->>'balance_after', d->>'reclaimed',
        CASE WHEN (d->>'shortfall')::numeric > 0
             THEN ' SHORT $' || (d->>'shortfall') ELSE '' END;
    END IF;
  END LOOP;
  IF n > 30 THEN
    RAISE NOTICE '  ... and % more user(s)', n - 30;
  END IF;

  -- Safety rail: expected ~$190.63 gross. A much larger figure means the note
  -- filter caught cancels or legacy refunds too — abort rather than debit the
  -- wrong customers.
  IF (plan->>'users')::int > 0 AND (plan->>'owed')::numeric > 300 THEN
    RAISE EXCEPTION 'ABORT: $% gross exceeds the $300 expected ceiling — scope is wrong',
      plan->>'owed';
  END IF;

  IF (plan->>'users')::int = 0 THEN
    RAISE NOTICE '  nothing to reverse';
  ELSE
    done := public.reverse_expiry_refunds(true);
    RAISE NOTICE '=== EXECUTED: $% taken from % user(s); $% could not be reclaimed ===',
      done->>'reclaimed', done->>'users', done->>'shortfall';
  END IF;

  integ := public.check_ledger_integrity();
  RAISE NOTICE '=== LEDGER INTEGRITY ===';
  RAISE NOTICE '  ok=%  over_refunded=%  drift_users=%  drift_amount=%',
    integ->>'ok', integ->>'over_refunded_orders',
    integ->>'balance_drift_users', integ->>'balance_drift_amount';
  IF (integ->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: ledger integrity broken by the reversal — rolled back';
  END IF;
END $$;
