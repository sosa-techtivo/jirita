-- Adds a per-project role to project_memberships — lets a project
-- distinguish its one responsible Project Lead from its regular members,
-- independent of the person's org-wide role (organization_memberships.role
-- is untouched by this migration, same 3 global values as before: admin,
-- project_lead, member). A user can be project_role 'lead' on one project
-- and 'member' on another; an org Admin can also be a project's 'lead'.
--
-- Schema/data only — no RLS, grants, UI, or dashboard wiring changes here.
-- The existing table-level grants on project_memberships (see
-- 20260807000000_grant_authenticated_project_memberships_write.sql) already
-- cover every column, this one included, so no new grant is needed. The
-- "an org role of member shouldn't be assignable as project lead" domain
-- rule described alongside this feature is intentionally left for the
-- future write path (Server Action or RLS) that actually lets someone set
-- this column from the UI — not a concern this pure schema migration
-- enforces, since doing so would require a cross-table trigger this task's
-- scope doesn't ask for.
--
-- text + check, not a new enum type — mirrors ticket_relations.kind's own
-- precedent (20260802000000_add_ticket_relations.sql) for a small,
-- add-on value set on an existing table, rather than introducing a new
-- top-level enum type for two values.

alter table public.project_memberships
  add column project_role text not null default 'member'
    check (project_role in ('lead', 'member'));

-- At most one 'lead' per project — a partial unique index only covers rows
-- where project_role = 'lead', so any number of 'member' rows stay
-- unrestricted. No trigger needed for this guarantee.
create unique index project_memberships_one_lead_per_project
  on public.project_memberships (project_id)
  where project_role = 'lead';
