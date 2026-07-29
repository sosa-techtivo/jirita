import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlannedAttachmentFields } from "../types/phase6";

export interface PostApplyDbReconciliation {
  totalHistoricalRows: number;
  distinctUnfuddleIds: number;
  unexpectedUnfuddleIds: string[];
  ticketLevelCount: number;
  commentLevelCount: number;
  /** Distinct ticket_id across ALL 250 rows (direct + via-comment) — 75, confirmed against the parsed XML independently of this query. */
  distinctTicketsWithAnyAttachment: number;
  /** Distinct ticket_id among the 70 comment_id=null rows only — the narrower "53 tickets con adjuntos" figure from computeAttachmentStats/xmlStats, which only ever counted direct ticket-level attachments. */
  distinctTicketsWithDirectAttachment: number;
  distinctCommentsWithAttachments: number;
  ticketsNotInKTVibe: string[];
  commentsBelongingToWrongTicket: { attachmentUnfuddleId: string; commentId: string; commentTicketId: string; attachmentTicketId: string }[];
  ticket651DueDateStillDrifted: boolean;
  preexistingNonHistoricalRowsUnchanged: boolean;
  ok: boolean;
  issues: string[];
}

const ATTACHMENT_COLUMNS = "id, ticket_id, comment_id, unfuddle_id";

/** Read-only, run once after APPLY completes. Aggregate/structural checks not already covered by the per-row reconciliation apply-attachments.ts performs during the insert itself. */
export async function reconcilePostApplyDb(admin: SupabaseClient, ktvibeTicketIds: string[], expectedUnfuddleIds: string[], preexistingCountBefore: number): Promise<PostApplyDbReconciliation> {
  const issues: string[] = [];

  const { data: rows, error } = await admin.from("ticket_attachments").select(ATTACHMENT_COLUMNS).in("unfuddle_id", expectedUnfuddleIds);
  if (error) {
    issues.push(`Query failed: ${error.message}`);
    return {
      totalHistoricalRows: 0,
      distinctUnfuddleIds: 0,
      unexpectedUnfuddleIds: [],
      ticketLevelCount: 0,
      commentLevelCount: 0,
      distinctTicketsWithAnyAttachment: 0,
      distinctTicketsWithDirectAttachment: 0,
      distinctCommentsWithAttachments: 0,
      ticketsNotInKTVibe: [],
      commentsBelongingToWrongTicket: [],
      ticket651DueDateStillDrifted: false,
      preexistingNonHistoricalRowsUnchanged: false,
      ok: false,
      issues,
    };
  }

  const totalHistoricalRows = rows?.length ?? 0;
  const unfuddleIdSet = new Set((rows ?? []).map((r) => r.unfuddle_id as string));
  const distinctUnfuddleIds = unfuddleIdSet.size;
  const expectedSet = new Set(expectedUnfuddleIds);
  const unexpectedUnfuddleIds = [...unfuddleIdSet].filter((id) => !expectedSet.has(id));

  const ticketIdSet = new Set(ktvibeTicketIds);
  const ticketsNotInKTVibe = (rows ?? []).filter((r) => !ticketIdSet.has(r.ticket_id as string)).map((r) => r.ticket_id as string);

  const ticketLevelCount = (rows ?? []).filter((r) => r.comment_id === null).length;
  const commentLevelCount = (rows ?? []).filter((r) => r.comment_id !== null).length;
  const distinctTicketsWithAnyAttachment = new Set((rows ?? []).map((r) => r.ticket_id as string)).size;
  const distinctTicketsWithDirectAttachment = new Set((rows ?? []).filter((r) => r.comment_id === null).map((r) => r.ticket_id as string)).size;
  const distinctCommentsWithAttachments = new Set((rows ?? []).filter((r) => r.comment_id !== null).map((r) => r.comment_id as string)).size;

  const commentIds = [...new Set((rows ?? []).filter((r) => r.comment_id !== null).map((r) => r.comment_id as string))];
  const commentsBelongingToWrongTicket: PostApplyDbReconciliation["commentsBelongingToWrongTicket"] = [];
  if (commentIds.length > 0) {
    const { data: comments } = await admin.from("ticket_comments").select("id, ticket_id").in("id", commentIds);
    const commentTicketById = new Map((comments ?? []).map((c) => [c.id as string, c.ticket_id as string]));
    for (const row of rows ?? []) {
      if (row.comment_id === null) continue;
      const commentTicketId = commentTicketById.get(row.comment_id as string);
      if (commentTicketId && commentTicketId !== row.ticket_id) {
        commentsBelongingToWrongTicket.push({ attachmentUnfuddleId: row.unfuddle_id as string, commentId: row.comment_id as string, commentTicketId, attachmentTicketId: row.ticket_id as string });
      }
    }
  }

  const { data: ticket651 } = await admin.from("tickets").select("due_date").eq("unfuddle_id", "11697").single();
  const ticket651DueDateStillDrifted = ticket651?.due_date === "2026-06-01";
  if (!ticket651DueDateStillDrifted) issues.push(`Ticket #651 (unfuddle_id 11697) due_date is "${ticket651?.due_date}" — expected the already-known live drift "2026-06-01" to remain untouched.`);

  const { count: nonHistoricalCountAfter } = await admin.from("ticket_attachments").select("id", { count: "exact", head: true }).is("unfuddle_id", null);
  const preexistingNonHistoricalRowsUnchanged = (nonHistoricalCountAfter ?? -1) === preexistingCountBefore;
  if (!preexistingNonHistoricalRowsUnchanged) issues.push(`Pre-existing non-historical ticket_attachments count changed: before=${preexistingCountBefore} after=${nonHistoricalCountAfter}.`);

  if (totalHistoricalRows !== 250) issues.push(`Expected exactly 250 historical rows, found ${totalHistoricalRows}.`);
  if (distinctUnfuddleIds !== totalHistoricalRows) issues.push(`unfuddle_id is not unique across the historical rows: ${totalHistoricalRows} rows, ${distinctUnfuddleIds} distinct ids.`);
  if (unexpectedUnfuddleIds.length > 0) issues.push(`${unexpectedUnfuddleIds.length} unfuddle_id(s) outside the expected 250: ${unexpectedUnfuddleIds.join(", ")}.`);
  if (ticketsNotInKTVibe.length > 0) issues.push(`${ticketsNotInKTVibe.length} row(s) reference a ticket outside KTVibe.`);
  if (commentsBelongingToWrongTicket.length > 0) issues.push(`${commentsBelongingToWrongTicket.length} row(s) have a comment_id belonging to a different ticket than their own ticket_id.`);
  if (ticketLevelCount !== 70) issues.push(`Expected 70 ticket-level rows, found ${ticketLevelCount}.`);
  if (commentLevelCount !== 180) issues.push(`Expected 180 comment-level rows, found ${commentLevelCount}.`);
  // 53 ("tickets con adjuntos") was always computeAttachmentStats' ticket-LEVEL-only
  // count (t.attachments.length > 0) — it never included tickets whose only
  // attachment coverage comes through a comment. The true distinct-ticket
  // count across all 250 rows is 75 (independently confirmed against the
  // parsed XML: 53 tickets have a direct attachment, 42 have a comment-level
  // one, 20 have both -> union 75) — that number, not 53, is what a query
  // over ALL 250 rows should be compared against.
  if (distinctTicketsWithDirectAttachment !== 53) issues.push(`Expected 53 distinct tickets with a direct (ticket-level) attachment, found ${distinctTicketsWithDirectAttachment}.`);
  if (distinctTicketsWithAnyAttachment !== 75) issues.push(`Expected 75 distinct tickets with any attachment (direct or via a comment), found ${distinctTicketsWithAnyAttachment}.`);
  if (distinctCommentsWithAttachments !== 78) issues.push(`Expected 78 distinct comments with attachments, found ${distinctCommentsWithAttachments}.`);

  return {
    totalHistoricalRows,
    distinctUnfuddleIds,
    unexpectedUnfuddleIds,
    ticketLevelCount,
    commentLevelCount,
    distinctTicketsWithAnyAttachment,
    distinctTicketsWithDirectAttachment,
    distinctCommentsWithAttachments,
    ticketsNotInKTVibe,
    commentsBelongingToWrongTicket,
    ticket651DueDateStillDrifted,
    preexistingNonHistoricalRowsUnchanged,
    ok: issues.length === 0,
    issues,
  };
}

export interface PostApplyStorageReconciliation {
  expectedPaths: number;
  foundPaths: number;
  missingPaths: string[];
  unexpectedExtraObjects: string[];
  distinctPaths: number;
  sizeMismatches: { attachmentUnfuddleId: number; storagePath: string; expected: number; actual: number | null }[];
  ok: boolean;
  issues: string[];
}

/** Lists every affected ticket folder fully (paginated, 1000-per-page — well above the 250-object total) and cross-checks against the planned paths. */
export async function reconcilePostApplyStorage(admin: SupabaseClient, bucketId: string, planned: PlannedAttachmentFields[]): Promise<PostApplyStorageReconciliation> {
  const issues: string[] = [];
  const expectedByPath = new Map(planned.map((p) => [p.storage_path, p]));
  const folders = [...new Set(planned.map((p) => p.ticket_id))];
  const storage = admin.storage.from(bucketId);

  const actualPaths = new Set<string>();
  const sizeByPath = new Map<string, number | null>();
  for (const folder of folders) {
    let offset = 0;
    for (;;) {
      const { data, error } = await storage.list(folder, { limit: 1000, offset });
      if (error) {
        issues.push(`Storage list failed for folder ${folder}: ${error.message}`);
        break;
      }
      for (const obj of data ?? []) {
        const full = `${folder}/${obj.name}`;
        actualPaths.add(full);
        sizeByPath.set(full, obj.metadata?.size ?? null);
      }
      if (!data || data.length < 1000) break;
      offset += 1000;
    }
  }

  const missingPaths = [...expectedByPath.keys()].filter((p) => !actualPaths.has(p));
  const unexpectedExtraObjects = [...actualPaths].filter((p) => !expectedByPath.has(p));
  const sizeMismatches: PostApplyStorageReconciliation["sizeMismatches"] = [];
  for (const [path_, planned_] of expectedByPath) {
    const actualSize = sizeByPath.get(path_);
    if (actualSize !== undefined && actualSize !== planned_.size_bytes) {
      sizeMismatches.push({ attachmentUnfuddleId: planned_.attachmentUnfuddleId, storagePath: path_, expected: planned_.size_bytes, actual: actualSize });
    }
  }

  if (missingPaths.length > 0) issues.push(`${missingPaths.length} expected path(s) not found in Storage: ${missingPaths.slice(0, 10).join(", ")}${missingPaths.length > 10 ? "..." : ""}.`);
  if (unexpectedExtraObjects.length > 0) issues.push(`${unexpectedExtraObjects.length} unexpected object(s) found under the affected folders: ${unexpectedExtraObjects.slice(0, 10).join(", ")}${unexpectedExtraObjects.length > 10 ? "..." : ""}.`);
  if (sizeMismatches.length > 0) issues.push(`${sizeMismatches.length} object(s) have a remote size different from the planned size_bytes.`);
  if (actualPaths.size !== 250) issues.push(`Expected exactly 250 objects under the affected folders, found ${actualPaths.size}.`);

  return {
    expectedPaths: expectedByPath.size,
    foundPaths: actualPaths.size,
    missingPaths,
    unexpectedExtraObjects,
    distinctPaths: actualPaths.size,
    sizeMismatches,
    ok: issues.length === 0,
    issues,
  };
}
