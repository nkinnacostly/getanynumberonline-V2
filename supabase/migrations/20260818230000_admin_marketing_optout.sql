-- Let an admin change a user's marketing subscription, both directions.
--
-- Resubscribing someone who opted out is the sensitive direction: consent that
-- a person withdrew is being reinstated on their behalf. It is a legitimate
-- support action — an accidental click, or a customer asking to be put back —
-- but it must never be quiet. Every change writes an admin_audit_log entry
-- naming the admin, the direction and the time.
--
-- The one-argument set_marketing_opt_out stays as it is: that is the public
-- unsubscribe path, called by the email-unsubscribe function, and it can only
-- ever opt someone OUT.
CREATE OR REPLACE FUNCTION public.admin_set_marketing_opt_out(
  p_admin_id uuid,
  p_user_id  uuid,
  p_opt_out  boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_before   boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT marketing_opt_out INTO v_before
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET marketing_opt_out    = p_opt_out,
      -- Cleared on resubscribe so the column always answers "when did they
      -- last opt out", rather than keeping a date that no longer applies.
      marketing_opt_out_at = CASE WHEN p_opt_out THEN now() ELSE NULL END,
      updated_at           = now()
  WHERE id = p_user_id;

  -- Pull them out of anything still queued, same as a self-service unsubscribe.
  IF p_opt_out THEN
    DELETE FROM public.email_deliveries
    WHERE user_id = p_user_id AND status = 'pending';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (
    p_admin_id, p_user_id,
    CASE WHEN p_opt_out THEN 'marketing_unsubscribe' ELSE 'marketing_resubscribe' END,
    jsonb_build_object('from', v_before, 'to', p_opt_out)
  );

  RETURN p_opt_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_marketing_opt_out(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- Surface the subscription state on the user detail page. Two keys added to
-- the summary; everything else is unchanged from 20260818160000.
CREATE OR REPLACE FUNCTION public.admin_user_summary_by_id(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id  uuid := p_user_id;
  v_out jsonb;
BEGIN
  IF v_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id) THEN
    RETURN jsonb_build_object('found', false, 'user_id', p_user_id);
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'user_id', v_id,
    'email', (SELECT email FROM public.profiles WHERE id = v_id),
    'joined', (SELECT created_at FROM public.profiles WHERE id = v_id),
    'balance', (SELECT round(balance, 2) FROM public.profiles WHERE id = v_id),
    'is_banned', (SELECT is_banned FROM public.profiles WHERE id = v_id),
    'is_admin', (SELECT is_admin FROM public.profiles WHERE id = v_id),
    'is_flagged', (SELECT is_flagged FROM public.profiles WHERE id = v_id),
    'flag_reason', (SELECT flag_reason FROM public.profiles WHERE id = v_id),
    'marketing_opt_out', (SELECT marketing_opt_out FROM public.profiles WHERE id = v_id),
    'marketing_opt_out_at', (SELECT marketing_opt_out_at FROM public.profiles WHERE id = v_id),

    'deposited_real', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'completed'
        AND (provider IS NULL OR provider <> 'admin')), 0),
    'credited_by_admin', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'completed'
        AND provider = 'admin'), 0),
    'deposit_count', (
      SELECT count(*) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'completed'
        AND (provider IS NULL OR provider <> 'admin')),
    'pending_topups', (
      SELECT count(*) FROM public.transactions
      WHERE user_id = v_id AND type = 'topup' AND status = 'pending'),

    'total_deducted', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'deduction' AND status = 'completed'), 0),
    'total_refunded', COALESCE((
      SELECT round(sum(amount), 2) FROM public.transactions
      WHERE user_id = v_id AND type = 'refund' AND status = 'completed'), 0),

    'orders_total', (SELECT count(*) FROM public.orders WHERE user_id = v_id),
    'orders_delivered', (
      SELECT count(DISTINCT o.id) FROM public.orders o
      JOIN public.messages m ON m.order_id = o.id
      WHERE o.user_id = v_id),
    'spent_on_delivered', COALESCE((
      SELECT round(sum(o.cost), 2) FROM public.orders o
      WHERE o.user_id = v_id
        AND EXISTS (SELECT 1 FROM public.messages m WHERE m.order_id = o.id)), 0),
    'orders_by_status', COALESCE((
      SELECT jsonb_object_agg(s, n) FROM (
        SELECT status::text AS s, count(*) AS n
        FROM public.orders WHERE user_id = v_id GROUP BY status) x), '{}'::jsonb),

    'rentals_total', (SELECT count(*) FROM public.rentals WHERE user_id = v_id),
    'spent_on_rentals', COALESCE((
      SELECT round(sum(cost), 2) FROM public.rentals
      WHERE user_id = v_id AND status <> 'cancelled'), 0),
    'esims_total', (SELECT count(*) FROM public.esims WHERE user_id = v_id),
    'spent_on_esims', COALESCE((
      SELECT round(sum(cost), 2) FROM public.esims
      WHERE user_id = v_id AND status <> 'failed'), 0)
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_summary_by_id(uuid)
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE '=== unsubscribed users: % ===',
    (SELECT count(*) FROM public.profiles WHERE marketing_opt_out);
END $$;
