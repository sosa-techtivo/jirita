import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonicalRelationCandidate, RelationApplyOutcome } from "../types/phase7";

interface RelationRow {
  id: string;
  ticket_id: string;
  related_ticket_id: string;
  kind: string;
  created_by: string | null;
  created_at: string;
  unfuddle_relation_key: string | null;
}

function diffRelationFields(planned: CanonicalRelationCandidate, actual: RelationRow): string[] {
  const diffs: string[] = [];
  if (actual.ticket_id !== planned.plannedTicketId) diffs.push(`ticket_id: expected ${planned.plannedTicketId}, got ${actual.ticket_id}`);
  if (actual.related_ticket_id !== planned.plannedRelatedTicketId) diffs.push(`related_ticket_id: expected ${planned.plannedRelatedTicketId}, got ${actual.related_ticket_id}`);
  if (actual.kind !== planned.mappedKind) diffs.push(`kind: expected ${planned.mappedKind}, got ${actual.kind}`);
  if (actual.created_by !== null) diffs.push(`created_by: expected null, got ${actual.created_by}`);
  if (actual.unfuddle_relation_key !== planned.unfuddleRelationKey) {
    diffs.push(`unfuddle_relation_key: expected ${planned.unfuddleRelationKey}, got ${actual.unfuddle_relation_key}`);
  }
  return diffs;
}

/**
 * Inserts every new candidate in ONE call to
 * insert_ticket_relations_bypassing_activity_log (supabase/migrations/
 * 20260826000000-20260828000000) — a single PostgREST-managed transaction,
 * preferred here per this task's own instruction over chunking: the volume
 * is small (19) and the RPC already processes its whole input array
 * atomically (all rows succeed together or the statement fails and none
 * do), so splitting into smaller batches would only reduce atomicity for
 * no benefit. Never touches anything but ticket_relations — no tickets,
 * comments, time entries, attachments, manual activity, memberships, or
 * notifications; created_at is not sent (the RPC doesn't accept it — every
 * row gets the table's own now() default, honestly the import moment, per
 * this task's own instruction not to invent a historical timestamp
 * Unfuddle never provided).
 *
 * Re-reads every inserted row afterward (not just trusting the RPC's own
 * RETURNING) — same discipline every earlier phase's insert function
 * follows (insertComments, applyAttachments, etc.).
 */
export async function applyRelations(admin: SupabaseClient, newCandidates: CanonicalRelationCandidate[]): Promise<RelationApplyOutcome> {
  const start = Date.now();
  const attempted = newCandidates.length;

  const relationRows = newCandidates.map((c) => c.plannedRow);
  const { data, error: insertError } = await admin.rpc("insert_ticket_relations_bypassing_activity_log", { relation_rows: relationRows });

  if (insertError) {
    return {
      attempted,
      inserted: 0,
      insertedKeys: [],
      failed: attempted,
      possiblePartialImport: false,
      reconciledOk: 0,
      reconciliationDiffs: [],
      error: insertError.message,
      durationMs: Date.now() - start,
    };
  }

  const insertedRows = (data ?? []) as unknown as RelationRow[];
  const insertedKeys = insertedRows.map((r) => r.unfuddle_relation_key).filter((k): k is string => Boolean(k));

  let reconciledOk = 0;
  const reconciliationDiffs: RelationApplyOutcome["reconciliationDiffs"] = [];
  const plannedByKey = new Map(newCandidates.map((c) => [c.unfuddleRelationKey, c]));

  if (insertedKeys.length > 0) {
    const { data: rereadData, error: rereadError } = await admin
      .from("ticket_relations")
      .select("id, ticket_id, related_ticket_id, kind, created_by, created_at, unfuddle_relation_key")
      .in("unfuddle_relation_key", insertedKeys)
      .returns<RelationRow[]>();

    if (rereadError) {
      return {
        attempted,
        inserted: insertedRows.length,
        insertedKeys,
        failed: attempted - insertedRows.length,
        possiblePartialImport: insertedRows.length > 0 && insertedRows.length < attempted,
        reconciledOk: 0,
        reconciliationDiffs: [],
        error: `Post-insert re-read failed: ${rereadError.message}`,
        durationMs: Date.now() - start,
      };
    }

    const byKey = new Map((rereadData ?? []).map((r) => [r.unfuddle_relation_key as string, r]));
    for (const key of insertedKeys) {
      const actual = byKey.get(key);
      const planned = plannedByKey.get(key);
      if (!actual || !planned) {
        reconciliationDiffs.push({ unfuddleRelationKey: key, diffs: ["row not found on re-read"] });
        continue;
      }
      const diffs = diffRelationFields(planned, actual);
      if (diffs.length === 0) reconciledOk++;
      else reconciliationDiffs.push({ unfuddleRelationKey: key, diffs });
    }
  }

  return {
    attempted,
    inserted: insertedRows.length,
    insertedKeys,
    failed: attempted - insertedRows.length,
    possiblePartialImport: insertedRows.length > 0 && insertedRows.length < attempted,
    reconciledOk,
    reconciliationDiffs,
    error: null,
    durationMs: Date.now() - start,
  };
}
