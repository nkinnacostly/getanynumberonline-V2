-- Switch the eSIM feature from eSIM Access to SimJuno.
--
-- SimJuno (api.simjuno.com/v1) resells the same underlying network, so the
-- schema barely moves: prices stay x10,000-scaled integers, volumes in bytes,
-- and the esimStatus vocabulary is relayed unchanged. What changes:
--
--   1. New rows are provider='simjuno'. Orders are keyed by package SLUG and
--      return the provider's esim id synchronously (stored in
--      provider_tran_no — it is the handle for GET /esim/{id} and /cancel).
--   2. Existing eSIM Access rows keep working: get-esim-profile and
--      reconcile-esims keep a read-only legacy leg until they drain out.
--
-- The webhook dedupe table (esim_webhook_events) is reused as-is: SimJuno's
-- signed events carry a stable `id` that maps onto notify_id.

-- ── Provider tag ─────────────────────────────────────────────
ALTER TABLE public.esims
  ALTER COLUMN provider SET DEFAULT 'simjuno';

ALTER TABLE public.esims DROP CONSTRAINT IF EXISTS esims_provider_check;
ALTER TABLE public.esims ADD CONSTRAINT esims_provider_check
  CHECK (provider IN ('smspool', 'esimaccess', 'simjuno'));

-- ── Provider availability cache row ──────────────────────────
INSERT INTO public.esim_provider_status (provider, available, note)
VALUES ('simjuno', true, 'awaiting first balance check')
ON CONFLICT (provider) DO NOTHING;

-- ── Deduct + create (atomic) ─────────────────────────────────
-- Same signature; only the hardcoded provider tag changes.
CREATE OR REPLACE FUNCTION public.deduct_balance_and_create_esim(
  p_user_id        uuid,
  p_cost           numeric,
  p_country        text,
  p_country_name   text,
  p_plan_id        text,
  p_data_gb        numeric,
  p_duration_days  int,
  p_provider_txn_id text,
  p_total_bytes    bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance_before NUMERIC;
  v_balance_after  NUMERIC;
  v_id             UUID;
BEGIN
  SELECT balance INTO v_balance_before
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_balance_before < p_cost THEN
    RAISE EXCEPTION 'Insufficient balance. Have: %, Need: %', v_balance_before, p_cost;
  END IF;

  v_balance_after := v_balance_before - p_cost;

  UPDATE public.profiles
  SET balance = v_balance_after
  WHERE id = p_user_id;

  INSERT INTO public.esims (
    user_id, plan_id, country, country_name,
    data_gb, duration_days, cost, status,
    provider, provider_txn_id, total_bytes
  )
  VALUES (
    p_user_id, p_plan_id, p_country, p_country_name,
    p_data_gb, p_duration_days, p_cost, 'pending',
    'simjuno', p_provider_txn_id, p_total_bytes
  )
  RETURNING id INTO v_id;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_before, balance_after, status, note
  )
  VALUES (
    p_user_id, 'deduction', p_cost, v_balance_before, v_balance_after,
    'completed',
    'eSIM: ' || COALESCE(p_data_gb::text, '?') || 'GB (' ||
      COALESCE(p_country_name, p_country, '—') || ')'
  );

  RETURN v_id;
END;
$$;

-- ── Refund + fail atomically ─────────────────────────────────
-- Same guard set as before; the refund transaction now records whichever
-- provider issued the failed eSIM instead of hardcoding one.
CREATE OR REPLACE FUNCTION public.refund_failed_esim(
  p_esim_id uuid,
  p_reason  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_cost     numeric;
  v_txn      text;
  v_provider text;
BEGIN
  -- Lock the row and re-check status: two overlapping sweeps must not both
  -- refund. Only a still-pending row is refundable.
  SELECT user_id, cost, provider_txn_id, provider
    INTO v_user_id, v_cost, v_txn, v_provider
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
    p_provider     => COALESCE(v_provider, 'simjuno'),
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

-- ── Operator health view ─────────────────────────────────────
-- Recreated for the live provider; cron columns are unchanged.
CREATE OR REPLACE VIEW public.esim_ops_health AS
SELECT
  (SELECT available   FROM public.esim_provider_status WHERE provider = 'simjuno') AS provider_available,
  (SELECT balance     FROM public.esim_provider_status WHERE provider = 'simjuno') AS provider_balance,
  (SELECT min_balance FROM public.esim_provider_status WHERE provider = 'simjuno') AS provider_min_balance,
  (SELECT checked_at  FROM public.esim_provider_status WHERE provider = 'simjuno') AS balance_checked_at,

  (SELECT active   FROM cron.job WHERE jobname = 'reconcile-esims') AS cron_active,
  (SELECT schedule FROM cron.job WHERE jobname = 'reconcile-esims') AS cron_schedule,
  (SELECT max(start_time) FROM cron.job_run_details d
     JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'reconcile-esims')                            AS cron_last_run,
  (SELECT status FROM cron.job_run_details d
     JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'reconcile-esims'
    ORDER BY start_time DESC LIMIT 1)                               AS cron_last_status,

  -- Rows the sweeper still owes an answer on (both providers).
  (SELECT count(*) FROM public.esims
    WHERE status = 'pending'
      AND provider IN ('simjuno', 'esimaccess'))                    AS pending_now,
  -- Pending long enough that it should already have been refunded.
  (SELECT count(*) FROM public.esims
    WHERE status = 'pending'
      AND provider IN ('simjuno', 'esimaccess')
      AND created_at < now() - interval '15 minutes')               AS pending_overdue,
  -- Dead-lettered: gave up and refunded.
  (SELECT count(*) FROM public.esims
    WHERE status = 'failed' AND last_error IS NOT NULL
      AND refunded_at > now() - interval '24 hours')                AS refunded_24h;

REVOKE ALL ON public.esim_ops_health FROM PUBLIC, anon, authenticated;
