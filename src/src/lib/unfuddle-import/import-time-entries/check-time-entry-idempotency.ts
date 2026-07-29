import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingTimeEntryRow, PlannedTimeEntryFields, TimeEntryIdempotencyResult } from "../types/phase5";
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

/**
 * `unfuddle_id` (migration 20260824000000) is the sole idempotency key —
 * never body/ticket/person/date/hours content, per task policy. The three
 * pairs of content-duplicate entries (same ticket/person/date/hours, real
 * duplicate Unfuddle records) are never merged: each distinct unfuddle_id
 * is its own independent candidate row here.
 */
export async function checkTimeEntryIdempotency(admin: SupabaseClient, planned: PlannedTimeEntryFields[]): Promise<TimeEntryIdempotencyResult> {
  const unfuddleIds = planned.map((p) => p.unfuddle_id);
  const duplicateUnfuddleIdsInBatch = [...new Set(unfuddleIds.filter((id, i) => unfuddleIds.indexOf(id) !== i))];

  const { data, error } = await admin.from("ticket_time_entries").select(TIME_ENTRY_ROW_COLUMNS).in("unfuddle_id", unfuddleIds);
  if (error) throw new Error(`ticket_time_entries lookup by unfuddle_id failed: ${error.message}`);

  const existingByUnfuddleId = new Map<string, ExistingTimeEntryRow>();
  for (const row of (data ?? []) as TimeEntryRow[]) {
    if (row.unfuddle_id) existingByUnfuddleId.set(row.unfuddle_id, toExistingTimeEntryRow(row));
  }

  const newEntries: PlannedTimeEntryFields[] = [];
  const alreadyImportedMatching: { planned: PlannedTimeEntryFields; existing: ExistingTimeEntryRow }[] = [];
  const conflicting: { planned: PlannedTimeEntryFields; existing: ExistingTimeEntryRow; diffs: string[] }[] = [];

  for (const row of planned) {
    const existing = existingByUnfuddleId.get(row.unfuddle_id);
    if (!existing) {
      newEntries.push(row);
      continue;
    }
    const diffs = diffTimeEntryFields(row, existing);
    if (diffs.length === 0) alreadyImportedMatching.push({ planned: row, existing });
    else conflicting.push({ planned: row, existing, diffs });
  }

  const ok = conflicting.length === 0 && duplicateUnfuddleIdsInBatch.length === 0;

  return { newEntries, alreadyImportedMatching, conflicting, duplicateUnfuddleIdsInBatch, ok };
}
