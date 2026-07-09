-- Grant authenticated-role write access for real project editing.
--
-- 20260712000000/20260713000000 granted select/insert on projects; editing
-- a project also needs update, gated the same way at the privilege layer
-- before RLS is ever evaluated (see those migrations' comments for why the
-- grant is needed in addition to RLS — Postgres checks base table
-- privileges first, and returns "permission denied for table projects"
-- rather than an RLS error when this grant is missing, which is exactly
-- what editing hit without it).
--
-- RLS stays the real access-control layer — projects_update (from
-- 20260708000000_mvp_schema.sql) already restricts who the update actually
-- succeeds for: only org role admin or project_lead
-- (is_org_admin_or_lead), same as insert. This grant only clears the
-- privilege gate Postgres checks first.

grant update on public.projects to authenticated;
