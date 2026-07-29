import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplyOutcome, ExistingTimeEntryRow, PlannedTimeEntryFields } from "../types/phase5";
import { diffTimeEntryFields } from "./reconcile-time-entry-rows";

const TIME_ENTRY_ROW_COLUMNS = "id, ticket_id, unfuddle_id, minutes, work_date, comment, logged_by, created_at, updated_at";

interface TimeEntryRow {
  id: string;
  ticket_id: string;
  unfuddle_id: string | null;
  minutes: number;
  work_date: string;
  comment: string | null;
  logged_by: string | null;
  created_at: string;
  updated_at: string | null;
}

function toExistingTimeEntryRow(row: TimeEntryRow): ExistingTimeEntryRow {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    unfuddleId: row.unfuddle_id,
    minutes: row.minutes,
    workDate: row.work_date,
    comment: row.comment,
    loggedBy: row.logged_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BATCH_SIZE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Inserts only new time entries, in small atomic batches, via
 * `insert_ticket_time_entries_bypassing_activity_log` (supabase/migrations/
 * 20260824000000) — never a plain `.from('ticket_time_entries').insert()`.
 * That RPC sets the same transaction-LOCAL bypass flag tickets/comments
 * already use and performs the insert in the same PostgREST-managed
 * transaction, suppressing only the synthetic `ticket_activity`
 * "time_logged" row `ticket_time_entries_log_activity` would otherwise log
 * with today's date for a historical entry. Each RPC call is one Postgres
 * statement/transaction — all rows in a batch succeed or none do. Stops at
 * the first failing batch, keeps an in-memory record of every
 * `unfuddle_id` actually committed before that point, and never attempts
 * any rollback/delete.
 *
 * NOTE: not invoked by the Phase 5 runner in this task — kept here, fully
 * built and type-checked, for the task that actually runs Phase 5 APPLY
 * once the migration is confirmed live.
 */
export async function insertTimeEntries(admin: SupabaseClient, newEntries: PlannedTimeEntryFields[]): Promise<ApplyOutcome> {
  const insertedUnfuddleIds: string[] = [];
  let inserted = 0;
  let error: string | null = null;

  const batches = chunk(newEntries, BATCH_SIZE);
  for (const batch of batches) {
    const { data, error: insertError } = await admin.rpc("insert_ticket_time_entries_bypassing_activity_log", { entry_rows: batch });
    if (insertError) {
      error = `Batch insert failed after ${inserted}/${newEntries.length} time entries: ${insertError.message}`;
      break;
    }
    const insertedRows = (data ?? []) as unknown as { unfuddle_id: string | null }[];
    for (const row of insertedRows) {
      if (row.unfuddle_id) insertedUnfuddleIds.push(row.unfuddle_id);
    }
    inserted += batch.length;
  }

  const attempted = newEntries.length;
  const failed = error ? attempted - inserted : 0;
  const possiblePartialImport = error !== null && inserted > 0;

  let reconciledOk = 0;
  const reconciliationDiffs: { unfuddleId: string; diffs: string[] }[] = [];

  if (insertedUnfuddleIds.length > 0) {
    const { data: rereadData, error: rereadError } = await admin.from("ticket_time_entries").select(TIME_ENTRY_ROW_COLUMNS).in("unfuddle_id", insertedUnfuddleIds);

    if (rereadError) {
      error = error ?? `Post-insert re-read failed: ${rereadError.message}`;
    } else {
      const byUnfuddleId = new Map((rereadData ?? []).map((r) => [(r as TimeEntryRow).unfuddle_id as string, toExistingTimeEntryRow(r as TimeEntryRow)]));
      const plannedById = new Map(newEntries.map((p) => [p.unfuddle_id, p]));
      for (const unfuddleId of insertedUnfuddleIds) {
        const actual = byUnfuddleId.get(unfuddleId);
        const planned = plannedById.get(unfuddleId);
        if (!actual || !planned) {
          reconciliationDiffs.push({ unfuddleId, diffs: ["row not found on re-read"] });
          continue;
        }
        const diffs = diffTimeEntryFields(planned, actual);
        if (diffs.length === 0) reconciledOk++;
        else reconciliationDiffs.push({ unfuddleId, diffs });
      }
    }
  }

  return {
    attempted,
    inserted,
    skippedAlreadyImported: 0,
    failed,
    possiblePartialImport,
    insertedUnfuddleIds,
    reconciledOk,
    reconciliationDiffs,
    error,
  };
}
