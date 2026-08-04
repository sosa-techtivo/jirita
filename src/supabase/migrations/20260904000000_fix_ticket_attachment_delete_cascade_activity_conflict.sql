-- Fixes the same class of preexisting bug already fixed for
-- project_notes_log_deleted and ticket_relations_log_removed
-- (20260903000000), now confirmed in a third place:
-- ticket_attachments_log_deleted can block a full project deletion.
--
-- ── Exact cause, confirmed by reading the live trigger/function
-- (20260731000000_log_attachment_rename_delete_activity.sql) ──────────────
--
-- `log_attachment_deleted()` (AFTER DELETE on ticket_attachments) inserts
-- into `ticket_activity (ticket_id, ...)` using `old.ticket_id`. When a
-- whole project is deleted, its tickets cascade-delete first
-- (projects->tickets), which in turn cascades to ticket_attachments
-- (tickets->ticket_attachments) — by the time this trigger fires for each
-- attachment, the specific `tickets` row `old.ticket_id` points at is
-- already gone (Postgres implements ON DELETE CASCADE as a trigger on the
-- parent that fires only after the parent row is removed, then cascades to
-- children — the same mechanism already traced in detail in
-- 20260903000000). The INSERT then violates
-- `ticket_activity_ticket_id_fkey`, blocking the whole project DELETE.
--
-- ── Fix ──────────────────────────────────────────────────────────────────
--
-- Identical minimal pattern as the other two fixes: check whether
-- `old.ticket_id` still exists before inserting. If it does, this is a
-- real, standalone attachment deletion inside a still-active ticket — log
-- it exactly as before, no behavior change. If it doesn't, this deletion
-- is a side effect of a larger cascade whose own parent ticket is already
-- gone — skip the insert. No global trigger disabling, no new GUC (this
-- isn't an import/restore concern — it's a structural "does the row this
-- insert would reference still exist" check, same as the other two fixes),
-- no dropped/relaxed constraint. Fully compatible with the existing
-- `jirita.import_bypass_activity_log` GUC and both restore-phase RPCs
-- (20260901000000/20260902000000): neither of those ever deletes anything,
-- so this AFTER DELETE trigger never runs during a restore either way —
-- this fix and that GUC govern entirely different code paths.

-- ── log_attachment_deleted: skip only when the parent ticket is already
-- gone ───────────────────────────────────────────────────────────────────
-- Identical signature, security context, and default behavior as the
-- original (20260731000000) — only the new existence guard is added.

create or replace function public.log_attachment_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.tickets t where t.id = old.ticket_id) then
    return old;
  end if;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, old_value)
  values (old.ticket_id, auth.uid(), 'attachment_deleted', old.filename);
  return old;
end;
$$;
