-- ============================================================
-- Uploaded campaign banners
--
-- Until now a campaign banner could be one of the four images shipped in
-- public/images/email/, or a URL pasted from somewhere else. Neither is
-- "use this picture": the first needs a deploy, the second needs the admin to
-- have already hosted the file. This adds a bucket they can upload into.
--
-- Public read is not a preference, it is a requirement. The URL ends up as an
-- <img src> inside an email that a stranger's mail client fetches, possibly
-- months later, carrying no session and no token. A signed URL expires and the
-- banner would quietly turn into a broken image in every copy already sent.
-- Nothing private is ever put in here — these are marketing images that are,
-- by the time they matter, already in other people's inboxes.
--
-- Writes are admin-only and that is enforced HERE rather than in the app,
-- because the browser uploads straight to Storage with the signed-in user's own
-- token. There is no Edge Function in the path to check anything, so the policy
-- is the check. Routing the bytes through admin-api instead would mean
-- base64 (a third bigger) inside the 6 MB function body limit, for no gain.
-- ============================================================

-- ── Who counts as an admin ──────────────────────────────────
--
-- The rest of the codebase inlines `SELECT is_admin FROM profiles WHERE id = …`
-- inside SECURITY DEFINER functions. A Storage policy has nowhere to put that:
-- it runs as the calling user, so a bare subquery against profiles would be
-- filtered by profiles' own RLS and could be turned into a bypass — or a
-- lockout — by an unrelated policy change. This reads the actual column value,
-- always, and is the single thing the Storage policies below depend on.
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = p_user), false);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

comment on function public.is_admin(uuid) is
  'True when the given user (default: the caller) has profiles.is_admin. '
  'SECURITY DEFINER so RLS on profiles cannot change the answer.';

-- ── The bucket ──────────────────────────────────────────────
--
-- 5 MB and four image types, enforced by Storage itself. The client checks the
-- same limits before uploading so the admin gets a sentence instead of a 413,
-- but the client check is a courtesy and this one is the rule.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-banners',
  'email-banners',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies ────────────────────────────────────────────────
--
-- Read is open. A public bucket already serves /object/public/… without
-- checking RLS, so restricting SELECT would not protect the files — it would
-- only stop the admin panel from LISTING what has been uploaded, since list()
-- does go through RLS. The one thing an open read adds is that a stranger
-- could enumerate the filenames of our marketing banners, which are images we
-- deliberately mail to thousands of people.
drop policy if exists "email banners are readable" on storage.objects;
create policy "email banners are readable"
  on storage.objects for select
  using (bucket_id = 'email-banners');

drop policy if exists "admins upload email banners" on storage.objects;
create policy "admins upload email banners"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'email-banners' and public.is_admin());

drop policy if exists "admins replace email banners" on storage.objects;
create policy "admins replace email banners"
  on storage.objects for update to authenticated
  using (bucket_id = 'email-banners' and public.is_admin())
  with check (bucket_id = 'email-banners' and public.is_admin());

drop policy if exists "admins delete email banners" on storage.objects;
create policy "admins delete email banners"
  on storage.objects for delete to authenticated
  using (bucket_id = 'email-banners' and public.is_admin());

-- ── Verify, don't assume ────────────────────────────────────
--
-- A silently-missing policy here is an admin panel whose upload button fails
-- with an opaque "new row violates row-level security" long after this ran.
-- Failing the migration instead means it is never half-applied.
do $$
declare
  v_public   boolean;
  v_policies int;
begin
  select public into v_public from storage.buckets where id = 'email-banners';
  if v_public is not true then
    raise exception 'email-banners bucket missing or not public';
  end if;

  select count(*) into v_policies
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'email banners are readable',
      'admins upload email banners',
      'admins replace email banners',
      'admins delete email banners'
    );
  if v_policies <> 4 then
    raise exception 'expected 4 email-banners storage policies, found %', v_policies;
  end if;

  if public.is_admin('00000000-0000-0000-0000-000000000000'::uuid) is not false then
    raise exception 'is_admin() should be false for an unknown user';
  end if;

  raise notice 'email-banners: bucket public, 4 policies, is_admin() sane';
end $$;
