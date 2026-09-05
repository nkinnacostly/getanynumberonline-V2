-- A fourth layout: plain text-dominant mail, for landing in Gmail's Primary
-- tab rather than Promotions.
--
-- The classifier weighs image-heavy HTML, prominent CTA buttons and link
-- density. `letter` has none of those — no banner, no card, no button, one
-- text link and a signature. It still carries the unsubscribe link and the
-- List-Unsubscribe headers: those are required of bulk senders, and dropping
-- them would trade a tab for the spam folder.
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_template_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_template_check
  CHECK (template IN ('basic', 'promo', 'weekly', 'letter'));

-- The hero image is meaningless on a layout that draws no images.
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
  IF v_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Not authorised'; END IF;

  IF coalesce(btrim(p_subject), '') = '' THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;
  IF coalesce(btrim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  v_template := coalesce(nullif(btrim(p_template), ''), 'basic');
  IF v_template NOT IN ('basic', 'promo', 'weekly', 'letter') THEN
    RAISE EXCEPTION 'Unknown template %', v_template;
  END IF;

  v_cta_url   := nullif(btrim(coalesce(p_cta_url, '')), '');
  v_cta_label := nullif(btrim(coalesce(p_cta_label, '')), '');
  IF v_cta_url IS NULL THEN
    v_cta_label := NULL;
  ELSIF v_cta_label IS NULL THEN
    v_cta_label := 'Open GetAnyNumberOnline';
  END IF;

  v_hero := nullif(btrim(coalesce(p_hero_image, '')), '');
  IF v_template IN ('basic', 'letter') THEN
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
