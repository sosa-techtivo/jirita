import type { Ticket } from "../types/models";
import type { DuplicateContentGroup } from "../types/phase5";
import { findDuplicateGroups } from "../utils/duplicates";

/**
 * Reports groups of time entries that share identical
 * ticket+person+date+hours+description but have different Unfuddle ids —
 * informational only. Per task policy, these are never merged, never used
 * for idempotency, and every distinct unfuddle_id is still an independent
 * candidate row.
 */
export function findDuplicateContentGroups(tickets: Ticket[]): DuplicateContentGroup[] {
  const entries = tickets.flatMap((t) => t.timeEntries);
  const groups = findDuplicateGroups(entries, (e) => `${e.ticketUnfuddleId}|${e.personUnfuddleId}|${e.date}|${e.hours}|${e.description}`);
  return Array.from(groups.entries()).map(([key, group]) => ({ key, unfuddleIds: group.map((e) => e.unfuddleId) }));
}
