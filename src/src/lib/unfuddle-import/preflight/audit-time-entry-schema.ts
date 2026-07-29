import type { SchemaAudit } from "../types/phase5";

/**
 * Confirmed against the real, currently-live schema — not assumed:
 *
 * ```sql
 * create table public.ticket_time_entries (
 *   id           uuid primary key default gen_random_uuid(),
 *   ticket_id    uuid not null references public.tickets (id) on delete cascade,
 *   logged_by    uuid references public.profiles (id) on delete set null default auth.uid(),
 *   minutes      integer not null check (minutes > 0),
 *   work_date    date not null,
 *   comment      text,
 *   created_at   timestamptz not null default now(),
 *   unfuddle_id  text unique,        -- added by 20260824000000
 *   updated_at   timestamptz         -- added by 20260824000000, no default
 * );
 * ```
 *
 * - `minutes integer not null check (minutes > 0)` — zero/negative hours
 *   structurally impossible to insert (confirmed none exist in the 221
 *   real entries anyway).
 * - `logged_by` nullable — orphan person ids preserve as `null`.
 * - `work_date` is a real, separate column from `created_at`.
 * - No `BEFORE INSERT` trigger anywhere in this schema — a caller-supplied
 *   `created_at`/`updated_at` is preserved exactly.
 * - No trigger anywhere recalculates `tickets.hours` from
 *   `ticket_time_entries`.
 *
 * STATUS: RESOLVED and verified live. Migration
 * supabase/migrations/20260824000000_ticket_time_entries_historical_import_support.sql
 * was applied manually via the Supabase SQL Editor, then confirmed against
 * the real database (not assumed) with controlled, cleaned-up test data —
 * dedicated throwaway tickets, never any real KTVibe ticket/time entry:
 *   - `unfuddle_id`/`updated_at` columns exist and are selectable; all 14
 *     pre-existing app-created rows still show `unfuddle_id = null` and
 *     `updated_at = null` — no backfill happened.
 *   - `insert_ticket_time_entries_bypassing_activity_log` exists and is
 *     callable by the service-role client; calling it with the `anon` key
 *     was rejected with Postgres 42501 (permission denied).
 *   - A plain `ticket_time_entries` insert (no bypass) still produced
 *     exactly one `time_logged` ticket_activity row with the correct
 *     actor/metadata; `tickets.hours` and `tickets.updated_at` were both
 *     unchanged.
 *   - An insert through `insert_ticket_time_entries_bypassing_activity_log`
 *     produced zero `time_logged` activity rows, preserved
 *     unfuddle_id/ticket_id/logged_by/minutes(=6)/work_date/comment/
 *     created_at/updated_at exactly, left the parent ticket's own
 *     `hours`/`updated_at` untouched, and created zero new
 *     `project_memberships`.
 *   - The `unfuddle_id` unique constraint is real and enforced: a second
 *     insert reusing the same temporary `unfuddle_id` was rejected with
 *     Postgres 23505 (unique_violation); exactly one row remained.
 *   - A plain insert immediately *after* the bypass call again produced
 *     exactly one `time_logged` activity row — the transaction-local GUC
 *     did not leak.
 * `import-time-entries/insert-time-entries.ts` already calls this RPC
 * exclusively. `blocksApply` is now `false` on the strength of that
 * evidence — not because the migration file merely exists.
 */
export function auditTimeEntrySchema(): SchemaAudit {
  return {
    hasUnfuddleIdColumn: true,
    hasUpdatedAtColumn: true,
    loggedByNullable: true,
    minutesConstraint: "integer not null check (minutes > 0) — zero/negative hours cannot be inserted",
    activityTrigger: {
      exists: true,
      unconditional: false,
      description:
        "ticket_time_entries_log_activity (AFTER INSERT) skips the ticket_activity insert when jirita.import_bypass_activity_log='true' (verified: 0 rows produced by a controlled bypass test) — unconditional only for ordinary inserts (verified: a plain insert still logs exactly one time_logged row).",
    },
    membershipTrigger: {
      exists: true,
      description: "ticket_time_entries_ensure_membership keys off auth.uid(), null under service-role — verified empirically (0 new project_memberships after a controlled bypass insert).",
    },
    blocksApply: false,
    reason:
      "Resolved and verified live: migration 20260824000000 is deployed, unfuddle_id (unique, nullable) and updated_at (nullable, no default) exist with the 14 pre-existing rows untouched, insert_ticket_time_entries_bypassing_activity_log produces zero time_logged activity rows and preserves every historical field exactly (confirmed with a controlled, cleaned-up test entry, including minutes=6), the unique constraint is enforced, anon cannot execute the RPC, tickets.hours/updated_at are never touched, and the bypass does not leak into a subsequent normal insert. APPLY may proceed via this RPC.",
  };
}
