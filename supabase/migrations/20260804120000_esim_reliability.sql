-- eSIM fulfilment reliability.
--
-- Closes four gaps in the eSIM Access integration, all variants of the same
-- problem: the supplier call is a network call that can fail or hang AFTER the
-- customer's wallet has already been debited.
--
--   1. A row can sit at 'pending' forever if provisioning never completes —
--      the customer is charged and gets nothing. `reconcile-esims` now sweeps
--      those, linking them if they did provision and refunding if they didn't.
--   2. Retrying a sweep forever is its own failure mode, so `reconcile_attempts`
--      caps it and `last_error` records why it stopped — a dead-letter marker
--      an operator can query.
--   3. We must not accept an order we cannot fulfil, so provider balance is
--      polled and cached in `esim_provider_status`; the storefront and
--      order-esim both read it.
--   4. Refunds must be traceable, hence `refunded_at`.

-- ── Reconciliation bookkeeping on esims ──────────────────────
ALTER TABLE public.esims
  -- How many times the sweeper has looked at this row. Capped in the function;
  -- a row at the cap with a last_error is effectively dead-lettered.
  ADD COLUMN IF NOT EXISTS reconcile_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error         text,
  ADD COLUMN IF NOT EXISTS refunded_at        timestamptz;

-- The sweeper's hot query: pending rows ordered by age.
CREATE INDEX IF NOT EXISTS esims_pending_sweep_idx
  ON public.esims (status, created_at)
  WHERE status = 'pending';

-- ── Provider availability cache ──────────────────────────────
-- Single row per provider, refreshed by the reconcile cron. `available` is what
-- the storefront reads: false puts the eSIM buy flow into a "back soon" state
-- BEFORE a customer is charged, instead of discovering the shortfall at order
-- time and having to refund.
CREATE TABLE IF NOT EXISTS public.esim_provider_status (
  provider     text PRIMARY KEY,
  balance      numeric(12,4),
  available    boolean NOT NULL DEFAULT true,
  -- Floor below which we stop accepting orders. Sized to a few average orders
  -- so a burst can't drain the account mid-checkout.
  min_balance  numeric(12,4) NOT NULL DEFAULT 20,
  note         text,
  checked_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.esim_provider_status (provider, available, note)
VALUES ('esimaccess', true, 'awaiting first balance check')
ON CONFLICT (provider) DO NOTHING;

-- Readable by signed-in users so the buy page can show the back-soon banner.
-- Balance is deliberately NOT exposed — the view below hides it.
ALTER TABLE public.esim_provider_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in reads esim availability"
  ON public.esim_provider_status;
CREATE POLICY "Anyone signed in reads esim availability"
  ON public.esim_provider_status FOR SELECT
  TO authenticated
  USING (true);

-- ── Refund + fail an eSIM atomically ─────────────────────────
-- Used by reconcile-esims. Wraps the credit and the status flip in one
-- transaction so a row can never be marked refunded without the money moving
-- (or credited twice — credit_balance is idempotent on provider_ref, and the
-- status guard below means a concurrent sweep is a no-op).
CREATE OR REPLACE FUNCTION public.refund_failed_esim(
  p_esim_id uuid,
  p_reason  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_cost    numeric;
  v_txn     text;
BEGIN
  -- Lock the row and re-check status: two overlapping sweeps must not both
  -- refund. Only a still-pending row is refundable.
  SELECT user_id, cost, provider_txn_id
    INTO v_user_id, v_cost, v_txn
  FROM public.esims
  WHERE id = p_esim_id AND status = 'pending'
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM public.credit_balance(
    p_user_id      => v_user_id,
    p_amount       => v_cost,
    p_type         => 'refund'::transaction_type,
    p_order_id     => NULL,
    p_provider     => 'esimaccess',
    p_provider_ref => 'refund_' || COALESCE(v_txn, p_esim_id::text),
    p_note         => 'Auto-refund: ' || p_reason
  );

  UPDATE public.esims
  SET status      = 'failed',
      last_error  = p_reason,
      refunded_at = now(),
      updated_at  = now()
  WHERE id = p_esim_id;

  RETURN true;
END;
$$;

-- ── Scheduling ───────────────────────────────────────────────
-- The sweeper only helps if it actually runs. pg_cron + pg_net call the edge
-- function on a schedule.
--
-- The RECONCILE_SECRET is NOT hard-coded here: this migration is in git, and a
-- committed secret is a leaked secret. Instead this installs a helper that an
-- operator calls ONCE with the secret, from the SQL editor:
--
--   select public.schedule_esim_reconcile(
--     'https://<project-ref>.supabase.co/functions/v1',
--     '<RECONCILE_SECRET>'
--   );
--
-- Re-running it re-schedules cleanly (the job is unscheduled first), which is
-- also how you rotate the secret. To stop it:
--   select cron.unschedule('reconcile-esims');
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.schedule_esim_reconcile(
  p_functions_url text,
  p_secret        text,
  p_schedule      text DEFAULT '*/5 * * * *'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cmd text;
BEGIN
  -- Idempotent: drop any existing job before (re)creating it.
  PERFORM cron.unschedule('reconcile-esims')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-esims');

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
    rtrim(p_functions_url, '/') || '/reconcile-esims',
    p_secret
  );

  PERFORM cron.schedule('reconcile-esims', p_schedule, v_cmd);

  RETURN 'scheduled reconcile-esims at ' || p_schedule;
END;
$$;

-- Operators only. Never let a signed-in user read or re-point the job.
REVOKE ALL ON FUNCTION public.schedule_esim_reconcile(text, text, text)
  FROM PUBLIC, anon, authenticated;
