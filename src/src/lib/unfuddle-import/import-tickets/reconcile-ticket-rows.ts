import type { ExistingTicketRow, PlannedTicketFields } from "../types/phase3";

/** Compares every field this importer controls. Used both for the idempotent-replay check and post-APPLY reconciliation. */
export function diffTicketFields(planned: PlannedTicketFields, actual: ExistingTicketRow): string[] {
  const diffs: string[] = [];
  const compare = (label: string, expected: unknown, got: unknown) => {
    if (expected !== got) diffs.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  };

  compare("project_id", planned.project_id, actual.projectId);
  compare("unfuddle_id", planned.unfuddle_id, actual.unfuddleId);
  compare("ticket_number", planned.ticket_number, actual.ticketNumber);
  compare("title", planned.title, actual.title);
  compare("description", planned.description, actual.description);
  compare("status", planned.status, actual.status);
  compare("priority", planned.priority, actual.priority);
  compare("created_by", planned.created_by, actual.createdBy);
  compare("assignee_profile_id", planned.assignee_profile_id, actual.assigneeProfileId);
  compare("due_date", planned.due_date, actual.dueDate);
  compare("hours", planned.hours, actual.hours !== null ? Number(actual.hours) : null);

  if (new Date(planned.created_at).getTime() !== new Date(actual.createdAt).getTime()) {
    diffs.push(`created_at: expected ${planned.created_at}, got ${actual.createdAt}`);
  }
  if (new Date(planned.updated_at).getTime() !== new Date(actual.updatedAt).getTime()) {
    diffs.push(`updated_at: expected ${planned.updated_at}, got ${actual.updatedAt}`);
  }

  return diffs;
}
