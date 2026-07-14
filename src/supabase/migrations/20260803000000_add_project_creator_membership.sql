-- Ensures the creator of a project always has a real project_memberships
-- row, and backfills that same guarantee for projects that already exist.
--
-- Architecture: same trigger-on-the-existing-write pattern already used for
-- ticket_activity (20260728000000) — an AFTER INSERT trigger on `projects`
-- runs inside the same transaction as the projects insert itself, so:
--   - the membership row can never exist without the project, and the
--     project can never end up without its membership row if the trigger's
--     insert fails — one transaction, not two round-trips from the client.
--   - no client code (createProject in src/lib/projects.ts) needs to change;
--     it already inserts via an authenticated session, which is all the
--     `default auth.uid()` column below needs.
--   - it only ever touches the creator's own row — never every org admin.
--
-- `projects` has no `created_by` today, so it's added here with the exact
-- same `default auth.uid()` pattern as `tickets.created_by`
-- (20260728000000): never set by the client, can't be spoofed. Existing
-- projects honestly have no recorded creator (same reasoning as tickets —
-- "never backfilled with a guess"), so the created_by-driven backfill below
-- is a correct no-op today; the owner_profile_id (Project Lead)-driven
-- backfill is the one with real historical data to act on.

-- ── projects: real "who created this" ───────────────────────────────────────

alter table public.projects
  add column created_by uuid references public.profiles (id) on delete set null default auth.uid();

-- ── Trigger: add the creator to project_memberships on project creation ────
-- Role: 'Project Lead' only if this same insert already set owner_profile_id
-- to the creator (createProject today never does — owner_profile_id is set
-- later via Project Settings, which this trigger deliberately does not hook
-- into, matching the requested scope of "on creation" only); otherwise the
-- standard member title, matching ROLE_LABELS.MEMBER ("Member") in
-- src/lib/current-user.ts. on conflict guards the same (project_id,
-- profile_id) unique constraint project_memberships already had.

create or replace function public.add_project_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.project_memberships (project_id, profile_id, title)
    values (
      new.id,
      new.created_by,
      case when new.owner_profile_id = new.created_by then 'Project Lead' else 'Member' end
    )
    on conflict (project_id, profile_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_add_creator_membership
  after insert on public.projects
  for each row execute function public.add_project_creator_membership();

-- ── Backfill: existing projects ─────────────────────────────────────────────
-- Two independent inserts, both guarded by NOT EXISTS against
-- project_memberships (belt-and-suspenders alongside ON CONFLICT — makes the
-- "no duplicates" guarantee explicit even if run more than once). Order
-- matters only in that the creator pass runs first; if a project's
-- owner_profile_id is the same person as created_by, that single row is
-- already titled 'Project Lead' and the Project Lead pass below is then a
-- no-op for it via ON CONFLICT.

-- Pass 1: created_by (real starting now; NULL for every pre-existing project
-- per the honesty note above, so this affects 0 rows today and is here for
-- correctness going forward, not as dead code).
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

-- Pass 2: owner_profile_id (Project Lead) — the one with real data today.
-- Never touches organization_memberships and never considers workspace
-- admin status; only a project's own recorded Project Lead qualifies.
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
