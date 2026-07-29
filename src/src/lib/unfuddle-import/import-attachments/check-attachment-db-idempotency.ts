import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttachmentDbIdempotencyResult, ExistingAttachmentRow, PlannedAttachmentFields } from "../types/phase6";

/**
 * Executed for real every Phase 6 PREVIEW run (see run-attachment-precheck.ts)
 * now that migration 20260825000000 is live. Read-only. Classifies each
 * planned row by `unfuddle_id` alone — the project's non-negotiable
 * identity key, never a content hash and never a composite of other
 * fields — into exactly one of: new, already imported and matching, or
 * conflicting (same unfuddle_id, different field values). Never updates an
 * existing row; that decision belongs to a future APPLY, not this
 * classification.
 */
export async function checkAttachmentDbIdempotency(admin: SupabaseClient, planned: PlannedAttachmentFields[]): Promise<{ result: AttachmentDbIdempotencyResult | null; error: string | null }> {
  const seen = new Set<string>();
  const duplicateUnfuddleIdsInBatch: string[] = [];
  for (const p of planned) {
    if (seen.has(p.unfuddle_id)) duplicateUnfuddleIdsInBatch.push(p.unfuddle_id);
    else seen.add(p.unfuddle_id);
  }

  if (planned.length === 0) {
    return { result: { newRows: [], alreadyImportedMatching: [], conflicting: [], duplicateUnfuddleIdsInBatch, ok: duplicateUnfuddleIdsInBatch.length === 0 }, error: null };
  }

  const { data, error } = await admin
    .from("ticket_attachments")
    .select("id, ticket_id, comment_id, unfuddle_id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at, updated_at")
    .in(
      "unfuddle_id",
      planned.map((p) => p.unfuddle_id),
    );

  if (error) return { result: null, error: error.message };

  const existingByUnfuddleId = new Map<string, ExistingAttachmentRow>();
  for (const row of data ?? []) {
    if (row.unfuddle_id === null) continue;
    existingByUnfuddleId.set(row.unfuddle_id, {
      id: row.id,
      ticketId: row.ticket_id,
      commentId: row.comment_id,
      unfuddleId: row.unfuddle_id,
      filename: row.filename,
      storagePath: row.storage_path,
      sizeBytes: row.size_bytes,
      mimeType: row.mime_type,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  const newRows: PlannedAttachmentFields[] = [];
  const alreadyImportedMatching: AttachmentDbIdempotencyResult["alreadyImportedMatching"] = [];
  const conflicting: AttachmentDbIdempotencyResult["conflicting"] = [];

  for (const p of planned) {
    const existing = existingByUnfuddleId.get(p.unfuddle_id);
    if (!existing) {
      newRows.push(p);
      continue;
    }

    const diffs: string[] = [];
    if (existing.ticketId !== p.ticket_id) diffs.push(`ticket_id: existing=${existing.ticketId} planned=${p.ticket_id}`);
    if (existing.commentId !== p.comment_id) diffs.push(`comment_id: existing=${existing.commentId} planned=${p.comment_id}`);
    if (existing.filename !== p.filename) diffs.push(`filename: existing=${existing.filename} planned=${p.filename}`);
    if (existing.storagePath !== p.storage_path) diffs.push(`storage_path: existing=${existing.storagePath} planned=${p.storage_path}`);
    if (existing.sizeBytes !== p.size_bytes) diffs.push(`size_bytes: existing=${existing.sizeBytes} planned=${p.size_bytes}`);
    if (existing.mimeType !== p.mime_type) diffs.push(`mime_type: existing=${existing.mimeType} planned=${p.mime_type}`);
    if (existing.uploadedBy !== p.uploaded_by) diffs.push(`uploaded_by: existing=${existing.uploadedBy} planned=${p.uploaded_by}`);
    // Postgres round-trips timestamptz as "...+00:00"; the planned value from
    // the XML parser is "...Z" — same instant, different string. Compare by
    // value, not by raw string, or every row would falsely show a conflict.
    if (new Date(existing.createdAt).getTime() !== new Date(p.created_at).getTime()) diffs.push(`created_at: existing=${existing.createdAt} planned=${p.created_at}`);
    const existingUpdatedMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : null;
    const plannedUpdatedMs = p.updated_at ? new Date(p.updated_at).getTime() : null;
    if (existingUpdatedMs !== plannedUpdatedMs) diffs.push(`updated_at: existing=${existing.updatedAt} planned=${p.updated_at}`);

    if (diffs.length === 0) alreadyImportedMatching.push({ planned: p, existing });
    else conflicting.push({ planned: p, existing, diffs });
  }

  return {
    result: { newRows, alreadyImportedMatching, conflicting, duplicateUnfuddleIdsInBatch, ok: conflicting.length === 0 && duplicateUnfuddleIdsInBatch.length === 0 },
    error: null,
  };
}
