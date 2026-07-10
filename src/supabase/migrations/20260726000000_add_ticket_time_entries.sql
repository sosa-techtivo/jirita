-- Real Time Tracking entries — backs Ticket Detail's "Log Time" flow, which
-- previously only appended to local React state (nothing persisted, and
-- the modal's Date field defaulted to a hardcoded mock date instead of
-- today). Minutes are the stored unit (not a float "hours" value) to avoid
-- floating-point drift when summing many entries — the UI still displays
-- hours, converted at the mapping layer in ticket-detail-screen.tsx.
--
-- No edit/delete support (not implemented in the UI), so only select/insert
-- are granted — same shape as ticket_comments/ticket_attachments.

create table public.ticket_time_entries (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets (id) on delete cascade,
  -- Defaults to the authenticated user — never sent by the client, so it
  -- can't be spoofed, same pattern as ticket_attachments.uploaded_by.
  logged_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  minutes     integer not null check (minutes > 0),
  work_date   date not null,
  comment     text,
  created_at  timestamptz not null default now()
);

create index ticket_time_entries_ticket_id_idx on public.ticket_time_entries (ticket_id);

alter table public.ticket_time_entries enable row level security;

create policy ticket_time_entries_select on public.ticket_time_entries
  for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
  );

-- Mirrors tickets_insert / ticket_attachments_insert: is_project_member
-- alone would block everyone today (project_memberships is still empty),
-- so org admin/lead is the real path until real project staffing exists.
create policy ticket_time_entries_insert on public.ticket_time_entries
  for insert
  with check (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

grant select, insert on public.ticket_time_entries to authenticated;
