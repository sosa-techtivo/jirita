// Processes exactly one candidate row — shared by both PREVIEW and APPLY
// (run-backfill.ts) so the two modes can never drift in what they consider
// "processable" vs. "skip" vs. "error". PREVIEW downloads and decodes the
// real object (needed to report accurate width/skip counts) but never
// uploads a thumbnail or writes to the database; APPLY does both.

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateThumbnailFromBuffer, isRasterExtension } from "./generate-thumbnail-node";
import type { CandidateRow, ProcessResult } from "./types";

// Same Cache-Control as new uploads (Cached Egress Phase 3,
// ATTACHMENT_UPLOAD_CACHE_CONTROL / NOTE_ATTACHMENT_UPLOAD_CACHE_CONTROL in
// src/lib/tickets.ts / src/lib/notes.ts) — a backfilled thumbnail is written
// to a path just as unique/never-overwritten as one written at upload time.
const THUMBNAIL_CACHE_CONTROL = "31536000";

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// Mirrors uploadTicketAttachment/uploadProjectNoteAttachment's own
// candidatePath convention exactly: "<entityId>/thumbnails/<everything
// storagePath had after '<entityId>/'>.<ext>" — the "<uuid>-<safeName>"
// suffix (including the original's own extension) is reused verbatim from
// the already-existing original path, so a backfilled thumbnail's path is
// indistinguishable in shape from one a live upload would have produced.
function buildThumbnailPath(row: CandidateRow, ext: string): string {
  const suffix = row.storagePath.slice(row.entityId.length + 1);
  return `${row.entityId}/thumbnails/${suffix}.${ext}`;
}

type PersistResult = { ok: true } | { ok: false; message: string };

// The one place that ever writes thumbnail_path — used both for a freshly
// uploaded physical thumbnail and for the <=600px "the original is its own
// thumbnail" case below, so the concurrency guard can't be forgotten on
// either path. `.is("thumbnail_path", null)` means this can only ever fill
// a NULL, never overwrite a value the live app itself set for this row
// between this script's SELECT and this UPDATE (e.g. the attachment was
// deleted and re-uploaded by a user in the meantime).
async function persistThumbnailPath(admin: SupabaseClient, row: CandidateRow, thumbnailPath: string): Promise<PersistResult> {
  const { error, count } = await admin
    .from(row.table)
    .update({ thumbnail_path: thumbnailPath }, { count: "exact" })
    .eq("id", row.id)
    .is("thumbnail_path", null);
  if (error) return { ok: false, message: error.message };
  if (!count) return { ok: false, message: "update matched no row (thumbnail_path was no longer NULL)" };
  return { ok: true };
}

export async function processCandidate(
  admin: SupabaseClient,
  row: CandidateRow,
  mode: "preview" | "apply"
): Promise<ProcessResult> {
  const ext = getExt(row.filename);
  if (!isRasterExtension(ext)) {
    return {
      row,
      outcome: { kind: "skipped-not-image", reason: ext === "svg" ? "svg (vector, excluded)" : `unsupported extension .${ext || "?"}` },
    };
  }

  const { data: blob, error: downloadError } = await admin.storage.from(row.bucket).download(row.storagePath);
  if (downloadError || !blob) {
    return {
      row,
      outcome: { kind: "failed", stage: "download", message: downloadError?.message ?? "download returned no data" },
    };
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const generated = await generateThumbnailFromBuffer(buffer);

  if (generated.kind === "error") {
    return { row, outcome: { kind: "failed", stage: "generate", message: generated.message } };
  }

  if (generated.kind === "skipped-too-small") {
    // <=600px — no physical thumbnail file. thumbnail_path becomes the
    // row's own storage_path: the original doubles as its own thumbnail,
    // and (critically) the row stops matching candidates.ts's
    // `thumbnail_path IS NULL` filter, so it's never re-fetched/
    // re-downloaded by a future run. In PREVIEW this is reported but
    // nothing is written.
    if (mode === "preview") {
      return { row, outcome: { kind: "self-thumbnail", width: generated.width, height: generated.height } };
    }
    const persisted = await persistThumbnailPath(admin, row, row.storagePath);
    if (!persisted.ok) {
      return { row, outcome: { kind: "failed", stage: "db-update", message: persisted.message } };
    }
    return { row, outcome: { kind: "self-thumbnail", width: generated.width, height: generated.height } };
  }

  const thumbnailPath = buildThumbnailPath(row, generated.thumbnail.ext);

  if (mode === "preview") {
    // Nothing written — this is exactly what APPLY would create.
    return {
      row,
      outcome: {
        kind: "created",
        thumbnailPath,
        thumbnailSizeBytes: generated.thumbnail.buffer.length,
        width: generated.thumbnail.width,
        height: generated.thumbnail.height,
      },
    };
  }

  // upsert: true — idempotency for the "thumbnail uploaded but the DB
  // update below failed/crashed" case: a re-run recomputes this exact same
  // deterministic path and safely overwrites it with the same bytes,
  // rather than erroring on "already exists". Rows that already completed
  // (thumbnail_path set) never reach this function at all — see
  // candidates.ts's own `.is("thumbnail_path", null)` filter.
  const { error: uploadError } = await admin.storage.from(row.bucket).upload(thumbnailPath, generated.thumbnail.buffer, {
    contentType: "image/webp",
    cacheControl: THUMBNAIL_CACHE_CONTROL,
    upsert: true,
  });
  if (uploadError) {
    return { row, outcome: { kind: "failed", stage: "upload", message: uploadError.message } };
  }

  const persisted = await persistThumbnailPath(admin, row, thumbnailPath);
  if (!persisted.ok) {
    return { row, outcome: { kind: "failed", stage: "db-update", message: persisted.message } };
  }

  return {
    row,
    outcome: {
      kind: "created",
      thumbnailPath,
      thumbnailSizeBytes: generated.thumbnail.buffer.length,
      width: generated.thumbnail.width,
      height: generated.thumbnail.height,
    },
  };
}
