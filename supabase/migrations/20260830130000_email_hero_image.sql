-- A banner image at the top of a campaign, matching the reference layout:
-- picture, accent rule, then the heading in the card.
--
-- Stored as an absolute URL rather than a slug, because the renderer runs in an
-- Edge Function with no notion of the Next public directory — and because an
-- admin should be able to point at any image they have, not only the four we
-- ship.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS hero_image text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_hero_image_http'
  ) THEN
    ALTER TABLE public.email_campaigns
      ADD CONSTRAINT email_campaigns_hero_image_http
      CHECK (hero_image IS NULL OR hero_image ~ '^https?://[^[:space:]"''<>]+$');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_create_campaign(
  uuid, text, text, text, uuid, text, text, text, text, text
);

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
  p_cta_url        text DEFAULT NULL,
  p_hero_image     text DEFAULT NULL
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
  v_hero      text;
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

  -- The plain layout draws no banner, so a URL on it would be dead weight
  -- that a later template switch could silently resurrect.
  v_hero := nullif(btrim(coalesce(p_hero_image, '')), '');
  IF v_template = 'basic' THEN
    v_hero := NULL;
  END IF;

  INSERT INTO public.email_campaigns (
    subject, body_markdown, audience, target_user_id, created_by,
    template, preheader, headline, cta_label, cta_url, hero_image
  ) VALUES (
    btrim(p_subject), p_body, p_audience, p_target_user_id, p_admin_id,
    v_template,
    nullif(btrim(coalesce(p_preheader, '')), ''),
    nullif(btrim(coalesce(p_headline, '')), ''),
    v_cta_label, v_cta_url, v_hero
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_campaign(
  uuid, text, text, text, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
