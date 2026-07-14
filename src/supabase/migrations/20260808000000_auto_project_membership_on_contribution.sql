-- Automatically creates a project_memberships row the first time someone
-- makes a real contribution to a project's tickets, so Team represents who
-- actually participates rather than only who was manually added.
--
-- Architecture: same trigger-on-the-existing-write pattern already used for
-- 20260803000000's "project creator" membership and for ticket_activity
-- (20260728000000) — SECURITY DEFINER AFTER triggers on the real write
-- paths that already exist, not new client code. This is what lets a plain
-- project Member (who has no direct INSERT grant/policy on
-- project_memberships — see 20260807000000) still end up with their own
-- membership row: the trigger runs with the function owner's privileges,
-- bypassing RLS/grants entirely for this one narrow insert, exactly like
-- the project-creator trigger already does.
--
-- "Contribution" = create a ticket, edit a ticket (title/status/priority/
-- any field), comment, upload an attachment, log time, or link a ticket —
-- matching the spec's own list. Viewing a ticket or navigating the app
-- never fires any of these triggers, since none of them hook into a read.
--
-- ensure_project_membership is the one shared insert every trigger below
-- calls, so there is exactly one place that decides the starting title
-- ('Member' — the existing default project-member title, matching
-- 20260803000000's own non-creator case) and starting weekly_capacity
-- (seeded from the person's *organization*-level weekly_capacity, only on
-- first insert — on conflict do nothing means an already-customized
-- project-level capacity is never touched again after that).

create or replace function public.ensure_project_membership(target_project_id uuid, target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_capacity numeric;
begin
  if target_profile_id is null or target_project_id is null then
    return;
  end if;

  select om.weekly_capacity into org_capacity
  from public.projects p
  join public.organization_memberships om
    on om.organization_id = p.organization_id and om.profile_id = target_profile_id
  where p.id = target_project_id;

  insert into public.project_memberships (project_id, profile_id, title, weekly_capacity)
  values (target_project_id, target_profile_id, 'Member', org_capacity)
  on conflict (project_id, profile_id) do nothing;
end;
$$;

-- ── tickets: create + edit ──────────────────────────────────────────────────
-- One shared function for both triggers — both just need "the current
-- actor is now a member of NEW.project_id", regardless of whether this row
-- is brand new or an existing one being edited (status/priority/title/any
-- other field).

create or replace function public.tickets_ensure_contributor_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_project_membership(new.project_id, auth.uid());
  return new;
end;
$$;

create trigger tickets_ensure_membership_on_insert
  after insert on public.tickets
  for each row execute function public.tickets_ensure_contributor_membership();

create trigger tickets_ensure_membership_on_update
  after update on public.tickets
  for each row execute function public.tickets_ensure_contributor_membership();

-- ── ticket_comments: commenting ──────────────────────────────────────────────

create or replace function public.ticket_comments_ensure_contributor_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id from public.tickets where id = new.ticket_id;
  perform public.ensure_project_membership(target_project_id, auth.uid());
  return new;
end;
$$;

create trigger ticket_comments_ensure_membership
  after insert on public.ticket_comments
  for each row execute function public.ticket_comments_ensure_contributor_membership();

-- ── ticket_attachments: uploading a file ─────────────────────────────────────

create or replace function public.ticket_attachments_ensure_contributor_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id from public.tickets where id = new.ticket_id;
  perform public.ensure_project_membership(target_project_id, auth.uid());
  return new;
end;
$$;

create trigger ticket_attachments_ensure_membership
  after insert on public.ticket_attachments
  for each row execute function public.ticket_attachments_ensure_contributor_membership();

-- ── ticket_time_entries: logging time ────────────────────────────────────────

create or replace function public.ticket_time_entries_ensure_contributor_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id from public.tickets where id = new.ticket_id;
  perform public.ensure_project_membership(target_project_id, auth.uid());
  return new;
end;
$$;

create trigger ticket_time_entries_ensure_membership
  after insert on public.ticket_time_entries
  for each row execute function public.ticket_time_entries_ensure_contributor_membership();

-- ── ticket_relations: linking two tickets ────────────────────────────────────
-- Only the project of the ticket the actor is acting *from* (NEW.ticket_id)
-- — the related ticket can belong to a different project this same actor
-- has no other involvement in, and linking to it is not itself a
-- contribution to *that* project.

create or replace function public.ticket_relations_ensure_contributor_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  select project_id into target_project_id from public.tickets where id = new.ticket_id;
  perform public.ensure_project_membership(target_project_id, auth.uid());
  return new;
end;
$$;

create trigger ticket_relations_ensure_membership
  after insert on public.ticket_relations
  for each row execute function public.ticket_relations_ensure_contributor_membership();

-- ── Backfill: contributions that already exist ───────────────────────────────
-- Two real, already-recorded sources cover every contribution type above
-- without needing a separate backfill pass per table: ticket_activity's own
-- actor_profile_id (already logged for comments/status/priority/other field
-- changes/attachments/time entries/relations — every trigger that writes
-- ticket_activity already captures the real actor) union tickets.created_by
-- (the one contribution type — creating a ticket — that predates
-- ticket_activity for older rows and so isn't guaranteed to already have a
-- 'ticket_created' activity row).

with contributors as (
  select t.project_id, ta.actor_profile_id as profile_id
  from public.ticket_activity ta
  join public.tickets t on t.id = ta.ticket_id
  where ta.actor_profile_id is not null
  union
  select t.project_id, t.created_by as profile_id
  from public.tickets t
  where t.created_by is not null
)
insert into public.project_memberships (project_id, profile_id, title, weekly_capacity)
select c.project_id, c.profile_id, 'Member', om.weekly_capacity
from contributors c
join public.projects p on p.id = c.project_id
join public.organization_memberships om on om.organization_id = p.organization_id and om.profile_id = c.profile_id
where not exists (
  select 1 from public.project_memberships pm
  where pm.project_id = c.project_id and pm.profile_id = c.profile_id
)
on conflict (project_id, profile_id) do nothing;
