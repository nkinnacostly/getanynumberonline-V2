-- eSIM (data-only) feature.
--
-- Mirrors the rentals design: a purchase record per eSIM, wallet debits only
-- through an RPC that locks the profile row, and a matching transactions entry.
-- Activation details (LPA/QR, PIN, remaining data) are NOT stored — they are
-- fetched live from SMSPool's esim/profile so they never go stale.

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.esims (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  smspool_transaction_id text,                    -- transactionId from esim/purchase
  plan_id                text NOT NULL,           -- SMSPool plan ID that was purchased
  country                text,                    -- ISO 3166 code, e.g. 'US'
  country_name           text,
  data_gb                numeric(10,2),
  duration_days          int,
  cost                   numeric(10,4) NOT NULL,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','expired','archived','failed')),
  expires_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS esims_user_id_created_idx
  ON public.esims (user_id, created_at DESC);

-- Users read their own eSIMs (History / active view). All writes go through the
-- service role in edge functions, which bypasses RLS.
ALTER TABLE public.esims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own esims" ON public.esims;
CREATE POLICY "Users read own esims"
  ON public.esims FOR SELECT
  USING (auth.uid() = user_id);

-- ── Deduct + create (atomic) ─────────────────────────────────
-- Row starts 'pending'; the edge function flips it to 'active' after SMSPool
-- confirms the purchase, or refunds + marks 'failed' if the purchase fails.
CREATE OR REPLACE FUNCTION public.deduct_balance_and_create_esim(
  p_user_id       uuid,
  p_cost          numeric,
  p_country       text,
  p_country_name  text,
  p_plan_id       text,
  p_data_gb       numeric,
  p_duration_days int
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
    data_gb, duration_days, cost, status
  )
  VALUES (
    p_user_id, p_plan_id, p_country, p_country_name,
    p_data_gb, p_duration_days, p_cost, 'pending'
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
