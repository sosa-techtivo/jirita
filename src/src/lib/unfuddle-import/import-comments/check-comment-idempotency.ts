import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommentIdempotencyResult, ExistingCommentRow, PlannedCommentFields } from "../types/phase4";
import { diffCommentFields } from "./reconcile-comment-rows";
import { findDuplicateGroups } from "../utils/duplicates";

const COMMENT_ROW_COLUMNS = "id, ticket_id, unfuddle_id, body, author_profile_id, created_at, updated_at";

interface CommentRow {
  id: string;
  ticket_id: string;
  unfuddle_id: string | null;
  body: string;
  author_profile_id: string | null;
  created_at: string;
  updated_at: string | null;
}

function toExistingCommentRow(row: CommentRow): ExistingCommentRow {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    unfuddleId: row.unfuddle_id,
    body: row.body,
    authorProfileId: row.author_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `unfuddle_id` is the sole idempotency key (task's explicit instruction —
 * never body/author/timestamp). Comments with identical content but
 * different `unfuddle_id`s are surfaced as a report-only observation, never
 * merged or deduplicated.
 */
export async function checkCommentIdempotency(admin: SupabaseClient, planned: PlannedCommentFields[]): Promise<CommentIdempotencyResult> {
  const unfuddleIds = planned.map((p) => p.unfuddle_id);
  const duplicateUnfuddleIdsInBatch = [...new Set(unfuddleIds.filter((id, i) => unfuddleIds.indexOf(id) !== i))];

  const { data, error } = await admin.from("ticket_comments").select(COMMENT_ROW_COLUMNS).in("unfuddle_id", unfuddleIds);
  if (error) throw new Error(`ticket_comments lookup by unfuddle_id failed: ${error.message}`);

  const existingByUnfuddleId = new Map<string, ExistingCommentRow>();
  for (const row of (data ?? []) as CommentRow[]) {
    if (row.unfuddle_id) existingByUnfuddleId.set(row.unfuddle_id, toExistingCommentRow(row));
  }

  const newComments: PlannedCommentFields[] = [];
  const alreadyImportedMatching: { planned: PlannedCommentFields; existing: ExistingCommentRow }[] = [];
  const conflicting: { planned: PlannedCommentFields; existing: ExistingCommentRow; diffs: string[] }[] = [];

  for (const row of planned) {
    const existing = existingByUnfuddleId.get(row.unfuddle_id);
    if (!existing) {
      newComments.push(row);
      continue;
    }
    const diffs = diffCommentFields(row, existing);
    if (diffs.length === 0) alreadyImportedMatching.push({ planned: row, existing });
    else conflicting.push({ planned: row, existing, diffs });
  }

  const contentGroups = findDuplicateGroups(planned, (p) => `${p.ticket_id}|${p.author_profile_id}|${p.body}`);
  const identicalContentDifferentIds = Array.from(contentGroups.entries()).map(([key, group]) => ({
    key: key.slice(0, 100),
    unfuddleIds: group.map((g) => g.unfuddle_id),
  }));

  const ok = conflicting.length === 0 && duplicateUnfuddleIdsInBatch.length === 0;

  return { newComments, alreadyImportedMatching, conflicting, duplicateUnfuddleIdsInBatch, identicalContentDifferentIds, ok };
}
