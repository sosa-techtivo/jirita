-- Enables editing a comment's own text from Ticket Detail. ticket_comments
-- has always carried updated_at ("set only if the comment is edited" — see
-- 20260708000000's own doc comment) and a before-update set_updated_at
-- trigger, both already in place for exactly this — RLS was just
-- deliberately insert-only until now ("no update/delete in the MVP").
--
-- Author-only, enforced here at the database level (never just in the
-- UI) — the same "only the owner can change this row" convention already
-- used for ticket_attachments.uploaded_by / ticket_time_entries.logged_by.
-- Only body actually changes at the application layer, but the policy
-- itself doesn't need a column-level restriction: with check requires the
-- row's author_profile_id to still equal auth.uid() after the update, so
-- a comment can never be reassigned to a different author via this path.

create policy ticket_comments_update on public.ticket_comments
  for update
  using (author_profile_id = auth.uid())
  with check (author_profile_id = auth.uid());

grant update on public.ticket_comments to authenticated;
