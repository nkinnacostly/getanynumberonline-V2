-- Fix refund_order: orders.status is the enum `order_status`, not text.
--
-- The first version assigned the text parameter straight to the column, so
-- every call failed with 42804 ("column status is of type order_status but
-- expression is of type text") and no refund went through. The parameter stays
-- text so callers don't need the enum type in scope; it is cast on assignment.

CREATE OR REPLACE FUNCTION public.refund_order(
  p_order_id uuid,
  p_status   text DEFAULT 'refunded',
  p_reason   text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_cost    numeric;
  v_status  text;
  v_service text;
  v_country text;
BEGIN
  IF p_status NOT IN ('refunded', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'refund_order: invalid target status %', p_status;
  END IF;

  SELECT user_id, cost, status::text, service_name, country_name
    INTO v_user_id, v_cost, v_status, v_service, v_country
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- A code was delivered. The user got what they paid for.
  IF v_status = 'active' THEN
    RETURN false;
  END IF;

  -- Already settled by another path.
  IF v_status IN ('cancelled', 'refunded') THEN
    RETURN false;
  END IF;

  PERFORM public.credit_balance(
    p_user_id      => v_user_id,
    p_amount       => v_cost,
    p_type         => 'refund'::transaction_type,
    p_order_id     => p_order_id,
    p_provider     => 'system',
    p_provider_ref => 'refund_order_' || p_order_id::text,
    p_note         => COALESCE(
      p_reason,
      'Refund: no code received (' || COALESCE(v_service, '?') || ', ' ||
      COALESCE(v_country, '?') || ')'
    )
  );

  UPDATE public.orders
  SET status = p_status::order_status, updated_at = now()
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_order(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
