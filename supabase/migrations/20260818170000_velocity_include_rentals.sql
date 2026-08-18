-- Count rentals toward the rolling-hour velocity limit.
--
-- check_order_velocity counted the `orders` table only, so rent-number enforced
-- a limit that renting could never contribute to: ten rentals an hour passed
-- untouched, and a user throttled on numbers could keep buying rentals at will.
--
-- The counter now covers exactly the two paths that are gated by it — orders
-- and rentals. eSIMs are deliberately excluded: order-esim does not call this
-- check, and counting a purchase that isn't itself limited would throttle
-- number ordering for reasons the user cannot see or avoid.
--
-- Signature is unchanged (uuid -> integer), so the Edge Functions calling it
-- need no change to pick this up.

CREATE OR REPLACE FUNCTION public.check_order_velocity(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT
    (SELECT count(*) FROM public.orders
      WHERE user_id = p_user_id
        AND created_at > now() - interval '1 hour')
    +
    (SELECT count(*) FROM public.rentals
      WHERE user_id = p_user_id
        AND created_at > now() - interval '1 hour')
  INTO v_count;

  RETURN v_count;
END;
$$;

-- Re-assert the lockdown from 20260818140000. CREATE OR REPLACE keeps the
-- existing ACL, but this function is SECURITY DEFINER and reads another user's
-- activity, so the grant is stated explicitly rather than assumed.
REVOKE ALL ON FUNCTION public.check_order_velocity(uuid)
  FROM PUBLIC, anon, authenticated;

-- Both halves are covered by the (user_id, created_at DESC) indexes added in
-- 20260818120000_admin_user_detail.sql.

-- ── Verify against real activity ─────────────────────────────
-- Shows whether the widened count would change anyone's outcome right now, and
-- proves the function executes rather than merely compiling.
DO $$
DECLARE
  r       record;
  v_limit numeric;
  v_any   boolean := false;
BEGIN
  SELECT value INTO v_limit
  FROM public.platform_settings WHERE key = 'max_orders_per_hour';
  RAISE NOTICE '=== velocity (limit %) ===', v_limit;

  FOR r IN
    SELECT p.email,
           public.check_order_velocity(p.id) AS combined,
           (SELECT count(*) FROM public.orders o
             WHERE o.user_id = p.id AND o.created_at > now() - interval '1 hour') AS orders_only
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM public.orders o
                   WHERE o.user_id = p.id AND o.created_at > now() - interval '1 hour')
       OR EXISTS (SELECT 1 FROM public.rentals rr
                   WHERE rr.user_id = p.id AND rr.created_at > now() - interval '1 hour')
    ORDER BY 2 DESC
    LIMIT 10
  LOOP
    v_any := true;
    RAISE NOTICE '  % | was % now % %',
      rpad(COALESCE(r.email, '?'), 34), r.orders_only, r.combined,
      CASE WHEN r.combined >= v_limit THEN '<-- now blocked' ELSE '' END;
  END LOOP;

  IF NOT v_any THEN
    RAISE NOTICE '  no orders or rentals in the last hour';
  END IF;

  -- Exercise the function on a real id so a runtime error surfaces here.
  RAISE NOTICE '  sample call returns: %',
    public.check_order_velocity((SELECT id FROM public.profiles LIMIT 1));
END $$;
