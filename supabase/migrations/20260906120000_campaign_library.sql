-- Reading a campaign back, and editing one that has not gone out yet.
--
-- Until now a campaign was write-only: admin_campaign_stats deliberately
-- strips body_markdown, and nothing else returns it. So a draft the AI writer
-- produced could be sent or deleted but never re-opened, and a campaign that
-- had gone out could not be used as the starting point for the next one.
--
-- Three pieces:
--   admin_campaign_content  read one back in full, for the composer
--   admin_update_campaign   edit one in place, while it is still editable
--   admin_list_campaigns    + source/schedule columns and a filter
--
-- The approval gate is unchanged and is the thing to be careful about here.
-- Editing content invalidates the test that was sent against the old content,
-- so an edit ALWAYS clears test_sent_at and withdraws approval. Otherwise
-- "approve, then quietly rewrite" would be a way past the human review that
-- the whole scheduling design exists to enforce.

-- ── Read one back ────────────────────────────────────────────
-- Everything the composer needs to reconstruct a draft, body included. Kept
-- separate from admin_campaign_stats rather than adding the body there: the
-- stats endpoint is polled with a recipient list attached, and shipping the
-- body on every poll would be a waste.
CREATE OR REPLACE FUNCTION public.admin_campaign_content(
  p_admin_id    uuid,
  p_campaign_id uuid
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

  SELECT * INTO v_c FROM public.email_campaigns WHERE id = p_campaign_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  RETURN jsonb_build_object(
    'found', true,
    'campaign', jsonb_build_object(
      'id',             v_c.id,
      'subject',        v_c.subject,
      'body',           v_c.body_markdown,
      'template',       v_c.template,
      'preheader',      v_c.preheader,
      'headline',       v_c.headline,
      'cta_label',      v_c.cta_label,
      'cta_url',        v_c.cta_url,
      'hero_image',     v_c.hero_image,
      'audience',       v_c.audience,
      'target_user_id', v_c.target_user_id,
      'status',         v_c.status,
      'source',         v_c.source,
      'ai_brief',       v_c.ai_brief,
      'scheduled_for',  v_c.scheduled_for,
      'approved_at',    v_c.approved_at,
      'test_sent_at',   v_c.test_sent_at,
      -- What the caller may do with it. Decided here rather than by the
      -- client re-deriving the rule from the status string.
      'editable',       v_c.status IN ('draft', 'scheduled')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_content(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── Edit one in place ────────────────────────────────────────
-- The alternative — always inserting a new row — is what the composer did
-- before, and it left an orphan draft behind on every edit-then-test cycle.
CREATE OR REPLACE FUNCTION public.admin_update_campaign(
  p_admin_id       uuid,
  p_campaign_id    uuid,
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin  boolean;
  v_c         public.email_campaigns%ROWTYPE;
  v_template  text;
  v_cta_url   text;
  v_cta_label text;
  v_hero      text;
  v_target    uuid;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Not authorised'; END IF;

  SELECT * INTO v_c FROM public.email_campaigns
  WHERE id = p_campaign_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  -- Anything past 'scheduled' is a record of something that happened. Editing
  -- it would rewrite history against delivery rows that are already counted.
  IF v_c.status NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Campaign is already % — copy it into a new one instead',
      v_c.status;
  END IF;

  IF coalesce(btrim(p_subject), '') = '' THEN
    RAISE EXCEPTION 'Subject is required';
  END IF;
  IF coalesce(btrim(p_body), '') = '' THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;
  IF p_audience NOT IN ('all', 'user') THEN
    RAISE EXCEPTION 'audience must be all or user';
  END IF;

  v_target := CASE WHEN p_audience = 'user' THEN p_target_user_id ELSE NULL END;
  IF p_audience = 'user' AND v_target IS NULL THEN
    RAISE EXCEPTION 'A single-user send needs a recipient';
  END IF;

  v_template := coalesce(nullif(btrim(p_template), ''), 'basic');
  IF v_template NOT IN ('basic', 'promo', 'weekly', 'letter') THEN
    RAISE EXCEPTION 'Unknown template %', v_template;
  END IF;

  -- Same normalisation as admin_create_campaign: half a button is no button.
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

  UPDATE public.email_campaigns
  SET subject        = btrim(p_subject),
      body_markdown  = p_body,
      audience       = p_audience,
      target_user_id = v_target,
      template       = v_template,
      preheader      = nullif(btrim(coalesce(p_preheader, '')), ''),
      headline       = nullif(btrim(coalesce(p_headline, '')), ''),
      cta_label      = v_cta_label,
      cta_url        = v_cta_url,
      hero_image     = v_hero,
      -- The test that was sent described the OLD text. Clearing this is what
      -- forces another one before this can reach the list, and it is why an
      -- edit cannot be used to slip past review.
      test_sent_at   = NULL,
      approved_at    = NULL,
      approved_by    = NULL,
      -- A scheduled campaign drops back to a proposal. scheduled_for is kept
      -- so the date stays on the calendar; the dispatcher only ever looks at
      -- status = 'scheduled', so a draft with a date cannot send itself.
      status         = 'draft'
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'status', 'draft',
    'was_scheduled', v_c.status = 'scheduled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_campaign(
  uuid, uuid, text, text, text, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- ── The list, with what wrote it and a filter ────────────────
-- Same body as 20260830120000 plus source/scheduled_for/approved_at/ai_brief,
-- and p_filter. The filter is applied to the count as well as the page, or
-- the pager would offer pages that are not there.
CREATE OR REPLACE FUNCTION public.admin_list_campaigns(
  p_admin_id uuid,
  p_limit    int  DEFAULT 25,
  p_offset   int  DEFAULT 0,
  p_filter   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_rows     jsonb;
  v_total    int;
  v_filter   text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  v_filter := nullif(btrim(coalesce(p_filter, '')), '');

  SELECT count(*) INTO v_total
  FROM public.email_campaigns c
  WHERE CASE v_filter
          WHEN 'ai'        THEN c.source = 'ai'
          WHEN 'human'     THEN c.source = 'human'
          WHEN 'draft'     THEN c.status = 'draft'
          WHEN 'scheduled' THEN c.status = 'scheduled'
          WHEN 'sent'      THEN c.status IN ('sent', 'sending', 'queued')
          ELSE true
        END;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT c.id, c.subject, c.audience, c.status, c.recipient_count,
           c.sent_count, c.failed_count, c.test_sent_at, c.created_at,
           c.completed_at, c.last_error, c.template,
           c.source, c.scheduled_for, c.approved_at, c.ai_brief,
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
    WHERE CASE v_filter
            WHEN 'ai'        THEN c.source = 'ai'
            WHEN 'human'     THEN c.source = 'human'
            WHEN 'draft'     THEN c.status = 'draft'
            WHEN 'scheduled' THEN c.status = 'scheduled'
            WHEN 'sent'      THEN c.status IN ('sent', 'sending', 'queued')
            ELSE true
          END
    ORDER BY c.created_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) r;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_campaigns(uuid, int, int, text)
  FROM PUBLIC, anon, authenticated;

-- The three-argument form is now ambiguous with the four-argument one for
-- callers that omit p_filter, so the old signature goes.
DROP FUNCTION IF EXISTS public.admin_list_campaigns(uuid, int, int);

-- ── Prove the gates hold ─────────────────────────────────────
-- Creates its own fixtures, asserts, and cleans up. A failure raises, which
-- rolls the migration back rather than leaving a half-applied change.
DO $$
DECLARE
  v_admin uuid;
  v_id    uuid;
  v_row   public.email_campaigns%ROWTYPE;
  v_out   jsonb;
  v_ok    boolean;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin IS TRUE LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE NOTICE 'no admin profile — skipping verification';
    RETURN;
  END IF;

  INSERT INTO public.email_campaigns
    (subject, body_markdown, audience, created_by, template,
     status, source, test_sent_at, approved_at, approved_by, scheduled_for)
  VALUES
    ('verify-fixture', 'original body', 'all', v_admin, 'promo',
     'scheduled', 'ai', now(), now(), v_admin, now() + interval '2 days')
  RETURNING id INTO v_id;

  -- 1. The body comes back, which is the whole point of the read.
  v_out := public.admin_campaign_content(v_admin, v_id);
  IF v_out -> 'campaign' ->> 'body' <> 'original body' THEN
    RAISE EXCEPTION 'content read did not return the body';
  END IF;
  IF (v_out -> 'campaign' ->> 'editable')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'a scheduled campaign should be editable';
  END IF;

  -- 2. An edit withdraws approval, clears the test and drops to draft,
  --    while keeping the proposed date on the calendar.
  PERFORM public.admin_update_campaign(
    v_admin, v_id, 'verify-fixture', 'edited body', 'all', NULL, 'promo');
  SELECT * INTO v_row FROM public.email_campaigns WHERE id = v_id;
  IF v_row.body_markdown <> 'edited body' THEN
    RAISE EXCEPTION 'update did not write the body';
  END IF;
  IF v_row.test_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'update left the stale test flag set';
  END IF;
  IF v_row.approved_at IS NOT NULL OR v_row.status <> 'draft' THEN
    RAISE EXCEPTION 'update left the campaign approved';
  END IF;
  IF v_row.scheduled_for IS NULL THEN
    RAISE EXCEPTION 'update dropped the proposed date';
  END IF;

  -- 3. A campaign that has gone out is not editable.
  UPDATE public.email_campaigns SET status = 'sent' WHERE id = v_id;
  v_ok := false;
  BEGIN
    PERFORM public.admin_update_campaign(
      v_admin, v_id, 'verify-fixture', 'should not apply', 'all', NULL, 'promo');
  EXCEPTION WHEN others THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'a sent campaign accepted an edit';
  END IF;
  SELECT * INTO v_row FROM public.email_campaigns WHERE id = v_id;
  IF v_row.body_markdown <> 'edited body' THEN
    RAISE EXCEPTION 'the refused edit still changed the row';
  END IF;

  -- 4. The filter selects on source, and counts what it selects.
  v_out := public.admin_list_campaigns(v_admin, 100, 0, 'ai');
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_out -> 'rows') x
    WHERE x ->> 'id' = v_id::text
  ) THEN
    RAISE EXCEPTION 'the ai filter dropped an ai campaign';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_out -> 'rows') x
    WHERE x ->> 'source' <> 'ai'
  ) THEN
    RAISE EXCEPTION 'the ai filter returned a human campaign';
  END IF;

  DELETE FROM public.email_campaigns WHERE id = v_id;
  RAISE NOTICE 'campaign library verification passed';
END;
$$;
