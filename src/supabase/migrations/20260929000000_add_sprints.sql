-- Sprint MVP: a minimal per-project `sprints` entity so Admin/Project Lead
-- can organize tickets into a single active sprint instead of one flat
-- backlog. Deliberately shaped after the `ticket_statuses` feature
-- (20260830000000 / 20260918000000 / 20260920000000): plain RLS-gated
-- insert/update for simple fields, SECURITY DEFINER RPCs for the two
-- operations that carry a real cross-row invariant (activate, close), and a
-- partial unique index as the actual "at most one" backstop rather than
-- trusting application logic alone — same shape
-- ticket_statuses_one_default_per_project already uses.
--
-- No burndown/velocity/goal/capacity/story-points/auto-start-close/reports/
-- multi-active-sprint/drag-and-drop concepts here — see the Sprint MVP
-- prompt this migration was written against. start_date/end_date are purely
-- informational: nothing in this migration reads them to drive status.

-- ── sprints ──────────────────────────────────────────────────────────────

create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  start_date date,
  end_date date,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.sprints
  add constraint sprints_name_not_blank check (length(trim(name)) > 0);

-- The real "at most one active sprint per project" guarantee — enforced by
-- Postgres itself, not just by activate_sprint()'s own pre-check below (same
-- defense-in-depth reasoning ticket_statuses_one_default_per_project uses).
create unique index sprints_one_active_per_project
  on public.sprints (project_id)
  where status = 'active';

create index sprints_project_id_idx on public.sprints (project_id);

create trigger set_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();

alter table public.sprints enable row level security;

-- Any project viewer (including Member) can see this project's sprints —
-- same trust level tickets_select already grants via can_view_project.
create policy sprints_select on public.sprints
  for select
  using (public.can_view_project(project_id));

-- Create / rename / reschedule — same "any org-wide Admin or Project Lead"
-- trust level ticket_statuses_insert/_update already grant, never scoped
-- down to "the lead of this one project" (no such narrower concept exists
-- anywhere else in this schema).
create policy sprints_insert on public.sprints
  for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

create policy sprints_update on public.sprints
  for update
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and public.is_org_admin_or_lead(p.organization_id)
    )
  );

grant select, insert on public.sprints to authenticated;

-- `status` carries the one-active-per-project invariant and the
-- close-cascades-to-tickets side effect — it only ever changes through
-- activate_sprint/close_sprint below, never a bare client UPDATE. Same
-- "revoke the blanket grant, re-grant just the safe columns" convention
-- ticket_statuses_management (20260920000000) already established.
revoke update on public.sprints from authenticated;
grant update (name, start_date, end_date) on public.sprints to authenticated;

-- No delete policy — sprint deletion/cancellation isn't in this MVP's scope
-- (same "left denied-by-default until decided" precedent tickets itself
-- uses for its own missing delete policy).

-- ── tickets.sprint_id ────────────────────────────────────────────────────
-- One more nullable column on the same row tickets_select/_update (RLS)
-- already govern — no new ticket-side RLS needed. A ticket with
-- sprint_id = null belongs to the general backlog.

alter table public.tickets
  add column sprint_id uuid references public.sprints (id) on delete set null;

create index tickets_sprint_id_idx on public.tickets (sprint_id);

-- ── activate_sprint ──────────────────────────────────────────────────────
-- Idempotent no-op if already active. Refuses to activate a closed sprint,
-- and refuses to activate while a *different* sprint in the same project is
-- already active — deliberately a hard error, not a silent auto-close of
-- the other one (auto-closing would silently return that sprint's own open
-- tickets to the backlog, a real side effect the caller must trigger
-- explicitly via close_sprint instead).

create or replace function public.activate_sprint(p_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_status text;
  v_other_active_id uuid;
begin
  select s.project_id, s.status, p.organization_id
    into v_project_id, v_status, v_org_id
  from public.sprints s
  join public.projects p on p.id = s.project_id
  where s.id = p_sprint_id;

  if v_project_id is null then
    raise exception 'Sprint not found.';
  end if;
  if not public.is_org_admin_or_lead(v_org_id) then
    raise exception 'Not authorized to manage sprints for this project.';
  end if;

  if v_status = 'active' then
    return;
  end if;
  if v_status = 'closed' then
    raise exception 'Cannot activate a closed sprint.';
  end if;

  select id into v_other_active_id
  from public.sprints
  where project_id = v_project_id
    and status = 'active'
    and id <> p_sprint_id;

  if v_other_active_id is not null then
    raise exception 'Another sprint is already active in this project. Close it before activating a new one.';
  end if;

  update public.sprints set status = 'active' where id = p_sprint_id;
end;
$$;

revoke all on function public.activate_sprint(uuid) from public;
grant execute on function public.activate_sprint(uuid) to authenticated;

-- ── close_sprint ─────────────────────────────────────────────────────────
-- Allowed from 'planned' or 'active' (closing a never-activated sprint is a
-- harmless, no-extra-complexity allowance — same code path either way, and
-- this MVP has no separate cancel/delete action). Tickets still open
-- (ticket_statuses.group_type = 'open', the app's own established
-- open/closed source — see isTicketClosed() in src/lib/tickets.ts) return
-- to the general backlog (sprint_id = null); already-closed tickets keep
-- their sprint_id, preserving history. Never touches parent_ticket_id.

create or replace function public.close_sprint(p_sprint_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_org_id uuid;
  v_status text;
begin
  select s.project_id, s.status, p.organization_id
    into v_project_id, v_status, v_org_id
  from public.sprints s
  join public.projects p on p.id = s.project_id
  where s.id = p_sprint_id;

  if v_project_id is null then
    raise exception 'Sprint not found.';
  end if;
  if not public.is_org_admin_or_lead(v_org_id) then
    raise exception 'Not authorized to manage sprints for this project.';
  end if;
  if v_status = 'closed' then
    raise exception 'This sprint is already closed.';
  end if;

  update public.sprints set status = 'closed' where id = p_sprint_id;

  update public.tickets
  set sprint_id = null
  where sprint_id = p_sprint_id
    and status_id in (
      select id from public.ticket_statuses
      where project_id = v_project_id and group_type = 'open'
    );
end;
$$;

revoke all on function public.close_sprint(uuid) from public;
grant execute on function public.close_sprint(uuid) to authenticated;

-- ── Historical backfill: Sprint 0 ────────────────────────────────────────
-- One closed "Sprint 0" per project that has at least one closed ticket
-- (group_type = 'closed') with no sprint_id yet — the only tickets it ever
-- claims. Open historical tickets are left alone (sprint_id stays null,
-- i.e. the general backlog). Guarded by a not-exists check on the sprint
-- name so re-running this migration is a no-op, per this feature's own
-- idempotency requirement.

do $$
declare
  proj record;
  v_sprint_id uuid;
begin
  for proj in
    select distinct t.project_id
    from public.tickets t
    join public.ticket_statuses ts on ts.id = t.status_id
    where ts.group_type = 'closed'
      and t.sprint_id is null
      and not exists (
        select 1 from public.sprints s
        where s.project_id = t.project_id and s.name = 'Sprint 0'
      )
  loop
    insert into public.sprints (project_id, name, status, created_by)
    values (proj.project_id, 'Sprint 0', 'closed', null)
    returning id into v_sprint_id;

    update public.tickets t
    set sprint_id = v_sprint_id
    from public.ticket_statuses ts
    where ts.id = t.status_id
      and ts.group_type = 'closed'
      and t.project_id = proj.project_id
      and t.sprint_id is null;
  end loop;
end $$;
