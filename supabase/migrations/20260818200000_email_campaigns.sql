-- Email marketing: campaigns, per-recipient delivery ledger, opt-out.
--
-- Two rules carried over from the refund work, because the failure modes are
-- the same shape — an action that must happen exactly once, per person:
--
--   * one row per (campaign, user) with a UNIQUE index, so a retry, a double
--     click or a cron overlap cannot mail the same person twice
--   * the send loop is a queue drain, not a request handler, so a timeout
--     halfway through a list resumes instead of restarting
--
-- Everything here is service-role only (RLS on, no policies), reachable through
-- Edge Functions behind the is_admin check.

-- ── Opt-out ──────────────────────────────────────────────────
-- Deliberately NOT added to guard_profile_privileged_columns: unlike is_banned
-- or is_flagged, this is the one flag the user themselves must be able to set.
-- Marketing to existing customers relies on soft opt-in, which is only lawful
-- while opting out stays free and easy.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz;

-- ── Campaigns ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         text NOT NULL,
  body_markdown   text NOT NULL,
  audience        text NOT NULL CHECK (audience IN ('all', 'user')),
  target_user_id  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','queued','sending','sent','failed')),
  recipient_count int  NOT NULL DEFAULT 0,
  sent_count      int  NOT NULL DEFAULT 0,
  failed_count    int  NOT NULL DEFAULT 0,
  -- A campaign to everyone cannot be queued until it has been seen in a real
  -- inbox. A typo mailed to the whole list is not recoverable.
  test_sent_at    timestamptz,
  created_by      uuid NOT NULL REFERENCES auth.users (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  queued_at       timestamptz,
  completed_at    timestamptz,
  last_error      text,
  CONSTRAINT target_required_for_single
    CHECK (audience <> 'user' OR target_user_id IS NOT NULL)
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS email_campaigns_created_idx
  ON public.email_campaigns (created_at DESC);

-- ── Per-recipient ledger ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns (id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  email       text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed')),
  provider_id text,
  error       text,
  attempts    int  NOT NULL DEFAULT 0,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

-- The structural guarantee: one delivery per person per campaign, enforced by
-- Postgres rather than by every code path remembering to check.
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_one_per_user
  ON public.email_deliveries (campaign_id, user_id);

-- The queue drain's access path.
CREATE INDEX IF NOT EXISTS email_deliveries_pending_idx
  ON public.email_deliveries (campaign_id) WHERE status = 'pending';

-- ── Create a draft ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_campaign(
  p_admin_id       uuid,
  p_subject        text,
  p_body           text,
  p_audience       text,
  p_target_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_id       uuid;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF coalesce(btrim(p_subject), '') = '' THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;
  IF coalesce(btrim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  INSERT INTO public.email_campaigns (
    subject, body_markdown, audience, target_user_id, created_by
  ) VALUES (
    btrim(p_subject), p_body, p_audience, p_target_user_id, p_admin_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Snapshot the recipients and hand the campaign to the queue ──
-- Recipients are frozen HERE, not read at send time: a list that shifts while
-- a send is draining is how people get mailed twice or missed entirely.
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
  IF v_c.status <> 'draft' THEN
    RAISE EXCEPTION 'Campaign already %', v_c.status;
  END IF;
  IF v_c.audience = 'all' AND v_c.test_sent_at IS NULL THEN
    RAISE EXCEPTION 'Send yourself a test first';
  END IF;

  -- Eligibility is one definition, applied once. Banned accounts and anyone
  -- who has unsubscribed are excluded here, so no send path can forget to.
  INSERT INTO public.email_deliveries (campaign_id, user_id, email)
  SELECT p_campaign_id, p.id, p.email
  FROM public.profiles p
  WHERE p.email IS NOT NULL
    AND p.is_banned = false
    AND p.marketing_opt_out = false
    AND (v_c.audience = 'all' OR p.id = v_c.target_user_id)
  ON CONFLICT (campaign_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'No eligible recipients (unsubscribed, banned, or no email on file)';
  END IF;

  UPDATE public.email_campaigns
  SET status = 'queued', recipient_count = v_count, queued_at = now()
  WHERE id = p_campaign_id;

  RETURN v_count;
END;
$$;

-- ── Listing for the admin UI ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_campaigns(
  p_admin_id uuid,
  p_limit    int DEFAULT 25,
  p_offset   int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_rows     jsonb;
  v_total    int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT count(*) INTO v_total FROM public.email_campaigns;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT c.id, c.subject, c.audience, c.status, c.recipient_count,
           c.sent_count, c.failed_count, c.test_sent_at, c.created_at,
           c.completed_at, c.last_error,
           t.email AS target_email
    FROM public.email_campaigns c
    LEFT JOIN public.profiles t ON t.id = c.target_user_id
    ORDER BY c.created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) r;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

-- ── How many people a campaign would actually reach ───────────
-- Shown before the send button, so "all users" is never an unknown number.
CREATE OR REPLACE FUNCTION public.admin_audience_size(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN jsonb_build_object(
    'eligible', (SELECT count(*) FROM public.profiles
                 WHERE email IS NOT NULL AND is_banned = false
                   AND marketing_opt_out = false),
    'unsubscribed', (SELECT count(*) FROM public.profiles WHERE marketing_opt_out),
    'banned', (SELECT count(*) FROM public.profiles WHERE is_banned)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_campaign(uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_queue_campaign(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_campaigns(uuid, int, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audience_size(uuid)
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE j jsonb;
BEGIN
  SELECT jsonb_build_object(
    'eligible', (SELECT count(*) FROM public.profiles
                 WHERE email IS NOT NULL AND is_banned = false
                   AND marketing_opt_out = false),
    'total', (SELECT count(*) FROM public.profiles)
  ) INTO j;
  RAISE NOTICE '=== audience today: % eligible of % profiles ===',
    j->>'eligible', j->>'total';
END $$;
