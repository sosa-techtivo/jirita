-- Real attachments for Project Notes — same authorization model already
-- used for ticket_attachments (20260724000000): a private Storage bucket +
-- a metadata table, both scoped to whoever can see the attachment's note
-- (via its project). No comment-equivalent column here (Notes has no
-- comment thread) — a note attachment is always note-level.
--
-- organization_id is NOT duplicated onto this table — same reasoning as
-- ticket_attachments/project_notes themselves: derived through
-- project_notes.project_id via a join in every policy below.

-- ── project_note_attachments ─────────────────────────────────────────────────

create table public.project_note_attachments (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.project_notes (id) on delete cascade,
  storage_path text not null unique,
  filename     text not null,
  size_bytes   bigint not null,
  mime_type    text,
  -- Defaults to the authenticated uploader — the client never needs to (and
  -- cannot spoof who) sets this; Postgres fills it in from the session.
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index project_note_attachments_note_id_idx on public.project_note_attachments (note_id);

alter table public.project_note_attachments enable row level security;

create policy project_note_attachments_select on public.project_note_attachments
  for select
  using (
    exists (
      select 1 from public.project_notes n
      where n.id = note_id
        and public.can_view_project(n.project_id)
    )
  );

-- Mirrors ticket_attachments_insert/project_notes_insert's own check:
-- is_org_admin_or_lead OR is_project_member on the note's project — the
-- same set of people who can create/edit/delete the note itself can
-- attach files to it.
create policy project_note_attachments_insert on public.project_note_attachments
  for insert
  with check (
    exists (
      select 1 from public.project_notes n
      join public.projects p on p.id = n.project_id
      where n.id = note_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

create policy project_note_attachments_delete on public.project_note_attachments
  for delete
  using (
    exists (
      select 1 from public.project_notes n
      join public.projects p on p.id = n.project_id
      where n.id = note_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

grant select, insert, delete on public.project_note_attachments to authenticated;

-- No update policy/grant — renaming isn't part of this feature (matches
-- ticket_attachments' own original MVP pass, before rename/delete were
-- added later); only create/preview/download/delete are needed here.

-- ── storage: project-note-attachments bucket ────────────────────────────────
-- Private (unlike the public "avatars" bucket) — note attachments may be
-- sensitive project files, so reads go through RLS below rather than a
-- public object URL. Objects are stored at "<note_id>/<uuid>-<filename>",
-- so (storage.foldername(name))[1] is the note id — every policy below
-- joins back through project_notes the same way the table policies above
-- do, keeping the Storage path and the RLS model in lockstep.
--
-- `objects.name` is qualified explicitly in every policy below (not just
-- the ones joining `projects`) — ticket_attachments_storage_insert
-- (20260724000000) originally shipped with an unqualified `name` reference
-- that Postgres silently resolved to `projects.name` instead of
-- `storage.objects.name` inside an EXISTS subquery also joining projects
-- (fixed in 20260725000000); qualifying it everywhere here avoids that
-- same class of bug from ever being possible, regardless of which table a
-- future edit might add to any of these joins.

insert into storage.buckets (id, name, public)
values ('project-note-attachments', 'project-note-attachments', false)
on conflict (id) do nothing;

create policy project_note_attachments_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-note-attachments'
    and exists (
      select 1 from public.project_notes n
      where n.id::text = (storage.foldername(objects.name))[1]
        and public.can_view_project(n.project_id)
    )
  );

create policy project_note_attachments_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-note-attachments'
    and exists (
      select 1 from public.project_notes n
      join public.projects p on p.id = n.project_id
      where n.id::text = (storage.foldername(objects.name))[1]
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

create policy project_note_attachments_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-note-attachments'
    and exists (
      select 1 from public.project_notes n
      join public.projects p on p.id = n.project_id
      where n.id::text = (storage.foldername(objects.name))[1]
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );
