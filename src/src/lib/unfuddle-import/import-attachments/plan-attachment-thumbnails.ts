import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateThumbnailFromBuffer, isRasterExtension } from "../../attachment-thumbnail-backfill/generate-thumbnail-node";
import { generateAttachmentThumbnailObjectPath } from "./generate-object-path";
import type { AttachmentThumbnailPlanItem, AttachmentThumbnailStats, PlannedAttachmentFields } from "../types/phase6";

/**
 * Decides, per planned attachment, whether a physical thumbnail should be
 * generated — reusing the exact same decode/resize/encode logic (600px max
 * width, aspect ratio preserved, WebP ~0.82 quality, sharp-based) the live
 * historical-data backfill already uses
 * (src/lib/attachment-thumbnail-backfill/generate-thumbnail-node.ts), so
 * all three thumbnail-generation paths in this codebase — new uploads
 * (src/lib/tickets.ts, browser canvas), the historical backfill (Node/
 * sharp), and this future-project importer (also Node/sharp) — can never
 * drift on what counts as "needs a thumbnail."
 *
 * Reads the *local* media/ file only (never Supabase Storage, never the
 * database) — this is what makes it safe to call from a pure PREVIEW with
 * zero writes anywhere. The same function is reused by APPLY
 * (apply-attachments.ts), called once per row right before that row's
 * upload/insert, so PREVIEW and APPLY can never disagree about which
 * attachments get a thumbnail.
 *
 * Mirrors the live backfill's own <=600px decision
 * (process-candidate.ts): no physical file for an already-small image —
 * thumbnailPath is the row's own storage_path, so the original doubles as
 * its own thumbnail rather than leaving thumbnail_path NULL (which would
 * make the row look like an unprocessed candidate to a future backfill
 * run).
 */
export async function planAttachmentThumbnail(mediaDir: string, planned: PlannedAttachmentFields): Promise<AttachmentThumbnailPlanItem> {
  const ext = planned.filename.split(".").pop()?.toLowerCase() ?? "";

  if (!isRasterExtension(ext)) {
    return {
      attachmentUnfuddleId: planned.attachmentUnfuddleId,
      kind: "not-image",
      width: null,
      height: null,
      thumbnailPath: null,
      thumbnailBuffer: null,
      reason: ext === "svg" ? "svg (vector, excluded)" : `unsupported extension .${ext || "?"}`,
    };
  }

  const localPath = path.join(mediaDir, String(planned.attachmentUnfuddleId));
  let buffer: Buffer;
  try {
    buffer = await readFile(localPath);
  } catch (err) {
    return {
      attachmentUnfuddleId: planned.attachmentUnfuddleId,
      kind: "error",
      width: null,
      height: null,
      thumbnailPath: null,
      thumbnailBuffer: null,
      reason: `Cannot read local file ${localPath}: ${(err as Error).message}`,
    };
  }

  const generated = await generateThumbnailFromBuffer(buffer);

  if (generated.kind === "error") {
    return {
      attachmentUnfuddleId: planned.attachmentUnfuddleId,
      kind: "error",
      width: null,
      height: null,
      thumbnailPath: null,
      thumbnailBuffer: null,
      reason: generated.message,
    };
  }

  if (generated.kind === "skipped-too-small") {
    return {
      attachmentUnfuddleId: planned.attachmentUnfuddleId,
      kind: "self",
      width: generated.width,
      height: generated.height,
      thumbnailPath: planned.storage_path,
      thumbnailBuffer: null,
      reason: null,
    };
  }

  return {
    attachmentUnfuddleId: planned.attachmentUnfuddleId,
    kind: "physical",
    width: generated.thumbnail.width,
    height: generated.thumbnail.height,
    thumbnailPath: generateAttachmentThumbnailObjectPath(planned.ticket_id, planned.attachmentUnfuddleId, planned.filename),
    thumbnailBuffer: generated.thumbnail.buffer,
    reason: null,
  };
}

/**
 * Sequential, one row at a time (never Promise.all across the batch) — same
 * "keep memory/IO bounded" reasoning as the live backfill's own
 * run-backfill.ts: a "physical" result's thumbnailBuffer is only ever held
 * by the current iteration, never accumulated across all planned rows.
 */
export async function planAttachmentThumbnails(mediaDir: string, planned: PlannedAttachmentFields[]): Promise<AttachmentThumbnailPlanItem[]> {
  const items: AttachmentThumbnailPlanItem[] = [];
  for (const p of planned) {
    items.push(await planAttachmentThumbnail(mediaDir, p));
  }
  return items;
}

export function summarizeThumbnailPlan(items: AttachmentThumbnailPlanItem[]): AttachmentThumbnailStats {
  const stats: AttachmentThumbnailStats = {
    totalAttachments: items.length,
    wouldCreatePhysicalThumbnail: 0,
    wouldUseOriginalAsThumbnail: 0,
    notImage: 0,
    errors: 0,
    errorDetails: [],
  };
  for (const item of items) {
    if (item.kind === "physical") stats.wouldCreatePhysicalThumbnail += 1;
    else if (item.kind === "self") stats.wouldUseOriginalAsThumbnail += 1;
    else if (item.kind === "not-image") stats.notImage += 1;
    else {
      stats.errors += 1;
      stats.errorDetails.push({ attachmentUnfuddleId: item.attachmentUnfuddleId, reason: item.reason ?? "unknown error" });
    }
  }
  return stats;
}
