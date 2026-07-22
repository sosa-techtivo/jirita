-- Adds three workspace-wide policy/default settings to `organizations`, for
-- Settings → General: default_role, default_weekly_capacity, and
-- active_days. Workspace Name needs no new column — it already reuses the
-- existing `organizations.name`.
--
-- These are policy/default values only, read at invite/creation time by a
-- future caller (not yet wired — see lib/server/update-organization-settings-action.ts
-- and lib/membership.ts for the app-side pieces added alongside this
-- migration). This migration touches no existing `organization_memberships`
-- row — a member's own real `weekly_capacity` is unaffected, matching the
-- already-established rule that org-level capacity is never summed/derived
-- from project-level values (see reports-screen.tsx/lib/projects.ts's own
-- "capacity belongs to the member" precedent) — this is the mirror case:
-- `default_weekly_capacity` belongs to the organization, and only ever seeds
-- a *new* member's own row, never rewrites an existing one.
--
-- Schema/RLS only — no UI wiring in this migration.

-- ── default_role ─────────────────────────────────────────────────────────────
-- Reuses the existing `org_role` enum (admin | project_lead | member) —
-- never a second, parallel enum for the same three values.
alter table public.organizations
  add column default_role public.org_role not null default 'member';

-- ── default_weekly_capacity ──────────────────────────────────────────────────
-- Same bare `numeric` type as organization_memberships.weekly_capacity
-- (20260708000000_mvp_schema.sql) — this is only ever a starting value
-- copied onto a *new* member's own weekly_capacity at invite time, never a
-- live multiplier and never something an existing member's own row reads
-- from afterward.
alter table public.organizations
  add column default_weekly_capacity numeric not null default 40
    check (default_weekly_capacity > 0);

-- ── active_days ───────────────────────────────────────────────────────────────
-- The organization's configured working days, as ISO weekday numbers
-- (1 = Monday .. 7 = Sunday) — a plain smallint[] rather than a bitmask or a
-- second lookup table, matching the "simple, validable" shape asked for.
--
-- Validated through a small immutable helper function rather than a raw
-- CHECK expression: Postgres forbids any subquery inside a table CHECK
-- constraint outright, and detecting duplicates/out-of-range values via
-- `unnest()` needs one — a plpgsql loop sidesteps that restriction entirely.
create or replace function public.is_valid_active_days(days smallint[])
returns boolean
language plpgsql
immutable
as $$
declare
  d smallint;
  seen smallint[] := '{}';
begin
  if days is null or cardinality(days) = 0 then
    return false;
  end if;

  foreach d in array days loop
    if d < 1 or d > 7 or d = any(seen) then
      return false;
    end if;
    seen := seen || d;
  end loop;

  return true;
end;
$$;

alter table public.organizations
  add column active_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[]
    check (public.is_valid_active_days(active_days));

-- ── RLS: organizations_update ────────────────────────────────────────────────
-- Only an active admin of *this exact* organization may update its own row —
-- reuses `is_org_admin(...)` (20260708000000_mvp_schema.sql), the same
-- helper `organization_memberships_update`/`projects_update` already key
-- off, never a second definition of "is this caller an admin here". This
-- can never let a caller update a different organization: `is_org_admin`
-- checks the caller's own `organization_memberships` row for the exact
-- `id` being written, so an organization the caller doesn't belong to (or
-- belongs to as a non-admin) never satisfies `using`/`with check`.
--
-- No `grant update ... to authenticated` alongside this policy — same gap
-- as `organization_memberships_update` (which has never had one either):
-- the real write path is a Server Action that re-verifies session +
-- membership + admin role itself, then escalates to the service-role
-- client (already granted ALL on every public table via
-- 20260806000000_grant_service_role_public_schema.sql's default-privileges
-- grant), never a direct client-side update.
create policy organizations_update on public.organizations
  for update
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));
