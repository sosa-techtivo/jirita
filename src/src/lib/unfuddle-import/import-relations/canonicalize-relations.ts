import type { CanonicalRelationCandidate, ParentChildOrientation, ResolvedRelation } from "../types/phase7";
import { buildRelationHistoricalKey, orientParentChild } from "./build-relation-key";

/**
 * Collapses every both-resolved ResolvedRelation onto the single planned
 * `ticket_relations` row it would actually produce.
 *
 * Unfuddle stores each relationship twice — once from each ticket's own
 * <associated-tickets> block (e.g. A "child" of B, and, independently, B
 * "parent" of A) — confirmed directly against the raw XML (every global
 * type count is even: sibling 9268, child/parent 264/264, related 178,
 * duplicate 26) and against this batch specifically (38 of the 39
 * KTVibe-sourced records pair up into exactly 19 mirrored A<->B pairs; the
 * 39th has no mirror in this batch because its target ticket is outside the
 * 170 KTVibe tickets — see resolve-relation-tickets.ts).
 *
 * JIRITA's own storage already canonicalizes a symmetric kind
 * (createTicketRelation in src/lib/tickets.ts: `[fromId, toId] =
 * [ticketId, otherTicketId].sort()`, sorted by the JIRITA ticket UUID, not
 * the Unfuddle id) — this function mirrors that exact rule for the planned
 * row shape, so a mirrored XML pair collapses onto the identical single row
 * JIRITA itself would end up storing. Separately, unfuddleRelationKey
 * (built from the Unfuddle ids, not the JIRITA UUIDs — see
 * build-relation-key.ts) is the real historical-identity key persisted in
 * ticket_relations.unfuddle_relation_key (20260826000000) — both mirrored
 * raw records are guaranteed to produce the identical key, verified by the
 * duplicateKeysInBatch check in check-relation-idempotency.ts never firing
 * for this batch.
 */
export function canonicalizeRelations(resolved: ResolvedRelation[]): CanonicalRelationCandidate[] {
  const byKey = new Map<string, CanonicalRelationCandidate>();

  for (const r of resolved) {
    if (r.status !== "both_resolved" || !r.source.ticketId || !r.target.ticketId) continue;

    const [plannedTicketId, plannedRelatedTicketId] = [r.source.ticketId, r.target.ticketId].sort();
    const sourceIsPlannedTicket = plannedTicketId === r.source.ticketId;
    const aEnd = sourceIsPlannedTicket ? r.source : r.target;
    const bEnd = sourceIsPlannedTicket ? r.target : r.source;
    const key = `${plannedTicketId}-${plannedRelatedTicketId}-${r.mappedKind}`;

    const unfuddleRelationKey = buildRelationHistoricalKey(r.source.ticketUnfuddleId, r.target.ticketUnfuddleId, r.raw.type);
    const orientation: ParentChildOrientation | null = orientParentChild(r.source.ticketUnfuddleId, r.target.ticketUnfuddleId, r.raw.type);

    const existing = byKey.get(unfuddleRelationKey);
    if (existing) {
      existing.rawTypes.push(r.raw.type);
      existing.rawRecordCount += 1;
      existing.isMirrored = true;
    } else {
      byKey.set(unfuddleRelationKey, {
        key,
        unfuddleRelationKey,
        plannedTicketId,
        plannedRelatedTicketId,
        aTicketUnfuddleId: aEnd.ticketUnfuddleId,
        bTicketUnfuddleId: bEnd.ticketUnfuddleId,
        aTicketNumber: aEnd.ticketNumber!,
        bTicketNumber: bEnd.ticketNumber!,
        mappedKind: r.mappedKind,
        rawTypes: [r.raw.type],
        rawRecordCount: 1,
        isMirrored: false,
        orientation,
        plannedRow: {
          ticket_id: plannedTicketId,
          related_ticket_id: plannedRelatedTicketId,
          kind: r.mappedKind,
          created_by: null,
          unfuddle_relation_key: unfuddleRelationKey,
        },
      });
    }
  }

  return Array.from(byKey.values());
}
