// Orchestrates the backfill across both attachment tables — drains
// ticket_attachments first, then project_note_attachments, each in small
// keyset-paginated batches (default 20 rows/batch) processed one row at a
// time (never Promise.all across a batch) to keep memory, Storage egress,
// and request concurrency low, as required. Idempotent by construction:
// every row this loop can ever see already satisfies thumbnail_path IS
// NULL (candidates.ts's own filter), so a row that completed on a prior
// run — in this process or an earlier one — is never re-fetched, let alone
// reprocessed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNoteAttachmentCandidates, fetchTicketAttachmentCandidates } from "./candidates";
import { processCandidate } from "./process-candidate";
import { emptyTableSummary, type AttachmentTable, type BackfillReport, type CandidateRow, type FailureDetail, type TableSummary } from "./types";

const DEFAULT_BATCH_SIZE = 20;

function applyOutcome(summary: TableSummary, result: Awaited<ReturnType<typeof processCandidate>>, mode: "preview" | "apply"): void {
  summary.candidates += 1;
  const { outcome } = result;
  if (outcome.kind === "skipped-not-image") {
    summary.skippedNotImage += 1;
    return;
  }
  summary.attempted += 1;
  if (outcome.kind === "self-thumbnail") {
    // <=600px — thumbnail_path becomes storage_path itself. This IS a
    // write in apply mode (see process-candidate.ts's persistThumbnailPath
    // call on this branch), even though no new Storage object exists.
    summary.selfThumbnail += 1;
    if (mode === "apply") summary.rowsUpdated += 1;
    return;
  }
  if (outcome.kind === "failed") {
    summary.failed += 1;
    return;
  }
  // kind === "created"
  summary.created += 1;
  if (mode === "apply") summary.rowsUpdated += 1;
}

async function drainTable(
  admin: SupabaseClient,
  table: AttachmentTable,
  mode: "preview" | "apply",
  batchSize: number,
  summary: TableSummary,
  failures: FailureDetail[],
  onRow?: (row: CandidateRow, result: Awaited<ReturnType<typeof processCandidate>>) => void
): Promise<void> {
  let afterId: string | null = null;
  for (;;) {
    const batch: CandidateRow[] =
      table === "ticket_attachments"
        ? await fetchTicketAttachmentCandidates(admin, afterId, batchSize)
        : await fetchNoteAttachmentCandidates(admin, afterId, batchSize);

    if (batch.length === 0) break;

    for (const row of batch) {
      // processCandidate reports its own failures as a typed outcome
      // (never throws for an expected failure mode) — this try/catch is a
      // second, belt-and-suspenders guard against any *unexpected*
      // exception (e.g. a transient network error a library throws
      // instead of returning), so one bad row can truly never abort the
      // rest of the backfill.
      let result: Awaited<ReturnType<typeof processCandidate>>;
      try {
        result = await processCandidate(admin, row, mode);
      } catch (err) {
        result = { row, outcome: { kind: "failed", stage: "download", message: err instanceof Error ? err.message : String(err) } };
      }
      applyOutcome(summary, result, mode);
      if (result.outcome.kind === "failed") {
        failures.push({ table: row.table, id: row.id, storagePath: row.storagePath, stage: result.outcome.stage, message: result.outcome.message });
      }
      onRow?.(row, result);
      afterId = row.id;
    }

    if (batch.length < batchSize) break;
  }
}

export interface RunBackfillOptions {
  mode: "preview" | "apply";
  batchSize?: number;
  /** Optional per-row callback — runner/backfill-run.ts uses this for
   *  live progress output on large backfills; unused (and harmless to
   *  omit) for a plain summary-only run. */
  onRow?: (row: CandidateRow, result: Awaited<ReturnType<typeof processCandidate>>) => void;
}

export async function runBackfill(admin: SupabaseClient, options: RunBackfillOptions): Promise<BackfillReport> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const start = Date.now();

  const perTable: Record<AttachmentTable, TableSummary> = {
    ticket_attachments: emptyTableSummary(),
    project_note_attachments: emptyTableSummary(),
  };
  const failures: FailureDetail[] = [];

  await drainTable(admin, "ticket_attachments", options.mode, batchSize, perTable.ticket_attachments, failures, options.onRow);
  await drainTable(admin, "project_note_attachments", options.mode, batchSize, perTable.project_note_attachments, failures, options.onRow);

  const total = emptyTableSummary();
  for (const key of Object.keys(perTable) as AttachmentTable[]) {
    const t = perTable[key];
    total.candidates += t.candidates;
    total.attempted += t.attempted;
    total.created += t.created;
    total.selfThumbnail += t.selfThumbnail;
    total.skippedNotImage += t.skippedNotImage;
    total.failed += t.failed;
    total.rowsUpdated += t.rowsUpdated;
  }

  return {
    mode: options.mode,
    batchSize,
    perTable,
    total,
    failures,
    elapsedMs: Date.now() - start,
  };
}
