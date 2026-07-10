-- Grant authenticated-role update access to tickets — backs persisting
-- Ticket Detail's inline edits (Title/Description/Status/Type/Priority/
-- Assignee/Estimated Hours/Due Date/Labels) to Supabase instead of leaving
-- them as local-only state (see updateTicket in src/lib/tickets.ts).
--
-- RLS policy tickets_update was already defined in 20260708000000_mvp_schema.sql
-- (assignee_profile_id = auth.uid(), or an org admin/lead) — as with every
-- other table so far, RLS alone grants nothing; Postgres checks base table
-- privileges before RLS is ever evaluated.

grant update on public.tickets to authenticated;
