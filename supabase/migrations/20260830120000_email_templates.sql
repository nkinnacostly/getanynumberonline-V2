-- Email templates: promotional and weekly, on top of the plain `basic` layout.
--
-- Five new columns rather than one jsonb blob, because each is a distinct slot
-- the renderer fills and each has its own validity rule — a CTA label with no
-- URL is a dead button in someone's inbox, and that is worth a CHECK rather
-- than a code comment.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS template  text NOT NULL DEFAULT 'basic',
  -- The inbox preview line. Optional: the renderer derives one from the body.
  ADD COLUMN IF NOT EXISTS preheader text,
  -- The hero heading. Optional: falls back to the subject.
  ADD COLUMN IF NOT EXISTS headline  text,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS cta_url   text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_template_check'
  ) THEN
    ALTER TABLE public.email_campaigns
      ADD CONSTRAINT email_campaigns_template_check
      CHECK (template IN ('basic', 'promo', 'weekly'));
  END IF;

  -- A button needs somewhere to go, and a destination needs a label. Either
  -- both or neither.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_cta_pair'
  ) THEN
    ALTER TABLE public.email_campaigns
      ADD CONSTRAINT email_campaigns_cta_pair
      CHECK (
        (cta_url IS NULL AND cta_label IS NULL)
        OR (cta_url IS NOT NULL AND cta_label IS NOT NULL)
      );
  END IF;

  -- Only ever store a link we would be willing to render.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_cta_url_http'
  ) THEN
    ALTER TABLE public.email_campaigns
      ADD CONSTRAINT email_campaigns_cta_url_http
      CHECK (cta_url IS NULL OR cta_url ~ '^https?://[^[:space:]"''<>]+$');
  END IF;
END $$;

-- ── Create a draft, now carrying the template ────────────────
-- The old 5-argument signature is dropped rather than left alongside: adding
-- defaulted parameters would create an overload, and a call with the original
-- five arguments would then be ambiguous.
DROP FUNCTION IF EXISTS public.admin_create_campaign(uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.admin_create_campaign(
  p_admin_id       uuid,
  p_subject        text,
  p_body           text,
  p_audience       text,
  p_target_user_id uuid DEFAULT NULL,
  p_template       text DEFAULT 'basic',
  p_preheader      text DEFAULT NULL,
  p_headline       text DEFAULT NULL,
  p_cta_label      text DEFAULT NULL,
  p_cta_url        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin  boolean;
  v_id        uuid;
  v_template  text;
  v_cta_url   text;
  v_cta_label text;
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

  v_template := coalesce(nullif(btrim(p_template), ''), 'basic');
  IF v_template NOT IN ('basic', 'promo', 'weekly') THEN
    RAISE EXCEPTION 'Unknown template %', v_template;
  END IF;

  -- Normalise the pair here so the UI can leave either field half-filled
  -- without tripping the CHECK: an unusable half is simply dropped.
  v_cta_url   := nullif(btrim(coalesce(p_cta_url, '')), '');
  v_cta_label := nullif(btrim(coalesce(p_cta_label, '')), '');
  IF v_cta_url IS NULL THEN
    v_cta_label := NULL;
  ELSIF v_cta_label IS NULL THEN
    v_cta_label := 'Open GetAnyNumberOnline';
  END IF;

  INSERT INTO public.email_campaigns (
    subject, body_markdown, audience, target_user_id, created_by,
    template, preheader, headline, cta_label, cta_url
  ) VALUES (
    btrim(p_subject), p_body, p_audience, p_target_user_id, p_admin_id,
    v_template,
    nullif(btrim(coalesce(p_preheader, '')), ''),
    nullif(btrim(coalesce(p_headline, '')), ''),
    v_cta_label, v_cta_url
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_campaign(
  uuid, text, text, text, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- ── The campaigns table shows which template was used ────────
-- Same body as 20260818240000, plus c.template: knowing a send went out on the
-- weekly layout is part of reading its open rate.
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
           c.completed_at, c.last_error, c.template,
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
