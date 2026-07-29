import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingTicketRow, PlannedTicketFields, TicketIdempotencyResult } from "../types/phase3";
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

/**
 * `unfuddle_id` is the idempotency key (never `ticket_number` alone, per
 * task's explicit instruction) — but `unique(project_id, ticket_number)` is
 * a real, separate DB constraint, so a ticket_number collision against a
 * row with a *different* (or no) unfuddle_id is checked independently and
 * would make the insert fail regardless of the unfuddle_id-based plan.
 */
export async function checkTicketIdempotency(admin: SupabaseClient, projectId: string, planned: PlannedTicketFields[]): Promise<TicketIdempotencyResult> {
  const unfuddleIds = planned.map((p) => p.unfuddle_id);
  const ticketNumbers = planned.map((p) => p.ticket_number);

  const duplicateUnfuddleIdsInBatch = [...new Set(unfuddleIds.filter((id, i) => unfuddleIds.indexOf(id) !== i))];
  const duplicateTicketNumbersInBatch = [...new Set(ticketNumbers.filter((n, i) => ticketNumbers.indexOf(n) !== i))];

  const { data: byUnfuddleIdData, error: byUnfuddleIdError } = await admin
    .from("tickets")
    .select(TICKET_ROW_COLUMNS)
    .eq("project_id", projectId)
    .in("unfuddle_id", unfuddleIds);
  if (byUnfuddleIdError) throw new Error(`tickets lookup by unfuddle_id failed: ${byUnfuddleIdError.message}`);

  const existingByUnfuddleId = new Map<string, ExistingTicketRow>();
  for (const row of (byUnfuddleIdData ?? []) as TicketRow[]) {
    if (row.unfuddle_id) existingByUnfuddleId.set(row.unfuddle_id, toExistingTicketRow(row));
  }

  const { data: byNumberData, error: byNumberError } = await admin
    .from("tickets")
    .select(TICKET_ROW_COLUMNS)
    .eq("project_id", projectId)
    .in("ticket_number", ticketNumbers);
  if (byNumberError) throw new Error(`tickets lookup by ticket_number failed: ${byNumberError.message}`);

  const existingByNumber = new Map<number, ExistingTicketRow>();
  for (const row of (byNumberData ?? []) as TicketRow[]) {
    existingByNumber.set(row.ticket_number, toExistingTicketRow(row));
  }

  const newTickets: PlannedTicketFields[] = [];
  const alreadyImportedMatching: { planned: PlannedTicketFields; existing: ExistingTicketRow }[] = [];
  const conflicting: { planned: PlannedTicketFields; existing: ExistingTicketRow; diffs: string[] }[] = [];
  const ticketNumberCollisions: { planned: PlannedTicketFields; existing: ExistingTicketRow }[] = [];

  for (const row of planned) {
    const existingByUf = existingByUnfuddleId.get(row.unfuddle_id);
    if (existingByUf) {
      const diffs = diffTicketFields(row, existingByUf);
      if (diffs.length === 0) alreadyImportedMatching.push({ planned: row, existing: existingByUf });
      else conflicting.push({ planned: row, existing: existingByUf, diffs });
      continue;
    }

    // Not found by unfuddle_id — a *different* project ticket already using
    // this exact ticket_number would violate unique(project_id, ticket_number).
    const existingByNum = existingByNumber.get(row.ticket_number);
    if (existingByNum && existingByNum.unfuddleId !== row.unfuddle_id) {
      ticketNumberCollisions.push({ planned: row, existing: existingByNum });
      continue;
    }

    newTickets.push(row);
  }

  const ok = conflicting.length === 0 && ticketNumberCollisions.length === 0 && duplicateUnfuddleIdsInBatch.length === 0 && duplicateTicketNumbersInBatch.length === 0;

  return { newTickets, alreadyImportedMatching, conflicting, ticketNumberCollisions, duplicateTicketNumbersInBatch, duplicateUnfuddleIdsInBatch, ok };
}
