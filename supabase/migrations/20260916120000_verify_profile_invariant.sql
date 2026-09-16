-- Google sign-in rests on an invariant this repo has never written down.
--
-- Every wallet, order, rental and eSIM hangs off public.profiles, but nothing
-- in src/ ever inserts a profile row and no migration here creates the table —
-- the base schema was built in the dashboard. So the row must come from a
-- trigger on auth.users that none of this repo can see.
--
-- That matters now because a Google sign-in inserts into auth.users through a
-- different path than signUp() does. If the trigger were conditional on the
-- provider, an OAuth user would land with a session and no profile: no wallet
-- row, no balance, and a dashboard that reads zero everywhere. Silent, and
-- only visible once someone tries to pay.
--
-- This migration changes nothing. It prints what the trigger actually is, and
-- refuses to apply if the invariant is already broken — so the assumption is
-- recorded and checked rather than assumed.
DO $$
DECLARE
  r          record;
  v_orphans  int;
  v_users    int;
  v_found    boolean := false;
BEGIN
  FOR r IN
    SELECT t.tgname,
           p.proname,
           pg_get_functiondef(p.oid) AS def
    FROM pg_trigger t
    JOIN pg_proc      p ON p.oid = t.tgfoid
    JOIN pg_class     c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
  LOOP
    v_found := true;
    RAISE NOTICE 'auth.users trigger % calls %()', r.tgname, r.proname;
    -- The body is what answers the question: does it touch profiles, and does
    -- it branch on the provider?
    RAISE NOTICE 'touches profiles: %   mentions provider: %',
      r.def ILIKE '%profiles%',
      r.def ILIKE '%provider%';
    RAISE NOTICE 'body: %', replace(substr(r.def, 1, 900), E'\n', ' ');
  END LOOP;

  IF NOT v_found THEN
    RAISE NOTICE 'no user-defined trigger on auth.users';
  END IF;

  SELECT count(*) INTO v_users FROM auth.users;
  SELECT count(*) INTO v_orphans
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      '% of % users have no profiles row — fix that before enabling OAuth',
      v_orphans, v_users;
  END IF;

  RAISE NOTICE 'profile invariant holds: % users, 0 without a profile', v_users;
END;
$$;
