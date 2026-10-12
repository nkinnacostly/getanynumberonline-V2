-- ============================================================
-- Verify: can the browser actually be pushed an incoming SMS?
--
-- ActiveOrder learns that a code arrived in two ways: the 5s poll of
-- poll-sms, and a Realtime INSERT on public.messages. The poll was reading a
-- field poll-sms never returns, so for some time Realtime was the ONLY path —
-- and if public.messages is not in the supabase_realtime publication, there is
-- no path at all and the code never appears, however well SMSPool delivered it.
--
-- Read-only. It reports rather than asserts, because adding a table to the
-- publication is a deliberate act and this file's job is to say what is true.
-- ============================================================

do $$
declare
  v_msgs     boolean;
  v_rentals  boolean;
  v_replica  text;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) into v_msgs;

  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rental_messages'
  ) into v_rentals;

  select case relreplident
           when 'd' then 'default (primary key only)'
           when 'f' then 'full'
           when 'i' then 'index'
           when 'n' then 'nothing'
         end
    into v_replica
  from pg_class where oid = 'public.messages'::regclass;

  raise notice 'realtime: public.messages in supabase_realtime = %', v_msgs;
  raise notice 'realtime: public.rental_messages in supabase_realtime = %', v_rentals;
  raise notice 'realtime: public.messages REPLICA IDENTITY = %', v_replica;
end $$;
