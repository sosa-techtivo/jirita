-- Fix: avatar uploads failing with "new row violates row-level security
-- policy" on storage.objects insert.
--
-- The policy logic in 20260710000000_avatars_storage.sql is the standard,
-- documented Supabase pattern (bucket_id = 'avatars' and
-- (storage.foldername(name))[1] = auth.uid()::text) and matches exactly the
-- path avatar-upload.ts uploads to ("<uid>/avatar.jpg" — storage.foldername
-- returns every path segment except the filename, so [1] is the uid). An
-- RLS violation rather than a foreign-key error confirms the bucket exists
-- and the insert is reaching policy evaluation and being rejected — i.e.
-- the policies themselves are missing or inconsistent in the live database,
-- not a logic bug. `create policy` has no "or replace" form, so if
-- 20260710000000 was ever applied twice, or partially (one statement
-- failing rolls back that whole transaction, silently undoing everything
-- after — including the trailing `grant update (avatar_url)`), the
-- policies could simply not exist. This migration makes every statement
-- idempotent so it's always safe to (re-)run, and adds the read policy
-- explicitly instead of relying solely on the bucket's public flag.

-- Guarantee the bucket exists and is public, regardless of any prior state
-- (on conflict do nothing would have silently left a pre-existing
-- private/misconfigured bucket alone).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;
drop policy if exists avatars_select_public on storage.objects;

create policy avatars_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Explicit read policy — belt-and-suspenders alongside the bucket's public
-- flag (the flag is what actually serves the public object URL without an
-- auth header; this covers any authenticated/RLS-evaluated read path too).
create policy avatars_select_public on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

-- Re-assert in case the original migration's transaction rolled back
-- before reaching this statement (see comment above). No-op if already
-- granted.
grant update (avatar_url) on public.profiles to authenticated;
