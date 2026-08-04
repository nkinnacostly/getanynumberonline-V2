-- Operator health view for eSIM fulfilment.
--
-- Answers the questions you actually ask when something looks wrong, without
-- needing to remember three table names:
--   is the reconcile cron installed and firing?
--   when did it last succeed?
--   can we currently fulfil orders?
--   is anything stuck or dead-lettered right now?
--
-- Service role only (no grants to anon/authenticated) — it exposes supplier
-- balance and internal failure reasons.

CREATE OR REPLACE VIEW public.esim_ops_health AS
SELECT
  (SELECT available   FROM public.esim_provider_status WHERE provider = 'esimaccess') AS provider_available,
  (SELECT balance     FROM public.esim_provider_status WHERE provider = 'esimaccess') AS provider_balance,
  (SELECT min_balance FROM public.esim_provider_status WHERE provider = 'esimaccess') AS provider_min_balance,
  (SELECT checked_at  FROM public.esim_provider_status WHERE provider = 'esimaccess') AS balance_checked_at,

  (SELECT active   FROM cron.job WHERE jobname = 'reconcile-esims') AS cron_active,
  (SELECT schedule FROM cron.job WHERE jobname = 'reconcile-esims') AS cron_schedule,
  (SELECT max(start_time) FROM cron.job_run_details d
     JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'reconcile-esims')                            AS cron_last_run,
  (SELECT status FROM cron.job_run_details d
     JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'reconcile-esims'
    ORDER BY start_time DESC LIMIT 1)                               AS cron_last_status,

  -- Rows the sweeper still owes an answer on.
  (SELECT count(*) FROM public.esims
    WHERE status = 'pending' AND provider = 'esimaccess')           AS pending_now,
  -- Pending long enough that it should already have been refunded.
  (SELECT count(*) FROM public.esims
    WHERE status = 'pending' AND provider = 'esimaccess'
      AND created_at < now() - interval '15 minutes')               AS pending_overdue,
  -- Dead-lettered: gave up and refunded.
  (SELECT count(*) FROM public.esims
    WHERE status = 'failed' AND last_error IS NOT NULL
      AND refunded_at > now() - interval '24 hours')                AS refunded_24h;

REVOKE ALL ON public.esim_ops_health FROM PUBLIC, anon, authenticated;

-- Report current state into the migration output.
DO $$
DECLARE h record;
BEGIN
  SELECT * INTO h FROM public.esim_ops_health;
  RAISE NOTICE 'CRON active=% schedule=% last_run=% last_status=%',
    h.cron_active, h.cron_schedule, h.cron_last_run, h.cron_last_status;
  RAISE NOTICE 'PROVIDER available=% balance=% checked_at=%',
    h.provider_available, h.provider_balance, h.balance_checked_at;
  RAISE NOTICE 'ESIMS pending=% overdue=% refunded_24h=%',
    h.pending_now, h.pending_overdue, h.refunded_24h;
END $$;
