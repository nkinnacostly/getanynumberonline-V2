-- Per-recipient email engagement: delivered, opened, clicked, bounced, spam.
--
-- Resend reports these by webhook, keyed on the id it returned when we sent —
-- which is already stored as email_deliveries.provider_id, so events join
-- straight onto the row they belong to.
--
-- Two events change eligibility, not just statistics:
--   * a spam complaint means never mail this person again, full stop. Keeping
--     complaint rate under 0.30% is the difference between Gmail delivering
--     our mail and rejecting it outright.
--   * a permanent bounce means the address is dead. Continuing to send to it
--     damages domain reputation for everyone else on the list.
-- Both therefore set marketing_opt_out, not merely a timestamp.

ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at  timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at     timestamptz,
  ADD COLUMN IF NOT EXISTS open_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS click_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_type   text,
  ADD COLUMN IF NOT EXISTS bounce_detail text,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event    text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

-- The webhook's only access path.
CREATE INDEX IF NOT EXISTS email_deliveries_provider_idx
  ON public.email_deliveries (provider_id) WHERE provider_id IS NOT NULL;

-- Claiming the Svix id is what makes handling exactly-once across retries —
-- same approach as esim_webhook_events.
CREATE TABLE IF NOT EXISTS public.email_webhook_events (
  svix_id     text PRIMARY KEY,
  event_type  text NOT NULL,
  email_id    text,
  payload     jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS email_webhook_events_received_idx
  ON public.email_webhook_events (received_at DESC);

-- ── Record one event ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_email_event(
  p_svix_id  text,
  p_email_id text,
  p_type     text,
  p_at       timestamptz,
  p_detail   jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_at      timestamptz := COALESCE(p_at, now());
BEGIN
  -- Exactly-once. A duplicate delivery is reported, not applied — otherwise a
  -- retried 'opened' would inflate open_count.
  INSERT INTO public.email_webhook_events (svix_id, event_type, email_id, payload)
  VALUES (p_svix_id, p_type, p_email_id, p_detail)
  ON CONFLICT (svix_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  IF p_email_id IS NULL THEN
    RETURN 'no_email_id';
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.email_deliveries WHERE provider_id = p_email_id;

  IF v_user_id IS NULL THEN
    -- A test send has no delivery row; the event is still recorded above.
    RETURN 'unmatched';
  END IF;

  UPDATE public.email_deliveries d
  SET
    delivered_at  = CASE WHEN p_type = 'email.delivered'
                         THEN COALESCE(d.delivered_at, v_at) ELSE d.delivered_at END,
    -- Earliest open wins: opened_at is "when they first read it", and events
    -- can arrive out of order.
    opened_at     = CASE WHEN p_type = 'email.opened'
                         THEN LEAST(COALESCE(d.opened_at, v_at), v_at) ELSE d.opened_at END,
    open_count    = d.open_count  + CASE WHEN p_type = 'email.opened'  THEN 1 ELSE 0 END,
    clicked_at    = CASE WHEN p_type = 'email.clicked'
                         THEN LEAST(COALESCE(d.clicked_at, v_at), v_at) ELSE d.clicked_at END,
    click_count   = d.click_count + CASE WHEN p_type = 'email.clicked' THEN 1 ELSE 0 END,
    bounced_at    = CASE WHEN p_type = 'email.bounced'
                         THEN COALESCE(d.bounced_at, v_at) ELSE d.bounced_at END,
    bounce_type   = CASE WHEN p_type = 'email.bounced'
                         THEN COALESCE(p_detail #>> '{bounce,type}', d.bounce_type)
                         ELSE d.bounce_type END,
    bounce_detail = CASE WHEN p_type = 'email.bounced'
                         THEN COALESCE(p_detail #>> '{bounce,message}', d.bounce_detail)
                         ELSE d.bounce_detail END,
    complained_at = CASE WHEN p_type = 'email.complained'
                         THEN COALESCE(d.complained_at, v_at) ELSE d.complained_at END,
    -- A bounce or complaint is a failure however the send itself went.
    status        = CASE WHEN p_type IN ('email.bounced', 'email.failed')
                         THEN 'failed' ELSE d.status END,
    error         = CASE WHEN p_type IN ('email.bounced', 'email.failed')
                         THEN COALESCE(p_detail #>> '{bounce,message}', p_type)
                         ELSE d.error END,
    last_event    = p_type,
    last_event_at = v_at
  WHERE d.provider_id = p_email_id;

  -- Eligibility changes. Suppressing here rather than in the webhook function
  -- means it happens in the same transaction as the event that caused it.
  IF p_type = 'email.complained'
     OR (p_type = 'email.bounced'
         AND lower(COALESCE(p_detail #>> '{bounce,type}', '')) = 'permanent') THEN
    UPDATE public.profiles
    SET marketing_opt_out = true,
        marketing_opt_out_at = COALESCE(marketing_opt_out_at, v_at)
    WHERE id = v_user_id AND marketing_opt_out = false;

    DELETE FROM public.email_deliveries
    WHERE user_id = v_user_id AND status = 'pending';
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.record_email_event(text, text, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ── Campaign stats for the admin UI ──────────────────────────
-- One call returns the headline numbers and the per-recipient rows, because
-- the question "who didn't get it?" is only answerable by looking at both.
CREATE OR REPLACE FUNCTION public.admin_campaign_stats(
  p_admin_id    uuid,
  p_campaign_id uuid,
  p_filter      text DEFAULT 'all',
  p_limit       int  DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_campaign jsonb;
  v_totals   jsonb;
  v_rows     jsonb;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT to_jsonb(c) - 'body_markdown' INTO v_campaign
  FROM public.email_campaigns c WHERE c.id = p_campaign_id;

  IF v_campaign IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT jsonb_build_object(
    'recipients', count(*),
    'sent',       count(*) FILTER (WHERE status = 'sent'),
    'delivered',  count(*) FILTER (WHERE delivered_at IS NOT NULL),
    'opened',     count(*) FILTER (WHERE opened_at IS NOT NULL),
    'clicked',    count(*) FILTER (WHERE clicked_at IS NOT NULL),
    'bounced',    count(*) FILTER (WHERE bounced_at IS NOT NULL),
    'complained', count(*) FILTER (WHERE complained_at IS NOT NULL),
    'failed',     count(*) FILTER (WHERE status = 'failed'),
    'pending',    count(*) FILTER (WHERE status IN ('pending', 'sending')),
    -- Delivered but never opened: the "didn't read it" number, which is only
    -- meaningful against delivered, not against everyone we tried.
    'unopened',   count(*) FILTER (WHERE delivered_at IS NOT NULL
                                     AND opened_at IS NULL)
  ) INTO v_totals
  FROM public.email_deliveries WHERE campaign_id = p_campaign_id;

  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT d.email, d.status, d.delivered_at, d.opened_at, d.open_count,
           d.clicked_at, d.click_count, d.bounced_at, d.bounce_type,
           d.bounce_detail, d.complained_at, d.error, d.sent_at,
           d.user_id
    FROM public.email_deliveries d
    WHERE d.campaign_id = p_campaign_id
      AND CASE p_filter
            WHEN 'opened'     THEN d.opened_at IS NOT NULL
            WHEN 'unopened'   THEN d.delivered_at IS NOT NULL AND d.opened_at IS NULL
            WHEN 'clicked'    THEN d.clicked_at IS NOT NULL
            WHEN 'bounced'    THEN d.bounced_at IS NOT NULL
            WHEN 'complained' THEN d.complained_at IS NOT NULL
            WHEN 'failed'     THEN d.status = 'failed'
            WHEN 'notsent'    THEN d.status <> 'sent'
            ELSE true
          END
    ORDER BY d.opened_at DESC NULLS LAST, d.email
    LIMIT greatest(p_limit, 1)
  ) r;

  RETURN jsonb_build_object(
    'found', true, 'campaign', v_campaign,
    'totals', v_totals, 'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats(uuid, uuid, text, int)
  FROM PUBLIC, anon, authenticated;

-- Engagement on the campaign list, so the table shows outcomes not just counts.
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
           t.email AS target_email,
           COALESCE(e.opened, 0)  AS opened_count,
           COALESCE(e.bounced, 0) AS bounced_count
    FROM public.email_campaigns c
    LEFT JOIN public.profiles t ON t.id = c.target_user_id
    LEFT JOIN (
      SELECT campaign_id,
             count(*) FILTER (WHERE opened_at IS NOT NULL)  AS opened,
             count(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced
      FROM public.email_deliveries GROUP BY campaign_id
    ) e ON e.campaign_id = c.id
    ORDER BY c.created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) r;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_campaigns(uuid, int, int)
  FROM PUBLIC, anon, authenticated;
