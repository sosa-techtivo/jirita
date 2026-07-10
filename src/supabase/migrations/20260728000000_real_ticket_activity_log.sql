-- Real, comprehensive Activity Log for tickets. Until now the only real
-- producer was the comment-creation trigger (20260727000000); every other
-- action (create, field edits, labels, acceptance criteria, attachments,
-- time entries) was either not logged at all or only logged to local
-- React state that vanished on refresh.
--
-- Architecture: database triggers on the tables that ALREADY perform real
-- writes (tickets insert/update, ticket_attachments insert,
-- ticket_time_entries insert — ticket_comments' trigger already exists).
-- This is deliberate, not incidental:
--   - "solo despues de que la accion se haya guardado" / "no crear eventos
--     si la operacion falla" comes for free — a trigger only runs as part
--     of the same transaction as the real write, so it can never fire
--     without the write, and never survives if the write rolls back.
--   - "usar siempre el usuario autenticado real" comes for free — auth.uid()
--     resolves the real calling session inside a SECURITY DEFINER trigger,
--     exactly like the existing comment trigger already relies on.
--   - No existing client code (createTicket/updateTicket/
--     uploadTicketAttachment/logTicketTime) needs to change at all — every
--     one of those functions already only succeeds after a real, committed
--     write, which is exactly what the triggers observe.
--   - ticket_activity keeps its original design intent from 20260708000000
--     ("written by application/service-role logic") — no new insert grant
--     or RLS relaxation for authenticated is needed; SECURITY DEFINER
--     triggers bypass RLS/grants for their own internal inserts only.

-- ── ticket_activity: new columns for structured old/new values ─────────────────
-- payload (jsonb) already existed from the base schema and is reused as the
-- "metadata" field the spec asks for — no need for a second jsonb column.

alter table public.ticket_activity
  add column field_name text,
  add column old_value  text,
  add column new_value  text;

-- ── tickets: real "who created this" ────────────────────────────────────────
-- Same default-auth.uid() pattern already used for ticket_attachments.
-- uploaded_by / ticket_time_entries.logged_by / ticket_comments.
-- author_profile_id — never sent by the client, can't be spoofed. Existing
-- tickets simply have this as null (honest: we don't actually know who
-- created them) — never backfilled with a guess.

alter table public.tickets
  add column created_by uuid references public.profiles (id) on delete set null default auth.uid();

-- ── Trigger: ticket creation ─────────────────────────────────────────────────

create or replace function public.log_ticket_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type)
  values (new.id, new.created_by, 'ticket_created');
  return new;
end;
$$;

create trigger tickets_log_created
  after insert on public.tickets
  for each row execute function public.log_ticket_created();

-- ── Trigger: per-field changes on update ─────────────────────────────────────
-- One activity row per column that actually changed (IS DISTINCT FROM skips
-- unchanged columns — "no registrar un cambio cuando old = new"). Labels and
-- acceptance_criteria_done are arrays, diffed element-by-element so each
-- added/removed label or each toggled criterion gets its own readable row.

create or replace function public.log_ticket_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  idx int;
begin
  if old.title is distinct from new.title then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'title_changed', 'title', old.title, new.title);
  end if;

  if old.description is distinct from new.description then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'description_changed', 'description', old.description, new.description);
  end if;

  if old.status is distinct from new.status then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'status_changed', 'status', old.status::text, new.status::text);
  end if;

  if old.type is distinct from new.type then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'type_changed', 'type', old.type::text, new.type::text);
  end if;

  if old.priority is distinct from new.priority then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'priority_changed', 'priority', old.priority::text, new.priority::text);
  end if;

  if old.assignee_profile_id is distinct from new.assignee_profile_id then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'assignee_changed', 'assignee_profile_id', old.assignee_profile_id::text, new.assignee_profile_id::text);
  end if;

  if old.hours is distinct from new.hours then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'hours_changed', 'hours', old.hours::text, new.hours::text);
  end if;

  if old.due_date is distinct from new.due_date then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value, new_value)
    values (new.id, actor, 'due_date_changed', 'due_date', old.due_date::text, new.due_date::text);
  end if;

  if old.labels is distinct from new.labels then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, new_value)
    select new.id, actor, 'label_added', 'labels', l
    from unnest(new.labels) as l
    where l <> all(coalesce(old.labels, '{}'));

    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, old_value)
    select new.id, actor, 'label_removed', 'labels', l
    from unnest(old.labels) as l
    where l <> all(coalesce(new.labels, '{}'));
  end if;

  if old.acceptance_criteria is distinct from new.acceptance_criteria then
    insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name)
    values (new.id, actor, 'acceptance_criteria_updated', 'acceptance_criteria');
  end if;

  if old.acceptance_criteria_done is distinct from new.acceptance_criteria_done then
    for idx in select generate_subscripts(new.acceptance_criteria_done, 1) loop
      if coalesce(old.acceptance_criteria_done[idx], false) is distinct from coalesce(new.acceptance_criteria_done[idx], false) then
        insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, field_name, new_value, payload)
        values (
          new.id, actor,
          case when coalesce(new.acceptance_criteria_done[idx], false)
            then 'acceptance_criterion_completed' else 'acceptance_criterion_unchecked' end,
          'acceptance_criteria_done',
          coalesce(new.acceptance_criteria[idx], ''),
          jsonb_build_object('index', idx - 1)
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger tickets_log_field_changes
  after update on public.tickets
  for each row execute function public.log_ticket_field_changes();

-- ── Trigger: attachment uploaded ─────────────────────────────────────────────

create or replace function public.log_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, new_value, payload)
  values (
    new.ticket_id, new.uploaded_by, 'attachment_uploaded', new.filename,
    jsonb_build_object('size_bytes', new.size_bytes, 'mime_type', new.mime_type)
  );
  return new;
end;
$$;

create trigger ticket_attachments_log_activity
  after insert on public.ticket_attachments
  for each row execute function public.log_attachment_activity();

-- ── Trigger: time logged ─────────────────────────────────────────────────────

create or replace function public.log_time_entry_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, new_value, payload)
  values (
    new.ticket_id, new.logged_by, 'time_logged', new.minutes::text,
    jsonb_build_object('work_date', new.work_date, 'comment', new.comment)
  );
  return new;
end;
$$;

create trigger ticket_time_entries_log_activity
  after insert on public.ticket_time_entries
  for each row execute function public.log_time_entry_activity();
