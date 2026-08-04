-- Let the edge functions read the ops health view.
--
-- The previous migration revoked the view from PUBLIC to keep supplier balance
-- and failure reasons away from signed-in users. That also stripped the grant
-- the service role needs, so reconcile-esims could not read its own health.
-- Grant it back to service_role only.

GRANT SELECT ON public.esim_ops_health TO service_role;
