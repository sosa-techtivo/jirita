-- Persistent per-ticket subscribers — the durable "has this user
-- meaningfully interacted with this ticket" relationship the notification
-- audit found nowhere already existed. Additive only: a row here is never
-- deleted or moved when a ticket is reassigned (unlike
-- tickets.assignee_profile_id, which is overwritten in place) — a past
-- assignee, past commenter, past mentioned user, or past time-logger stays
-- subscribed forever, exactly the "once you've touched it, you stay in the
-- loop" rule this feature needs. No unsubscribe path exists yet (out of
-- scope for this change) — this table is write-once-per-(ticket,profile)
-- from the app's own auto-subscribe points (see lib/tickets.ts:
-- createTicket, updateTicket, createTicketComment/updateTicketComment,
-- logTicketTime), never edited or removed afterward.
--
-- Deliberately its own table, not a repurposed ticket_activity/ticket_comments
-- read: those already record every interaction, but not deduplicated per
-- user and not queryable as a simple "who to notify" list without a
-- DISTINCT scan over several tables on every notification. This is that
-- list, precomputed and kept current going forward.

create table public.ticket_subscribers (
  ticket_id   uuid not null references public.tickets (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (ticket_id, profile_id)
);

create index ticket_subscribers_ticket_idx on public.ticket_subscribers (ticket_id);
create index ticket_subscribers_profile_idx on public.ticket_subscribers (profile_id);

alter table public.ticket_subscribers enable row level security;

-- Same "can you see this ticket's project at all" gate every other
-- ticket-scoped table already uses (ticket_time_entries_select,
-- ticket_comments_select, ...) — a subscriber list is not more sensitive
-- than the comments/time entries that produced it, and this app has no
-- unsubscribe UI yet to restrict "whose own row" further.
create policy ticket_subscribers_select on public.ticket_subscribers
  for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
  );

-- A caller may always subscribe *themselves* to any ticket they can see
-- (self-service, same "you already have real access" gate as the select
-- policy above). Subscribing a *different* profile — needed when a ticket
-- is assigned to someone else, or when someone else is @mentioned in a
-- comment — is only ever allowed when that target profile is already a
-- real member of the ticket's own project: this can never grant new
-- project access, it only opts an already-visible member into future
-- notifications for one ticket they can already see.
create policy ticket_subscribers_insert on public.ticket_subscribers
  for insert
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and public.can_view_project(t.project_id)
    )
    and (
      profile_id = auth.uid()
      or profile_id in (
        select pm.profile_id
        from public.tickets t
        join public.project_memberships pm on pm.project_id = t.project_id
        where t.id = ticket_id
      )
    )
  );

-- No update/delete grant — no unsubscribe/watch UI yet (explicitly out of
-- scope for this change); a row, once inserted, is permanent for now.
grant select, insert on public.ticket_subscribers to authenticated;

-- ── Backfill — every ticket that predates this feature ──────────────────────
-- Each source below already has its own real FK to profiles with
-- `on delete set null` (tickets.created_by/assignee_profile_id,
-- ticket_comments.author_profile_id, ticket_time_entries.logged_by), so a
-- non-null value here is guaranteed to reference a still-real profile —
-- safe to insert directly. `on conflict do nothing` (the table's own PK)
-- makes every one of these statements idempotent and order-independent;
-- together they can never produce a duplicate (ticket_id, profile_id) row.

-- Creator.
insert into public.ticket_subscribers (ticket_id, profile_id)
select id, created_by from public.tickets where created_by is not null
on conflict do nothing;

-- Current assignee.
insert into public.ticket_subscribers (ticket_id, profile_id)
select id, assignee_profile_id from public.tickets where assignee_profile_id is not null
on conflict do nothing;

-- Comment authors (covers replies too — same table, same column).
insert into public.ticket_subscribers (ticket_id, profile_id)
select ticket_id, author_profile_id from public.ticket_comments where author_profile_id is not null
on conflict do nothing;

-- Time loggers.
insert into public.ticket_subscribers (ticket_id, profile_id)
select ticket_id, logged_by from public.ticket_time_entries where logged_by is not null
on conflict do nothing;

-- Historical assignees — ticket_activity.old_value/new_value are plain
-- text (no FK of their own, see 20260728000000), so unlike the sources
-- above a value here could in principle outlive the profile it names —
-- guarded explicitly with `exists (... profiles ...)` rather than assumed.
insert into public.ticket_subscribers (ticket_id, profile_id)
select act.ticket_id, act.old_value::uuid
from public.ticket_activity act
where act.event_type = 'assignee_changed'
  and act.old_value is not null
  and exists (select 1 from public.profiles pr where pr.id = act.old_value::uuid)
on conflict do nothing;

insert into public.ticket_subscribers (ticket_id, profile_id)
select act.ticket_id, act.new_value::uuid
from public.ticket_activity act
where act.event_type = 'assignee_changed'
  and act.new_value is not null
  and exists (select 1 from public.profiles pr where pr.id = act.new_value::uuid)
on conflict do nothing;

-- Mentioned users, where recoverable — a real mention is a
-- <span data-type="mention" data-id="<uuid>"> node in the comment's own
-- saved HTML body (see extractMentionedProfileIds, lib/tickets.ts); no
-- separate mentions table exists, so this is recovered by pattern-matching
-- the same markup that node parser looks for. Same "exists in profiles"
-- guard as historical assignees above — an embedded data-id is just text,
-- not an FK.
insert into public.ticket_subscribers (ticket_id, profile_id)
select distinct tc.ticket_id, m.match[1]::uuid
from public.ticket_comments tc
cross join lateral regexp_matches(
  tc.body,
  'data-id="([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"',
  'g'
) as m(match)
where exists (select 1 from public.profiles pr where pr.id = m.match[1]::uuid)
on conflict do nothing;

-- ── New notification types for subscriber fan-out ───────────────────────────
-- Three new event types a ticket's subscribers (as opposed to its current
-- assignee, a specific @mention, or a comment's parent author — all
-- already covered by the existing five types) can now receive:
--   - ticket_field_changed: priority/due date/description/labels/
--     acceptance-criteria/reassignment, bundled into one notification per
--     update rather than one per field.
--   - ticket_attachment_added: a new attachment on the ticket.
--   - ticket_time_logged: a new time entry on the ticket.
-- Same widen-the-check-constraint pattern already used twice before
-- (20260908000000, 20260912000000) — never a new column, never a second
-- notifications table.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'ticket_assigned',
    'comment_mention',
    'ticket_comment',
    'ticket_status_changed',
    'project_member_added',
    'project_access_requested',
    'project_access_rejected',
    'comment_reply',
    'ticket_field_changed',
    'ticket_attachment_added',
    'ticket_time_logged'
  ));
