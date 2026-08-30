-- Let the send loop claim work atomically.
--
-- Without this, two overlapping drains (an admin clicking Send while the cron
-- is running) can both read the same 'pending' row and mail that person twice.
-- The unique index stops duplicate ROWS; it cannot stop duplicate SENDS. This
-- closes that gap by moving the row to 'sending' under a lock before anything
-- leaves the building.

ALTER TABLE public.email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE public.email_deliveries ADD CONSTRAINT email_deliveries_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed'));

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
    ORDER BY d2.created_at
    -- SKIP LOCKED is what makes concurrent drains safe rather than merely
    -- unlikely: a row already claimed by another worker is passed over.
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(p_limit, 1)
  )
  RETURNING d.id, d.user_id, d.email;
END;
$$;

-- Roll a batch's outcome back into the ledger and the campaign counters.
CREATE OR REPLACE FUNCTION public.record_email_results(
  p_campaign_id uuid,
  p_results     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.email_deliveries d
  SET status      = r.status,
      provider_id = r.provider_id,
      error       = r.error,
      sent_at     = CASE WHEN r.status = 'sent' THEN now() ELSE NULL END
  FROM jsonb_to_recordset(p_results)
       AS r(id uuid, status text, provider_id text, error text)
  WHERE d.id = r.id;

  UPDATE public.email_campaigns c
  SET sent_count   = (SELECT count(*) FROM public.email_deliveries
                      WHERE campaign_id = p_campaign_id AND status = 'sent'),
      failed_count = (SELECT count(*) FROM public.email_deliveries
                      WHERE campaign_id = p_campaign_id AND status = 'failed'),
      status = CASE
        WHEN EXISTS (SELECT 1 FROM public.email_deliveries
                     WHERE campaign_id = p_campaign_id
                       AND status IN ('pending', 'sending'))
        THEN 'sending' ELSE 'sent' END,
      completed_at = CASE
        WHEN EXISTS (SELECT 1 FROM public.email_deliveries
                     WHERE campaign_id = p_campaign_id
                       AND status IN ('pending', 'sending'))
        THEN NULL ELSE now() END
  WHERE c.id = p_campaign_id;
END;
$$;

-- Unsubscribe, called by the public endpoint after it verifies the signature.
CREATE OR REPLACE FUNCTION public.set_marketing_opt_out(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET marketing_opt_out = true, marketing_opt_out_at = now()
  WHERE id = p_user_id AND marketing_opt_out = false;

  -- Also pull them out of anything still queued. An unsubscribe that only
  -- takes effect on the NEXT campaign is not an unsubscribe.
  DELETE FROM public.email_deliveries
  WHERE user_id = p_user_id AND status = 'pending';

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_deliveries(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_email_results(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_marketing_opt_out(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_campaign_tested(
  p_admin_id uuid, p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT is_admin FROM public.profiles WHERE id = p_admin_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.email_campaigns SET test_sent_at = now() WHERE id = p_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_campaign_tested(uuid, uuid) FROM PUBLIC, anon, authenticated;
