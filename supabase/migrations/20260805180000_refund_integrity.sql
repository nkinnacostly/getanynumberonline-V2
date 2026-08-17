-- Make double-refunding structurally impossible.
--
-- Every fix so far has been a better convention, enforced in application code
-- across four refund paths, using order STATUS as a proxy for whether money had
-- moved. Status and money can diverge — that was the bug. Conventions also
-- don't survive the next code path someone adds.
--
-- This migration:
--   1. reports the damage per user, before changing anything
--   2. writes off the duplicate credits as goodwill — the money STAYS with the
--      users, but each order ends up with exactly one 'refund' row, so the
--      ledger becomes internally consistent
--   3. backfills provider_ref on every historical refund, so the idempotency
--      key exists retroactively
--   4. adds a UNIQUE INDEX so a second completed refund for an order is a
--      database error, not a silent overpayment
--   5. adds check_ledger_integrity() for the cron to assert continuously

-- ── 1. Report before acting ──────────────────────────────────
DO $$
DECLARE r record; v_users int := 0; v_total numeric := 0;
BEGIN
  RAISE NOTICE '=== WRITE-OFF PLAN (money stays with users) ===';
  FOR r IN
    SELECT p.email,
           count(*)                    AS orders,
           round(sum(s.extra), 2)      AS overpaid,
           round(max(p.balance), 2)    AS balance
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
  LOOP
    v_users := v_users + 1;
    v_total := v_total + r.overpaid;
    RAISE NOTICE '  % | % orders | $% written off | balance $%',
      rpad(r.email, 34), r.orders, r.overpaid, r.balance;
  END LOOP;
  RAISE NOTICE '=== % users, $% written off as goodwill ===', v_users, round(v_total, 2);
END $$;

-- ── 2. Write off the duplicates ──────────────────────────────
-- For each order, the EARLIEST completed refund is the real one. Every later
-- one is reclassified as an admin credit: same amount, same balance, but no
-- longer counted as a refund. Nothing is debited — the user keeps the money.
--
-- provider='admin' is the existing convention for a credit that is not a sale,
-- and get_stats already excludes it from revenue.
WITH ranked AS (
  SELECT t.id,
         t.order_id,
         row_number() OVER (PARTITION BY t.order_id ORDER BY t.created_at, t.id) AS rn
  FROM public.transactions t
  WHERE t.type = 'refund'
    AND t.status = 'completed'
    AND t.order_id IS NOT NULL
    AND t.order_id IN (
      SELECT order_id FROM public.transactions
      WHERE type = 'refund' AND status = 'completed' AND order_id IS NOT NULL
      GROUP BY order_id HAVING count(*) > 1
    )
)
UPDATE public.transactions t
SET type         = 'topup'::transaction_type,
    provider     = 'admin',
    provider_ref = 'goodwill_dupe_' || r.order_id::text || '_' || r.rn::text,
    note         = 'Goodwill: duplicate refund written off (order '
                   || left(r.order_id::text, 8) || ')'
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- ── 3. Backfill the idempotency key ──────────────────────────
-- order-number and the old cancel-order issued refunds with no provider_ref,
-- which is precisely why credit_balance's idempotency check could not see them.
UPDATE public.transactions
SET provider_ref = 'refund_order_' || order_id::text,
    provider     = COALESCE(provider, 'system')
WHERE type = 'refund'
  AND status = 'completed'
  AND order_id IS NOT NULL
  AND provider_ref IS NULL;

-- ── 4. The structural guarantee ──────────────────────────────
-- One completed refund per order, enforced by Postgres. Any future code path
-- that tries to pay twice now raises an error instead of silently overpaying.
-- Partial so cancelled/failed rows and non-order transactions are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_refund_per_order
  ON public.transactions (order_id)
  WHERE type = 'refund' AND status = 'completed' AND order_id IS NOT NULL;

-- ── 5. Continuous integrity assertions ───────────────────────
-- Two invariants that must always hold. The cron calls this every run and
-- alerts on violation — my double-refund ran for a day and was found by
-- accident; this finds the next one in minutes.
CREATE OR REPLACE FUNCTION public.check_ledger_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_over_refunded int;
  v_over_amount   numeric;
  v_drifted       int;
  v_drift_amount  numeric;
  v_worst         jsonb;
BEGIN
  -- Invariant A: an order can never be refunded for more than it cost.
  SELECT count(*), COALESCE(sum(excess), 0) INTO v_over_refunded, v_over_amount
  FROM (
    SELECT sum(t.amount) - o.cost AS excess
    FROM public.orders o
    JOIN public.transactions t
      ON t.order_id = o.id AND t.type = 'refund' AND t.status = 'completed'
    GROUP BY o.id, o.cost
    HAVING sum(t.amount) > o.cost + 0.001
  ) x;

  -- Invariant B: a stored balance must equal its own ledger.
  SELECT count(*), COALESCE(sum(abs(diff)), 0) INTO v_drifted, v_drift_amount
  FROM (
    SELECT p.id, p.balance - COALESCE(l.net, 0) AS diff
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
  ) y;

  SELECT jsonb_agg(z) INTO v_worst FROM (
    SELECT p.email, round(p.balance, 2) AS balance,
           round(COALESCE(l.net, 0), 2) AS ledger,
           round(p.balance - COALESCE(l.net, 0), 2) AS drift
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
    ORDER BY abs(p.balance - COALESCE(l.net, 0)) DESC
    LIMIT 10
  ) z;

  RETURN jsonb_build_object(
    'ok', v_over_refunded = 0 AND v_drifted = 0,
    'over_refunded_orders', v_over_refunded,
    'over_refunded_amount', round(v_over_amount, 2),
    'balance_drift_users', v_drifted,
    'balance_drift_amount', round(v_drift_amount, 2),
    'worst_drift', COALESCE(v_worst, '[]'::jsonb)
  );
END$$;

REVOKE ALL ON FUNCTION public.check_ledger_integrity() FROM PUBLIC, anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────
DO $$
DECLARE j jsonb;
BEGIN
  j := public.check_ledger_integrity();
  RAISE NOTICE '=== LEDGER INTEGRITY AFTER WRITE-OFF ===';
  RAISE NOTICE '  ok=%', j->>'ok';
  RAISE NOTICE '  over-refunded orders: % ($%)',
    j->>'over_refunded_orders', j->>'over_refunded_amount';
  RAISE NOTICE '  balance drift users:  % ($%)',
    j->>'balance_drift_users', j->>'balance_drift_amount';
  IF (j->>'balance_drift_users')::int > 0 THEN
    RAISE NOTICE '  worst: %', j->'worst_drift';
  END IF;
END $$;
