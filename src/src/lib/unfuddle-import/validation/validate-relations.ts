import type { Ticket } from "../types/models";
import type { RelationValidationResult } from "../types/report";

const KNOWN_RELATIONSHIP_TYPES = new Set(["parent", "child", "sibling", "related", "duplicate"]);

/**
 * Classifies every Relation declared by an in-scope Ticket's
 * <associated-tickets> block:
 *
 * - invalid: self-referencing (from === to) or an unrecognized relationship
 *   type — a genuine data anomaly, not a scoping question.
 * - valid: the target ticket is itself one of the in-scope (Milestone 183)
 *   Tickets.
 * - external: the target ticket is a real Unfuddle ticket (Unfuddle embeds
 *   a full shallow copy, never a dangling id) that simply belongs to a
 *   different Milestone/Project than the one being migrated.
 */
export function validateRelations(tickets: Ticket[]): RelationValidationResult {
  const inScopeIds = new Set(tickets.map((t) => t.unfuddleId));

  let validCount = 0;
  let invalidCount = 0;
  let externalCount = 0;
  const invalidDetails: string[] = [];
  const externalDetails: string[] = [];

  for (const ticket of tickets) {
    for (const relation of ticket.relations) {
      if (relation.toTicketUnfuddleId === relation.fromTicketUnfuddleId) {
        invalidCount++;
        invalidDetails.push(`Ticket #${ticket.number} (${ticket.unfuddleId}) has a self-referencing "${relation.type}" relation.`);
        continue;
      }
      if (!KNOWN_RELATIONSHIP_TYPES.has(relation.type)) {
        invalidCount++;
        invalidDetails.push(
          `Ticket #${ticket.number} (${ticket.unfuddleId}) has an unrecognized relationship type "${relation.type}" targeting ticket ${relation.toTicketUnfuddleId}.`,
        );
        continue;
      }
      if (inScopeIds.has(relation.toTicketUnfuddleId)) {
        validCount++;
      } else {
        externalCount++;
        externalDetails.push(
          `Ticket #${ticket.number} (${ticket.unfuddleId}) has a "${relation.type}" relation to ticket ${relation.toTicketUnfuddleId}, which is outside Milestone 183.`,
        );
      }
    }
  }

  return { validCount, invalidCount, externalCount, invalidDetails, externalDetails };
}
