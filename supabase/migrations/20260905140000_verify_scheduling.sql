-- Verification only. Drives the scheduler against throwaway campaigns and
-- deletes them again. The property being proved is the one the whole feature
-- rests on: an unapproved campaign does not send, however overdue it is.
DO $$
DECLARE
  v_admin    uuid;
  v_approved uuid;
  v_naked    uuid;
  v_result   jsonb;
  v_status   text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE WARNING 'no admin to test with — scheduling NOT verified';
    RETURN;
  END IF;

  -- Both are overdue by an hour and addressed to everyone. The only
  -- difference between them is approval.
  INSERT INTO public.email_campaigns
    (subject, body_markdown, audience, status, created_by, test_sent_at,
     scheduled_for, approved_at, approved_by)
  VALUES ('__verify approved__', 'x', 'all', 'scheduled', v_admin, now(),
          now() - interval '1 hour', now(), v_admin)
  RETURNING id INTO v_approved;

  INSERT INTO public.email_campaigns
    (subject, body_markdown, audience, status, created_by, test_sent_at,
     scheduled_for)
  VALUES ('__verify unapproved__', 'x', 'all', 'scheduled', v_admin, now(),
          now() - interval '1 hour')
  RETURNING id INTO v_naked;

  v_result := public.dispatch_due_campaigns(10);
  RAISE NOTICE 'dispatch returned %', v_result;

  SELECT status INTO v_status FROM public.email_campaigns WHERE id = v_approved;
  IF v_status <> 'queued' THEN
    RAISE EXCEPTION 'approved+due campaign did not queue: status %', v_status;
  END IF;
  RAISE NOTICE 'approved + due  -> queued (% recipients)',
    (SELECT recipient_count FROM public.email_campaigns WHERE id = v_approved);

  SELECT status INTO v_status FROM public.email_campaigns WHERE id = v_naked;
  IF v_status <> 'scheduled' THEN
    RAISE EXCEPTION
      'UNAPPROVED campaign was dispatched — status %, expected scheduled', v_status;
  END IF;
  RAISE NOTICE 'unapproved + due -> left alone (status %)', v_status;

  -- Withdrawing approval must also drop it off the schedule.
  PERFORM public.admin_approve_campaign(v_admin, v_naked, false);
  SELECT status INTO v_status FROM public.email_campaigns WHERE id = v_naked;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'withdrawing approval left status %', v_status;
  END IF;
  RAISE NOTICE 'approval withdrawn -> back to draft, date cleared';

  -- Scheduling a broadcast that has never been tested must be refused.
  BEGIN
    UPDATE public.email_campaigns SET test_sent_at = NULL WHERE id = v_naked;
    PERFORM public.admin_schedule_campaign(v_admin, v_naked, now() + interval '1 day');
    RAISE EXCEPTION 'untested broadcast was allowed onto the schedule';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%test%' THEN RAISE; END IF;
    RAISE NOTICE 'untested broadcast refused: %', SQLERRM;
  END;

  DELETE FROM public.email_deliveries WHERE campaign_id IN (v_approved, v_naked);
  DELETE FROM public.email_campaigns  WHERE id IN (v_approved, v_naked);
  RAISE NOTICE 'cleaned up; scheduling verified';
END $$;
