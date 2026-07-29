import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplyOutcome, ExistingCommentRow, PlannedCommentFields } from "../types/phase4";
import { diffCommentFields } from "./reconcile-comment-rows";

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

const BATCH_SIZE = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Inserts only new comments, in small atomic batches, via
 * `insert_ticket_comments_bypassing_activity_log` (supabase/migrations/
 * 20260823000000) rather than a plain `.from('ticket_comments').insert(...)`
 * — that RPC sets the same transaction-LOCAL bypass flag tickets already
 * use and performs the insert in the same PostgREST-managed transaction,
 * which suppresses only the synthetic `ticket_activity` "added a comment"
 * row `ticket_comments_log_activity` would otherwise log with today's date
 * for a historical comment. Every other `ticket_comments` trigger still
 * runs unchanged. Each RPC call is one Postgres statement/transaction —
 * all rows in a batch succeed or none do. Stops at the first failing
 * batch, keeps an in-memory record of every `unfuddle_id` actually
 * committed before that point, and never attempts any rollback/delete.
 */
export async function insertComments(admin: SupabaseClient, newComments: PlannedCommentFields[]): Promise<ApplyOutcome> {
  const insertedUnfuddleIds: string[] = [];
  let inserted = 0;
  let error: string | null = null;

  const batches = chunk(newComments, BATCH_SIZE);
  for (const batch of batches) {
    const { data, error: insertError } = await admin.rpc("insert_ticket_comments_bypassing_activity_log", { comment_rows: batch });
    if (insertError) {
      error = `Batch insert failed after ${inserted}/${newComments.length} comments: ${insertError.message}`;
      break;
    }
    const insertedRows = (data ?? []) as unknown as { unfuddle_id: string | null }[];
    for (const row of insertedRows) {
      if (row.unfuddle_id) insertedUnfuddleIds.push(row.unfuddle_id);
    }
    inserted += batch.length;
  }

  const attempted = newComments.length;
  const failed = error ? attempted - inserted : 0;
  const possiblePartialImport = error !== null && inserted > 0;

  let reconciledOk = 0;
  const reconciliationDiffs: { unfuddleId: string; diffs: string[] }[] = [];

  if (insertedUnfuddleIds.length > 0) {
    const { data: rereadData, error: rereadError } = await admin.from("ticket_comments").select(COMMENT_ROW_COLUMNS).in("unfuddle_id", insertedUnfuddleIds);

    if (rereadError) {
      error = error ?? `Post-insert re-read failed: ${rereadError.message}`;
    } else {
      const byUnfuddleId = new Map((rereadData ?? []).map((r) => [(r as CommentRow).unfuddle_id as string, toExistingCommentRow(r as CommentRow)]));
      const plannedById = new Map(newComments.map((p) => [p.unfuddle_id, p]));
      for (const unfuddleId of insertedUnfuddleIds) {
        const actual = byUnfuddleId.get(unfuddleId);
        const planned = plannedById.get(unfuddleId);
        if (!actual || !planned) {
          reconciliationDiffs.push({ unfuddleId, diffs: ["row not found on re-read"] });
          continue;
        }
        const diffs = diffCommentFields(planned, actual);
        if (diffs.length === 0) reconciledOk++;
        else reconciliationDiffs.push({ unfuddleId, diffs });
      }
    }
  }

  return {
    attempted,
    inserted,
    skippedAlreadyImported: 0,
    failed,
    possiblePartialImport,
    insertedUnfuddleIds,
    reconciledOk,
    reconciliationDiffs,
    error,
  };
}
