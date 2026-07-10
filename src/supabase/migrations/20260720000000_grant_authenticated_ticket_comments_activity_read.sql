-- Grant authenticated-role read access to ticket_comments and ticket_activity
-- — backs the Ticket Preview Drawer's Comments/Activity sections, which now
-- read real rows instead of mock content (see loadTicketComments /
-- loadTicketActivity in src/lib/tickets.ts). Read-only: there is still no
-- comment-creation or activity-logging UI, so only SELECT is granted here.
--
-- RLS policies (ticket_comments_select, ticket_activity_select) were already
-- defined in 20260708000000_mvp_schema.sql, scoped to whoever can see the
-- parent project via can_view_project — as with every other table so far,
-- RLS alone grants nothing; Postgres checks base table privileges first.

grant select on public.ticket_comments to authenticated;
grant select on public.ticket_activity to authenticated;
