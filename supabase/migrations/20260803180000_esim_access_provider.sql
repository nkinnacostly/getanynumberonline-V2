-- Switch the eSIM feature from SMSPool to eSIM Access.
--
-- SMSPool discontinued eSIM support. eSIM Access differs in two ways that the
-- schema has to absorb:
--
--   1. Ordering is ASYNCHRONOUS. `esim/order` returns only an `orderNo`; the
--      SM-DP+ server allocates the profile up to ~30s later and the ICCID /
--      activation code only exist after that. So a row is created 'pending'
--      with our own `provider_txn_id` (the idempotency key we send as
--      `transactionId`), and the webhook + client polling fill in
--      `provider_order_no`, `provider_tran_no` and `iccid` when the profile
--      lands.
--
--   2. Lifecycle is reported by webhook (ESIM_STATUS / DATA_USAGE), so status,
--      SM-DP+ state and byte counters are worth persisting — data usage only
--      refreshes every 2-3h upstream, and re-querying on every render would
--      burn the 8 req/s budget.
--
-- Existing SMSPool eSIMs stay readable: they are tagged provider='smspool' and
-- keep their `smspool_transaction_id`. Their activation path is gone (the
-- upstream API is dead), which the UI surfaces explicitly.

-- ── Provider tag ─────────────────────────────────────────────
-- Added with DEFAULT 'smspool' so every pre-existing row backfills correctly,
-- then flipped so new rows default to the live provider.
ALTER TABLE public.esims
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'smspool';
ALTER TABLE public.esims
  ALTER COLUMN provider SET DEFAULT 'esimaccess';

ALTER TABLE public.esims DROP CONSTRAINT IF EXISTS esims_provider_check;
ALTER TABLE public.esims ADD CONSTRAINT esims_provider_check
  CHECK (provider IN ('smspool', 'esimaccess'));

-- ── eSIM Access identifiers ──────────────────────────────────
ALTER TABLE public.esims
  -- transactionId WE generate and send with the order; also the key the
  -- webhook echoes back, so it must be unique per order attempt.
  ADD COLUMN IF NOT EXISTS provider_txn_id   text,
  -- orderNo returned by esim/order (one per order, may cover several profiles)
  ADD COLUMN IF NOT EXISTS provider_order_no text,
  -- esimTranNo of the allocated profile — the recommended query/cancel key,
  -- because ICCIDs are recycled upstream
  ADD COLUMN IF NOT EXISTS provider_tran_no  text,
  ADD COLUMN IF NOT EXISTS iccid             text,
  -- RELEASED | DOWNLOAD | INSTALLATION | ENABLED | DISABLED | DELETED
  ADD COLUMN IF NOT EXISTS smdp_status       text,
  -- Byte counters: eSIM Access reports volume in bytes, not GB
  ADD COLUMN IF NOT EXISTS total_bytes       bigint,
  ADD COLUMN IF NOT EXISTS used_bytes        bigint,
  ADD COLUMN IF NOT EXISTS usage_updated_at  timestamptz;

-- provider_txn_id is our idempotency key: a retried order must not create a
-- second row. Partial so legacy SMSPool rows (NULL) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS esims_provider_txn_id_key
  ON public.esims (provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;

-- Webhook lookups arrive keyed by orderNo, esimTranNo or iccid.
CREATE INDEX IF NOT EXISTS esims_provider_order_no_idx
  ON public.esims (provider_order_no) WHERE provider_order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS esims_provider_tran_no_idx
  ON public.esims (provider_tran_no) WHERE provider_tran_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS esims_iccid_idx
  ON public.esims (iccid) WHERE iccid IS NOT NULL;

-- ── Status vocabulary ────────────────────────────────────────
-- eSIM Access reports CANCEL / REVOKED / SUSPENDED states the old CHECK had no
-- room for. Mapping (see _shared/esimaccess.ts → mapEsimStatus):
--   GOT_RESOURCE, IN_USE                          -> active
--   USED_UP, USED_EXPIRED, UNUSED_EXPIRED         -> expired
--   CANCEL, REVOKED                               -> cancelled
--   SUSPENDED                                     -> suspended
ALTER TABLE public.esims DROP CONSTRAINT IF EXISTS esims_status_check;
ALTER TABLE public.esims ADD CONSTRAINT esims_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'archived', 'failed',
                    'cancelled', 'suspended'));

-- ── Webhook deduplication ────────────────────────────────────
-- eSIM Access retries deliveries and sends a stable `notifyId` per event.
-- Inserting the id first makes handling exactly-once. Service role only —
-- RLS on with no policies means no client can read it.
CREATE TABLE IF NOT EXISTS public.esim_webhook_events (
  notify_id   text PRIMARY KEY,
  notify_type text,
  payload     jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.esim_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS esim_webhook_events_received_idx
  ON public.esim_webhook_events (received_at DESC);

-- ── Deduct + create (atomic) ─────────────────────────────────
-- Replaces the SMSPool-era signature: adds the idempotency key and the byte
-- total (which is what the provider actually quotes; data_gb stays for display).
-- Dropped rather than CREATE OR REPLACE because the argument list changed —
-- otherwise Postgres would keep both as overloads and the call would be
-- ambiguous.
DROP FUNCTION IF EXISTS public.deduct_balance_and_create_esim(
  uuid, numeric, text, text, text, numeric, int
);

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
    'esimaccess', p_provider_txn_id, p_total_bytes
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
