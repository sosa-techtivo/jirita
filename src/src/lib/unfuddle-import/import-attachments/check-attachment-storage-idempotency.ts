import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlannedAttachmentFields, StorageIdempotencyResult, StorageObjectFinding } from "../types/phase6";

/**
 * Real, read-only classification of every planned attachment's deterministic
 * Storage path — `.list()` to check existence, `.download()` only for an
 * object that already exists at the exact expected path, purely to compare
 * bytes against the real local file in `media/<attachment unfuddle_id>`.
 * Never `.upload()`, never `upsert: true`, never overwrites anything — this
 * function cannot write to Storage even by accident, it has no code path
 * that does. A path that already holds different bytes than expected is
 * reported as a conflict, never assumed to match by path alone, and never
 * silently overwritten. Two attachments with byte-identical content still
 * resolve to two independent paths (each keyed by its own unfuddle_id), so
 * this function never merges or dedupes by hash — the hash here only
 * confirms "is the object already at this exact path what we think it is",
 * never a substitute identity.
 *
 * Nothing has ever been uploaded under this deterministic
 * `<ticket_id>/att-<unfuddle_id>-<filename>` scheme (the app only ever
 * writes `<ticket_id>/<random uuid>-<filename>`), so a real run today is
 * expected to classify all 250 as `not_exists` — that expectation is
 * confirmed by actually calling `.list()`, not assumed.
 */
function sha256OfLocalFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function sha256OfBlob(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

export async function checkAttachmentStorageIdempotency(
  admin: SupabaseClient,
  bucketId: string,
  planned: PlannedAttachmentFields[],
  mediaDir: string,
): Promise<{ result: StorageIdempotencyResult | null; error: string | null }> {
  const findings: StorageObjectFinding[] = [];
  const pathCollisionCandidates = new Map<string, number[]>();

  for (const p of planned) {
    const arr = pathCollisionCandidates.get(p.storage_path) ?? [];
    arr.push(p.attachmentUnfuddleId);
    pathCollisionCandidates.set(p.storage_path, arr);
  }
  const pathCollisions = [...pathCollisionCandidates.entries()].filter(([, ids]) => ids.length > 1).map(([path, attachmentUnfuddleIds]) => ({ path, attachmentUnfuddleIds }));

  const byFolder = new Map<string, PlannedAttachmentFields[]>();
  for (const p of planned) {
    const folder = p.ticket_id;
    const arr = byFolder.get(folder) ?? [];
    arr.push(p);
    byFolder.set(folder, arr);
  }

  const storage = admin.storage.from(bucketId);

  for (const [folder, rows] of byFolder) {
    const { data: listing, error } = await storage.list(folder, { limit: 1000 });
    if (error) return { result: null, error: `Storage list failed for folder "${folder}": ${error.message}` };

    const byName = new Map((listing ?? []).map((obj) => [obj.name, obj]));

    for (const p of rows) {
      const objectName = p.storage_path.slice(folder.length + 1);
      const existing = byName.get(objectName);

      if (!existing) {
        findings.push({ attachmentUnfuddleId: p.attachmentUnfuddleId, storagePath: p.storage_path, status: "not_exists", detail: null });
        continue;
      }

      const existingSize = existing.metadata?.size ?? null;
      if (existingSize !== null && existingSize !== p.size_bytes) {
        findings.push({ attachmentUnfuddleId: p.attachmentUnfuddleId, storagePath: p.storage_path, status: "exists_differs", detail: `size mismatch: existing=${existingSize} expected=${p.size_bytes}` });
        continue;
      }

      let localHash: string;
      try {
        localHash = await sha256OfLocalFile(path.join(mediaDir, String(p.attachmentUnfuddleId)));
      } catch (err) {
        findings.push({ attachmentUnfuddleId: p.attachmentUnfuddleId, storagePath: p.storage_path, status: "exists_differs", detail: `size matched but the local reference file could not be read to confirm content: ${(err as Error).message} — treated as unverified, never assumed to match by path alone.` });
        continue;
      }

      const { data: blob, error: downloadError } = await storage.download(p.storage_path);
      if (downloadError || !blob) {
        findings.push({ attachmentUnfuddleId: p.attachmentUnfuddleId, storagePath: p.storage_path, status: "exists_differs", detail: `size matched but content could not be verified: ${downloadError?.message ?? "no data"}` });
        continue;
      }

      const remoteHash = await sha256OfBlob(blob);
      if (remoteHash === localHash) {
        findings.push({ attachmentUnfuddleId: p.attachmentUnfuddleId, storagePath: p.storage_path, status: "exists_matching", detail: null });
      } else {
        findings.push({ attachmentUnfuddleId: p.attachmentUnfuddleId, storagePath: p.storage_path, status: "exists_differs", detail: "SHA-256 mismatch despite matching size — never overwritten." });
      }
    }
  }

  const result: StorageIdempotencyResult = {
    checked: findings.length,
    notExists: findings.filter((f) => f.status === "not_exists").length,
    existsMatching: findings.filter((f) => f.status === "exists_matching").length,
    existsDiffers: findings.filter((f) => f.status === "exists_differs").length,
    findings,
    pathCollisions,
    ok: pathCollisions.length === 0 && findings.every((f) => f.status !== "exists_differs"),
  };

  return { result, error: null };
}
