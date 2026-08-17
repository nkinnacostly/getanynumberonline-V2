-- Reconcile pre-existing balance drift so the integrity check is meaningful.
--
-- check_ledger_integrity found two profiles whose stored balance exceeds their
-- own transaction history by $6.00 in total. This predates the refund work —
-- nothing in this session changed a balance — and most likely comes from a
-- direct balance edit (dashboard, or the previous void-returning
-- admin_adjust_balance, which moved money without writing a ledger row).
--
-- The drift is left in the users' favour: no balance is changed. What is added
-- is a transaction row DOCUMENTING the existing credit, so the ledger explains
-- the balance instead of silently disagreeing with it.
--
-- Why this matters beyond $6: an invariant that is permanently violated is an
-- alert everyone learns to ignore. Reconciling the known drift is what makes
-- the NEXT drift — from a real bug — visible.

DO $$
DECLARE
  r record;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.email, p.balance,
           COALESCE(l.net, 0) AS ledger,
           p.balance - COALESCE(l.net, 0) AS drift
    FROM public.profiles p
    LEFT JOIN (
      SELECT user_id,
             sum(CASE WHEN type IN ('topup', 'refund') THEN amount
                      ELSE -amount END) AS net
      FROM public.transactions
      WHERE status = 'completed'
      GROUP BY user_id
    ) l ON l.user_id = p.id
    WHERE abs(p.balance - COALESCE(l.net, 0)) > 0.001
  LOOP
    -- Only ever document a credit the user already holds. A NEGATIVE drift
    -- would mean the ledger claims more than the balance shows, which is a
    -- different problem — flag it rather than quietly inventing a deduction.
    IF r.drift < 0 THEN
      RAISE WARNING 'NEGATIVE drift for % (balance %, ledger %) — not auto-reconciled',
        r.email, r.balance, r.ledger;
      CONTINUE;
    END IF;

    INSERT INTO public.transactions (
      user_id, type, amount, balance_before, balance_after,
      provider, provider_ref, status, note
    ) VALUES (
      r.id, 'topup'::transaction_type, r.drift,
      r.ledger, r.balance,
      'admin', 'drift_reconcile_' || r.id::text, 'completed',
      'Opening balance reconciliation: credit present on the account but '
      || 'missing from transaction history'
    );

    v_count := v_count + 1;
    v_total := v_total + r.drift;
    RAISE NOTICE 'reconciled % : balance % vs ledger % -> documented $%',
      r.email, r.balance, r.ledger, r.drift;
  END LOOP;

  RAISE NOTICE '=== documented % drifted balance(s), $% total ===',
    v_count, round(v_total, 2);
END $$;

-- Confirm both invariants now hold.
DO $$
DECLARE j jsonb;
BEGIN
  j := public.check_ledger_integrity();
  RAISE NOTICE '=== LEDGER INTEGRITY ===';
  RAISE NOTICE '  ok=%  over_refunded=%  drift_users=%  drift_amount=%',
    j->>'ok', j->>'over_refunded_orders',
    j->>'balance_drift_users', j->>'balance_drift_amount';
END $$;
