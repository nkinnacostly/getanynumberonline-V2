-- Make the send order live instead of a snapshot.
--
-- 20260901120000 assigns email_deliveries.priority once, at queue time, from
-- delivery history. That already means "anyone who has ever opened" — the tier
-- is recomputed from scratch for every campaign, so a first-time opener joins
-- the front of the queue for every future send automatically. It is not a
-- fixed list.
--
-- What it does NOT cover is an open that arrives AFTER a campaign was queued.
-- People open days late; the webhook lands while the drain is still running,
-- and until now that recipient sat in tier 1 for the rest of the send even
-- though we had just learned they engage. Now the event itself re-ranks them.

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

  -- ── Live re-ranking ────────────────────────────────────────
  -- Someone just proved they engage. Move every email still waiting to go out
  -- to them up to the engaged tier, so the rest of the drain treats them as a
  -- known opener rather than the tier they were filed under at queue time.
  --
  -- Note this cannot reorder the campaign the open came from: a recipient has
  -- one delivery per campaign, and that one has already been sent. It moves
  -- them up in anything else still queued, and — because the queue-time tier
  -- is computed from history — in every campaign after this one.
  IF p_type IN ('email.opened', 'email.clicked') THEN
    UPDATE public.email_deliveries d
    SET priority = 0
    WHERE d.user_id = v_user_id
      AND d.status = 'pending'
      AND d.priority > 0;
  END IF;

  -- The mirror image. A soft bounce is not grounds for deleting anything —
  -- a full mailbox empties — but it is grounds for going last while the
  -- address is misbehaving. Permanent bounces are handled below instead.
  IF p_type = 'email.bounced'
     AND lower(COALESCE(p_detail #>> '{bounce,type}', '')) <> 'permanent' THEN
    UPDATE public.email_deliveries d
    SET priority = 2
    WHERE d.user_id = v_user_id
      AND d.status = 'pending'
      AND d.priority < 2;
  END IF;

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
