-- Verification only, no schema change.
--
-- admin_audience_size was rewritten in the previous migration and is called on
-- mount by the campaign composer: if it raises, the whole audience panel breaks
-- and the send button has no number to quote. Postgres only checks a plpgsql
-- body for syntax at creation time, so this executes it once against real data
-- and prints the result into the apply log.
DO $$
DECLARE
  v_admin uuid;
  v_json  jsonb;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE is_admin ORDER BY created_at LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE WARNING 'no admin to test with — admin_audience_size NOT verified';
    RETURN;
  END IF;

  v_json := public.admin_audience_size(v_admin);
  RAISE NOTICE 'admin_audience_size -> %', v_json;

  -- Every key the AudienceSize interface reads must be present, or the UI
  -- renders "undefined" rather than a count.
  IF NOT (v_json ?& array['eligible','engaged','unopened','fresh',
                          'bounce_suppressed','unsubscribed','banned']) THEN
    RAISE EXCEPTION 'admin_audience_size is missing keys the admin UI reads: %', v_json;
  END IF;

  RAISE NOTICE 'all keys present';
END $$;
