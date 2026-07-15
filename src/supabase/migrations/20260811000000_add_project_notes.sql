-- Real Project Notes — replaces src/lib/mock-notes.ts's hardcoded array as
-- the data source for /projects/[slug]/notes. Same scope discipline as the
-- rest of this schema: only what the current UI (notes-screen.tsx,
-- note-detail-modal.tsx) actually needs — title, content, author, updated
-- date. Tag stays a local-only, unwired UI field (same precedent as New
-- Ticket's "More Options" fields — see src/lib/notes.ts) since versioning/
-- categories/tags/favorites/etc. are explicitly out of scope for this pass.
--
-- Design mirrors tickets: created_by defaults to auth.uid() (never
-- spoofable), updated_by/updated_at are stamped by a trigger on every
-- update (not a client-sent value, so it can't be spoofed either), and RLS
-- reuses the exact admin/lead-or-project-member check tickets_insert was
-- fixed to use in 20260719000000 — project_memberships is still sparse, so
-- notes must be creatable by org admins/leads even without a staffing row.

create table public.project_notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null,
  content    text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_notes_project_id_idx on public.project_notes (project_id);

-- Stamps updated_at/updated_by on every UPDATE — deliberately a dedicated
-- trigger rather than reusing the shared set_updated_at() (profiles/
-- projects/tickets/ticket_comments), since notes also need updated_by set
-- from the real session, not just updated_at touched.
create or replace function public.set_note_updated_meta()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger project_notes_set_updated_meta
  before update on public.project_notes
  for each row execute function public.set_note_updated_meta();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.project_notes enable row level security;

create policy project_notes_select on public.project_notes
  for select
  using (public.can_view_project(project_id));

create policy project_notes_insert on public.project_notes
  for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

create policy project_notes_update on public.project_notes
  for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

create policy project_notes_delete on public.project_notes
  for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

-- create table alone grants nothing to authenticated — Postgres checks base
-- table privileges before RLS is ever evaluated, same as every other table
-- in this schema.
grant select, insert, update, delete on public.project_notes to authenticated;

-- ── Activity Log ─────────────────────────────────────────────────────────────
-- Same trigger-based architecture as ticket_activity (20260728000000) /
-- ticket_relations (20260802000000): fires only inside the same transaction
-- as the real write, so "no activity on failure" and "real authenticated
-- actor" both come for free, and src/lib/notes.ts's create/update/delete
-- functions never have to write activity rows themselves.
--
-- note_id is ON DELETE SET NULL (not CASCADE) and note_title is a snapshot
-- column, specifically so a note's own "note_deleted" activity row — and
-- its full history — survives the delete instead of vanishing with it.

create table public.project_note_activity (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  note_id          uuid references public.project_notes (id) on delete set null,
  note_title       text not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_type       text not null, -- 'note_created' | 'note_updated' | 'note_deleted'
  field_name       text,
  old_value        text,
  new_value        text,
  created_at       timestamptz not null default now()
);

create index project_note_activity_project_id_idx on public.project_note_activity (project_id);
create index project_note_activity_note_id_idx on public.project_note_activity (note_id);

alter table public.project_note_activity enable row level security;

create policy project_note_activity_select on public.project_note_activity
  for select
  using (public.can_view_project(project_id));

-- No insert policy/grant for authenticated on purpose — rows are only ever
-- written by the SECURITY DEFINER triggers below, same as ticket_activity.
grant select on public.project_note_activity to authenticated;

create or replace function public.log_note_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_note_activity (project_id, note_id, note_title, actor_profile_id, event_type)
  values (new.project_id, new.id, new.title, new.created_by, 'note_created');
  return new;
end;
$$;

create trigger project_notes_log_created
  after insert on public.project_notes
  for each row execute function public.log_note_created();

create or replace function public.log_note_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if old.title is distinct from new.title then
    insert into public.project_note_activity
      (project_id, note_id, note_title, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.project_id, new.id, new.title, actor, 'note_updated', 'title', old.title, new.title);
  end if;

  if old.content is distinct from new.content then
    insert into public.project_note_activity
      (project_id, note_id, note_title, actor_profile_id, event_type, field_name)
    values (new.project_id, new.id, new.title, actor, 'note_updated', 'content');
  end if;

  return new;
end;
$$;

create trigger project_notes_log_updated
  after update on public.project_notes
  for each row execute function public.log_note_updated();

create or replace function public.log_note_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_note_activity (project_id, note_id, note_title, actor_profile_id, event_type)
  values (old.project_id, old.id, old.title, auth.uid(), 'note_deleted');
  return old;
end;
$$;

-- BEFORE (not AFTER) so this insert runs while the note row still exists —
-- note_id's own FK is satisfied at insert time, then automatically nulled
-- out by ON DELETE SET NULL once the actual delete completes.
create trigger project_notes_log_deleted
  before delete on public.project_notes
  for each row execute function public.log_note_deleted();
