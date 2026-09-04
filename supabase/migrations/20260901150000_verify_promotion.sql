-- Verification only. Creates two throwaway campaigns, drives a real webhook
-- event through record_email_event, asserts the pending row was re-ranked, and
-- deletes everything it made. Any failure raises, which rolls the whole
-- migration back — so this can never leave test rows behind.
DO $$
DECLARE
  v_admin   uuid;
  v_user    uuid;
  v_sent    uuid;   -- campaign whose email gets opened
  v_pending uuid;   -- campaign still waiting to go out
  v_prio    smallint;
  v_status  text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user  FROM public.profiles WHERE email IS NOT NULL ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL OR v_user IS NULL THEN
    RAISE WARNING 'no admin/profile to test with — promotion NOT verified';
    RETURN;
  END IF;

  INSERT INTO public.email_campaigns (subject, body_markdown, audience, status, created_by)
  VALUES ('__verify sent__', 'x', 'all', 'sent', v_admin) RETURNING id INTO v_sent;
  INSERT INTO public.email_campaigns (subject, body_markdown, audience, status, created_by)
  VALUES ('__verify pending__', 'x', 'all', 'queued', v_admin) RETURNING id INTO v_pending;

  -- The already-delivered one carries the provider id the webhook references.
  INSERT INTO public.email_deliveries
    (campaign_id, user_id, email, status, provider_id, priority)
  VALUES (v_sent, v_user, 'verify@example.invalid', 'sent', '__verify_pid__', 2);

  -- The one still queued, filed as "never had a campaign".
  INSERT INTO public.email_deliveries
    (campaign_id, user_id, email, status, priority)
  VALUES (v_pending, v_user, 'verify@example.invalid', 'pending', 2);

  -- 1. An open must promote the still-pending row to the engaged tier.
  PERFORM public.record_email_event(
    '__verify_svix_open__', '__verify_pid__', 'email.opened', now(), '{}'::jsonb);

  SELECT priority INTO v_prio FROM public.email_deliveries
  WHERE campaign_id = v_pending AND user_id = v_user;
  IF v_prio <> 0 THEN
    RAISE EXCEPTION 'open did not promote: pending row is priority %, expected 0', v_prio;
  END IF;
  RAISE NOTICE 'open promoted the pending row 2 -> 0';

  -- 2. A soft bounce must send them to the back without deleting anything.
  PERFORM public.record_email_event(
    '__verify_svix_soft__', '__verify_pid__', 'email.bounced', now(),
    '{"bounce":{"type":"Transient","message":"mailbox full"}}'::jsonb);

  SELECT priority, status INTO v_prio, v_status FROM public.email_deliveries
  WHERE campaign_id = v_pending AND user_id = v_user;
  IF v_prio <> 2 THEN
    RAISE EXCEPTION 'soft bounce did not demote: priority %, expected 2', v_prio;
  END IF;
  RAISE NOTICE 'soft bounce demoted 0 -> 2, row kept (status %)', v_status;

  -- 3. A permanent bounce must remove the pending row outright.
  PERFORM public.record_email_event(
    '__verify_svix_hard__', '__verify_pid__', 'email.bounced', now(),
    '{"bounce":{"type":"Permanent","message":"no such user"}}'::jsonb);

  IF EXISTS (SELECT 1 FROM public.email_deliveries
             WHERE campaign_id = v_pending AND user_id = v_user) THEN
    RAISE EXCEPTION 'permanent bounce left the pending row in place';
  END IF;
  RAISE NOTICE 'permanent bounce removed the pending row';

  -- Undo everything, including the opt-out the permanent bounce just set and
  -- which this test user did not ask for.
  UPDATE public.profiles
  SET marketing_opt_out = false, marketing_opt_out_at = NULL
  WHERE id = v_user;
  DELETE FROM public.email_webhook_events
  WHERE svix_id IN ('__verify_svix_open__', '__verify_svix_soft__', '__verify_svix_hard__');
  DELETE FROM public.email_campaigns WHERE id IN (v_sent, v_pending);

  IF EXISTS (SELECT 1 FROM public.email_deliveries WHERE provider_id = '__verify_pid__') THEN
    RAISE EXCEPTION 'cleanup failed — verify rows survived';
  END IF;
  RAISE NOTICE 'cleaned up; all three behaviours verified';
END $$;
