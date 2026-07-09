-- Grant authenticated-role write access for real project creation.
--
-- 20260712000000_grant_authenticated_projects_read.sql granted select on
-- projects; creating a project also needs insert, gated the same way at
-- the privilege layer before RLS is ever evaluated (see that migration's
-- comment for why the grant is needed in addition to RLS).
--
-- RLS stays the real access-control layer — projects_insert (from
-- 20260708000000_mvp_schema.sql) already restricts who the insert actually
-- succeeds for: only org role admin or project_lead
-- (is_org_admin_or_lead). This grant only clears the privilege gate
-- Postgres checks first.

grant insert on public.projects to authenticated;
