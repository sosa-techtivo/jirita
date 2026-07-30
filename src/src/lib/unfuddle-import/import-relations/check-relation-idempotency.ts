import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalRelationCandidate, ExistingJiritaRelation, RelationIdempotencyClassification } from "../types/phase7";

interface RelationRow {
  id: string;
  ticket_id: string;
  related_ticket_id: string;
  kind: string;
  created_at: string;
  created_by: string | null;
  unfuddle_relation_key: string | null;
}

/**
 * Real historical idempotency, now that ticket_relations.unfuddle_relation_key
 * exists (20260826000000, deployed and verified live): each candidate's
 * deterministic key is looked up directly against the table, exactly like
 * every other phase's unfuddle_id-based classification (tickets/comments/
 * time entries/attachments) — not the content-only (ticket_id,
 * related_ticket_id, kind) approximation this module used before the
 * migration existed.
 *
 * The table is small enough (a handful of rows total today) to fetch in
 * full rather than filtering, avoiding any query-string escaping around a
 * large `.in(...)` id list.
 */
export async function checkRelationIdempotency(
  admin: SupabaseClient,
  candidates: CanonicalRelationCandidate[],
): Promise<RelationIdempotencyClassification> {
  const { data } = await admin
    .from("ticket_relations")
    .select("id, ticket_id, related_ticket_id, kind, created_at, created_by, unfuddle_relation_key")
    .returns<RelationRow[]>();

  const existing: ExistingJiritaRelation[] = (data ?? []).map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    relatedTicketId: r.related_ticket_id,
    kind: r.kind,
    createdAt: r.created_at,
    createdBy: r.created_by,
    unfuddleRelationKey: r.unfuddle_relation_key,
  }));

  const byHistoricalKey = new Map<string, ExistingJiritaRelation>();
  for (const e of existing) {
    if (e.unfuddleRelationKey) byHistoricalKey.set(e.unfuddleRelationKey, e);
  }

  // Defensive — canonicalize-relations.ts already guarantees a mirrored
  // pair collapses onto one candidate, so this should always be empty.
  const seenKeysInBatch = new Set<string>();
  const duplicateKeysInBatch: string[] = [];
  for (const c of candidates) {
    if (seenKeysInBatch.has(c.unfuddleRelationKey)) duplicateKeysInBatch.push(c.unfuddleRelationKey);
    seenKeysInBatch.add(c.unfuddleRelationKey);
  }

  const newCandidates: CanonicalRelationCandidate[] = [];
  const alreadyImportedMatching: RelationIdempotencyClassification["alreadyImportedMatching"] = [];
  const conflicting: RelationIdempotencyClassification["conflicting"] = [];
  const matchedExistingIds = new Set<string>();

  for (const c of candidates) {
    const match = byHistoricalKey.get(c.unfuddleRelationKey);
    if (!match) {
      newCandidates.push(c);
      continue;
    }
    matchedExistingIds.add(match.id);
    const diffs: string[] = [];
    if (match.ticketId !== c.plannedTicketId || match.relatedTicketId !== c.plannedRelatedTicketId) {
      diffs.push(`ticket pair: expected (${c.plannedTicketId}, ${c.plannedRelatedTicketId}), got (${match.ticketId}, ${match.relatedTicketId})`);
    }
    if (match.kind !== c.mappedKind) diffs.push(`kind: expected ${c.mappedKind}, got ${match.kind}`);
    if (diffs.length > 0) conflicting.push({ candidate: c, existing: match, diffs });
    else alreadyImportedMatching.push({ candidate: c, existing: match });
  }

  const unrelatedExistingRelationsInJirita = existing.filter((e) => !matchedExistingIds.has(e.id));

  return {
    newCandidates,
    alreadyImportedMatching,
    conflicting,
    duplicateKeysInBatch,
    hasHistoricalIdentity: true,
    unrelatedExistingRelationsInJirita,
  };
}
