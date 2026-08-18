-- Real bug fix: a Project Lead creating a project (Sidebar's "+ New
-- Project", the Dashboard's own quick action, or /projects' own "+ Create
-- Project" — the Sidebar/Dashboard entry points already show this action
-- to Project Lead today via canManage(user.role), so this has been a live,
-- reachable failure) got "new row violates row-level security policy for
-- table projects" on every attempt, while Admin worked fine.
--
-- This repo's own migration history (20260708000000_mvp_schema.sql)
-- already declares projects_insert as
-- `with check (is_org_admin_or_lead(organization_id))` — which already
-- covers Project Lead (is_org_admin_or_lead checks
-- organization_memberships.role in ('admin', 'project_lead'), the app's
-- one real source of truth for org-wide role, already reused unchanged by
-- projects_update/projects_delete/ticket_statuses_*/sprints_insert — see
-- 20260830000000/20260920000000/20260929000000). No other migration ever
-- redefines projects_insert. The live policy nonetheless does not match:
-- the same class of drift already found and repaired for six unrelated
-- migrations in 20260929000000 (applied directly against the live
-- database at some point, outside this repo's own tracked history).
--
-- Rather than assume one specific stale definition, this migration
-- authoritatively re-asserts the correct, already-intended policy —
-- drop-then-recreate is safe whether the live version already matches
-- this repo's declared one or not, same shape this repo's own precedent
-- for re-fixing a policy already uses (e.g.
-- 20260829000000_fix_tickets_update_rls_project_member.sql). No new
-- helper function, no duplicated role logic — is_org_admin_or_lead is
-- reused verbatim.
--
-- SELECT/UPDATE/DELETE on projects are left completely untouched — no
-- evidence they're affected, and this app's own schema doc/comments treat
-- their current definitions as a deliberate, working design (e.g.
-- can_view_project's "Admin sees every project; Project Lead/Member see
-- only projects they're staffed on").

drop policy if exists projects_insert on public.projects;

create policy projects_insert on public.projects
  for insert
  with check (public.is_org_admin_or_lead(organization_id));
