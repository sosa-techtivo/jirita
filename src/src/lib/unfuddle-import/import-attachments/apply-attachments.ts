import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttachmentApplyBatchSummary, AttachmentApplyOutcome, PlannedAttachmentFields, StorageObjectFinding } from "../types/phase6";
import { uploadAttachment } from "./upload-attachment";

const ATTACHMENT_ROW_COLUMNS = "id, ticket_id, comment_id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at, updated_at, unfuddle_id";
const BATCH_SIZE = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface AttachmentRow {
  id: string;
  ticket_id: string;
  comment_id: string | null;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string | null;
  unfuddle_id: string | null;
}

function diffPlannedVsActual(planned: PlannedAttachmentFields, actual: AttachmentRow): string[] {
  const diffs: string[] = [];
  if (actual.ticket_id !== planned.ticket_id) diffs.push(`ticket_id: expected ${planned.ticket_id} got ${actual.ticket_id}`);
  if (actual.comment_id !== planned.comment_id) diffs.push(`comment_id: expected ${planned.comment_id} got ${actual.comment_id}`);
  if (actual.filename !== planned.filename) diffs.push(`filename: expected ${planned.filename} got ${actual.filename}`);
  if (actual.storage_path !== planned.storage_path) diffs.push(`storage_path: expected ${planned.storage_path} got ${actual.storage_path}`);
  if (actual.size_bytes !== planned.size_bytes) diffs.push(`size_bytes: expected ${planned.size_bytes} got ${actual.size_bytes}`);
  if ((actual.mime_type ?? null) !== (planned.mime_type ?? null)) diffs.push(`mime_type: expected ${planned.mime_type} got ${actual.mime_type}`);
  if (actual.uploaded_by !== null) diffs.push(`uploaded_by: expected null got ${actual.uploaded_by}`);
  if (new Date(actual.created_at).getTime() !== new Date(planned.created_at).getTime()) diffs.push(`created_at: expected ${planned.created_at} got ${actual.created_at}`);
  const plannedUpdated = planned.updated_at ? new Date(planned.updated_at).getTime() : null;
  const actualUpdated = actual.updated_at ? new Date(actual.updated_at).getTime() : null;
  if (plannedUpdated !== actualUpdated) diffs.push(`updated_at: expected ${planned.updated_at} got ${actual.updated_at}`);
  if (actual.unfuddle_id !== planned.unfuddle_id) diffs.push(`unfuddle_id: expected ${planned.unfuddle_id} got ${actual.unfuddle_id}`);
  return diffs;
}

/**
 * Executes the real APPLY for one row at a time — upload confirmed before
 * that row's insert, insert confirmed via an immediate re-select before
 * moving to the next row — grouped into batches of 10 purely for
 * structured progress reporting, never for combining multiple rows into
 * one upload/insert operation. Stops at the very first error (upload,
 * insert, or reconciliation mismatch) and returns everything committed so
 * far, including any orphan object (uploaded, but whose row insert did not
 * complete) — never deletes anything, never retries automatically.
 *
 * Only ever calls `insert_ticket_attachments_bypassing_activity_log` to
 * write rows (never a plain `.insert()`, never upsert, never update).
 * Only ever calls `.storage.upload(..., { upsert: false })` to write
 * objects (never overwrites, never uploads to a path already classified
 * `exists_matching`/`exists_differs`).
 */
export async function applyAttachments(admin: SupabaseClient, bucketId: string, mediaDir: string, newRows: PlannedAttachmentFields[], storageFindings: StorageObjectFinding[]): Promise<AttachmentApplyOutcome> {
  const findingByAttachmentId = new Map(storageFindings.map((f) => [f.attachmentUnfuddleId, f]));

  const insertedUnfuddleIds: string[] = [];
  const orphanObjects: AttachmentApplyOutcome["orphanObjects"] = [];
  const reconciliationDiffs: AttachmentApplyOutcome["reconciliationDiffs"] = [];
  const batches: AttachmentApplyBatchSummary[] = [];

  let uploaded = 0;
  let inserted = 0;
  let reconciledOk = 0;
  let stopError: string | null = null;

  const rowChunks = chunk(newRows, BATCH_SIZE);

  outer: for (let batchIndex = 0; batchIndex < rowChunks.length; batchIndex++) {
    const batchStart = Date.now();
    const batchRows = rowChunks[batchIndex];
    const batchErrors: string[] = [];
    let batchUploaded = 0;
    let batchInserted = 0;
    let batchReconciled = 0;

    for (const planned of batchRows) {
      const finding = findingByAttachmentId.get(planned.attachmentUnfuddleId);
      if (!finding) {
        stopError = `Attachment ${planned.attachmentUnfuddleId}: no Storage idempotency finding available — refusing to guess.`;
        batchErrors.push(stopError);
        break outer;
      }

      if (finding.status === "exists_differs") {
        stopError = `Attachment ${planned.attachmentUnfuddleId}: Storage object at ${planned.storage_path} already exists and differs — conflict, stopping (never overwritten).`;
        batchErrors.push(stopError);
        break outer;
      }

      if (finding.status === "not_exists") {
        const uploadResult = await uploadAttachment(admin, bucketId, mediaDir, planned.attachmentUnfuddleId, planned.storage_path, planned.size_bytes, planned.mime_type);
        if (!uploadResult.ok) {
          stopError = `Attachment ${planned.attachmentUnfuddleId}: upload failed: ${uploadResult.error}`;
          batchErrors.push(stopError);
          break outer;
        }
        uploaded++;
        batchUploaded++;
      }
      // finding.status === "exists_matching": object already there and verified matching by the precheck — do not re-upload, proceed straight to the row insert (classification "B").

      const { data: insertedRows, error: insertError } = await admin.rpc("insert_ticket_attachments_bypassing_activity_log", { attachment_rows: [planned] });
      if (insertError || !insertedRows || insertedRows.length !== 1) {
        stopError = `Attachment ${planned.attachmentUnfuddleId}: row insert failed: ${insertError?.message ?? "no row returned"}`;
        batchErrors.push(stopError);
        if (finding.status === "not_exists") orphanObjects.push({ attachmentUnfuddleId: planned.attachmentUnfuddleId, storagePath: planned.storage_path });
        break outer;
      }
      inserted++;
      batchInserted++;
      insertedUnfuddleIds.push(planned.unfuddle_id);

      const { data: reread, error: rereadError } = await admin.from("ticket_attachments").select(ATTACHMENT_ROW_COLUMNS).eq("unfuddle_id", planned.unfuddle_id).single();
      if (rereadError || !reread) {
        stopError = `Attachment ${planned.attachmentUnfuddleId}: post-insert re-select failed: ${rereadError?.message ?? "row not found"}`;
        batchErrors.push(stopError);
        break outer;
      }
      const diffs = diffPlannedVsActual(planned, reread as AttachmentRow);
      if (diffs.length === 0) {
        reconciledOk++;
        batchReconciled++;
      } else {
        stopError = `Attachment ${planned.attachmentUnfuddleId}: reconciliation mismatch after insert: ${diffs.join("; ")}`;
        reconciliationDiffs.push({ unfuddleId: planned.unfuddle_id, diffs });
        batchErrors.push(stopError);
        break outer;
      }
    }

    batches.push({
      index: batchIndex,
      attachmentUnfuddleIds: batchRows.map((r) => r.attachmentUnfuddleId),
      uploaded: batchUploaded,
      inserted: batchInserted,
      reconciled: batchReconciled,
      errors: batchErrors,
      durationMs: Date.now() - batchStart,
    });

    if (stopError) break;
  }

  const attempted = newRows.length;
  const failed = attempted - inserted;
  const possiblePartialImport = stopError !== null && (uploaded > 0 || inserted > 0);

  return {
    attempted,
    uploaded,
    inserted,
    skippedAlreadyImported: 0,
    failed,
    possiblePartialImport,
    insertedUnfuddleIds,
    orphanObjects,
    reconciledOk,
    reconciliationDiffs,
    batches,
    error: stopError,
  };
}
