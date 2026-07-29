import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhysicalFileStats, PlannedAttachmentFields } from "../types/phase6";

export interface HashCheck {
  attachmentUnfuddleId: number;
  reason: string;
  localHash: string | null;
  remoteHash: string | null;
  match: boolean;
  error: string | null;
}

export interface HashVerificationResult {
  checks: HashCheck[];
  ok: boolean;
  scopeDescription: string;
}

function sha256OfLocalFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Downloads and SHA-256-verifies a deliberately small, targeted sample —
 * not all 250 — per this task's explicit instruction to report exactly
 * what was verified, never claim "250/250 hashes verified" without
 * actually downloading and hashing all 250. The sample is chosen to cover
 * every case called out explicitly: the 5 SHA-256-duplicate-content groups
 * (10 attachments), the largest file, the smallest file, the one SVG, the
 * one ZIP, a handful of the 167 `image.png` attachments, and at least one
 * ticket-level and one comment-level row.
 */
export async function verifyRequiredHashSample(admin: SupabaseClient, bucketId: string, mediaDir: string, planned: PlannedAttachmentFields[], physicalFiles: PhysicalFileStats): Promise<HashVerificationResult> {
  const ids = new Map<number, string>(); // attachmentUnfuddleId -> reason

  for (const group of physicalFiles.duplicateContentGroups) {
    for (const id of group.unfuddleIds) ids.set(id, ids.get(id) ? `${ids.get(id)}; SHA-256-duplicate group ${group.hash.slice(0, 12)}` : `SHA-256-duplicate group ${group.hash.slice(0, 12)}`);
  }

  const byId = new Map(planned.map((p) => [p.attachmentUnfuddleId, p]));
  const largest = [...planned].sort((a, b) => b.size_bytes - a.size_bytes)[0];
  const smallest = [...planned].sort((a, b) => a.size_bytes - b.size_bytes)[0];
  if (largest) ids.set(largest.attachmentUnfuddleId, ids.get(largest.attachmentUnfuddleId) ? `${ids.get(largest.attachmentUnfuddleId)}; largest file` : "largest file");
  if (smallest) ids.set(smallest.attachmentUnfuddleId, ids.get(smallest.attachmentUnfuddleId) ? `${ids.get(smallest.attachmentUnfuddleId)}; smallest file` : "smallest file");

  const svg = planned.find((p) => p.filename.toLowerCase().endsWith(".svg"));
  if (svg) ids.set(svg.attachmentUnfuddleId, ids.get(svg.attachmentUnfuddleId) ? `${ids.get(svg.attachmentUnfuddleId)}; the .svg file` : "the .svg file");

  const zip = planned.find((p) => p.filename.toLowerCase().endsWith(".zip"));
  if (zip) ids.set(zip.attachmentUnfuddleId, ids.get(zip.attachmentUnfuddleId) ? `${ids.get(zip.attachmentUnfuddleId)}; the .zip file` : "the .zip file");

  const imagePngSample = planned.filter((p) => p.filename === "image.png").slice(0, 3);
  for (const p of imagePngSample) ids.set(p.attachmentUnfuddleId, ids.get(p.attachmentUnfuddleId) ? `${ids.get(p.attachmentUnfuddleId)}; image.png sample` : "image.png sample");

  const ticketLevel = planned.find((p) => p.comment_id === null && !ids.has(p.attachmentUnfuddleId));
  if (ticketLevel) ids.set(ticketLevel.attachmentUnfuddleId, "at least one ticket-level row");
  const commentLevel = planned.find((p) => p.comment_id !== null && !ids.has(p.attachmentUnfuddleId));
  if (commentLevel) ids.set(commentLevel.attachmentUnfuddleId, "at least one comment-level row");

  const storage = admin.storage.from(bucketId);
  const checks: HashCheck[] = [];

  for (const [attachmentUnfuddleId, reason] of ids) {
    const planned_ = byId.get(attachmentUnfuddleId);
    if (!planned_) {
      checks.push({ attachmentUnfuddleId, reason, localHash: null, remoteHash: null, match: false, error: "not found in planned rows" });
      continue;
    }
    let localHash: string | null = null;
    let remoteHash: string | null = null;
    let error: string | null = null;
    try {
      localHash = await sha256OfLocalFile(path.join(mediaDir, String(attachmentUnfuddleId)));
    } catch (err) {
      error = `local read failed: ${(err as Error).message}`;
    }
    if (!error) {
      const { data: blob, error: downloadError } = await storage.download(planned_.storage_path);
      if (downloadError || !blob) {
        error = `remote download failed: ${downloadError?.message ?? "no data"}`;
      } else {
        const buf = Buffer.from(await blob.arrayBuffer());
        remoteHash = createHash("sha256").update(buf).digest("hex");
      }
    }
    checks.push({ attachmentUnfuddleId, reason, localHash, remoteHash, match: localHash !== null && remoteHash !== null && localHash === remoteHash, error });
  }

  return {
    checks,
    ok: checks.every((c) => c.match),
    scopeDescription: `${checks.length} of 250 attachments hash-verified (downloaded + SHA-256 compared against the local file) — the minimum required sample (duplicate-content groups, largest, smallest, SVG, ZIP, an image.png sample, at least one ticket-level and one comment-level row), not all 250.`,
  };
}
