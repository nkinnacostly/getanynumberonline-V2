-- Admin panel: role flag, privileged RPCs, and an audit trail.
--
-- Everything the admin panel reads spans all users, which RLS deliberately
-- prevents. That data therefore only ever moves through the admin-api edge
-- function using the service role — the browser never gets a cross-user query.
-- This migration adds the pieces that must live in the database: the role
-- flag, the two mutating RPCs, and the guards that stop the flag being
-- self-granted.

-- ── Role flag ────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Admin lookups happen on every admin-api call; keep them cheap.
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx
  ON public.profiles (id) WHERE is_admin;

-- ── Privilege-escalation guard ───────────────────────────────
-- `profiles` was created outside migrations, so its RLS policies aren't
-- visible in this repo. If ANY policy lets a user update their own row —
-- a very common "let users edit their profile" policy — then without this
-- trigger a user could run:
--     update profiles set is_admin = true where id = auth.uid();
-- and own the admin panel. Same story for `balance`, which CLAUDE.md §5 says
-- must only ever move through an RPC.
--
-- SECURITY DEFINER functions (deduct_balance_and_create_order, credit_balance,
-- the admin RPCs below) run as their owner, and the service role is its own
-- role, so both pass straight through. Only direct anon/authenticated writes
-- are blocked.
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'is_admin cannot be changed directly';
    END IF;
    IF NEW.balance IS DISTINCT FROM OLD.balance THEN
      RAISE EXCEPTION 'balance can only be changed through a balance RPC';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'is_banned cannot be changed directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER guard_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ── Audit trail ──────────────────────────────────────────────
-- Every privileged mutation is recorded with the acting admin. Service-role
-- only (RLS on, no policies) — reachable through admin-api, never directly.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  target_user uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);

-- ── Replace any pre-existing admin RPCs ──────────────────────
-- These functions already exist in this database, created outside migrations
-- (like `profiles` itself). CREATE OR REPLACE cannot change a function's return
-- type, so the first attempt at this migration failed with 42P13. Drop every
-- overload by signature first, logging what was there so the change is
-- traceable — this is replacing live, money-touching code.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           pg_get_function_result(p.oid) AS ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_adjust_balance', 'admin_set_ban')
  LOOP
    RAISE NOTICE 'dropping existing %s -> returns %', r.sig, r.ret;
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

-- ── Manual balance adjustment ────────────────────────────────
-- Positive credits, negative debits. Writes a matching transactions row so the
-- money is visible in the user's own history, tagged provider='admin' so it
-- can be excluded from revenue reporting — an admin credit is not a sale.
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_admin_id uuid,
  p_user_id  uuid,
  p_amount   numeric,
  p_note     text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin       boolean;
  v_balance_before numeric;
  v_balance_after  numeric;
BEGIN
  -- Re-check the caller here too. The edge function already verifies it, but
  -- this RPC is reachable by anything holding the service role, so it must not
  -- depend on the caller having done the check.
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Amount must be non-zero';
  END IF;

  SELECT balance INTO v_balance_before
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_balance_after := v_balance_before + p_amount;
  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'Adjustment would put balance below zero (have %, adjusting %)',
      v_balance_before, p_amount;
  END IF;

  UPDATE public.profiles SET balance = v_balance_after, updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_before, balance_after,
    provider, provider_ref, status, note
  ) VALUES (
    p_user_id,
    CASE WHEN p_amount > 0 THEN 'topup' ELSE 'deduction' END::transaction_type,
    abs(p_amount), v_balance_before, v_balance_after,
    'admin', 'admin_' || gen_random_uuid()::text, 'completed',
    COALESCE(p_note, 'Manual adjustment by admin')
  );

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (p_admin_id, p_user_id, 'adjust_balance',
          jsonb_build_object('amount', p_amount, 'note', p_note,
                             'balance_before', v_balance_before,
                             'balance_after', v_balance_after));

  RETURN v_balance_after;
END;
$$;

-- ── Ban / unban ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_ban(
  p_admin_id uuid,
  p_user_id  uuid,
  p_banned   boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- An admin locking themselves out is unrecoverable from the UI.
  IF p_admin_id = p_user_id AND p_banned THEN
    RAISE EXCEPTION 'You cannot ban your own account';
  END IF;

  UPDATE public.profiles
  SET is_banned = p_banned, updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, target_user, action, detail)
  VALUES (p_admin_id, p_user_id, CASE WHEN p_banned THEN 'ban' ELSE 'unban' END,
          jsonb_build_object('banned', p_banned));

  RETURN p_banned;
END;
$$;

-- These are service-role surfaces only; never callable straight from a client.
REVOKE ALL ON FUNCTION public.admin_adjust_balance(uuid, uuid, numeric, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_ban(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- ── Report existing profiles policies ────────────────────────
-- `profiles` predates this repo's migrations, so print its policies into the
-- deploy output. If an UPDATE policy shows up here, the guard trigger above is
-- doing real work rather than being belt-and-braces.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT policyname, cmd, roles::text FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    n := n + 1;
    RAISE NOTICE 'profiles policy: % | cmd=% | roles=%', r.policyname, r.cmd, r.roles;
  END LOOP;
  IF n = 0 THEN RAISE NOTICE 'profiles: no RLS policies found'; END IF;
END $$;
