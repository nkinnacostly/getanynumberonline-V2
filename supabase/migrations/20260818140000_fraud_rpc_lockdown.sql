-- Lock down the fraud RPCs, and report the two schema details the application
-- code still needs.
--
-- SECURITY: check_order_velocity and evaluate_user_fraud were created SECURITY
-- DEFINER with EXECUTE granted to PUBLIC/anon/authenticated — the Postgres
-- default for a new function. evaluate_user_fraud takes an arbitrary user_id
-- and WRITES profiles.is_flagged, so as it stands any signed-in user can flag
-- any other account by calling it directly against the REST API, and
-- check_order_velocity lets them read anyone's order count.
--
-- Both are only ever called by Edge Functions holding the service role, so
-- nothing legitimate loses access here.

REVOKE ALL ON FUNCTION public.check_order_velocity(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_user_fraud(uuid)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '=== grants after revoke ===';
  FOR r IN
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('check_order_velocity', 'evaluate_user_fraud')
    ORDER BY routine_name, grantee
  LOOP
    RAISE NOTICE '  % -> %', rpad(r.routine_name, 22), r.grantee;
  END LOOP;

  -- ── platform_settings shape (scrolled off the previous run) ──
  RAISE NOTICE '=== platform_settings columns ===';
  FOR r IN
    SELECT column_name, data_type, is_nullable, COALESCE(column_default, '-') AS def
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_settings'
    ORDER BY ordinal_position
  LOOP
    RAISE NOTICE '  % | % | nullable=% | default=%',
      rpad(r.column_name, 20), rpad(r.data_type, 18), r.is_nullable, r.def;
  END LOOP;

  RAISE NOTICE '=== platform_settings rows ===';
  FOR r IN EXECUTE 'SELECT * FROM public.platform_settings ORDER BY 1' LOOP
    RAISE NOTICE '  %', row_to_json(r);
  END LOOP;

  -- ── does the privileged-column trigger cover the flag columns? ──
  -- admin_set_ban exists because a trigger blocks direct writes to is_banned.
  -- If is_flagged is guarded the same way, clearing a flag needs its own RPC
  -- rather than a plain service-role UPDATE.
  RAISE NOTICE '=== guard trigger source ===';
  FOR r IN
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'guard_profile_privileged_columns'
  LOOP
    RAISE NOTICE '%', r.def;
  END LOOP;
END $$;
