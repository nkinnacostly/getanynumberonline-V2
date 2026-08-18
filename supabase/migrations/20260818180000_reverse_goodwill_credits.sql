-- Reverse the goodwill write-off: take back the duplicate refunds.
--
-- Background. A bug in reconcile-orders refunded 169 orders a second time,
-- putting ~$160.92 into 21 accounts that was never owed. The first correction
-- (20260805180000) kept that money with the users as goodwill and only
-- reclassified the ledger rows so the invariants could hold. That decision is
-- now reversed: the balances go back to what they were before the duplicate
-- refunds landed.
--
-- What is NOT touched:
--   * The structural fix stays exactly as it is — the unique index, the single
--     refund path through refund_order, the integrity checks. This reverses the
--     payout, not the protection.
--   * The ~$190.63 of FIRST refunds on orders that expired without a code.
--     Those were genuinely owed under the product's own promise and are not
--     part of this bug.
--   * The $6.00 of pre-existing drift documented in 20260805190000. That money
--     was on those accounts before any of this work started; clawing it back
--     would take balance the users already had.
--
-- Accounting method: a reversing entry, never a deletion. The goodwill 'topup'
-- rows stay in history because the credit really did happen; an offsetting
-- 'deduction' is written against it. The pair nets to zero, balance drops by
-- the same amount, and both ledger invariants still hold afterwards.
--
-- Balance floor: profiles.balance can never go below zero, and some users will
-- have spent the money already. Each account gives back LEAST(owed, balance) —
-- never more than it holds. Any shortfall is reported, not forced.

CREATE OR REPLACE FUNCTION public.reverse_goodwill_credits(p_execute boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r              record;
  v_users        int     := 0;
  v_rows         int     := 0;
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
           count(*)        AS dupe_rows,
           sum(t.amount)   AS owed
    FROM public.transactions t
    JOIN public.profiles p ON p.id = t.user_id
    WHERE t.provider_ref LIKE 'goodwill_dupe_%'
      AND t.status = 'completed'
      -- One reversal per account. A re-run is a no-op rather than a second bite.
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions x
        WHERE x.user_id = t.user_id
          AND x.provider_ref = 'goodwill_reversal_' || t.user_id::text
      )
    GROUP BY t.user_id, p.email
    ORDER BY sum(t.amount) DESC
  LOOP
    -- Lock the row so a concurrent order can't spend the balance between the
    -- read and the write.
    SELECT balance INTO v_balance
    FROM public.profiles WHERE id = r.user_id FOR UPDATE;

    v_taken := LEAST(r.owed, GREATEST(v_balance, 0));
    v_short := r.owed - v_taken;

    v_users       := v_users + 1;
    v_rows        := v_rows + r.dupe_rows;
    v_owed_total  := v_owed_total + r.owed;
    v_taken_total := v_taken_total + v_taken;
    v_short_total := v_short_total + v_short;

    v_detail := v_detail || jsonb_build_object(
      'email', r.email, 'owed', round(r.owed, 2),
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
        'admin', 'goodwill_reversal_' || r.user_id::text, 'completed',
        'Reversal of duplicate refund credited in error'
        || CASE WHEN v_short > 0
                THEN ' (partial: $' || round(v_short, 2) || ' could not be reclaimed)'
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
    'duplicate_rows', v_rows,
    'owed', round(v_owed_total, 2),
    'reclaimed', round(v_taken_total, 2),
    'shortfall', round(v_short_total, 2),
    'detail', v_detail
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_goodwill_credits(boolean)
  FROM PUBLIC, anon, authenticated;

-- ── Dry run, safety rail, then execute ───────────────────────
DO $$
DECLARE
  plan jsonb;
  done jsonb;
  integ jsonb;
  d    jsonb;
BEGIN
  plan := public.reverse_goodwill_credits(false);

  RAISE NOTICE '=== CLAWBACK PLAN ===';
  RAISE NOTICE '  users=%  duplicate rows=%  owed=$%',
    plan->>'users', plan->>'duplicate_rows', plan->>'owed';
  RAISE NOTICE '  reclaimable=$%  shortfall=$%',
    plan->>'reclaimed', plan->>'shortfall';

  FOR d IN SELECT * FROM jsonb_array_elements(plan->'detail') LOOP
    RAISE NOTICE '  % | owed $% | bal $% -> $% | reclaim $% %',
      rpad(COALESCE(d->>'email', '?'), 32),
      d->>'owed', d->>'balance_before', d->>'balance_after', d->>'reclaimed',
      CASE WHEN (d->>'shortfall')::numeric > 0
           THEN ' SHORT $' || (d->>'shortfall') ELSE '' END;
  END LOOP;

  -- Safety rail. This migration moves real money off real accounts, and it is
  -- written from a known incident: 169 rows, 21 users, ~$160.92. If the marked
  -- rows do not resemble that, something other than the expected bug is being
  -- targeted — abort the whole transaction rather than find out afterwards.
  IF (plan->>'users')::int > 0 THEN
    IF (plan->>'owed')::numeric > 200 THEN
      RAISE EXCEPTION 'ABORT: $% to reverse exceeds the $200 expected ceiling',
        plan->>'owed';
    END IF;
    IF (plan->>'users')::int > 30 THEN
      RAISE EXCEPTION 'ABORT: % users affected, expected ~21', plan->>'users';
    END IF;
  END IF;

  IF (plan->>'users')::int = 0 THEN
    RAISE NOTICE '  nothing to reverse (already done, or no goodwill rows)';
  ELSE
    done := public.reverse_goodwill_credits(true);
    RAISE NOTICE '=== EXECUTED: $% reclaimed from % user(s), $% unreclaimable ===',
      done->>'reclaimed', done->>'users', done->>'shortfall';
  END IF;

  -- Both invariants must still hold: balances have moved, so this is the check
  -- that proves the reversing entries match the money actually taken.
  integ := public.check_ledger_integrity();
  RAISE NOTICE '=== LEDGER INTEGRITY ===';
  RAISE NOTICE '  ok=%  over_refunded=%  drift_users=%  drift_amount=%',
    integ->>'ok', integ->>'over_refunded_orders',
    integ->>'balance_drift_users', integ->>'balance_drift_amount';
  IF (integ->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: ledger integrity broken by the reversal — rolled back';
  END IF;
END $$;
