-- Let an admin bin a draft.
--
-- The composer mints a draft the first time you send yourself a test, and any
-- edit to the subject or body invalidates that test and mints another — which
-- is what keeps a tested message and a sent message identical. The cost is
-- that drafts accumulate, so there has to be a way to clear them.
--
-- Only drafts. A campaign that has been queued or sent is a record of mail
-- that actually left, and deleting it would erase the delivery ledger with it.
CREATE OR REPLACE FUNCTION public.admin_delete_campaign(
  p_admin_id    uuid,
  p_campaign_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_status   text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT status INTO v_status FROM public.email_campaigns
  WHERE id = p_campaign_id FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft can be deleted (this one is %)', v_status;
  END IF;

  DELETE FROM public.email_campaigns WHERE id = p_campaign_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_campaign(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
