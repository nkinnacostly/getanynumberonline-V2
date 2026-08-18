-- Fraud / velocity controls: the pieces the application code needs.
--
-- platform_settings, profiles.is_flagged/flag_reason, check_order_velocity()
-- and evaluate_user_fraud() already exist (captured in
-- 20260818130000_fraud_controls_baseline.sql). This adds what is missing around
-- them: a way for a user to be told the first-deposit minimum without exposing
-- the settings table, admin surfaces for the review queue, and the guard that
-- stops a flagged user simply un-flagging themselves.

-- ── 1. The flag has to be tamper-proof to mean anything ──────
--
-- guard_profile_privileged_columns covers is_admin, balance and is_banned, but
-- not the new flag columns — and the "Users can update own profile" RLS policy
-- is still live. Without this, a flagged user can clear their own flag from the
-- browser with a single PATCH, which makes the whole review queue decorative.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'is_admin cannot be changed directly';
    END IF;
    IF NEW.balance IS DISTINCT FROM OLD.balance THEN
      RAISE EXCEPTION 'balance can only be changed through a balance RPC';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'is_banned cannot be changed directly';
    END IF;
    IF NEW.is_flagged IS DISTINCT FROM OLD.is_flagged THEN
      RAISE EXCEPTION 'is_flagged cannot be changed directly';
    END IF;
    IF NEW.flag_reason IS DISTINCT FROM OLD.flag_reason THEN
      RAISE EXCEPTION 'flag_reason cannot be changed directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The review queue reads only flagged rows; there are few of them by design.
CREATE INDEX IF NOT EXISTS profiles_flagged_idx
  ON public.profiles (created_at DESC) WHERE is_flagged;

-- ── 2. First-deposit minimum, answerable by the user's own client ──
--
-- The rule has to be enforced server-side, but platform_settings is
-- service-role only (RLS on, no policies) and Vercel deliberately holds no
-- service-role key (CLAUDE.md §6). So rather than widen either of those, this
-- SECURITY DEFINER function answers the single question the checkout needs and
-- nothing else.
--
-- It reads auth.uid() itself instead of taking a user id, so a caller cannot
-- ask the question "as" somebody else — whether this is a first deposit is
-- decided from the ledger, never from the client.
CREATE OR REPLACE FUNCTION public.check_first_topup_minimum(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_min      numeric;
  v_is_first boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT value INTO v_min
  FROM public.platform_settings WHERE key = 'min_first_deposit';
  v_min := COALESCE(v_min, 0);

  -- "First" means no completed top-up has ever landed. Admin credits are
  -- excluded: a goodwill credit is not the user putting money in, so it must
  -- not quietly satisfy the minimum.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE user_id = v_user_id
      AND type = 'topup'
      AND status = 'completed'
      AND (provider IS NULL OR provider <> 'admin')
  ) INTO v_is_first;

  RETURN jsonb_build_object(
    'is_first', v_is_first,
    'min_first_deposit', v_min,
    'allowed', (NOT v_is_first) OR p_amount >= v_min
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_first_topup_minimum(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_first_topup_minimum(numeric) TO authenticated;

-- ── 3. Admin: the flagged review queue ───────────────────────
-- Order and cancel counts come back with the row because the whole point of
-- the queue is judging the flag, and "12 orders, 11 cancelled" is the judgement.
CREATE OR REPLACE FUNCTION public.admin_list_flagged(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_rows     jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.flagged_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT p.id,
           p.email,
           round(p.balance, 2)                        AS balance,
           p.flag_reason,
           p.is_banned,
           p.created_at,
           -- No flagged_at column exists upstream; updated_at is when the flag
           -- was written, since evaluate_user_fraud is what last touched the row.
           p.updated_at                               AS flagged_at,
           COALESCE(o.total, 0)                       AS order_count,
           COALESCE(o.cancelled, 0)                   AS cancel_count
    FROM public.profiles p
    LEFT JOIN (
      SELECT user_id,
             count(*)                                                    AS total,
             count(*) FILTER (WHERE status IN ('cancelled', 'refunded')) AS cancelled
      FROM public.orders GROUP BY user_id
    ) o ON o.user_id = p.id
    WHERE p.is_flagged
  ) r;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_flagged(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Admin: clear a flag ───────────────────────────────────
-- Deliberately does NOT touch is_banned. Clearing a flag says "reviewed, not
-- fraud"; banning is a separate decision with its own audit entry.
CREATE OR REPLACE FUNCTION public.admin_clear_flag(
  p_admin_id uuid,
  p_user_id  uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_reason   text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT flag_reason INTO v_reason
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  UPDATE public.profiles
  SET is_flagged = false, flag_reason = NULL, updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (p_admin_id, p_user_id, 'clear_flag',
          jsonb_build_object('cleared_reason', v_reason));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_flag(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Admin: read + write the levers ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_settings(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_rows     jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.key), '[]'::jsonb) INTO v_rows
  FROM (SELECT key, value, description, updated_at
        FROM public.platform_settings) r;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_settings(uuid) FROM PUBLIC, anon, authenticated;

-- Bounds are enforced here, not in the UI. These levers gate money and
-- ordering: a stray keystroke setting max_orders_per_hour to 0 would take the
-- whole product offline, and a negative cancel rate would flag every customer.
CREATE OR REPLACE FUNCTION public.admin_update_setting(
  p_admin_id uuid,
  p_key      text,
  p_value    numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_old      numeric;
  v_min      numeric;
  v_max      numeric;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_value IS NULL THEN
    RAISE EXCEPTION 'Value is required';
  END IF;

  -- Unknown keys are rejected rather than inserted, so this cannot be used to
  -- write arbitrary rows into the settings table.
  CASE p_key
    WHEN 'min_first_deposit'   THEN v_min := 0; v_max := 500;
    WHEN 'max_orders_per_hour' THEN v_min := 1; v_max := 1000;
    WHEN 'flag_cancel_rate'    THEN v_min := 0; v_max := 1;
    WHEN 'flag_min_orders'     THEN v_min := 1; v_max := 100000;
    ELSE RAISE EXCEPTION 'Unknown setting: %', p_key;
  END CASE;

  IF p_value < v_min OR p_value > v_max THEN
    RAISE EXCEPTION '% must be between % and %', p_key, v_min, v_max;
  END IF;

  SELECT value INTO v_old FROM public.platform_settings WHERE key = p_key FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Setting % not found', p_key;
  END IF;

  UPDATE public.platform_settings
  SET value = p_value, updated_at = now()
  WHERE key = p_key;

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (p_admin_id, NULL, 'update_setting',
          jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));

  RETURN p_value;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_setting(uuid, text, numeric)
  FROM PUBLIC, anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '=== fraud control surfaces ===';
  FOR r IN
    SELECT p.proname, pg_get_function_result(p.oid) AS ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('check_first_topup_minimum', 'admin_list_flagged',
                        'admin_clear_flag', 'admin_get_settings',
                        'admin_update_setting')
    ORDER BY p.proname
  LOOP
    RAISE NOTICE '  % -> %', rpad(r.proname, 28), r.ret;
  END LOOP;
  RAISE NOTICE '  flagged users now: %',
    (SELECT count(*) FROM public.profiles WHERE is_flagged);
END $$;
