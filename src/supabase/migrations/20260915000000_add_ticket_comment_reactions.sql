-- Like/Dislike on any ticket comment (parent or reply — no distinction at
-- this table's level, same as ticket_comments itself: a reaction just
-- targets a comment_id, whatever that comment's own parent_comment_id is).
-- One reaction per user per comment, enforced by a real unique constraint,
-- not just app-level logic — switching Like<->Dislike updates that same
-- row, pressing the already-active one deletes it.

create table public.ticket_comment_reactions (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.ticket_comments (id) on delete cascade,
  -- Defaults to the authenticated user — never sent by the client, same
  -- pattern as ticket_comments.author_profile_id.
  profile_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  reaction    text not null check (reaction in ('like', 'dislike')),
  created_at  timestamptz not null default now(),
  unique (comment_id, profile_id)
);

create index ticket_comment_reactions_comment_id_idx on public.ticket_comment_reactions (comment_id);

alter table public.ticket_comment_reactions enable row level security;

-- Same visibility as the comment itself (ticket_comments_select,
-- 20260708000000).
create policy ticket_comment_reactions_select on public.ticket_comment_reactions
  for select
  using (
    exists (
      select 1 from public.ticket_comments c
      join public.tickets t on t.id = c.ticket_id
      where c.id = comment_id
        and public.can_view_project(t.project_id)
    )
  );

-- Same authorization as ticket_comments_insert — a real, active project
-- member (or org admin/lead) may react, never a non-member.
create policy ticket_comment_reactions_insert on public.ticket_comment_reactions
  for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.ticket_comments c
      join public.tickets t on t.id = c.ticket_id
      where c.id = comment_id
        and public.is_project_member(t.project_id)
    )
  );

-- Author-only, same convention as ticket_comments_update/ticket_time_entries_update.
-- Switching reaction (Like -> Dislike) is an UPDATE of the same row; removing
-- one's own reaction is a DELETE (below) — never a second row per user.
create policy ticket_comment_reactions_update on public.ticket_comment_reactions
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy ticket_comment_reactions_delete on public.ticket_comment_reactions
  for delete
  using (profile_id = auth.uid());

grant select, insert, delete on public.ticket_comment_reactions to authenticated;
-- Column-restricted, same precedent as notifications_update's own
-- `grant update (read_at)`: only the reaction itself may ever change via
-- UPDATE — comment_id/profile_id can never be reassigned to attribute a
-- reaction to a different comment or a different person.
grant update (reaction) on public.ticket_comment_reactions to authenticated;

-- No activity-log trigger and no notification path for reactions —
-- deliberately out of scope for this feature (never generate a
-- notification for a Like/Dislike). Deleting a comment already
-- cascade-deletes its own reactions for free via comment_id's own
-- `on delete cascade` above — including through delete_ticket_comment's
-- `security definer` RPC (20260912000000), which bypasses RLS for exactly
-- this kind of cascade the same way it already does for replies.
