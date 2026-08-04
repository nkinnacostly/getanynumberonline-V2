-- Make the eSIM reconcile cron self-provisioning.
--
-- The previous design needed an operator to paste RECONCILE_SECRET into
-- schedule_esim_reconcile(). That has two failure modes we actually hit:
-- the secret is only stored in Supabase's edge-secret vault (write-only, so
-- losing your copy means it is gone), and pasting it into the SQL editor puts
-- it in query history.
--
-- Instead the secret is GENERATED IN THE DATABASE, stored in a service-role-only
-- table, used by the cron command, and verified by the edge function against
-- that same table. It never appears in git, in a shell, or in query history,
-- and it can be rotated with one UPDATE and no redeploy.
--
-- The env var RECONCILE_SECRET still works as a manual override — see
-- reconcile-esims, which accepts either.

-- ── Secret store ─────────────────────────────────────────────
-- RLS on with NO policies: unreachable by anon and authenticated. Only the
-- service role (which bypasses RLS) can read it.
CREATE TABLE IF NOT EXISTS public.internal_secrets (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

ALTER TABLE public.internal_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_secrets FROM PUBLIC, anon, authenticated;

-- Generate once, 64 hex chars. Two UUIDs concatenated so this needs no
-- pgcrypto dependency. ON CONFLICT DO NOTHING keeps re-runs idempotent —
-- re-applying the migration must not silently rotate a live secret.
INSERT INTO public.internal_secrets (name, value)
VALUES (
  'reconcile',
  replace(gen_random_uuid()::text, '-', '') ||
  replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (name) DO NOTHING;

-- ── Scheduler that sources its own secret ────────────────────
CREATE OR REPLACE FUNCTION public.schedule_esim_reconcile_auto(
  p_functions_url text,
  p_schedule      text DEFAULT '*/5 * * * *'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_cmd    text;
BEGIN
  SELECT value INTO v_secret
  FROM public.internal_secrets
  WHERE name = 'reconcile';

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'no reconcile secret stored';
  END IF;

  PERFORM cron.unschedule('reconcile-esims')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-esims');

  v_cmd := format(
    $cmd$select net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reconcile-secret', %L
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );$cmd$,
    rtrim(p_functions_url, '/') || '/reconcile-esims',
    v_secret
  );

  PERFORM cron.schedule('reconcile-esims', p_schedule, v_cmd);
  RETURN 'scheduled reconcile-esims at ' || p_schedule;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_esim_reconcile_auto(text, text)
  FROM PUBLIC, anon, authenticated;

-- ── Install the job now ──────────────────────────────────────
-- The functions URL is not a secret, so this can live in git and the schedule
-- activates on deploy with no manual step.
SELECT public.schedule_esim_reconcile_auto(
  'https://ciuwkjkgnqnhkknbeehw.supabase.co/functions/v1'
);

-- Echo the result into the migration output so the deploy proves it worked.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'reconcile-esims'
  LOOP
    RAISE NOTICE 'CRON INSTALLED: % | schedule=% | active=%',
      r.jobname, r.schedule, r.active;
  END LOOP;
END $$;
