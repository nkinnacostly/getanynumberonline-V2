-- Make credit_balance idempotent and placeholder-aware.
--
-- Problems this fixes:
--   1. Double-credit: the previous version had no idempotency guard, so a
--      re-delivered Flutterwave webhook (or the client fallback firing on top
--      of the webhook) credited the user twice.
--   2. Duplicate rows: it always INSERTed a fresh 'completed' row, leaving the
--      'pending' placeholder created at wallet-topup/initiate untouched — so a
--      single top-up showed up twice in history.
--
-- Approach:
--   * Lock the user's profile row FIRST. Concurrent credits for the same user
--     serialize on that lock, which makes the idempotency check below atomic.
--   * If this provider_ref already has a 'completed' transaction, do nothing.
--   * Otherwise credit, and COMPLETE the existing 'pending' placeholder in place
--     when one exists (single row per top-up); fall back to INSERT for callers
--     without a placeholder (e.g. refunds).

CREATE OR REPLACE FUNCTION public.credit_balance(
  p_user_id      uuid,
  p_amount       numeric,
  p_type         transaction_type,
  p_order_id     uuid  DEFAULT NULL::uuid,
  p_provider     text  DEFAULT NULL::text,
  p_provider_ref text  DEFAULT NULL::text,
  p_note         text  DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance_before  NUMERIC;
  v_balance_after   NUMERIC;
  v_updated         INT;
BEGIN
  -- Lock the profile row: serializes concurrent credits for this user.
  SELECT balance INTO v_balance_before
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Idempotency: already credited for this provider_ref → no-op.
  IF p_provider_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transactions
    WHERE provider_ref = p_provider_ref
      AND status = 'completed'
  ) THEN
    RETURN;
  END IF;

  v_balance_after := v_balance_before + p_amount;

  UPDATE public.profiles
  SET balance = v_balance_after
  WHERE id = p_user_id;

  -- Prefer completing the pending placeholder from initiate (one row per
  -- top-up); otherwise insert a fresh completed row.
  v_updated := 0;
  IF p_provider_ref IS NOT NULL THEN
    UPDATE public.transactions
    SET status         = 'completed',
        type           = p_type,
        amount         = p_amount,
        balance_before = v_balance_before,
        balance_after  = v_balance_after,
        provider       = COALESCE(p_provider, provider),
        order_id       = COALESCE(p_order_id, order_id),
        note           = COALESCE(p_note, note)
    WHERE provider_ref = p_provider_ref
      AND status = 'pending';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  IF v_updated = 0 THEN
    INSERT INTO public.transactions (
      user_id, order_id, type, amount,
      balance_before, balance_after,
      provider, provider_ref, status, note
    )
    VALUES (
      p_user_id, p_order_id, p_type, p_amount,
      v_balance_before, v_balance_after,
      p_provider, p_provider_ref, 'completed',
      COALESCE(p_note, p_type::text)
    );
  END IF;
END;
$function$;
