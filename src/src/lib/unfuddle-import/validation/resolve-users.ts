import type { Ticket, UserReference } from "../types/models";
import type { UserResolutionResult } from "../types/report";

/**
 * Resolves every Person reference found on the in-scope Tickets (assignee,
 * reporter, comment author, time-entry person) against the backup's own
 * People list.
 *
 * This is a purely internal, backup-only integrity check — per the task's
 * explicit "NO conectarse a Supabase" constraint, it never compares against
 * live Jirita data. "Nonexistent" means the referenced Unfuddle person id
 * has no matching <person> anywhere in backup.xml; "orphaned" means it
 * resolves to a Person flagged `is-removed` (a former Unfuddle account —
 * still a real match, but one that will need `organization_memberships`
 * handling on import per docs/UNFUDDLE_IMPORT_SPECIFICATION.md §5).
 */
export function resolveUsers(tickets: Ticket[], users: UserReference[]): UserResolutionResult {
  const byId = new Map(users.map((u) => [u.unfuddleId, u]));

  const referenced = new Map<number, string[]>();
  const reference = (id: number | null, context: string) => {
    if (id === null) return;
    const contexts = referenced.get(id);
    if (contexts) contexts.push(context);
    else referenced.set(id, [context]);
  };

  for (const ticket of tickets) {
    reference(ticket.assigneeUnfuddleId, `ticket #${ticket.number} assignee`);
    reference(ticket.reporterUnfuddleId, `ticket #${ticket.number} reporter`);
    for (const comment of ticket.comments) {
      reference(comment.authorUnfuddleId, `comment ${comment.unfuddleId} author`);
    }
    for (const entry of ticket.timeEntries) {
      reference(entry.personUnfuddleId, `time entry ${entry.unfuddleId} person`);
    }
  }

  const resolvedUnfuddleIds: number[] = [];
  const nonexistentUnfuddleIds: number[] = [];
  const orphanedUnfuddleIds: number[] = [];
  const warnings: string[] = [];

  for (const [id, contexts] of referenced) {
    const person = byId.get(id);
    if (!person) {
      nonexistentUnfuddleIds.push(id);
      warnings.push(
        `Person id ${id} referenced by ${contexts.length} record(s) (e.g. ${contexts[0]}) does not exist in the backup's People list.`,
      );
      continue;
    }
    resolvedUnfuddleIds.push(id);
    if (person.isRemoved) {
      orphanedUnfuddleIds.push(id);
      warnings.push(
        `Person id ${id} (${person.email || "no email"}) is flagged is-removed and is referenced by ${contexts.length} record(s).`,
      );
    }
  }

  for (const person of users) {
    if (!person.email) {
      warnings.push(`Person id ${person.unfuddleId} has no email — the only field the audit guarantees on all records.`);
    }
  }

  const emailCounts = new Map<string, number>();
  for (const person of users) {
    if (!person.email) continue;
    emailCounts.set(person.email, (emailCounts.get(person.email) ?? 0) + 1);
  }
  for (const [email, count] of emailCounts) {
    if (count > 1) warnings.push(`Email ${email} is shared by ${count} People records.`);
  }

  return {
    resolvedUnfuddleIds: resolvedUnfuddleIds.sort((a, b) => a - b),
    nonexistentUnfuddleIds: nonexistentUnfuddleIds.sort((a, b) => a - b),
    orphanedUnfuddleIds: orphanedUnfuddleIds.sort((a, b) => a - b),
    warnings,
  };
}
