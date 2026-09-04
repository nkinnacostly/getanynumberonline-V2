-- Send order by engagement, and bounce suppression.
--
-- Until now a broadcast drained in whatever order the recipients happened to be
-- inserted, which is effectively signup order. That matters more than it looks:
-- the sending plan has a daily cap, so a list that does not fit in one day gets
-- cut at an arbitrary point, and the first thing the receiving mail providers
-- judge our reputation on is that arbitrary first slice.
--
-- Ordering by past engagement puts the people most likely to open at the front
-- of every send. Opens and complaints are what Gmail and Yahoo actually measure,
-- so the early batches now set the best possible tone for the later ones.

-- 0 engaged, 1 delivered-but-never-opened, 2 no history. Default 2 so a row
-- inserted by anything that predates this migration lands in the "unknown"
-- bucket rather than jumping the queue.
ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 2;

COMMENT ON COLUMN public.email_deliveries.priority IS
  '0 = opened or clicked a previous campaign, 1 = delivered but never opened, 2 = never sent one before. Ascending send order.';

-- The claim's access path. Replaces the campaign-only partial index: the drain
-- now orders by (priority, created_at), and without this it would sort the
-- whole pending set on every batch.
DROP INDEX IF EXISTS email_deliveries_pending_idx;
CREATE INDEX IF NOT EXISTS email_deliveries_pending_priority_idx
  ON public.email_deliveries (campaign_id, priority, created_at)
  WHERE status = 'pending';

-- Reading engagement history, in one place so the queue and the audience
-- counter can never disagree about what "engaged" means.
CREATE OR REPLACE FUNCTION public.email_recipient_priority()
RETURNS TABLE (user_id uuid, priority smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.user_id,
         CASE
           WHEN bool_or(d.opened_at IS NOT NULL OR d.clicked_at IS NOT NULL)
             THEN 0::smallint
           WHEN bool_or(d.delivered_at IS NOT NULL)
             THEN 1::smallint
           ELSE 2::smallint
         END
  FROM public.email_deliveries d
  GROUP BY d.user_id;
$$;

REVOKE ALL ON FUNCTION public.email_recipient_priority()
  FROM PUBLIC, anon, authenticated;

/*
 * Who is suppressed for bouncing.
 *
 * A PERMANENT bounce already sets marketing_opt_out in record_email_event, so
 * those addresses are gone for good and never reach this. What is left is the
 * soft kind — a full mailbox, a server having a bad day — and a life sentence
 * for that would be wrong. So the rule is only "your most recent campaign
 * bounced": one campaign of rest, then they are eligible again.
 */
CREATE OR REPLACE FUNCTION public.email_bounce_suppressed()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT latest.user_id
  FROM (
    SELECT DISTINCT ON (d.user_id) d.user_id, d.bounced_at
    FROM public.email_deliveries d
    ORDER BY d.user_id, d.created_at DESC
  ) latest
  WHERE latest.bounced_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.email_bounce_suppressed()
  FROM PUBLIC, anon, authenticated;

-- ── Queue, now engagement-ordered and bounce-aware ───────────
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
  --
  -- Bounce suppression applies to broadcasts only. When an admin picks one
  -- person by name they have chosen that address deliberately, and refusing
  -- with "no eligible recipients" would be baffling — a hard bounce has
  -- already opted them out anyway.
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

-- ── Drain in priority order ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_email_deliveries(
  p_campaign_id uuid,
  p_limit       int DEFAULT 100
)
RETURNS TABLE (id uuid, user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_deliveries d
  SET status = 'sending', attempts = d.attempts + 1
  WHERE d.id IN (
    SELECT d2.id FROM public.email_deliveries d2
    WHERE d2.campaign_id = p_campaign_id
      AND d2.status = 'pending'
    -- Engaged recipients first. If a send is ever cut short — a daily cap, a
    -- timeout, an aborted drain — the people who reliably open are the ones
    -- who already got it.
    ORDER BY d2.priority, d2.created_at
    -- SKIP LOCKED is what makes concurrent drains safe rather than merely
    -- unlikely: a row already claimed by another worker is passed over.
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(p_limit, 1)
  )
  RETURNING d.id, d.user_id, d.email;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_deliveries(uuid, int)
  FROM PUBLIC, anon, authenticated;

-- ── Audience counts, broken down the way the send is ordered ──
CREATE OR REPLACE FUNCTION public.admin_audience_size(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result   jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH base AS (
    SELECT p.id, COALESCE(pr.priority, 2::smallint) AS priority,
           (p.id IN (SELECT b.user_id FROM public.email_bounce_suppressed() b))
             AS suppressed
    FROM public.profiles p
    LEFT JOIN public.email_recipient_priority() pr ON pr.user_id = p.id
    WHERE p.email IS NOT NULL
      AND p.is_banned = false
      AND p.marketing_opt_out = false
  )
  SELECT jsonb_build_object(
    -- `eligible` is what a broadcast would actually queue, suppressions
    -- already removed, because the send button quotes this number.
    'eligible',      count(*) FILTER (WHERE NOT suppressed),
    'engaged',       count(*) FILTER (WHERE NOT suppressed AND priority = 0),
    'unopened',      count(*) FILTER (WHERE NOT suppressed AND priority = 1),
    'fresh',         count(*) FILTER (WHERE NOT suppressed AND priority = 2),
    'bounce_suppressed', count(*) FILTER (WHERE suppressed),
    'unsubscribed',  (SELECT count(*) FROM public.profiles WHERE marketing_opt_out),
    'banned',        (SELECT count(*) FROM public.profiles WHERE is_banned)
  ) INTO v_result
  FROM base;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_audience_size(uuid)
  FROM PUBLIC, anon, authenticated;

-- Report the split as it stands, so the effect is visible in the apply log.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT COALESCE(pr.priority, 2::smallint) AS priority, count(*) AS n
    FROM public.profiles p
    LEFT JOIN public.email_recipient_priority() pr ON pr.user_id = p.id
    WHERE p.email IS NOT NULL AND p.is_banned = false
      AND p.marketing_opt_out = false
    GROUP BY 1 ORDER BY 1
  LOOP
    RAISE NOTICE 'priority % -> % recipients', r.priority, r.n;
  END LOOP;
  RAISE NOTICE 'bounce-suppressed: %',
    (SELECT count(*) FROM public.email_bounce_suppressed());
END $$;
