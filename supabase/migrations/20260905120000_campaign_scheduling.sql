-- Scheduling and approval for campaigns.
--
-- The rule the whole design is built around: nothing reaches a real inbox that
-- a human has not explicitly approved. A draft written by the AI agent is just
-- text in a row until an admin approves it, and the scheduler will not touch
-- an unapproved campaign no matter what date is on it.

ALTER TABLE public.email_campaigns
  -- When it should go out. NULL means "not scheduled".
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  -- The human gate. The scheduler refuses to send without this.
  ADD COLUMN IF NOT EXISTS approved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by   uuid REFERENCES auth.users (id),
  -- 'human' or 'ai', so the campaign list can show what wrote it.
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'human',
  -- What the admin asked the agent for. Kept so a draft can be regenerated
  -- and so the next brief can be written against the last one.
  ADD COLUMN IF NOT EXISTS ai_brief      text,
  -- Set when the scheduler picks it up, so a stuck campaign is visible.
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;

ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_status_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed'));

ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_source_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_source_check
  CHECK (source IN ('human', 'ai'));

-- A scheduled campaign must have a date, and a dated one must be scheduled.
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_schedule_pair;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_schedule_pair
  CHECK (status <> 'scheduled' OR scheduled_for IS NOT NULL);

-- The dispatcher's access path.
CREATE INDEX IF NOT EXISTS email_campaigns_due_idx
  ON public.email_campaigns (scheduled_for)
  WHERE status = 'scheduled';

-- ── Approve ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_campaign(
  p_admin_id    uuid,
  p_campaign_id uuid,
  p_approved    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_c        public.email_campaigns%ROWTYPE;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT * INTO v_c FROM public.email_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF v_c.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign is already %', v_c.status;
  END IF;

  IF p_approved THEN
    -- Same bar as sending by hand: a broadcast has to have been seen in a real
    -- inbox first. Approving something nobody has looked at would defeat the
    -- point of the gate.
    IF v_c.audience = 'all' AND v_c.test_sent_at IS NULL THEN
      RAISE EXCEPTION 'Send yourself a test before approving';
    END IF;

    UPDATE public.email_campaigns
    SET approved_at = now(), approved_by = p_admin_id
    WHERE id = p_campaign_id;
  ELSE
    -- Withdrawing approval also unschedules: a dated campaign nobody stands
    -- behind must not sit in the queue waiting for its date.
    UPDATE public.email_campaigns
    SET approved_at = NULL, approved_by = NULL,
        status = CASE WHEN status = 'scheduled' THEN 'draft' ELSE status END,
        scheduled_for = CASE WHEN status = 'scheduled' THEN NULL ELSE scheduled_for END
    WHERE id = p_campaign_id;
  END IF;

  RETURN jsonb_build_object('approved', p_approved);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_campaign(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- ── Schedule / reschedule / unschedule ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_schedule_campaign(
  p_admin_id    uuid,
  p_campaign_id uuid,
  p_when        timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_c        public.email_campaigns%ROWTYPE;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT * INTO v_c FROM public.email_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF v_c.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign is already %', v_c.status;
  END IF;

  IF p_when IS NULL THEN
    UPDATE public.email_campaigns
    SET status = 'draft', scheduled_for = NULL
    WHERE id = p_campaign_id;
    RETURN jsonb_build_object('scheduled_for', NULL);
  END IF;

  -- A minute of slack, so "schedule for 9am" typed at 9am is not rejected.
  IF p_when < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'That time is in the past';
  END IF;
  IF v_c.audience = 'all' AND v_c.test_sent_at IS NULL THEN
    RAISE EXCEPTION 'Send yourself a test before scheduling';
  END IF;

  UPDATE public.email_campaigns
  SET status = 'scheduled', scheduled_for = p_when
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object('scheduled_for', p_when);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_schedule_campaign(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- ── What the calendar draws ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_campaign_calendar(
  p_admin_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_rows     jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.at), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT c.id, c.subject, c.status, c.audience, c.source, c.template,
           c.approved_at IS NOT NULL AS approved,
           c.test_sent_at IS NOT NULL AS tested,
           c.recipient_count, c.sent_count, c.failed_count,
           -- Scheduled campaigns sit on their date; finished ones on the day
           -- they actually went out, so the calendar reads as a history too.
           COALESCE(c.scheduled_for, c.completed_at, c.queued_at) AS at
    FROM public.email_campaigns c
    WHERE COALESCE(c.scheduled_for, c.completed_at, c.queued_at) >= p_from
      AND COALESCE(c.scheduled_for, c.completed_at, c.queued_at) < p_to
  ) r;

  -- Unscheduled drafts have no date, so they cannot be drawn on a day. They
  -- ride along as a backlog the calendar can offer to place.
  RETURN jsonb_build_object(
    'entries', v_rows,
    'unscheduled', (
      SELECT COALESCE(jsonb_agg(u ORDER BY u.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT c.id, c.subject, c.status, c.audience, c.source, c.template,
               c.approved_at IS NOT NULL AS approved,
               c.test_sent_at IS NOT NULL AS tested,
               c.created_at
        FROM public.email_campaigns c
        WHERE c.status = 'draft' AND c.scheduled_for IS NULL
        LIMIT 50
      ) u
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_calendar(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
