-- ============================================================
-- Put public.messages on the Realtime publication
--
-- ActiveOrder subscribes to INSERTs on public.messages to show an incoming
-- code the moment it lands — poll-sms even says "this triggers Realtime push
-- to the UI". It did not: the table was never added to supabase_realtime, so
-- the subscription was silent, and the 5s poll beside it was reading a field
-- poll-sms does not return. Both routes to the screen were dead, which is why
-- a customer could have a code delivered on SMSPool and see nothing.
--
-- The poll is fixed in the same change and is the load-bearing path. This is
-- what makes it instant instead of up to five seconds late.
--
-- Safe to broadcast: Realtime honours RLS, messages has RLS enabled with
-- "Users can view own messages" USING (auth.uid() = user_id), so a subscriber
-- is only ever pushed their own rows — verified in
-- 20261012130000_sms_realtime_report. REPLICA IDENTITY is already FULL.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
    raise notice 'messages added to supabase_realtime';
  else
    raise notice 'messages already on supabase_realtime';
  end if;
end $$;

-- Assert it, rather than trust the branch above: a subscription that silently
-- never fires is precisely the failure this migration exists to end.
do $$
declare
  v_ok  boolean;
  v_rls boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages'
  ) into v_ok;
  if not v_ok then
    raise exception 'public.messages is still not on supabase_realtime';
  end if;

  -- Broadcasting a table whose RLS has been turned off would push every
  -- user's codes to every subscriber. Refuse rather than allow that.
  select relrowsecurity into v_rls
  from pg_class where oid = 'public.messages'::regclass;
  if v_rls is not true then
    raise exception 'public.messages has RLS disabled — refusing to broadcast it';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'messages' and cmd = 'SELECT'
  ) then
    raise exception 'public.messages has no SELECT policy — refusing to broadcast it';
  end if;

  raise notice 'messages: on supabase_realtime, RLS on, SELECT policy present';
end $$;
