-- Corrective migration for a regression introduced right after
-- 20260812000000_add_project_membership_project_role.sql: project_memberships
-- ended up empty on the live project, so Team showed no members and its
-- KPIs all read 0 even though the underlying projects/tickets/activity that
-- justify those memberships were untouched and still real.
--
-- Root cause: not the project_role migration's own SQL (its ALTER TABLE ...
-- ADD COLUMN ... DEFAULT 'member' correctly backfills existing rows in
-- place — Postgres never leaves existing rows NULL for a column added with
-- a DEFAULT). The rows were removed separately, by an overly broad DELETE
-- in an ad-hoc verification query run against the live database right
-- after that migration. This migration repairs the data, not the schema.
--
-- Restoring "without recreating users or memberships manually" means
-- re-deriving the real rows from real, still-intact source data — so this
-- re-runs the exact same two already-idempotent backfills that originally
-- created them:
--   - 20260803000000's project creator/owner (Project Lead) backfill
--   - 20260808000000's ticket-contribution backfill
-- Both are driven entirely by data this incident never touched
-- (projects.created_by / owner_profile_id, tickets.created_by,
-- ticket_activity.actor_profile_id) and both are already guarded by
-- NOT EXISTS + ON CONFLICT DO NOTHING, so re-running them here is safe: a
-- project whose membership rows are still intact is simply a no-op, and a
-- project whose rows were lost gets them re-derived correctly. No project
-- currently missing its rows is skipped, and no row is duplicated.

-- ── Guarantee the project_role invariant (NOT NULL / default 'member' /
-- restricted to lead|member) regardless of how this environment got here —
-- a no-op today since 20260812000000 already put it in this exact state,
-- but explicit and safe to re-assert. ──────────────────────────────────────

update public.project_memberships
set project_role = 'member'
where project_role is null;

alter table public.project_memberships
  alter column project_role set default 'member';

alter table public.project_memberships
  alter column project_role set not null;

-- (The 'lead'/'member' check constraint and the one-lead-per-project
-- partial unique index were already added by 20260812000000 and still
-- apply — nothing to redo for either.)

-- ── Restore pass 1: project creator / owner (Project Lead) — verbatim from
-- 20260803000000_add_project_creator_membership.sql ────────────────────────

insert into public.project_memberships (project_id, profile_id, title)
select
  p.id,
  p.created_by,
  case when p.owner_profile_id = p.created_by then 'Project Lead' else 'Member' end
from public.projects p
where p.created_by is not null
  and not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p.id and pm.profile_id = p.created_by
  )
on conflict (project_id, profile_id) do nothing;

insert into public.project_memberships (project_id, profile_id, title)
select
  p.id,
  p.owner_profile_id,
  'Project Lead'
from public.projects p
where p.owner_profile_id is not null
  and not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p.id and pm.profile_id = p.owner_profile_id
  )
on conflict (project_id, profile_id) do nothing;

-- ── Restore pass 2: real ticket contributors — verbatim from
-- 20260808000000_auto_project_membership_on_contribution.sql's own backfill ──

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
