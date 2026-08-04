-- Fixes a real, preexisting bug (found while cleaning up test fixtures for
-- the project-restore feature, unrelated to that feature itself): deleting
-- a project that has notes and/or ticket relations fails partway through
-- its own cascade, leaving the DELETE blocked.
--
-- ── Exact cause, confirmed by tracing Postgres's own cascade order ─────────
--
-- ON DELETE CASCADE is implemented by Postgres as a system trigger on the
-- *referenced* (parent) table that fires AFTER a parent row is deleted and
-- then issues the cascading DELETE on the child table. That means the
-- parent row is already gone from its table by the time the child table's
-- own DELETE triggers run — this is true at every level of a cascade
-- chain, not just the first one.
--
-- `project_notes_log_deleted` (BEFORE DELETE on project_notes) inserts into
-- `project_note_activity (project_id, ...)`. When a project is deleted,
-- the projects->project_notes cascade fires this trigger for each note —
-- but the `projects` row itself is already gone, so the INSERT (which
-- requires `project_note_activity.project_id` to reference a real,
-- existing project) violates that FK: `insert or update on table
-- "project_note_activity" violates foreign key constraint
-- "project_note_activity_project_id_fkey"`.
--
-- `ticket_relations_log_removed` (AFTER DELETE on ticket_relations) inserts
-- into `ticket_activity (ticket_id, ...)`. When a project is deleted, its
-- tickets cascade-delete first (projects->tickets), which in turn cascades
-- to ticket_relations (tickets->ticket_relations) — by the time this
-- trigger fires, the specific `tickets` row `old.ticket_id`/
-- `old.related_ticket_id` points at is already gone, so the INSERT
-- violates `ticket_activity_ticket_id_fkey` the same way.
--
-- Both failures were reproduced live and are fixed by the same minimal
-- pattern: check whether the *parent row the activity row would reference*
-- still exists before inserting. If it does, this is a real, standalone
-- deletion inside a still-active project (or between two still-active
-- tickets) — log it exactly as before, no behavior change. If it doesn't,
-- this deletion is happening as a side effect of a larger cascade whose
-- own parent is already gone — skip the insert (there is nothing
-- meaningful to attribute the activity to, and no valid FK target to write
-- it against). No global trigger disabling, no dropped/relaxed constraint,
-- no interaction with the existing `jirita.import_bypass_activity_log` GUC
-- (which only ever governed INSERT-triggered synthetic activity, never
-- these two DELETE triggers) — fully compatible with the historical-import
-- and restore-phase bypasses, unrelated mechanisms both before and after
-- this fix.

-- ── log_note_deleted: skip only when the parent project is already gone ────
-- Identical signature, security context, and default behavior as the
-- original (20260811000000) — only the new existence guard is added.

create or replace function public.log_note_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;

  insert into public.project_note_activity (project_id, note_id, note_title, actor_profile_id, event_type)
  values (old.project_id, old.id, old.title, auth.uid(), 'note_deleted');
  return old;
end;
$$;

-- ── log_ticket_relation_removed: skip only when either side's ticket is
-- already gone ─────────────────────────────────────────────────────────────
-- Identical signature, security context, and default behavior as the
-- original (20260802000000) — only the new existence guard is added.
-- Checked once, up front, for both tickets: the two inserts below already
-- reference each other's ticket code (code_a/code_b), so a half-vanished
-- state (one side gone, the other not) is never a meaningful event to log
-- either — both sides skip together, matching the same "this is a cascade
-- teardown, not a real relation-removal event" reasoning as the notes fix
-- above.

create or replace function public.log_ticket_relation_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  code_a text;
  code_b text;
  label_forward text;
  label_inverse text;
begin
  if not exists (select 1 from public.tickets t where t.id = old.ticket_id)
     or not exists (select 1 from public.tickets t where t.id = old.related_ticket_id) then
    return old;
  end if;

  select p.project_code || '-' || t.ticket_number into code_a
  from public.tickets t join public.projects p on p.id = t.project_id
  where t.id = old.ticket_id;

  select p.project_code || '-' || t.ticket_number into code_b
  from public.tickets t join public.projects p on p.id = t.project_id
  where t.id = old.related_ticket_id;

  label_forward := case old.kind
    when 'blocks' then 'Blocks'
    when 'duplicates' then 'Duplicates'
    else 'Related to'
  end;
  label_inverse := case old.kind
    when 'blocks' then 'Is blocked by'
    when 'duplicates' then 'Is duplicated by'
    else 'Related to'
  end;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value)
  values (old.ticket_id, actor, 'relation_removed', label_forward, code_b);

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value)
  values (old.related_ticket_id, actor, 'relation_removed', label_inverse, code_a);

  return old;
end;
$$;
