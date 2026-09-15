-- Historical identity for project_notes — Unfuddle Notebook/Page recovery
-- (KTVibe project, unfuddle_id = "183"). Notebooks/Pages were never modeled
-- by the original Unfuddle -> JIRITA importer (src/lib/unfuddle-import/
-- parser/backup-xml-parser.ts explicitly skips <notebooks> as out of that
-- phase's scope), so the 158 historical Notes that existed in Unfuddle were
-- silently omitted from the KTVibe migration. This migration only adds the
-- identity column + a narrowly-scoped bypass RPC the recovery importer
-- needs — same two-part pattern already applied to tickets/ticket_comments/
-- ticket_time_entries/ticket_attachments and, for a synthesized
-- (no-native-id) case, ticket_relations
-- (20260826000000_ticket_relations_historical_import_support.sql).
--
-- Problem 1 (identity): project_notes has no historical-identity column.
-- Unfuddle Notes are Notebook -> Page -> Page revision; a revision's own
-- <page><id> is per-revision (each edit gets a new id, confirmed directly
-- against the raw backup.xml), so it can never be used as identity — the
-- same reasoning ticket_relations already established for a source entity
-- with no stable literal id. Logical page identity is instead
-- (notebook_id, page number), confirmed unique/stable against the full
-- canonical snapshot for this project (158 logical pages, 0 duplicate
-- version numbers inside a logical page, 0 incomplete/non-consecutive
-- histories). This migration adds `unfuddle_note_key text`, a deterministic
-- key built by the importer (TypeScript, not this migration):
--   unfuddle:note:<notebook_id>:<page_number>
-- Nullable — every existing project_notes row, including KTVibe's one
-- native "Siteground Staging" note, gets null and is never backfilled with
-- a guessed value — and unique, the same nullable-unique pattern
-- tickets.unfuddle_id/ticket_comments.unfuddle_id/
-- ticket_time_entries.unfuddle_id/ticket_attachments.unfuddle_id/
-- ticket_relations.unfuddle_relation_key all already use.
--
-- Problem 2 (activity): public.log_note_created() (project_notes' AFTER
-- INSERT trigger) already checks the transaction-local GUC
-- jirita.import_bypass_activity_log — patched by
-- 20260902000000_project_restore_phase2.sql specifically because Notes were
-- never part of the original Unfuddle import and needed the same bypass
-- restore_project_phase2 relies on. Reused as-is here: no new GUC, no
-- change to that function. project_notes_log_updated / project_notes_
-- log_deleted are UPDATE/DELETE-only and never fire during this
-- INSERT-only recovery. set_note_updated_meta() is also UPDATE-only, so an
-- INSERT-only recovery can preserve explicit historical created_at/
-- updated_at/created_by/updated_by without touching that trigger.
--
-- Access: EXECUTE is revoked from PUBLIC (so neither `anon` nor
-- `authenticated` can call the new RPC) and granted only to `service_role`,
-- which the importer already uses exclusively, server-side only. `security
-- invoker` (the default, stated explicitly): no privilege escalation
-- needed — only service_role can call this at all, and service_role
-- already bypasses RLS and has full table access on its own.
--
-- Explicitly NOT changed: every existing project_notes RLS policy, every
-- existing constraint, grants on the base table, log_note_updated/
-- log_note_deleted, set_note_updated_meta, and every application query
-- against project_notes (this one new nullable column changes no existing
-- response shape anywhere that doesn't already use `select *`/explicit
-- column lists compatible with an added column).

-- ── project_notes: historical identity ──────────────────────────────────────

alter table public.project_notes
  add column unfuddle_note_key text,
  add constraint project_notes_unfuddle_note_key_key unique (unfuddle_note_key);

comment on column public.project_notes.unfuddle_note_key is
  'Historical-import-only. Deterministic composite key preserving an Unfuddle '
  'Notebook Page''s logical identity (unfuddle:note:<notebook_id>:<page_number>), '
  'set only by the offline Unfuddle Notes recovery importer for idempotent '
  're-imports. Unfuddle Page revisions have no stable id of their own (each '
  'edit receives a new <page><id>), so this is a synthesized key, never a '
  'literal id copy. Null for every note created through the app, including '
  'the pre-existing KTVibe "Siteground Staging" native note. Never backfilled '
  'retroactively for existing rows.';

-- ── insert_project_notes_bypassing_activity_log: the only way to set the flag for notes recovery ──
-- Historical-import-only. Accepts one batch of notes as a JSON array (each
-- element: project_id, title, content, created_by, updated_by, created_at,
-- updated_at, unfuddle_note_key — already canonicalized in TypeScript, see
-- src/lib/unfuddle-import/import-notes-recovery/), sets the bypass, performs
-- the real insert in the same transaction, and returns the inserted rows.
-- Inserts only — never updates an existing row (idempotency-by-
-- unfuddle_note_key is decided in TypeScript, before this is ever called).
-- Touches only `project_notes`: never `projects` (no updated_at write),
-- never manual activity, never attachments/memberships/notifications.
-- id is never accepted — every row gets project_notes' own default
-- (gen_random_uuid()), unlike restore_project_phase2's notes insert (which
-- restores already-known JIRITA ids from a prior export); this is a fresh
-- historical import where those ids never existed before.
--
-- Unlike insert_ticket_relations_bypassing_activity_log (which accepts no
-- historical timestamp because Unfuddle provides none for a relationship),
-- this RPC DOES accept and preserve created_at/updated_at/created_by/
-- updated_by: real historical data from the Unfuddle Page revisions
-- (v1 for creation metadata, latest version for update metadata), not an
-- absent value being papered over.
--
-- Every real constraint (the project_id FK, the created_by/updated_by
-- profile FKs, and this migration's own unfuddle_note_key uniqueness) still
-- applies in full — this is a genuine INSERT statement, not a constraint
-- bypass; only the project_note_activity side effect is suppressed.

create or replace function public.insert_project_notes_bypassing_activity_log(note_rows jsonb)
returns setof public.project_notes
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.project_notes (
      project_id, title, content, created_by, updated_by, created_at, updated_at, unfuddle_note_key
    )
    select
      (r ->> 'project_id')::uuid,
      r ->> 'title',
      r ->> 'content',
      nullif(r ->> 'created_by', '')::uuid,
      nullif(r ->> 'updated_by', '')::uuid,
      (r ->> 'created_at')::timestamptz,
      (r ->> 'updated_at')::timestamptz,
      r ->> 'unfuddle_note_key'
    from jsonb_array_elements(note_rows) as r
    returning *;
end;
$$;

comment on function public.insert_project_notes_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts project_notes while suppressing the '
  'synthetic note_created project_note_activity rows, scoped to this '
  'transaction only via the same LOCAL custom GUC every other '
  'historical-import bypass RPC already uses '
  '(jirita.import_bypass_activity_log). Preserves real historical '
  'created_at/updated_at/created_by/updated_by from the Unfuddle snapshot. '
  'id is never accepted — every row gets project_notes'' own default '
  '(gen_random_uuid()). Never call from client code — EXECUTE is restricted '
  'to service_role.';

revoke all on function public.insert_project_notes_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_project_notes_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_project_notes_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_project_notes_bypassing_activity_log(jsonb) to service_role;
