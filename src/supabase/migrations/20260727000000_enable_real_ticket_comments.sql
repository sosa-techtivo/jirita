-- Enables real comment creation from Ticket Detail — Comments was
-- previously read-only (see loadTicketComments in src/lib/tickets.ts,
-- 20260720000000). ticket_comments itself and its RLS policies already
-- existed from the base schema (20260708000000), but:
--   1. authenticated never had INSERT granted (read-only until now).
--   2. ticket_comments_insert only checked is_project_member(project_id),
--      which blocks everyone today — project_memberships is still empty
--      (no staffing UI exists yet), the same bug already fixed for
--      tickets_insert / ticket_attachments_insert / ticket_time_entries_insert.
--   3. author_profile_id had no default — the client has no way to look up
--      its own profile id (CurrentUser only exposes name/avatar/role), so
--      it needs the same default auth.uid() pattern already used for
--      ticket_attachments.uploaded_by / ticket_time_entries.logged_by.

drop policy ticket_comments_insert on public.ticket_comments;

create policy ticket_comments_insert on public.ticket_comments
  for insert
  with check (
    exists (
      select 1 from public.tickets t
      join public.projects p on p.id = t.project_id
      where t.id = ticket_id
        and (public.is_org_admin_or_lead(p.organization_id) or public.is_project_member(p.id))
    )
  );

alter table public.ticket_comments
  alter column author_profile_id set default auth.uid();

grant insert on public.ticket_comments to authenticated;

-- ── Activity: automatic "<name> added a comment" entry ─────────────────────────
-- ticket_activity was deliberately left with no client-facing insert policy
-- (see 20260708000000's own comment: "rows are written by application/
-- service-role logic"). A security-definer trigger honors that design
-- exactly — it runs with elevated privileges regardless of the inserting
-- role, so ticket_activity's grants/RLS don't need to change at all; the
-- client only ever needs to be able to insert its own comment.

create or replace function public.log_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type)
  values (new.ticket_id, new.author_profile_id, 'added_a_comment');
  return new;
end;
$$;

create trigger ticket_comments_log_activity
  after insert on public.ticket_comments
  for each row execute function public.log_comment_activity();
