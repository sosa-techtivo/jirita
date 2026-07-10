-- Activity Log entries for renaming and deleting a Ticket Attachment — both
-- actions already persist (20260729000000 / 20260730000000) but, unlike
-- attachment_uploaded (20260728000000), didn't produce an activity row.
-- Same trigger-based architecture as every other producer in that
-- migration: firing only after the real write commits gets "no event on a
-- failed operation" for free, and auth.uid() inside a SECURITY DEFINER
-- trigger resolves the real actor without any client code change in
-- src/lib/tickets.ts (renameTicketAttachment / deleteTicketAttachment).

-- ── Trigger: attachment renamed ──────────────────────────────────────────────
-- AFTER UPDATE so it only fires once the rename is actually committed.
-- Guarded by "old.filename is distinct from new.filename" the same way
-- log_ticket_field_changes guards every column — filename is currently the
-- only column a client can update, but this keeps the trigger honest either
-- way and never logs a no-op write.

create or replace function public.log_attachment_renamed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.filename is distinct from new.filename then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.ticket_id, auth.uid(), 'attachment_renamed', 'filename', old.filename, new.filename);
  end if;
  return new;
end;
$$;

create trigger ticket_attachments_log_renamed
  after update on public.ticket_attachments
  for each row execute function public.log_attachment_renamed();

-- ── Trigger: attachment deleted ──────────────────────────────────────────────
-- AFTER DELETE — OLD still holds the row's data at this point. ticket_activity
-- has no foreign key on the attachment itself (only on ticket_id, which is
-- untouched), so this activity row survives the attachment's removal and
-- still shows up after a refresh.

create or replace function public.log_attachment_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, old_value)
  values (old.ticket_id, auth.uid(), 'attachment_deleted', old.filename);
  return old;
end;
$$;

create trigger ticket_attachments_log_deleted
  after delete on public.ticket_attachments
  for each row execute function public.log_attachment_deleted();
