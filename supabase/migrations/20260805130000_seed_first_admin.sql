-- Seed the first admin.
--
-- This cannot be done from the app: guard_profile_privileged_columns blocks
-- anon/authenticated from setting is_admin, deliberately, so the very first
-- grant has to come from a migration or the SQL editor. Recorded here rather
-- than run ad hoc in the dashboard so there is a permanent record of who was
-- given access and when.

DO $$
DECLARE
  v_email text := 'heiscostly@gmail.com';
  v_id    uuid;
  r       record;
BEGIN
  RAISE NOTICE '--- admins BEFORE ---';
  FOR r IN SELECT email FROM public.profiles WHERE is_admin LOOP
    RAISE NOTICE '  %', r.email;
  END LOOP;

  SELECT id INTO v_id FROM public.profiles WHERE lower(email) = lower(v_email);

  IF v_id IS NULL THEN
    -- Loud, not silent: a typo here would leave the panel unreachable and the
    -- migration would otherwise look like it succeeded.
    RAISE WARNING 'No profile found for % — no admin granted', v_email;
  ELSE
    UPDATE public.profiles SET is_admin = true, updated_at = now()
    WHERE id = v_id;

    INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
    VALUES (v_id, v_id, 'grant_admin',
            jsonb_build_object('email', v_email, 'via', 'seed migration'));

    RAISE NOTICE 'granted admin to %', v_email;
  END IF;

  RAISE NOTICE '--- admins AFTER ---';
  FOR r IN SELECT email FROM public.profiles WHERE is_admin LOOP
    RAISE NOTICE '  %', r.email;
  END LOOP;
END $$;
