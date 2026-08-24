-- Lower the SimJuno pause floor from the $20 default to $5.
--
-- The floor exists so a burst of orders can't drain the reseller wallet
-- mid-checkout; $20 was sized for the eSIM Access era. SimJuno plans wholesale
-- from ~$0.51, so $5 still covers several average orders of headroom while
-- matching the operator's actual float. The reconcile cron (and the admin
-- refresh button) compare against this row, so the storefront reopens on the
-- next successful balance check.

UPDATE public.esim_provider_status
SET min_balance = 5,
    updated_at  = now()
WHERE provider = 'simjuno';
