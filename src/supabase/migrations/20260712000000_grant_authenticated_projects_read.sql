-- Grant authenticated-role read access to projects.
--
-- 20260708000000_mvp_schema.sql defined RLS policies for projects (see
-- can_view_project: Admin sees every org project, Project Lead/Member see
-- only projects they're staffed on via project_memberships), but `create
-- table` alone grants nothing to the authenticated role — Postgres checks
-- base table privileges before RLS is ever evaluated. Without this grant,
-- every query from the authenticated role fails with "permission denied
-- for table projects" (42501), same root cause as
-- 20260708010000_grant_authenticated_membership_read.sql fixed for
-- profiles/organization_memberships/organizations.
--
-- RLS stays the real access-control layer — this only clears the privilege
-- gate Postgres checks first, and is scoped to select only.

grant select on public.projects to authenticated;
