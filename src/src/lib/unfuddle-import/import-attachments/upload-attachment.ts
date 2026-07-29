import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UploadAttachmentResult {
  ok: boolean;
  error: string | null;
  remoteSize: number | null;
}

/**
 * Uploads exactly one attachment's real bytes from `media/<attachment
 * unfuddle_id>` to the deterministic Storage path, `upsert: false` always —
 * this call fails rather than overwrite if anything is already at that
 * exact path. Never called for a path Storage idempotency already
 * classified as `exists_matching`/`exists_differs` (the caller only
 * reaches here for `not_exists`) — this function itself adds a second,
 * independent layer of the same guarantee via `upsert: false`.
 *
 * After upload, re-lists the object to confirm it exists at the exact
 * expected path with the exact expected size — the RPC insert is never
 * called on the strength of "the upload call didn't error" alone.
 */
export async function uploadAttachment(admin: SupabaseClient, bucketId: string, mediaDir: string, attachmentUnfuddleId: number, storagePath: string, expectedSizeBytes: number, mimeType: string | null): Promise<UploadAttachmentResult> {
  const localPath = path.join(mediaDir, String(attachmentUnfuddleId));
  let bytes: Buffer;
  try {
    bytes = await readFile(localPath);
  } catch (err) {
    return { ok: false, error: `Cannot read local file ${localPath}: ${(err as Error).message}`, remoteSize: null };
  }
  if (bytes.length !== expectedSizeBytes) {
    return { ok: false, error: `Local file size ${bytes.length} does not match planned size_bytes ${expectedSizeBytes} — refusing to upload.`, remoteSize: null };
  }

  const storage = admin.storage.from(bucketId);
  const { error: uploadError } = await storage.upload(storagePath, bytes, { contentType: mimeType ?? undefined, upsert: false });
  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}`, remoteSize: null };

  const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const objectName = storagePath.slice(folder.length + 1);
  const { data: listing, error: listError } = await storage.list(folder, { limit: 1000, search: objectName });
  if (listError) return { ok: false, error: `Post-upload verification list() failed: ${listError.message}`, remoteSize: null };

  const found = (listing ?? []).find((o) => o.name === objectName);
  if (!found) return { ok: false, error: `Post-upload verification: object not found at ${storagePath} immediately after upload.`, remoteSize: null };

  const remoteSize = found.metadata?.size ?? null;
  if (remoteSize !== expectedSizeBytes) {
    return { ok: false, error: `Post-upload verification: remote size ${remoteSize} does not match expected ${expectedSizeBytes}.`, remoteSize };
  }

  return { ok: true, error: null, remoteSize };
}
