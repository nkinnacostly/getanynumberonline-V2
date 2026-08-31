-- A reusable admin grant, replacing the copy-paste DO block.
--
-- 20260805130000_seed_first_admin.sql could only run once, at a moment when
-- the profile already existed. Granting a second admin meant a second
-- near-identical migration — and one that silently does nothing if the person
-- has not signed up yet, which is the usual order of events.
--
-- This is deliberately NOT callable from the app. guard_profile_privileged_
-- columns blocks anon/authenticated from setting is_admin precisely so the
-- flag cannot be granted from a browser; a SECURITY DEFINER function that
-- bypasses it must be reachable only by the service role.

CREATE OR REPLACE FUNCTION public.grant_admin(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_already boolean;
BEGIN
  SELECT id, is_admin INTO v_id, v_already
  FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email));

  -- Loud, not silent: a typo here would leave the panel unreachable while the
  -- call still looked like it worked.
  IF v_id IS NULL THEN
    RETURN format(
      'NO SUCH PROFILE: %s has not signed up yet — create the account first, then call this again.',
      p_email
    );
  END IF;

  IF v_already THEN
    RETURN format('%s is already an admin.', p_email);
  END IF;

  UPDATE public.profiles
  SET is_admin = true, updated_at = now()
  WHERE id = v_id;

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (v_id, v_id, 'grant_admin',
          jsonb_build_object('email', p_email, 'via', 'grant_admin()'));

  RETURN format('granted admin to %s', p_email);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin(text) FROM PUBLIC, anon, authenticated;

-- Mirror image, so access can be taken back the same way it was given.
CREATE OR REPLACE FUNCTION public.revoke_admin(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.profiles
  WHERE lower(email) = lower(btrim(p_email));

  IF v_id IS NULL THEN
    RETURN format('NO SUCH PROFILE: %s', p_email);
  END IF;

  -- Never leave the panel with no way in.
  IF (SELECT count(*) FROM public.profiles WHERE is_admin) <= 1 THEN
    RAISE EXCEPTION 'Refusing to remove the last admin';
  END IF;

  UPDATE public.profiles SET is_admin = false, updated_at = now()
  WHERE id = v_id;

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (v_id, v_id, 'revoke_admin',
          jsonb_build_object('email', p_email, 'via', 'revoke_admin()'));

  RETURN format('revoked admin from %s', p_email);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_admin(text) FROM PUBLIC, anon, authenticated;

-- Attempt the grant now. It reports rather than fails when the account does
-- not exist yet, which is the expected case the first time this runs.
DO $$
DECLARE
  v_result text;
BEGIN
  SELECT public.grant_admin('hello@getanynumberonline.com') INTO v_result;
  RAISE NOTICE '%', v_result;
END $$;
