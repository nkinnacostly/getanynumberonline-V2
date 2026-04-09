CREATE OR REPLACE FUNCTION public.deduct_balance_and_create_rental(
  p_user_id       UUID,
  p_cost          NUMERIC,
  p_country       TEXT,
  p_country_name  TEXT,
  p_service       TEXT,
  p_service_name  TEXT,
  p_days          INT,
  p_rental_id     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance_before  NUMERIC;
  v_balance_after   NUMERIC;
  v_id              UUID;
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

  INSERT INTO public.rentals (
    user_id, country, country_name, service, service_name,
    days, cost, status, expires_at, smspool_rental_id
  )
  VALUES (
    p_user_id, p_country, p_country_name, p_service, p_service_name,
    p_days, p_cost, 'active',
    now() + (p_days || ' days')::interval,
    p_rental_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_before, balance_after, status, note
  )
  VALUES (
    p_user_id, 'deduction', p_cost, v_balance_before, v_balance_after,
    'completed', p_days || '-day rental: ' || p_service_name || ' (' || p_country_name || ')'
  );

  RETURN v_id;
END;
$$;
