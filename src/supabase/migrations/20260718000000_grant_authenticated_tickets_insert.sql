-- Grant authenticated-role insert access to tickets — backs real Ticket
-- creation from the existing New Ticket modal (title/description/acceptance
-- criteria/hours only; every other field is written with a fixed default —
-- see createTicket in src/lib/tickets.ts).
--
-- RLS policy tickets_insert was already defined in 20260708000000_mvp_schema.sql
-- (with check: is_project_member(project_id)), and tickets_select (needed for
-- INSERT ... RETURNING) checks can_view_project(project_id) — a query against
-- `projects`, not a self-reference into `tickets`, so this doesn't carry the
-- RETURNING-time visibility bug fixed for projects_select in 20260714000000.
-- As with every other table so far, RLS alone grants nothing — Postgres
-- checks base table privileges before RLS is ever evaluated.

grant insert on public.tickets to authenticated;
