-- Project-restore Phase 2: a single transactional RPC that writes
-- ticket_comments, ticket_time_entries, project_notes, ticket_attachments
-- (metadata only), ticket_relations, ticket_activity (historical), and
-- project_note_activity (historical) for a project already restored by
-- restore_project_phase1 (20260901000000). No Storage upload, no project/
-- ticket/membership write, no per-project ticket_statuses.
--
-- Trigger audit performed before writing anything here
-- (`grep -rn "create trigger" supabase/migrations/*.sql`, cross-checked
-- against each defining migration):
--
--   ticket_comments_log_activity            — bypass already exists
--   ticket_time_entries_log_activity        — bypass already exists
--   ticket_attachments_log_activity         — bypass already exists
--   ticket_relations_log_added              — bypass already exists
--   project_notes_log_created               — NO existing bypass (new)
--   ticket_comments_ensure_membership       — auth.uid()-only, no-op here
--   ticket_time_entries_ensure_membership   — auth.uid()-only, no-op here
--   ticket_attachments_ensure_membership    — auth.uid()-only, no-op here
--   ticket_relations_ensure_membership      — auth.uid()-only, no-op here
--   ticket_attachments_check_comment_ticket_consistency (BEFORE INSERT) —
--     real constraint: comment_id, when set, must belong to a
--     ticket_comments row with the same ticket_id — this is *why*
--     comments must be inserted before attachments below, not just this
--     task's own suggested order coinciding with it by chance.
--   ticket_attachments_log_renamed/_log_deleted, ticket_relations_log_removed,
--     project_notes_set_updated_meta/_log_updated/_log_deleted — all
--     UPDATE/DELETE-only, never fire during this INSERT-only phase.
--   No trigger anywhere updates `tickets` or `projects` from any of these
--   seven tables (confirmed by reading every trigger function body above)
--   — updated_at on both stays exactly what Phase 1 already wrote.
--
-- Four of the five activity-suppressing triggers already check the
-- transaction-local GUC `jirita.import_bypass_activity_log` (introduced by
-- the Unfuddle historical importer, 20260822000000 onward) — reused as-is
-- here, no new GUC for those. `log_note_created` is the one genuinely new
-- case (notes were never part of the Unfuddle import, so no precedent
-- bypass exists for it) — patched below to check the *same* GUC rather
-- than introducing a second one, since the problem it solves is identical.
--
-- Unlike the historical-import RPCs (which never accept created_at for
-- ticket_relations — Unfuddle has no relation-level timestamp to preserve),
-- this RPC's own ticket_relations insert *does* accept and preserve
-- created_at: a restored relation's created_at is real historical data
-- from an actual prior JIRITA project, not an absent value being
-- papered over. The cross-project guard those RPCs added
-- (20260827000000/20260828000000) is reproduced here in equivalent form:
-- every relation's ticket_id/related_ticket_id must resolve to a ticket
-- that belongs to the *restored* project specifically (not merely "exists
-- somewhere"), enforced by the same ticket-reference pre-check every other
-- table's ticket_id already goes through below.

-- ── log_note_created: skip only when the transaction-local flag is set ─────
-- Identical signature, security context, and default behavior as the
-- original (20260811000000) — only the new early-return guard is added.

create or replace function public.log_note_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('jirita.import_bypass_activity_log', true), 'false') = 'true' then
    return new;
  end if;

  insert into public.project_note_activity (project_id, note_id, note_title, actor_profile_id, event_type)
  values (new.project_id, new.id, new.title, new.created_by, 'note_created');
  return new;
end;
$$;

-- ── restore_project_phase2: the one transactional entry point ──────────────
-- Accepts { projectId, comments, timeEntries, notes, attachments, relations,
-- activity, noteActivity } as a single jsonb payload (shaped exactly like
-- ProjectRestorePlan's own collections — see
-- src/lib/server/execute-project-restore-phase2.ts, the only caller).
-- Validates every precondition itself before writing anything: the
-- restored project must exist, every ticket_id/related_ticket_id
-- referenced must belong to that exact project, comment_id/note_id must
-- resolve within this same payload when set, no id in the payload may
-- already exist in its target table, and every referenced profile id must
-- be real. The whole function body is one implicit transaction — any
-- `raise exception` rolls back everything this call did (not Phase 1,
-- which already committed in its own, separate call).
--
-- `security invoker` (the default, stated explicitly): only service_role
-- can call this at all (see grants below), and service_role already
-- bypasses RLS and has full table access on its own — same as Phase 1 and
-- every historical-import bypass RPC.

create or replace function public.restore_project_phase2(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project_id              uuid;
  v_comments                jsonb := coalesce(payload -> 'comments', '[]'::jsonb);
  v_time_entries            jsonb := coalesce(payload -> 'timeEntries', '[]'::jsonb);
  v_notes                   jsonb := coalesce(payload -> 'notes', '[]'::jsonb);
  v_attachments             jsonb := coalesce(payload -> 'attachments', '[]'::jsonb);
  v_relations               jsonb := coalesce(payload -> 'relations', '[]'::jsonb);
  v_activity                jsonb := coalesce(payload -> 'activity', '[]'::jsonb);
  v_note_activity           jsonb := coalesce(payload -> 'noteActivity', '[]'::jsonb);
  v_bad_count               integer;
  v_inserted_comments       integer;
  v_inserted_time_entries   integer;
  v_inserted_notes          integer;
  v_inserted_attachments    integer;
  v_inserted_relations      integer;
  v_inserted_activity       integer;
  v_inserted_note_activity  integer;
begin
  v_project_id := nullif(payload ->> 'projectId', '')::uuid;
  if v_project_id is null then
    raise exception 'restore_project_phase2: payload.projectId is required';
  end if;
  if jsonb_typeof(v_comments) <> 'array' or jsonb_typeof(v_time_entries) <> 'array'
     or jsonb_typeof(v_notes) <> 'array' or jsonb_typeof(v_attachments) <> 'array'
     or jsonb_typeof(v_relations) <> 'array' or jsonb_typeof(v_activity) <> 'array'
     or jsonb_typeof(v_note_activity) <> 'array' then
    raise exception 'restore_project_phase2: comments/timeEntries/notes/attachments/relations/activity/noteActivity must all be arrays';
  end if;

  -- ── Preconditions — never trust the caller for integrity ─────────────────

  if not exists (select 1 from public.projects p where p.id = v_project_id) then
    raise exception 'restore_project_phase2: restored project % does not exist — run restore_project_phase1 first', v_project_id;
  end if;

  -- Every ticket_id/related_ticket_id referenced by any of the six
  -- ticket-scoped collections must resolve to a ticket that belongs to
  -- *this* project specifically — not merely exist somewhere else. This is
  -- what the ticket_relations historical-import RPC's own cross-project
  -- guard (20260827000000/20260828000000) does for that one table;
  -- checking every reference against `tickets where project_id =
  -- v_project_id` here gives the same guarantee for all six at once.
  select count(*) into v_bad_count
  from (
    select nullif(x ->> 'ticket_id', '')::uuid as tid from jsonb_array_elements(v_comments) as x
    union all select nullif(x ->> 'ticket_id', '')::uuid from jsonb_array_elements(v_time_entries) as x
    union all select nullif(x ->> 'ticket_id', '')::uuid from jsonb_array_elements(v_attachments) as x
    union all select nullif(x ->> 'ticket_id', '')::uuid from jsonb_array_elements(v_activity) as x
    union all select nullif(x ->> 'ticket_id', '')::uuid from jsonb_array_elements(v_relations) as x
    union all select nullif(x ->> 'related_ticket_id', '')::uuid from jsonb_array_elements(v_relations) as x
  ) refs
  where refs.tid is not null
    and not exists (select 1 from public.tickets t where t.id = refs.tid and t.project_id = v_project_id);
  if v_bad_count > 0 then
    raise exception 'restore_project_phase2: % ticket reference(s) do not exist or do not belong to project %', v_bad_count, v_project_id;
  end if;

  select count(*) into v_bad_count
  from jsonb_array_elements(v_notes) as n
  where nullif(n ->> 'project_id', '')::uuid is distinct from v_project_id;
  if v_bad_count > 0 then
    raise exception 'restore_project_phase2: % note row(s) do not point at project %', v_bad_count, v_project_id;
  end if;

  select count(*) into v_bad_count
  from jsonb_array_elements(v_note_activity) as na
  where nullif(na ->> 'project_id', '')::uuid is distinct from v_project_id;
  if v_bad_count > 0 then
    raise exception 'restore_project_phase2: % note_activity row(s) do not point at project %', v_bad_count, v_project_id;
  end if;

  -- attachments.comment_id, when set, must resolve within this same
  -- payload's own comments — never a pre-existing, unrelated comment.
  select count(*) into v_bad_count
  from jsonb_array_elements(v_attachments) as a
  where nullif(a ->> 'comment_id', '') is not null
    and not exists (
      select 1 from jsonb_array_elements(v_comments) as c
      where nullif(c ->> 'id', '')::uuid = nullif(a ->> 'comment_id', '')::uuid
    );
  if v_bad_count > 0 then
    raise exception 'restore_project_phase2: % attachment row(s) reference a comment_id not present in this payload''s comments', v_bad_count;
  end if;

  -- noteActivity.note_id, when set, must resolve within this same
  -- payload's own notes.
  select count(*) into v_bad_count
  from jsonb_array_elements(v_note_activity) as na
  where nullif(na ->> 'note_id', '') is not null
    and not exists (
      select 1 from jsonb_array_elements(v_notes) as n
      where nullif(n ->> 'id', '')::uuid = nullif(na ->> 'note_id', '')::uuid
    );
  if v_bad_count > 0 then
    raise exception 'restore_project_phase2: % note_activity row(s) reference a note_id not present in this payload''s notes', v_bad_count;
  end if;

  -- No id in the payload may already exist in its target table.
  select count(*) into v_bad_count from jsonb_array_elements(v_comments) as x
    where exists (select 1 from public.ticket_comments c where c.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % comment id(s) already exist', v_bad_count; end if;

  select count(*) into v_bad_count from jsonb_array_elements(v_time_entries) as x
    where exists (select 1 from public.ticket_time_entries te where te.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % time entry id(s) already exist', v_bad_count; end if;

  select count(*) into v_bad_count from jsonb_array_elements(v_notes) as x
    where exists (select 1 from public.project_notes n where n.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % note id(s) already exist', v_bad_count; end if;

  select count(*) into v_bad_count from jsonb_array_elements(v_attachments) as x
    where exists (select 1 from public.ticket_attachments a where a.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % attachment id(s) already exist', v_bad_count; end if;

  select count(*) into v_bad_count from jsonb_array_elements(v_relations) as x
    where exists (select 1 from public.ticket_relations r where r.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % relation id(s) already exist', v_bad_count; end if;

  select count(*) into v_bad_count from jsonb_array_elements(v_activity) as x
    where exists (select 1 from public.ticket_activity ta where ta.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % activity id(s) already exist', v_bad_count; end if;

  select count(*) into v_bad_count from jsonb_array_elements(v_note_activity) as x
    where exists (select 1 from public.project_note_activity pna where pna.id = (x ->> 'id')::uuid);
  if v_bad_count > 0 then raise exception 'restore_project_phase2: % note_activity id(s) already exist', v_bad_count; end if;

  -- Every referenced profile id (authors/actors/loggers/uploaders/creators)
  -- must be a real row in profiles — explicit pre-check, same reasoning as
  -- Phase 1's own.
  select count(*) into v_bad_count
  from (
    select nullif(x ->> 'author_profile_id', '')::uuid as pid from jsonb_array_elements(v_comments) as x
    union all select nullif(x ->> 'logged_by', '')::uuid from jsonb_array_elements(v_time_entries) as x
    union all select nullif(x ->> 'created_by', '')::uuid from jsonb_array_elements(v_notes) as x
    union all select nullif(x ->> 'updated_by', '')::uuid from jsonb_array_elements(v_notes) as x
    union all select nullif(x ->> 'uploaded_by', '')::uuid from jsonb_array_elements(v_attachments) as x
    union all select nullif(x ->> 'created_by', '')::uuid from jsonb_array_elements(v_relations) as x
    union all select nullif(x ->> 'actor_profile_id', '')::uuid from jsonb_array_elements(v_activity) as x
    union all select nullif(x ->> 'actor_profile_id', '')::uuid from jsonb_array_elements(v_note_activity) as x
  ) refs
  where refs.pid is not null
    and not exists (select 1 from public.profiles pr where pr.id = refs.pid);
  if v_bad_count > 0 then
    raise exception 'restore_project_phase2: % referenced profile id(s) do not exist', v_bad_count;
  end if;

  -- ── Writes — bypassing the synthetic-activity triggers for the rest of
  -- this transaction only. Insert order: comments before attachments
  -- (ticket_attachments_check_comment_ticket_consistency requires the
  -- referenced comment to already exist), notes before noteActivity
  -- (FK on note_id) — everything else has no ordering dependency, kept in
  -- the order this task specifies. ─────────────────────────────────────────
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  insert into public.ticket_comments (
    id, ticket_id, author_profile_id, body, unfuddle_id, unfuddle_imported_at, created_at, updated_at
  )
  select
    (x ->> 'id')::uuid,
    (x ->> 'ticket_id')::uuid,
    nullif(x ->> 'author_profile_id', '')::uuid,
    x ->> 'body',
    x ->> 'unfuddle_id',
    nullif(x ->> 'unfuddle_imported_at', '')::timestamptz,
    (x ->> 'created_at')::timestamptz,
    nullif(x ->> 'updated_at', '')::timestamptz
  from jsonb_array_elements(v_comments) as x;
  get diagnostics v_inserted_comments = row_count;

  insert into public.ticket_time_entries (
    id, ticket_id, logged_by, minutes, work_date, comment, unfuddle_id, updated_at, created_at
  )
  select
    (x ->> 'id')::uuid,
    (x ->> 'ticket_id')::uuid,
    nullif(x ->> 'logged_by', '')::uuid,
    (x ->> 'minutes')::integer,
    (x ->> 'work_date')::date,
    x ->> 'comment',
    x ->> 'unfuddle_id',
    nullif(x ->> 'updated_at', '')::timestamptz,
    (x ->> 'created_at')::timestamptz
  from jsonb_array_elements(v_time_entries) as x;
  get diagnostics v_inserted_time_entries = row_count;

  insert into public.project_notes (
    id, project_id, title, content, created_by, updated_by, created_at, updated_at
  )
  select
    (x ->> 'id')::uuid,
    v_project_id,
    x ->> 'title',
    x ->> 'content',
    nullif(x ->> 'created_by', '')::uuid,
    nullif(x ->> 'updated_by', '')::uuid,
    (x ->> 'created_at')::timestamptz,
    (x ->> 'updated_at')::timestamptz
  from jsonb_array_elements(v_notes) as x;
  get diagnostics v_inserted_notes = row_count;

  insert into public.ticket_attachments (
    id, ticket_id, comment_id, filename, storage_path, size_bytes, mime_type,
    uploaded_by, unfuddle_id, updated_at, created_at
  )
  select
    (x ->> 'id')::uuid,
    (x ->> 'ticket_id')::uuid,
    nullif(x ->> 'comment_id', '')::uuid,
    x ->> 'filename',
    x ->> 'storage_path',
    (x ->> 'size_bytes')::bigint,
    nullif(x ->> 'mime_type', ''),
    nullif(x ->> 'uploaded_by', '')::uuid,
    x ->> 'unfuddle_id',
    nullif(x ->> 'updated_at', '')::timestamptz,
    (x ->> 'created_at')::timestamptz
  from jsonb_array_elements(v_attachments) as x;
  get diagnostics v_inserted_attachments = row_count;

  insert into public.ticket_relations (
    id, ticket_id, related_ticket_id, kind, created_by, unfuddle_relation_key, created_at
  )
  select
    (x ->> 'id')::uuid,
    (x ->> 'ticket_id')::uuid,
    (x ->> 'related_ticket_id')::uuid,
    x ->> 'kind',
    nullif(x ->> 'created_by', '')::uuid,
    x ->> 'unfuddle_relation_key',
    (x ->> 'created_at')::timestamptz
  from jsonb_array_elements(v_relations) as x;
  get diagnostics v_inserted_relations = row_count;

  insert into public.ticket_activity (
    id, ticket_id, actor_profile_id, event_type, payload, field_name, old_value, new_value, created_at
  )
  select
    (x ->> 'id')::uuid,
    (x ->> 'ticket_id')::uuid,
    nullif(x ->> 'actor_profile_id', '')::uuid,
    x ->> 'event_type',
    x -> 'payload',
    x ->> 'field_name',
    x ->> 'old_value',
    x ->> 'new_value',
    (x ->> 'created_at')::timestamptz
  from jsonb_array_elements(v_activity) as x;
  get diagnostics v_inserted_activity = row_count;

  insert into public.project_note_activity (
    id, project_id, note_id, note_title, actor_profile_id, event_type, field_name, old_value, new_value, created_at
  )
  select
    (x ->> 'id')::uuid,
    v_project_id,
    nullif(x ->> 'note_id', '')::uuid,
    x ->> 'note_title',
    nullif(x ->> 'actor_profile_id', '')::uuid,
    x ->> 'event_type',
    x ->> 'field_name',
    x ->> 'old_value',
    x ->> 'new_value',
    (x ->> 'created_at')::timestamptz
  from jsonb_array_elements(v_note_activity) as x;
  get diagnostics v_inserted_note_activity = row_count;

  -- ── Post-write integrity: inserted counts must match the payload exactly ─
  if v_inserted_comments is distinct from jsonb_array_length(v_comments) then
    raise exception 'restore_project_phase2: inserted % comment row(s) but the payload had %', v_inserted_comments, jsonb_array_length(v_comments);
  end if;
  if v_inserted_time_entries is distinct from jsonb_array_length(v_time_entries) then
    raise exception 'restore_project_phase2: inserted % time entry row(s) but the payload had %', v_inserted_time_entries, jsonb_array_length(v_time_entries);
  end if;
  if v_inserted_notes is distinct from jsonb_array_length(v_notes) then
    raise exception 'restore_project_phase2: inserted % note row(s) but the payload had %', v_inserted_notes, jsonb_array_length(v_notes);
  end if;
  if v_inserted_attachments is distinct from jsonb_array_length(v_attachments) then
    raise exception 'restore_project_phase2: inserted % attachment row(s) but the payload had %', v_inserted_attachments, jsonb_array_length(v_attachments);
  end if;
  if v_inserted_relations is distinct from jsonb_array_length(v_relations) then
    raise exception 'restore_project_phase2: inserted % relation row(s) but the payload had %', v_inserted_relations, jsonb_array_length(v_relations);
  end if;
  if v_inserted_activity is distinct from jsonb_array_length(v_activity) then
    raise exception 'restore_project_phase2: inserted % activity row(s) but the payload had %', v_inserted_activity, jsonb_array_length(v_activity);
  end if;
  if v_inserted_note_activity is distinct from jsonb_array_length(v_note_activity) then
    raise exception 'restore_project_phase2: inserted % note_activity row(s) but the payload had %', v_inserted_note_activity, jsonb_array_length(v_note_activity);
  end if;

  return jsonb_build_object(
    'projectId', v_project_id,
    'inserted', jsonb_build_object(
      'comments', v_inserted_comments,
      'activity', v_inserted_activity,
      'timeEntries', v_inserted_time_entries,
      'attachments', v_inserted_attachments,
      'relations', v_inserted_relations,
      'notes', v_inserted_notes,
      'noteActivity', v_inserted_note_activity
    ),
    -- Every restored attachment row's physical file is still pending
    -- upload — this phase never touches Storage (requirement: "no subir
    -- archivos todavía").
    'pendingAttachmentFiles', v_inserted_attachments
  );
end;
$$;

comment on function public.restore_project_phase2(jsonb) is
  'Project-restore Phase 2 only: writes ticket_comments, ticket_time_entries, '
  'project_notes, ticket_attachments (metadata only), ticket_relations, '
  'ticket_activity, and project_note_activity from a ProjectRestorePlan '
  'payload, inside one transaction, for a project already restored by '
  'restore_project_phase1. Bypasses the automatic synthetic-activity-log '
  'triggers (including a newly-added one for project_notes) via the same '
  'transaction-local GUC the Unfuddle historical importer already '
  'introduced. Never touches Supabase Storage. Never call from client code '
  '— EXECUTE is restricted to service_role.';

revoke all on function public.restore_project_phase2(jsonb) from public;
revoke all on function public.restore_project_phase2(jsonb) from anon;
revoke all on function public.restore_project_phase2(jsonb) from authenticated;
grant execute on function public.restore_project_phase2(jsonb) to service_role;
