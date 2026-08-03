-- SMSPool reference tables + name backfill.
--
-- Bug being fixed:
--   order-number stored the numeric SMSPool service/country ID in the *_name
--   columns. SMSPool's price / purchase responses carry no names, so the code's
--   `priceJson.service_name ?? service` fallback always used the ID — History
--   then showed "1734" instead of "Google". The real names live only in the
--   catalog lists (service/retrieve_all, country/retrieve_all).
--
-- This migration:
--   1. Adds lookup tables smspool_services / smspool_countries (id -> name).
--   2. Adds backfill_reference_names(): rewrites numeric/blank *_name values in
--      orders + rentals from those tables. Idempotent and re-runnable.
--
-- Seeding is done OUT of SQL (Postgres can't call the SMSPool API): the
-- sync-smspool-catalog edge function upserts the catalog into these tables and
-- then calls backfill_reference_names(). Run it once after this migration
-- deploys, and on a cron thereafter. order-number / rent-number also self-seed
-- these tables on a cache miss.

-- ── Lookup tables ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.smspool_services (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.smspool_countries (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reference data is server-only. Enabling RLS with NO policy denies all
-- anon/authenticated access; edge functions reach it via the service role,
-- which bypasses RLS. The frontend never reads these — it lists services /
-- countries straight from SMSPool through the existing proxy functions.
ALTER TABLE public.smspool_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smspool_countries ENABLE ROW LEVEL SECURITY;

-- ── Backfill ─────────────────────────────────────────────────
-- Only rewrites values that are clearly an ID or blank (never clobbers a name
-- that's already good), so it is safe to run repeatedly.
CREATE OR REPLACE FUNCTION public.backfill_reference_names()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orders_service   int := 0;
  v_orders_country   int := 0;
  v_rentals_service  int := 0;
  v_rentals_country  int := 0;
BEGIN
  UPDATE public.orders o
  SET service_name = s.name
  FROM public.smspool_services s
  WHERE o.service = s.id
    AND (o.service_name IS NULL
         OR btrim(o.service_name) = ''
         OR o.service_name = o.service
         OR o.service_name ~ '^[0-9]+$');
  GET DIAGNOSTICS v_orders_service = ROW_COUNT;

  UPDATE public.orders o
  SET country_name = c.name
  FROM public.smspool_countries c
  WHERE o.country = c.id
    AND (o.country_name IS NULL
         OR btrim(o.country_name) = ''
         OR o.country_name = o.country
         OR o.country_name ~ '^[0-9]+$');
  GET DIAGNOSTICS v_orders_country = ROW_COUNT;

  UPDATE public.rentals r
  SET service_name = s.name
  FROM public.smspool_services s
  WHERE r.service = s.id
    AND (r.service_name IS NULL
         OR btrim(r.service_name) = ''
         OR r.service_name = r.service
         OR r.service_name ~ '^[0-9]+$');
  GET DIAGNOSTICS v_rentals_service = ROW_COUNT;

  UPDATE public.rentals r
  SET country_name = c.name
  FROM public.smspool_countries c
  WHERE r.country = c.id
    AND (r.country_name IS NULL
         OR btrim(r.country_name) = ''
         OR r.country_name = r.country
         OR r.country_name ~ '^[0-9]+$');
  GET DIAGNOSTICS v_rentals_country = ROW_COUNT;

  RETURN jsonb_build_object(
    'orders_service_updated',  v_orders_service,
    'orders_country_updated',  v_orders_country,
    'rentals_service_updated', v_rentals_service,
    'rentals_country_updated', v_rentals_country
  );
END;
$function$;
