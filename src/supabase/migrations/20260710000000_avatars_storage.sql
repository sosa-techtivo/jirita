-- Avatar photo storage: public "avatars" bucket + minimal per-user write
-- policies, plus the profiles.avatar_url column grant this feature needs.
-- Backs the Profile screen's upload/drag-drop avatar picker — see
-- src/lib/avatar-upload.ts.

-- ── storage: avatars bucket ─────────────────────────────────────────────────
-- Public by design: avatars are served via Supabase's public object URL (no
-- signed URL / auth header needed), which is what lets CurrentUser.avatar
-- stay a plain string the existing Profile/Sidebar/Header <img> tags already
-- use unchanged (see membership.ts's resolveAvatarUrl). Public buckets serve
-- reads directly, bypassing storage.objects RLS entirely — so only writes
-- need policies below. storage.objects already has RLS enabled by default
-- on every Supabase project; this migration doesn't need to turn it on.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Each user may only write inside their own "<uid>/" folder — enforced by
-- checking the first path segment against auth.uid(). One fixed filename
-- per user (avatar-upload.ts always uploads to "<uid>/avatar.jpg" with
-- upsert) means no separate cleanup/delete flow is needed for old avatars,
-- so the delete policy below exists only for completeness/future use.

create policy avatars_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update
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
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── profiles: avatar_url column grant ───────────────────────────────────────
-- 20260709000000_profile_self_service_updates.sql granted UPDATE on
-- first_name/last_name only. avatar_url now needs the same self-service
-- write path (it stores the storage *path* from the bucket above, e.g.
-- "<uid>/avatar.jpg" — never a manually-entered URL). Still column-scoped:
-- email/unfuddle_id remain off-limits.

grant update (avatar_url) on public.profiles to authenticated;
