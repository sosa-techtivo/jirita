import type { ExistingCommentRow, PlannedCommentFields } from "../types/phase4";

/** Compares every field this importer controls. Used for both the idempotent-replay check and post-APPLY reconciliation. */
export function diffCommentFields(planned: PlannedCommentFields, actual: ExistingCommentRow): string[] {
  const diffs: string[] = [];
  const compare = (label: string, expected: unknown, got: unknown) => {
    if (expected !== got) diffs.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  };

  compare("ticket_id", planned.ticket_id, actual.ticketId);
  compare("unfuddle_id", planned.unfuddle_id, actual.unfuddleId);
  compare("body", planned.body, actual.body);
  compare("author_profile_id", planned.author_profile_id, actual.authorProfileId);

  if (new Date(planned.created_at).getTime() !== new Date(actual.createdAt).getTime()) {
    diffs.push(`created_at: expected ${planned.created_at}, got ${actual.createdAt}`);
  }
  const actualUpdatedAt = actual.updatedAt;
  if (!actualUpdatedAt || new Date(planned.updated_at).getTime() !== new Date(actualUpdatedAt).getTime()) {
    diffs.push(`updated_at: expected ${planned.updated_at}, got ${actualUpdatedAt}`);
  }

  return diffs;
}
