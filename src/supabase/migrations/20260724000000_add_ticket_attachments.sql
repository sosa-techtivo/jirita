-- Real Ticket Attachments — backs Ticket Detail's Attachments section,
-- which previously only simulated an upload locally (fake progress bar,
-- in-memory list, nothing persisted; see ticket-detail-screen.tsx). This
-- adds the minimum needed to actually store a file and its metadata:
-- a private Storage bucket + a metadata table, both scoped to whoever can
-- see the attachment's ticket (same authorization model already used for
-- tickets/ticket_comments/ticket_activity — can_view_project /
-- is_org_admin_or_lead / is_project_member, all defined in
-- 20260708000000_mvp_schema.sql).
--
-- No edit/delete/rename support (not implemented in the UI for real data
-- yet), so only select/insert are granted — matches the Comments/Activity
-- precedent (20260720000000).
--
-- organization_id/project_id are NOT duplicated onto this table — same
-- reasoning as ticket_comments/ticket_activity: they're derived through
-- tickets.project_id via a join in every policy below, so there's only one
-- place a ticket's project can ever be recorded.

-- ── ticket_attachments ────────────────────────────────────────────────────────

create table public.ticket_attachments (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.tickets (id) on delete cascade,
  storage_path  text not null unique,
  filename      text not null,
  size_bytes    bigint not null,
  mime_type     text,
  -- Defaults to the authenticated uploader — the client never needs to (and
  -- cannot spoof who) sets this; Postgres fills it in from the session.
  uploaded_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index ticket_attachments_ticket_id_idx on public.ticket_attachments (ticket_id);

alter table public.ticket_attachments enable row level security;

create policy ticket_attachments_select on public.ticket_attachments
  for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
  );

-- Mirrors tickets_insert's own check (20260719000000): is_project_member
-- alone would block everyone today, since project_memberships is still
-- empty (no staffing UI exists yet) — org admin/lead is the real path
-- until that exists.
create policy ticket_attachments_insert on public.ticket_attachments
  for insert
  with check (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

grant select, insert on public.ticket_attachments to authenticated;

-- ── storage: ticket-attachments bucket ──────────────────────────────────────
-- Private (unlike the public "avatars" bucket) — attachments may be
-- sensitive project files, so reads go through RLS below rather than a
-- public object URL. Objects are stored at "<ticket_id>/<uuid>-<filename>",
-- so (storage.foldername(name))[1] is the ticket id — every policy below
-- joins back through tickets the same way the table policies above do,
-- keeping the Storage path and the RLS model in lockstep.

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy ticket_attachments_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      where t.id::text = (storage.foldername(name))[1]
        and public.can_view_project(t.project_id)
    )
  );

create policy ticket_attachments_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id::text = (storage.foldername(name))[1]
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );
