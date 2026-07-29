import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplyOutcome, ExistingTicketRow, PlannedTicketFields } from "../types/phase3";
import { diffTicketFields } from "./reconcile-ticket-rows";

const TICKET_ROW_COLUMNS =
  "id, project_id, unfuddle_id, ticket_number, title, description, status, priority, created_by, assignee_profile_id, created_at, updated_at, due_date, hours, unfuddle_imported_at";

interface TicketRow {
  id: string;
  project_id: string;
  unfuddle_id: string | null;
  ticket_number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_by: string | null;
  assignee_profile_id: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  hours: number | string | null;
  unfuddle_imported_at: string | null;
}

function toExistingTicketRow(row: TicketRow): ExistingTicketRow {
  return {
    id: row.id,
    projectId: row.project_id,
    unfuddleId: row.unfuddle_id,
    ticketNumber: row.ticket_number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdBy: row.created_by,
    assigneeProfileId: row.assignee_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dueDate: row.due_date,
    hours: row.hours !== null ? Number(row.hours) : null,
    unfuddleImportedAt: row.unfuddle_imported_at,
  };
}

const BATCH_SIZE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Inserts only new tickets, in small atomic batches, via
 * `insert_tickets_bypassing_activity_log` (supabase/migrations/
 * 20260822000000) rather than a plain `.from('tickets').insert(...)` —
 * that RPC sets a transaction-LOCAL flag and performs the insert in the
 * same PostgREST-managed transaction, which suppresses only the synthetic
 * `ticket_activity` "ticket_created" row `tickets_log_created` would
 * otherwise log with today's date for a historical ticket. Every other
 * `tickets` trigger still runs unchanged. Each RPC call is one Postgres
 * statement/transaction — all rows in a batch succeed or none do. Stops at
 * the first failing batch, keeps an in-memory record of every
 * `unfuddle_id` actually committed before that point, and never attempts
 * any rollback/delete — a partial import is reported, not silently hidden
 * or "fixed" destructively.
 */
export async function insertTickets(admin: SupabaseClient, projectId: string, newTickets: PlannedTicketFields[]): Promise<ApplyOutcome> {
  const insertedUnfuddleIds: string[] = [];
  let inserted = 0;
  let error: string | null = null;

  const batches = chunk(newTickets, BATCH_SIZE);
  for (const batch of batches) {
    const { data, error: insertError } = await admin.rpc("insert_tickets_bypassing_activity_log", { ticket_rows: batch });
    if (insertError) {
      error = `Batch insert failed after ${inserted}/${newTickets.length} tickets: ${insertError.message}`;
      break;
    }
    const insertedRows = (data ?? []) as unknown as { unfuddle_id: string | null }[];
    for (const row of insertedRows) {
      if (row.unfuddle_id) insertedUnfuddleIds.push(row.unfuddle_id);
    }
    inserted += batch.length;
  }

  const attempted = newTickets.length;
  const failed = error ? attempted - inserted : 0;
  const possiblePartialImport = error !== null && inserted > 0;

  let reconciledOk = 0;
  const reconciliationDiffs: { unfuddleId: string; diffs: string[] }[] = [];

  if (insertedUnfuddleIds.length > 0) {
    const { data: rereadData, error: rereadError } = await admin
      .from("tickets")
      .select(TICKET_ROW_COLUMNS)
      .eq("project_id", projectId)
      .in("unfuddle_id", insertedUnfuddleIds);

    if (rereadError) {
      error = error ?? `Post-insert re-read failed: ${rereadError.message}`;
    } else {
      const byUnfuddleId = new Map((rereadData ?? []).map((r) => [(r as TicketRow).unfuddle_id as string, toExistingTicketRow(r as TicketRow)]));
      const plannedById = new Map(newTickets.map((p) => [p.unfuddle_id, p]));
      for (const unfuddleId of insertedUnfuddleIds) {
        const actual = byUnfuddleId.get(unfuddleId);
        const planned = plannedById.get(unfuddleId);
        if (!actual || !planned) {
          reconciliationDiffs.push({ unfuddleId, diffs: ["row not found on re-read"] });
          continue;
        }
        const diffs = diffTicketFields(planned, actual);
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
