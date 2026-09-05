-- The scheduler: turn due, approved campaigns into queued ones.

-- A scheduled campaign is a draft with a date on it, so the queue accepts both.
-- Everything else about admin_queue_campaign is unchanged.
CREATE OR REPLACE FUNCTION public.admin_queue_campaign(
  p_admin_id    uuid,
  p_campaign_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_c        public.email_campaigns%ROWTYPE;
  v_count    int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO v_c FROM public.email_campaigns
  WHERE id = p_campaign_id FOR UPDATE;

  IF v_c.id IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  IF v_c.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign already %', v_c.status;
  END IF;
  IF v_c.audience = 'all' AND v_c.test_sent_at IS NULL THEN
    RAISE EXCEPTION 'Send yourself a test first';
  END IF;

  INSERT INTO public.email_deliveries (campaign_id, user_id, email, priority)
  SELECT p_campaign_id, p.id, p.email, COALESCE(pr.priority, 2::smallint)
  FROM public.profiles p
  LEFT JOIN public.email_recipient_priority() pr ON pr.user_id = p.id
  WHERE p.email IS NOT NULL
    AND p.is_banned = false
    AND p.marketing_opt_out = false
    AND (v_c.audience = 'all' OR p.id = v_c.target_user_id)
    AND (
      v_c.audience <> 'all'
      OR p.id NOT IN (SELECT b.user_id FROM public.email_bounce_suppressed() b)
    )
  ON CONFLICT (campaign_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'No eligible recipients (unsubscribed, banned, bounced, or no email on file)';
  END IF;

  UPDATE public.email_campaigns
  SET status = 'queued', recipient_count = v_count, queued_at = now()
  WHERE id = p_campaign_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_queue_campaign(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

/*
 * Promote every campaign whose time has come.
 *
 * The approval check is repeated here rather than trusted from the scheduling
 * step: approval can be withdrawn after a date is set, and the last word on
 * "may this reach real people" belongs to the moment of sending, not to
 * whatever was true when someone picked a date.
 *
 * SKIP LOCKED so two overlapping cron ticks cannot both queue the same
 * campaign — the UNIQUE index on (campaign_id, user_id) would stop duplicate
 * mail either way, but a second queue attempt would raise and fail the run.
 */
CREATE OR REPLACE FUNCTION public.dispatch_due_campaigns(p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r        record;
  v_queued jsonb := '[]'::jsonb;
  v_count  int;
BEGIN
  FOR r IN
    SELECT c.id, c.approved_by, c.subject
    FROM public.email_campaigns c
    WHERE c.status = 'scheduled'
      AND c.approved_at IS NOT NULL
      AND c.approved_by IS NOT NULL
      AND c.scheduled_for <= now()
    ORDER BY c.scheduled_for
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(p_limit, 1)
  LOOP
    BEGIN
      v_count := public.admin_queue_campaign(r.approved_by, r.id);

      UPDATE public.email_campaigns
      SET dispatched_at = now() WHERE id = r.id;

      v_queued := v_queued || jsonb_build_object(
        'campaign_id', r.id, 'subject', r.subject, 'recipients', v_count);
    EXCEPTION WHEN OTHERS THEN
      -- One bad campaign must not stop the others. Park it as failed with the
      -- reason on the row, where the admin list already shows last_error.
      UPDATE public.email_campaigns
      SET status = 'failed', last_error = SQLERRM, dispatched_at = now()
      WHERE id = r.id;
      RAISE WARNING 'dispatch failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('queued', v_queued);
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_due_campaigns(int)
  FROM PUBLIC, anon, authenticated;

/** Campaigns the drain still owes work to, for the dispatcher to pick up. */
CREATE OR REPLACE FUNCTION public.campaigns_in_flight(p_limit int DEFAULT 5)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id FROM public.email_campaigns c
  WHERE c.status IN ('queued', 'sending')
  ORDER BY c.queued_at
  LIMIT greatest(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.campaigns_in_flight(int)
  FROM PUBLIC, anon, authenticated;

-- ── Cron installation ────────────────────────────────────────
-- Mirrors schedule_esim_reconcile: the secret is passed in at call time and
-- deliberately never committed.
CREATE OR REPLACE FUNCTION public.schedule_campaign_dispatch(
  p_functions_url text,
  p_secret        text,
  p_schedule      text DEFAULT '*/5 * * * *'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cmd text;
BEGIN
  PERFORM cron.unschedule('dispatch-campaigns')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-campaigns');

  v_cmd := format(
    $cmd$select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reconcile-secret', %L),
      body := '{}'::jsonb
    )$cmd$,
    rtrim(p_functions_url, '/') || '/dispatch-campaigns',
    p_secret
  );

  PERFORM cron.schedule('dispatch-campaigns', p_schedule, v_cmd);
  RETURN format('dispatch-campaigns scheduled %s', p_schedule);
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_campaign_dispatch(text, text, text)
  FROM PUBLIC, anon, authenticated;
