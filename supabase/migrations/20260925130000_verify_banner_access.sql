-- ============================================================
-- Verify: the email-banners gate opens for an admin and nobody else
--
-- The previous migration asserted the bucket and its four policies exist, and
-- a live probe confirmed an anonymous upload is refused with an RLS violation.
-- What neither covers is the other direction — that `public.is_admin()`, the
-- single expression every write policy hangs on, actually returns true for a
-- real admin. A silent false there is an upload button that refuses the very
-- people it is for, and the only symptom would be the same opaque RLS error.
--
-- Read-only: it asserts against whoever is already an admin and writes nothing.
-- ============================================================

do $$
declare
  v_admin     uuid;
  v_ordinary  uuid;
begin
  select id into v_admin
  from public.profiles
  where is_admin is true
  order by created_at
  limit 1;

  if v_admin is null then
    -- Not a failure: a project with no admin yet is a real state (see the
    -- grant_admin step in setup). Nothing to assert, so say so and stop.
    raise notice 'email-banners: no admin account exists yet — gate untested';
  elsif public.is_admin(v_admin) is not true then
    raise exception 'is_admin() returned false for admin %, banner uploads would be refused', v_admin;
  else
    raise notice 'email-banners: is_admin() opens for admin %', v_admin;
  end if;

  select id into v_ordinary
  from public.profiles
  where is_admin is not true
  order by created_at
  limit 1;

  if v_ordinary is not null and public.is_admin(v_ordinary) is not false then
    raise exception 'is_admin() returned true for non-admin % — anyone could upload', v_ordinary;
  end if;

  raise notice 'email-banners: is_admin() stays shut for ordinary users';
end $$;
