import type { Ticket } from "../types/models";
import { CONFIRMED_PRIORITY_MAP, CONFIRMED_STATUS_MAP } from "../config";
import type { MappingError, PlannedTicketFields, TicketMappingResult } from "../types/phase3";

/**
 * Maps the 170 already-materialized Ticket models (Phase 1's parser —
 * never re-implemented here) onto the exact `tickets` insert payload, per
 * the task's field list. Only status/priority values already confirmed by
 * direct evidence are mapped — anything else is a hard per-ticket error,
 * never a guess (STOP RULE).
 */
export function mapTicketRows(
  tickets: Ticket[],
  projectId: string,
  userMap: Map<number, string | null>,
  executedAt: Date,
): TicketMappingResult {
  const planned: PlannedTicketFields[] = [];
  const errors: MappingError[] = [];

  for (const ticket of tickets) {
    const fail = (reason: string) => errors.push({ ticketUnfuddleId: ticket.unfuddleId, ticketNumber: ticket.number, reason });

    if (ticket.number === null) {
      fail(`Ticket ${ticket.unfuddleId} has no ticket number.`);
      continue;
    }
    const status = CONFIRMED_STATUS_MAP[ticket.status];
    if (!status) {
      fail(`Unmapped status "${ticket.status}" on ticket #${ticket.number} (${ticket.unfuddleId}) — not one of the confirmed values.`);
      continue;
    }
    if (ticket.priority === null || !(ticket.priority in CONFIRMED_PRIORITY_MAP)) {
      fail(`Unmapped priority "${ticket.priority}" on ticket #${ticket.number} (${ticket.unfuddleId}) — not one of the confirmed values.`);
      continue;
    }
    if (!ticket.createdAt) {
      fail(`Ticket #${ticket.number} (${ticket.unfuddleId}) has no created_at — refusing to substitute today's date.`);
      continue;
    }
    if (!ticket.updatedAt) {
      fail(`Ticket #${ticket.number} (${ticket.unfuddleId}) has no updated_at — refusing to substitute today's date.`);
      continue;
    }

    const priority = CONFIRMED_PRIORITY_MAP[ticket.priority];
    const createdBy = ticket.reporterUnfuddleId !== null ? userMap.get(ticket.reporterUnfuddleId) ?? null : null;
    const assigneeProfileId = ticket.assigneeUnfuddleId !== null ? userMap.get(ticket.assigneeUnfuddleId) ?? null : null;

    planned.push({
      project_id: projectId,
      unfuddle_id: String(ticket.unfuddleId),
      ticket_number: ticket.number,
      title: ticket.summary,
      description: ticket.description || null,
      status,
      priority,
      created_by: createdBy,
      assignee_profile_id: assigneeProfileId,
      created_at: ticket.createdAt,
      updated_at: ticket.updatedAt,
      due_date: ticket.dueOn,
      hours: ticket.hoursEstimateCurrent,
      unfuddle_imported_at: executedAt.toISOString(),
    });
  }

  return { planned, errors, ok: errors.length === 0 };
}
