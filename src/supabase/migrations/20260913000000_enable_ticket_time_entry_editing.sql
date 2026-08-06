-- Enables editing/deleting one's own logged time entries — previously only
-- create existed (see 20260726000000's own doc comment: "No edit/delete
-- support (not implemented in the UI), so only select/insert are
-- granted"). Needed so a specific entry mis-persisted by the now-removed
-- mandatory 15-minute force-rounding (see PROJECT_STATUS.md's Time
-- Tracking hour-math fix) can be corrected individually, without a mass
-- historical migration and without guessing what its real original
-- duration was.
--
-- Author-only, same "only the owner can change this row" convention as
-- ticket_comments_update (20260907000000) / ticket_attachments' own
-- rename-delete grants — no cascade/RLS conflict to work around here
-- (unlike ticket_comments' delete_ticket_comment RPC): nothing references
-- ticket_time_entries.id as a foreign key, so a plain RLS delete policy is
-- sufficient.

create policy ticket_time_entries_update on public.ticket_time_entries
  for update
  using (logged_by = auth.uid())
  with check (logged_by = auth.uid());

create policy ticket_time_entries_delete on public.ticket_time_entries
  for delete
  using (logged_by = auth.uid());

grant update, delete on public.ticket_time_entries to authenticated;

-- ── updated_at: now a real edit timestamp, not import-only ─────────────────
-- 20260824000000 deliberately left this column unwired from the shared
-- set_updated_at trigger because the table had no edit flow yet. It does
-- now — same trigger every other editable table (ticket_comments, tickets)
-- already uses. Only ever fires on a real UPDATE, so every historical/
-- imported row (updated_at already null or importer-supplied) is
-- untouched by this addition.

create trigger set_updated_at
  before update on public.ticket_time_entries
  for each row execute function public.set_updated_at();

comment on column public.ticket_time_entries.updated_at is
  'Set automatically (set_updated_at trigger) on a real edit from the app. Also historically set directly by the offline importer for pre-migration Unfuddle rows (never both) — null means never edited.';

-- ── Activity: automatic "<name> updated/deleted a time entry" entries ──────
-- Same trigger-based architecture as every other producer (log_comment_activity,
-- log_attachment_renamed/log_attachment_deleted) — fires only after the real
-- write commits, and auth.uid() inside a security definer trigger resolves
-- the real actor without any client code change in
-- src/lib/tickets.ts (updateTicketTimeEntry/deleteTicketTimeEntry).

create or replace function public.log_time_entry_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.minutes is distinct from new.minutes
    or old.work_date is distinct from new.work_date
    or old.comment is distinct from new.comment
  then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, old_value, new_value, payload)
    values (
      new.ticket_id, auth.uid(), 'time_entry_updated', old.minutes::text, new.minutes::text,
      jsonb_build_object('work_date', new.work_date, 'comment', new.comment)
    );
  end if;
  return new;
end;
$$;

create trigger ticket_time_entries_log_updated
  after update on public.ticket_time_entries
  for each row execute function public.log_time_entry_updated();

-- AFTER DELETE — skip only when the parent ticket is already gone (a whole
-- ticket/project delete cascades into ticket_time_entries too; without this
-- guard the insert below would violate ticket_activity_ticket_id_fkey and
-- block that larger delete). Same fix already applied to
-- log_attachment_deleted (20260904000000) and log_comment_deleted
-- (20260912000000).

create or replace function public.log_time_entry_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.tickets t where t.id = old.ticket_id) then
    return old;
  end if;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, old_value, payload)
  values (
    old.ticket_id, auth.uid(), 'time_entry_deleted', old.minutes::text,
    jsonb_build_object('work_date', old.work_date, 'comment', old.comment)
  );
  return old;
end;
$$;

create trigger ticket_time_entries_log_deleted
  after delete on public.ticket_time_entries
  for each row execute function public.log_time_entry_deleted();
