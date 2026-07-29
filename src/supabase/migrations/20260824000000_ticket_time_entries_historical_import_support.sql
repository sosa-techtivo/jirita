-- Historical identity + edit timestamp for ticket_time_entries, and the
-- matching activity bypass — same two-part pattern already applied to
-- tickets (20260822000000) and ticket_comments (20260823000000).
--
-- Problem 1 (identity): ticket_time_entries has never had an `unfuddle_id`
-- column, unlike `tickets`/`ticket_comments` (both `text unique`). Without
-- one, the Unfuddle importer's non-negotiable idempotency rule —
-- unfuddle_id is always the key, never a content-based combination — has
-- no column to key off. This migration adds exactly that column, nullable
-- (every one of the 14 existing rows, all created from the live app, gets
-- `null` — never backfilled with a guessed value) and unique (a plain
-- `unique` constraint on a nullable column already permits unlimited nulls
-- in Postgres — NULL is never considered equal to NULL for uniqueness — so
-- this is the same simple pattern `tickets.unfuddle_id`/
-- `ticket_comments.unfuddle_id` already use, not a different mechanism).
--
-- Problem 2 (edit timestamp): ticket_time_entries has never had an
-- `updated_at` column at all — Unfuddle's own `<updated-at>` on a time
-- entry (19 of the backup's 221 differ from their `<created-at>`) had no
-- destination column to preserve it in. This migration adds it, nullable,
-- with NO default — every existing row gets `null` (honest: this table
-- has no edit flow in the app yet, so there is no real "last edited" for
-- them), and the importer is expected to set it explicitly per historical
-- row. Deliberately not wired into the shared `set_updated_at` trigger
-- (which is `before update`, so it would never fire on INSERT anyway, but
-- is left off entirely here — this table's edit history should stay
-- exactly what the importer supplies, not started/reset by app code that
-- doesn't even edit these rows today).
--
-- Problem 3 (activity): ticket_time_entries_log_activity (20260728000000)
-- is an unconditional `AFTER INSERT` trigger — every new time entry gets a
-- `ticket_activity` row (`event_type = 'time_logged'`) timestamped
-- `now()`, which would misrepresent 221 historical entries (spanning
-- 2016-2026) as all logged today. Same fix as before: a guard reading the
-- transaction-local GUC `jirita.import_bypass_activity_log` — no second
-- GUC introduced, this is the exact same flag tickets/comments already
-- use — and a new, narrowly-scoped
-- `insert_ticket_time_entries_bypassing_activity_log` RPC that is the only
-- place that ever sets it. Normal app behavior (the "Log Time" flow,
-- logTicketTime in src/lib/tickets.ts) never touches this GUC, so
-- `log_time_entry_activity` behaves exactly as it did before this
-- migration for every real user action.
--
-- Access: EXECUTE is revoked from PUBLIC (so neither `anon` nor
-- `authenticated` can call the new RPC) and granted only to `service_role`,
-- which the importer already uses exclusively, server-side only.
--
-- Explicitly NOT changed: ticket_time_entries_ensure_membership (already a
-- no-op under the service-role client — keys off auth.uid(), not any
-- column on the row), no trigger anywhere recalculates `tickets.hours`
-- (confirmed by enumerating every trigger on both tables — this migration
-- doesn't add one either), the tickets/comments bypass mechanisms from
-- 20260822000000/20260823000000 (untouched), RLS policies, grants on the
-- base table, and every application query against ticket_time_entries
-- (all use explicit column lists, never `select('*')` — verified by
-- reading every call site in src/lib/tickets.ts — so these two new
-- nullable columns change no existing response shape anywhere).

-- ── ticket_time_entries: historical identity + edit timestamp ──────────────

alter table public.ticket_time_entries
  add column unfuddle_id text,
  add column updated_at timestamptz,
  add constraint ticket_time_entries_unfuddle_id_key unique (unfuddle_id);

comment on column public.ticket_time_entries.unfuddle_id is
  'Historical Unfuddle time-entry id (text), set only by the offline importer for idempotent re-imports. Null for every entry created from the app. Never backfilled retroactively for existing rows.';

comment on column public.ticket_time_entries.updated_at is
  'Historical Unfuddle edit timestamp (only meaningful for imported rows — this table has no edit flow in the app yet), set only by the offline importer. Null for every entry created from the app and for existing pre-migration rows — never defaulted to now()/created_at.';

-- ── ticket_time_entries_log_activity: skip only when the transaction-local flag is set ──
-- Identical signature, security context, and default behavior as the
-- original (20260728000000) — only the new early-return guard is added.

create or replace function public.log_time_entry_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('jirita.import_bypass_activity_log', true), 'false') = 'true' then
    return new;
  end if;

  insert into public.ticket_activity (ticket_id, actor_profile_id, event_type, new_value, payload)
  values (
    new.ticket_id, new.logged_by, 'time_logged', new.minutes::text,
    jsonb_build_object('work_date', new.work_date, 'comment', new.comment)
  );
  return new;
end;
$$;

-- ── insert_ticket_time_entries_bypassing_activity_log: the only way to set the flag for time entries ──
-- Historical-import-only. Accepts one batch of time entries as a JSON
-- array (each element shaped like PlannedTimeEntryFields in
-- src/lib/unfuddle-import/types/phase5.ts), sets the bypass, performs the
-- real insert in the same transaction, and returns the inserted rows.
-- Inserts only — never updates an existing row (idempotency-by-
-- unfuddle_id is decided in TypeScript, before this is ever called).
-- Touches only `ticket_time_entries`: never `tickets` (no hours/updated_at
-- write), never manual activity, never memberships/notifications/
-- attachments/relations.
--
-- `security invoker` (the default, stated explicitly): no privilege
-- escalation needed — only service_role can call this at all (see grants
-- below), and service_role already has full table access and bypasses RLS
-- on its own.

create or replace function public.insert_ticket_time_entries_bypassing_activity_log(entry_rows jsonb)
returns setof public.ticket_time_entries
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('jirita.import_bypass_activity_log', 'true', true);

  return query
    insert into public.ticket_time_entries (
      ticket_id, logged_by, minutes, work_date, comment, created_at, updated_at, unfuddle_id
    )
    select
      (r ->> 'ticket_id')::uuid,
      nullif(r ->> 'logged_by', '')::uuid,
      (r ->> 'minutes')::integer,
      (r ->> 'work_date')::date,
      r ->> 'comment',
      (r ->> 'created_at')::timestamptz,
      nullif(r ->> 'updated_at', '')::timestamptz,
      r ->> 'unfuddle_id'
    from jsonb_array_elements(entry_rows) as r
    returning *;
end;
$$;

comment on function public.insert_ticket_time_entries_bypassing_activity_log(jsonb) is
  'Historical-import-only. Inserts ticket_time_entries while suppressing the '
  'synthetic ticket_time_entries_log_activity ticket_activity row, scoped to '
  'this transaction only via the same LOCAL custom GUC tickets/comments '
  'already use (jirita.import_bypass_activity_log). Never call from client '
  'code — EXECUTE is restricted to service_role.';

revoke all on function public.insert_ticket_time_entries_bypassing_activity_log(jsonb) from public;
revoke all on function public.insert_ticket_time_entries_bypassing_activity_log(jsonb) from anon;
revoke all on function public.insert_ticket_time_entries_bypassing_activity_log(jsonb) from authenticated;
grant execute on function public.insert_ticket_time_entries_bypassing_activity_log(jsonb) to service_role;
