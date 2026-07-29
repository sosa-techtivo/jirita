import type { ExistingTimeEntryRow, PlannedTimeEntryFields } from "../types/phase5";

/** Compares every field this importer controls. Used for both the idempotent-replay check and post-APPLY reconciliation. */
export function diffTimeEntryFields(planned: PlannedTimeEntryFields, actual: ExistingTimeEntryRow): string[] {
  const diffs: string[] = [];
  const compare = (label: string, expected: unknown, got: unknown) => {
    if (expected !== got) diffs.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  };

  compare("ticket_id", planned.ticket_id, actual.ticketId);
  compare("unfuddle_id", planned.unfuddle_id, actual.unfuddleId);
  compare("minutes", planned.minutes, actual.minutes);
  compare("work_date", planned.work_date, actual.workDate);
  compare("comment", planned.comment, actual.comment);
  compare("logged_by", planned.logged_by, actual.loggedBy);

  if (new Date(planned.created_at).getTime() !== new Date(actual.createdAt).getTime()) {
    diffs.push(`created_at: expected ${planned.created_at}, got ${actual.createdAt}`);
  }

  const plannedUpdatedAtTime = planned.updated_at ? new Date(planned.updated_at).getTime() : null;
  const actualUpdatedAtTime = actual.updatedAt ? new Date(actual.updatedAt).getTime() : null;
  if (plannedUpdatedAtTime !== actualUpdatedAtTime) {
    diffs.push(`updated_at: expected ${planned.updated_at}, got ${actual.updatedAt}`);
  }

  return diffs;
}
