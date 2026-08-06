-- One-level-deep comment threading ("Reply" on a ticket comment).
-- ticket_comments has always been a flat list (20260708000000) — this adds
-- a single, self-referential parent_comment_id: a comment with
-- parent_comment_id = null is a top-level (parent) comment; a comment with
-- it set is a reply, always to a top-level comment. Replies-to-replies are
-- never allowed: the trigger below auto-flattens them to the real
-- top-level ancestor instead of rejecting the insert.

alter table public.ticket_comments
  add column parent_comment_id uuid references public.ticket_comments (id) on delete cascade;

create index ticket_comments_parent_comment_id_idx on public.ticket_comments (parent_comment_id);

-- ── Enforce depth 1 ──────────────────────────────────────────────────────────
-- If a reply is attempted on a comment that is itself a reply (has its own
-- parent_comment_id set), re-point NEW.parent_comment_id at that comment's
-- own parent instead — the real top-level ancestor — rather than rejecting
-- the insert or allowing a second level of nesting. Only ever runs on
-- create; a comment's parent never changes after that (updateTicketComment
-- only ever touches body).

create or replace function public.flatten_ticket_comment_reply_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  grandparent_id uuid;
begin
  if new.parent_comment_id is not null then
    select parent_comment_id into grandparent_id
    from public.ticket_comments
    where id = new.parent_comment_id;

    if grandparent_id is not null then
      new.parent_comment_id := grandparent_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger ticket_comments_flatten_reply_depth
  before insert on public.ticket_comments
  for each row execute function public.flatten_ticket_comment_reply_depth();

-- ── Delete ───────────────────────────────────────────────────────────────────
-- No direct DELETE grant/policy for `authenticated` — deleting a parent
-- comment cascades (parent_comment_id ON DELETE CASCADE, above) to its own
-- replies, which a plain author-only RLS policy would then block whenever a
-- reply's author differs from the parent's own author (Postgres re-checks
-- RLS for every row a cascade removes, using the same role that issued the
-- original DELETE). This RPC re-verifies authorship itself, then runs as
-- its own definer — bypassing RLS entirely, same as every other
-- authorization-gated write in this schema (e.g.
-- project_memberships_block_unsafe_delete, 20260910000000) — so the
-- cascade always succeeds regardless of who authored the replies.

create or replace function public.delete_ticket_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_author uuid;
begin
  select author_profile_id into comment_author
  from public.ticket_comments
  where id = p_comment_id;

  if comment_author is null then
    raise exception 'Comment not found.';
  end if;

  if comment_author <> auth.uid() then
    raise exception 'You can only delete your own comments.';
  end if;

  delete from public.ticket_comments where id = p_comment_id;
end;
$$;

grant execute on function public.delete_ticket_comment(uuid) to authenticated;

-- ── Activity: automatic "<name> deleted a comment" entry ────────────────────
-- Same shape as log_comment_activity (added_a_comment, 20260727000000) and
-- log_attachment_deleted's own cascade-safety fix (20260904000000): skip the
-- insert if the parent ticket is already gone (e.g. this delete is itself a
-- side effect of the whole ticket/project being deleted), since that insert
-- would otherwise violate ticket_activity_ticket_id_fkey and block the
-- larger delete.

create or replace function public.log_comment_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.tickets t where t.id = old.ticket_id) then
    return old;
  end if;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type)
  values (old.ticket_id, auth.uid(), 'deleted_a_comment');

  return old;
end;
$$;

create trigger ticket_comments_log_deleted
  after delete on public.ticket_comments
  for each row execute function public.log_comment_deleted();

-- ── Notifications: new 'comment_reply' type ─────────────────────────────────
-- Same "drop and re-add the check constraint" pattern as
-- 20260908000000_add_project_access_requests.sql.

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
    'comment_reply'
  ));
