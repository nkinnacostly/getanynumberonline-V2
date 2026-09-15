-- Pagination for the two admin lists that never had any.
--
-- Every other admin list takes a limit and an offset and reports a total, so
-- the UI can page through it and say how much there is. These two did not:
--
--   admin_list_flagged    no LIMIT at all — it aggregates every flagged
--                         profile into one jsonb value and returns the lot.
--                         Fine at a dozen rows, a cliff at a few thousand.
--
--   admin_campaign_stats  caps the recipient list at p_limit (100 from the
--                         UI) and reports no row count, so a send to 315
--                         people shows 100 of them and says nothing about the
--                         other 215. Silent truncation is the worst kind.
--
-- Both now match the shape the rest of the admin API uses: {rows, total}.

-- ── Flagged users ────────────────────────────────────────────
-- Signature changes (jsonb array -> {rows,total}), so the old one goes rather
-- than being left behind as an overload nothing calls.
DROP FUNCTION IF EXISTS public.admin_list_flagged(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_flagged(
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

  SELECT count(*) INTO v_total FROM public.profiles WHERE is_flagged;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.flagged_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT p.id,
           p.email,
           round(p.balance, 2)                        AS balance,
           p.flag_reason,
           p.is_banned,
           p.created_at,
           -- No flagged_at column exists upstream; updated_at is when the flag
           -- was written, since evaluate_user_fraud is what last touched the row.
           p.updated_at                               AS flagged_at,
           COALESCE(o.total, 0)                       AS order_count,
           COALESCE(o.cancelled, 0)                   AS cancel_count
    FROM public.profiles p
    LEFT JOIN (
      SELECT user_id,
             count(*)                                                    AS total,
             count(*) FILTER (WHERE status IN ('cancelled', 'refunded')) AS cancelled
      FROM public.orders GROUP BY user_id
    ) o ON o.user_id = p.id
    WHERE p.is_flagged
    -- Ordered in the subquery as well as the aggregate, because LIMIT without
    -- an ORDER BY would take an arbitrary slice.
    ORDER BY p.updated_at DESC
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) r;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_flagged(uuid, int, int)
  FROM PUBLIC, anon, authenticated;

-- ── Campaign recipients ──────────────────────────────────────
-- Same body as 20260818240000 plus p_offset, and a row_total counted under the
-- same filter as the rows — so "page 2 of 4" is a statement about the filter
-- you are actually looking at, not about the campaign as a whole.
CREATE OR REPLACE FUNCTION public.admin_campaign_stats(
  p_admin_id    uuid,
  p_campaign_id uuid,
  p_filter      text DEFAULT 'all',
  p_limit       int  DEFAULT 100,
  p_offset      int  DEFAULT 0
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
  v_row_total int;
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

  SELECT count(*) INTO v_row_total
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
        END;

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
    -- email breaks the tie so paging is stable: ordering by opened_at alone
    -- leaves every never-opened row interchangeable, and the same address
    -- could appear on two consecutive pages.
    ORDER BY d.opened_at DESC NULLS LAST, d.email
    LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0)
  ) r;

  RETURN jsonb_build_object(
    'found', true, 'campaign', v_campaign,
    'totals', v_totals, 'rows', v_rows, 'row_total', v_row_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_campaign_stats(uuid, uuid, text, int, int)
  FROM PUBLIC, anon, authenticated;

-- The four-argument form is now ambiguous with the five-argument one for
-- callers that omit p_offset, so the old signature goes.
DROP FUNCTION IF EXISTS public.admin_campaign_stats(uuid, uuid, text, int);

-- ── Prove both actually page ─────────────────────────────────
-- Creates its own fixtures, asserts, cleans up. A failure raises, which rolls
-- the migration back rather than leaving it half applied.
DO $$
DECLARE
  v_admin    uuid;
  v_u1       uuid;
  v_u2       uuid;
  v_campaign uuid;
  v_out      jsonb;
  v_page1    text;
  v_page2    text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin IS TRUE LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE NOTICE 'no admin profile — skipping verification';
    RETURN;
  END IF;

  -- email_deliveries is UNIQUE on (campaign_id, user_id), so a two-row page
  -- test needs two real people. Caught by the constraint on the first run of
  -- this migration, which is the constraint doing its job.
  SELECT id INTO v_u1 FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_u2 FROM public.profiles
  WHERE id <> v_u1 ORDER BY created_at LIMIT 1;

  -- 1. Flagged: the shape is {rows,total}, and the total counts everything
  --    while rows honours the limit.
  v_out := public.admin_list_flagged(v_admin, 1, 0);
  IF NOT (v_out ? 'rows' AND v_out ? 'total') THEN
    RAISE EXCEPTION 'admin_list_flagged did not return {rows,total}';
  END IF;
  IF jsonb_array_length(v_out -> 'rows') > 1 THEN
    RAISE EXCEPTION 'admin_list_flagged ignored its limit';
  END IF;
  IF (v_out ->> 'total')::int
     <> (SELECT count(*) FROM public.profiles WHERE is_flagged) THEN
    RAISE EXCEPTION 'admin_list_flagged total does not match the table';
  END IF;

  -- 2. Campaign recipients: two rows, one per page, must be different rows.
  INSERT INTO public.email_campaigns
    (subject, body_markdown, audience, created_by, template, status)
  VALUES ('verify-paging', 'body', 'all', v_admin, 'basic', 'sent')
  RETURNING id INTO v_campaign;

  IF v_u2 IS NULL THEN
    RAISE NOTICE 'only one profile — skipping the recipient paging check';
  ELSE
    INSERT INTO public.email_deliveries (campaign_id, user_id, email, status)
    VALUES (v_campaign, v_u1, 'a@verify.invalid', 'sent'),
           (v_campaign, v_u2, 'b@verify.invalid', 'sent');

    v_out := public.admin_campaign_stats(v_admin, v_campaign, 'all', 1, 0);
    v_page1 := v_out -> 'rows' -> 0 ->> 'email';
    IF (v_out ->> 'row_total')::int <> 2 THEN
      RAISE EXCEPTION 'row_total was %, expected 2', v_out ->> 'row_total';
    END IF;

    v_out := public.admin_campaign_stats(v_admin, v_campaign, 'all', 1, 1);
    v_page2 := v_out -> 'rows' -> 0 ->> 'email';
    IF v_page1 IS NULL OR v_page2 IS NULL OR v_page1 = v_page2 THEN
      RAISE EXCEPTION 'offset did not move the window: % then %', v_page1, v_page2;
    END IF;

    -- 3. A filter narrows row_total, not just the rows.
    v_out := public.admin_campaign_stats(v_admin, v_campaign, 'opened', 10, 0);
    IF (v_out ->> 'row_total')::int <> 0 THEN
      RAISE EXCEPTION 'row_total ignored the filter';
    END IF;
  END IF;

  DELETE FROM public.email_deliveries WHERE campaign_id = v_campaign;
  DELETE FROM public.email_campaigns WHERE id = v_campaign;
  RAISE NOTICE 'pagination verification passed';
END;
$$;
