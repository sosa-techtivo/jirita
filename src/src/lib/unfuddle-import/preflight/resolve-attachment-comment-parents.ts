import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommentParentResolutionResult } from "../types/phase6";

/**
 * Resolves every comment-level attachment's `parent-id` (an Unfuddle
 * comment id) against the 412 already-imported comments, via
 * `ticket_comments.unfuddle_id` — the same identity-only resolution
 * pattern already used for ticket parents (never re-deriving comment
 * identity any other way, never matching by body/ticket/author).
 */
export async function resolveAttachmentCommentParents(admin: SupabaseClient, ticketIds: string[], referencedCommentUnfuddleIds: number[]): Promise<CommentParentResolutionResult> {
  if (ticketIds.length === 0) {
    return { map: new Map(), missingParents: referencedCommentUnfuddleIds, ok: referencedCommentUnfuddleIds.length === 0 };
  }

  const { data, error } = await admin.from("ticket_comments").select("id, unfuddle_id").in("ticket_id", ticketIds);
  if (error) {
    return { map: new Map(), missingParents: referencedCommentUnfuddleIds, ok: false };
  }

  const byUnfuddleId = new Map<number, string>();
  const ambiguous = new Set<number>();
  for (const row of data ?? []) {
    if (row.unfuddle_id === null) continue;
    const n = Number(row.unfuddle_id);
    if (Number.isNaN(n)) continue;
    if (byUnfuddleId.has(n)) ambiguous.add(n);
    else byUnfuddleId.set(n, row.id);
  }

  const map = new Map<number, string>();
  const missingParents: number[] = [];
  for (const commentUnfuddleId of referencedCommentUnfuddleIds) {
    const commentId = byUnfuddleId.get(commentUnfuddleId);
    if (commentId && !ambiguous.has(commentUnfuddleId)) map.set(commentUnfuddleId, commentId);
    else missingParents.push(commentUnfuddleId);
  }

  return { map, missingParents, ok: missingParents.length === 0 };
}
