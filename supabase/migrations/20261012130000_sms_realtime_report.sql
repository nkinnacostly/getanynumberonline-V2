-- ============================================================
-- Report: RLS on public.messages, before deciding about Realtime
--
-- Realtime respects RLS — a subscriber is pushed only the rows their policies
-- let them select. So "should messages be in the supabase_realtime
-- publication" is really "is there a policy that scopes messages to their
-- owner". Adding a table to a publication without knowing that is how a
-- broadcast turns into a leak, so this looks first and asserts nothing.
-- ============================================================

do $$
declare
  v_rls boolean;
  r     record;
  v_n   int := 0;
begin
  select relrowsecurity into v_rls
  from pg_class where oid = 'public.messages'::regclass;
  raise notice 'messages: RLS enabled = %', v_rls;

  for r in
    select policyname, cmd, qual::text
    from pg_policies
    where schemaname = 'public' and tablename = 'messages'
    order by policyname
  loop
    v_n := v_n + 1;
    raise notice 'messages policy: % [%] USING %', r.policyname, r.cmd, r.qual;
  end loop;

  if v_n = 0 then
    raise notice 'messages: NO policies — with RLS on, nobody can select; with RLS off, everyone can';
  end if;
end $$;
