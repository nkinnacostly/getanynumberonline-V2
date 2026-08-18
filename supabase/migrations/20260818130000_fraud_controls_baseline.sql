-- Baseline capture for the fraud/velocity controls.
--
-- platform_settings, profiles.is_flagged/flag_reason, check_order_velocity()
-- and evaluate_user_fraud() were created directly against the remote database
-- and exist in NO migration — a fresh environment would not have them.
--
-- This migration changes nothing. It reports the actual shape of those objects
-- so the application code is written against what is really there rather than
-- what it is assumed to be, and so the contract is recorded in git.

DO $$
DECLARE r record; n int;
BEGIN
  -- ── platform_settings ──────────────────────────────────────
  IF to_regclass('public.platform_settings') IS NULL THEN
    RAISE NOTICE 'platform_settings: DOES NOT EXIST';
  ELSE
    RAISE NOTICE '=== platform_settings columns ===';
    FOR r IN
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_settings'
      ORDER BY ordinal_position
    LOOP
      RAISE NOTICE '  % | % | nullable=% | default=%',
        rpad(r.column_name, 22), rpad(r.data_type, 20), r.is_nullable,
        COALESCE(r.column_default, '-');
    END LOOP;

    RAISE NOTICE '=== platform_settings rows ===';
    FOR r IN EXECUTE 'SELECT * FROM public.platform_settings' LOOP
      RAISE NOTICE '  %', row_to_json(r);
    END LOOP;

    RAISE NOTICE '=== platform_settings RLS ===';
    SELECT count(*) INTO n FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'platform_settings';
    RAISE NOTICE '  rls_enabled=% policies=%',
      (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.platform_settings'::regclass),
      n;
    FOR r IN
      SELECT policyname, cmd, roles::text FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'platform_settings'
    LOOP
      RAISE NOTICE '  policy: % | cmd=% | roles=%', r.policyname, r.cmd, r.roles;
    END LOOP;
  END IF;

  -- ── profiles flag columns ──────────────────────────────────
  RAISE NOTICE '=== profiles flag columns ===';
  FOR r IN
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name IN ('is_flagged', 'flag_reason', 'is_banned', 'is_admin')
    ORDER BY column_name
  LOOP
    RAISE NOTICE '  % | % | nullable=% | default=%',
      rpad(r.column_name, 14), rpad(r.data_type, 12), r.is_nullable,
      COALESCE(r.column_default, '-');
  END LOOP;
  RAISE NOTICE '  currently flagged: %',
    (SELECT count(*) FROM public.profiles WHERE is_flagged IS TRUE);

  -- ── the two RPCs: exact signature and return type ──────────
  RAISE NOTICE '=== fraud RPCs ===';
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid)             AS returns,
           p.prosecdef                               AS security_definer
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('check_order_velocity', 'evaluate_user_fraud')
  LOOP
    RAISE NOTICE '  %(%) RETURNS % | secdef=%',
      r.proname, r.args, r.returns, r.security_definer;
  END LOOP;

  IF to_regprocedure('public.check_order_velocity(uuid)') IS NULL THEN
    RAISE NOTICE '  check_order_velocity(uuid): NOT FOUND';
  END IF;
  IF to_regprocedure('public.evaluate_user_fraud(uuid)') IS NULL THEN
    RAISE NOTICE '  evaluate_user_fraud(uuid): NOT FOUND';
  END IF;

  -- Who may execute them. If authenticated can call evaluate_user_fraud
  -- directly, a user could self-flag or probe — worth knowing.
  RAISE NOTICE '=== execute grants ===';
  FOR r IN
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('check_order_velocity', 'evaluate_user_fraud')
    ORDER BY routine_name, grantee
  LOOP
    RAISE NOTICE '  % -> % (%)', rpad(r.routine_name, 22), r.grantee, r.privilege_type;
  END LOOP;
END $$;

-- Show the bodies, so the velocity window and cancel-rate maths are known
-- rather than inferred from the function name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('check_order_velocity', 'evaluate_user_fraud')
  LOOP
    RAISE NOTICE '=== SOURCE: % ===', r.proname;
    RAISE NOTICE '%', r.def;
  END LOOP;
END $$;
