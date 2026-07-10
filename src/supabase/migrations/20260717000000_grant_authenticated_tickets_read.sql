-- Grant authenticated-role read access to tickets — backs the real Tickets
-- data source for the /projects/[slug]/tickets views (List/Board/Calendar/
-- Timeline/Insights). Read-only: this task doesn't implement ticket
-- create/edit, so only SELECT is granted, matching that scope exactly.
--
-- RLS policies for tickets were already defined in
-- 20260708000000_mvp_schema.sql (tickets_select: visible to anyone who can
-- see the parent project via can_view_project(project_id) — a query
-- against `projects`, not a self-reference into `tickets`, so this doesn't
-- carry the RETURNING-time visibility bug fixed for projects_select in
-- 20260714000000). As with every other table so far, `create table` alone
-- grants nothing to the authenticated role — Postgres checks base table
-- privileges before RLS is ever evaluated.

grant select on public.tickets to authenticated;
