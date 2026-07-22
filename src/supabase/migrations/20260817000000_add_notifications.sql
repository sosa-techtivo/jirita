-- In-app notifications: single source of truth for the global bell dropdown
-- and the /notifications page. No email/push/desktop/cron/queues/watchers/
-- Realtime — a plain table, written by a service-role Server Action and read
-- on demand (initial load, focus/visibility regain, after marking read).
--
-- Creation is intentionally service-role only: there is no INSERT policy or
-- grant for `authenticated` at all, so a client can never fabricate a
-- notification for another profile or attribute one to a fake actor. See
-- src/lib/server/create-notification-action.ts, the one place rows are
-- inserted, which re-verifies the caller/recipient/org/project/ticket
-- server-side before doing so.

create table public.notifications (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  recipient_profile_id  uuid not null references public.profiles (id) on delete cascade,
  actor_profile_id      uuid references public.profiles (id) on delete set null,
  type                  text not null check (type in (
                          'ticket_assigned',
                          'comment_mention',
                          'ticket_comment',
                          'ticket_status_changed',
                          'project_member_added'
                        )),
  title                 text not null,
  message               text,
  project_id            uuid references public.projects (id) on delete cascade,
  ticket_id             uuid references public.tickets (id) on delete cascade,
  read_at               timestamptz,
  created_at            timestamptz not null default now()
);

-- Bell/page's own "most recent first" and "unread only" queries, plus the
-- org-scoped defense-in-depth check in the RLS policy below.
create index notifications_recipient_created_idx on public.notifications (recipient_profile_id, created_at desc);
create index notifications_recipient_read_idx on public.notifications (recipient_profile_id, read_at);
create index notifications_organization_id_idx on public.notifications (organization_id);

alter table public.notifications enable row level security;

-- A recipient can only ever read their own notifications, and only while
-- still an active member of the organization the row belongs to (the same
-- is_org_member floor every other table in this schema already uses) — this
-- is what keeps an Admin/Project Lead from seeing anyone else's inbox; every
-- notification's bandeja is personal, roles don't change that.
create policy notifications_select on public.notifications
  for select
  using (
    recipient_profile_id = auth.uid()
    and public.is_org_member(organization_id)
  );

-- Recipients may update their own rows; the column-level grant below is what
-- actually restricts *which* column (read_at only) — RLS alone only gates
-- which rows, not which columns, of an UPDATE.
create policy notifications_update on public.notifications
  for update
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- No insert/delete grant for `authenticated` at all — every notification is
-- created by create-notification-action.ts's service-role client (which
-- bypasses RLS/grants per 20260806000000). Deletion isn't a feature here.
