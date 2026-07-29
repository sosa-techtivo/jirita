import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import type { Attachment, Ticket } from "../types/models";
import type { PhysicalFileStats } from "../types/phase6";

/** A conservative, commonly-configured Supabase project default — reported as a comparison point only (see audit-attachment-storage.ts's honesty note about not being able to read the real configured value). */
const REFERENCE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function bucketFor(bytes: number): string {
  if (bytes < 10 * 1024) return "<10KB";
  if (bytes < 100 * 1024) return "10KB-100KB";
  if (bytes < 1024 * 1024) return "100KB-1MB";
  if (bytes < 10 * 1024 * 1024) return "1MB-10MB";
  if (bytes < 50 * 1024 * 1024) return "10MB-50MB";
  return ">50MB";
}

/**
 * Resolves each of the 250 attachments already materialized by Phase 1
 * against its exactly-one physical file in `media/<attachment unfuddle_id>`
 * — the same strong identifier Phase 1's Dry Run already used (never a
 * filename match, never approximate). Computes real size + SHA-256 for
 * every resolved file — read-only, no file is modified/renamed/copied/
 * executed.
 */
export async function resolvePhysicalFiles(tickets: Ticket[], mediaDir: string): Promise<PhysicalFileStats> {
  const all: Attachment[] = [];
  for (const ticket of tickets) {
    all.push(...ticket.attachments);
    for (const comment of ticket.comments) all.push(...comment.attachments);
  }

  let resolved = 0;
  const missingIds: number[] = [];
  let totalBytes = 0;
  let maxBytes = 0;
  let minBytes = Number.POSITIVE_INFINITY;
  let emptyFiles = 0;
  const sizeMismatches: { unfuddleId: number; declared: number; real: number }[] = [];
  const filesOverLimit: { unfuddleId: number; filename: string; bytes: number }[] = [];
  const sizeDistribution: Record<string, number> = { "<10KB": 0, "10KB-100KB": 0, "100KB-1MB": 0, "1MB-10MB": 0, "10MB-50MB": 0, ">50MB": 0 };
  const sizes: number[] = [];
  const hashByAttachment = new Map<number, string>();

  for (const a of all) {
    const filePath = path.join(mediaDir, String(a.unfuddleId));
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      missingIds.push(a.unfuddleId);
      continue;
    }
    if (!stat.isFile()) {
      missingIds.push(a.unfuddleId);
      continue;
    }

    resolved++;
    const realSize = stat.size;
    totalBytes += realSize;
    sizes.push(realSize);
    if (realSize > maxBytes) maxBytes = realSize;
    if (realSize < minBytes) minBytes = realSize;
    if (realSize === 0) emptyFiles++;
    sizeDistribution[bucketFor(realSize)]++;
    if (a.declaredSize !== null && a.declaredSize !== realSize) {
      sizeMismatches.push({ unfuddleId: a.unfuddleId, declared: a.declaredSize, real: realSize });
    }
    if (realSize > REFERENCE_SIZE_LIMIT_BYTES) {
      filesOverLimit.push({ unfuddleId: a.unfuddleId, filename: a.filename, bytes: realSize });
    }

    hashByAttachment.set(a.unfuddleId, await sha256(filePath));
  }

  sizes.sort((x, y) => x - y);
  const medianBytes = sizes.length === 0 ? 0 : sizes.length % 2 === 0 ? (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2 : sizes[(sizes.length - 1) / 2];

  const byHash = new Map<string, number[]>();
  for (const [id, hash] of hashByAttachment) {
    const arr = byHash.get(hash) ?? [];
    arr.push(id);
    byHash.set(hash, arr);
  }
  const duplicateContentGroups = [...byHash.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([hash, unfuddleIds]) => ({ hash, unfuddleIds }));

  return {
    resolved,
    missing: missingIds.length,
    missingIds,
    ambiguous: 0, // media/<id> is a 1:1 lookup by construction — no ambiguity is structurally possible
    totalBytes,
    maxBytes,
    minBytes: minBytes === Number.POSITIVE_INFINITY ? 0 : minBytes,
    avgBytes: sizes.length === 0 ? 0 : Math.round(totalBytes / sizes.length),
    medianBytes,
    sizeDistribution,
    emptyFiles,
    sizeMismatches,
    filesOverLimit,
    duplicateContentGroups,
  };
}
