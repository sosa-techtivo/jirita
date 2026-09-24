// Pure selection + backup-gate logic for the first, deliberately
// conservative cleanup batch of historical Unfuddle ticket attachments —
// no I/O, so every safety rule here is unit-tested (policy.test.ts).
//
// A candidate is a historical row (unfuddle_id IS NOT NULL) that is still
// is_available = true, whose original currently exists in Storage at
// >= 5 MiB. It is apply-eligible only if every physical object that would
// be removed (the original, plus a separate thumbnail if one unexpectedly
// exists) is proven present and intact in the verified local backup. The
// batch as a whole is approved only if every candidate is eligible AND the
// batch matches the independently expected size (19 rows / ~261 MiB) — a
// materially different result fails closed instead of expanding.
import { createHash } from "node:crypto";
import type { HistoricalAttachmentRow, RowPlan } from "../attachment-history-backup/plan";

export const MIN_ORIGINAL_BYTES = 5 * 1024 * 1024;
export const EXPECTED_CANDIDATES = 19;
export const EXPECTED_ORIGINAL_BYTES = 261 * 1024 * 1024;
/** "Approximately 261 MiB" — anything beyond ±3 MiB is a material difference. */
export const EXPECTED_BYTES_TOLERANCE = 3 * 1024 * 1024;

/** The known metadata-only historical rows (SWNA site-archive zips) — never touched. */
export const KNOWN_UNAVAILABLE_IDS: ReadonlySet<string> = new Set([
  "1fc505ab-9351-473a-94fc-e793540cb416",
  "b68b554e-e63d-4cdd-8d2a-9fae87bc1761",
  "20da5489-868f-4dd0-9c0d-eb45c91a39d8",
  "e0419dcd-3c3e-421e-b83e-f2541fc713a8",
]);

export type ThumbnailFinding = "none" | "self" | "separate" | "separate_missing";

export interface Candidate {
  row: HistoricalAttachmentRow;
  originalBytes: number;
  thumbnail: ThumbnailFinding;
  /** Only for a physically present separate thumbnail. */
  thumbnailBytes: number | null;
}

/** Selects candidates from a fresh backup-style inventory (rows already classified against live Storage). */
export function selectCandidates(rows: ReadonlyArray<RowPlan>): Candidate[] {
  const candidates: Candidate[] = [];
  for (const rp of rows) {
    const { row } = rp;
    if (row.unfuddle_id === null || row.unfuddle_id === undefined) continue;
    if (!row.is_available || KNOWN_UNAVAILABLE_IDS.has(row.id)) continue;
    if (rp.original !== "available" || !rp.originalObject) continue;
    if (rp.originalObject.sizeBytes < MIN_ORIGINAL_BYTES) continue;
    const thumbnail: ThumbnailFinding =
      rp.thumbnail === "none" ? "none" : rp.thumbnail === "self" ? "self" : rp.thumbnail === "available" ? "separate" : "separate_missing";
    candidates.push({
      row,
      originalBytes: rp.originalObject.sizeBytes,
      thumbnail,
      thumbnailBytes: rp.thumbnailObject?.sizeBytes ?? null,
    });
  }
  return candidates.sort((a, b) => b.originalBytes - a.originalBytes || a.row.id.localeCompare(b.row.id));
}

/** What the verified backup says about one physical object, plus a fresh re-hash of the local file. */
export interface BackupObjectEvidence {
  /** Size recorded in the manifest for this attachment's object (null when the manifest has none). */
  manifestSize: number | null;
  manifestStatus: string | null;
  manifestSha256: string | null;
  journalSize: number | null;
  journalSha256: string | null;
  localSize: number | null;
  localSha256: string | null;
}

export interface BackupEvidence {
  /** Manifest record for this attachment_id, if any. */
  manifestStoragePath: string | null;
  manifestThumbnailPath: string | null;
  original: BackupObjectEvidence;
  thumbnail: BackupObjectEvidence | null;
}

/** Every reason this object is NOT proven backed up at `currentSize`; empty means it is. */
export function objectBackupProblems(label: string, currentSize: number, e: BackupObjectEvidence | null): string[] {
  if (!e) return [`${label}: no backup evidence`];
  const problems: string[] = [];
  if (e.manifestStatus !== "verified") problems.push(`${label}: manifest status is ${e.manifestStatus ?? "absent"}`);
  if (e.manifestSize !== currentSize) problems.push(`${label}: manifest size ${e.manifestSize ?? "absent"} ≠ current Storage size ${currentSize}`);
  if (!e.journalSha256) problems.push(`${label}: no recorded SHA-256 in download journal`);
  else if (e.manifestSha256 !== e.journalSha256) problems.push(`${label}: manifest SHA-256 ≠ journal SHA-256`);
  if (e.journalSize !== currentSize) problems.push(`${label}: journal size ${e.journalSize ?? "absent"} ≠ current Storage size ${currentSize}`);
  if (e.localSize === null) problems.push(`${label}: local backup file missing`);
  else if (e.localSize !== currentSize) problems.push(`${label}: local file size ${e.localSize} ≠ current Storage size ${currentSize}`);
  else if (!e.localSha256 || e.localSha256 !== e.journalSha256) problems.push(`${label}: local file SHA-256 does not match the recorded SHA-256`);
  return problems;
}

export interface GatedCandidate extends Candidate {
  eligible: boolean;
  problems: string[];
  /** Exact Storage paths a later apply would remove (self-thumbnail counted once). */
  pathsToRemove: string[];
  originalSha256: string | null;
  thumbnailSha256: string | null;
}

export function gateCandidate(c: Candidate, evidence: BackupEvidence | null): GatedCandidate {
  const problems: string[] = [];
  if (!evidence) {
    problems.push("attachment_id not found in backup manifest");
  } else {
    if (evidence.manifestStoragePath !== c.row.storage_path) problems.push("backup manifest storage_path ≠ current storage_path");
    if (evidence.manifestThumbnailPath !== c.row.thumbnail_path) problems.push("backup manifest thumbnail_path ≠ current thumbnail_path");
    problems.push(...objectBackupProblems("original", c.originalBytes, evidence.original));
  }
  if (c.thumbnail === "separate_missing") {
    problems.push("thumbnail_path set but the thumbnail object is missing from Storage — needs manual review");
  }
  if (c.thumbnail === "separate") {
    problems.push(...objectBackupProblems("thumbnail", c.thumbnailBytes ?? -1, evidence?.thumbnail ?? null));
  }
  const pathsToRemove = c.thumbnail === "separate" ? [c.row.storage_path, c.row.thumbnail_path!] : [c.row.storage_path];
  return {
    ...c,
    eligible: problems.length === 0,
    problems,
    pathsToRemove,
    originalSha256: evidence?.original.journalSha256 ?? null,
    thumbnailSha256: c.thumbnail === "separate" ? (evidence?.thumbnail?.journalSha256 ?? null) : null,
  };
}

export interface BatchSummary {
  candidates: number;
  eligible: number;
  ineligible: number;
  originalBytes: number;
  thumbnailBytes: number;
  totalBytes: number;
  separateThumbnails: number;
  selfThumbnails: number;
  expectationProblems: string[];
  verified: boolean;
  reasons: string[];
  /** Identifies this exact batch + backup evidence; a later --apply must present it. */
  fingerprint: string;
}

export function batchFingerprint(batch: ReadonlyArray<GatedCandidate>): string {
  const lines = batch
    .map((c) => [c.row.id, c.row.storage_path, c.originalBytes, c.originalSha256 ?? "", c.row.thumbnail_path ?? "", c.thumbnailBytes ?? "", c.thumbnailSha256 ?? ""].join("|"))
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

export function summarizeBatch(batch: ReadonlyArray<GatedCandidate>): BatchSummary {
  const originalBytes = batch.reduce((sum, c) => sum + c.originalBytes, 0);
  const thumbnailBytes = batch.reduce((sum, c) => sum + (c.thumbnail === "separate" ? (c.thumbnailBytes ?? 0) : 0), 0);
  const eligible = batch.filter((c) => c.eligible).length;

  const expectationProblems: string[] = [];
  if (batch.length !== EXPECTED_CANDIDATES) expectationProblems.push(`found ${batch.length} candidates, expected exactly ${EXPECTED_CANDIDATES}`);
  if (Math.abs(originalBytes - EXPECTED_ORIGINAL_BYTES) > EXPECTED_BYTES_TOLERANCE) {
    expectationProblems.push(`original bytes ${originalBytes} are not within ±3 MiB of the expected ~261 MiB (${EXPECTED_ORIGINAL_BYTES})`);
  }

  const reasons = [...expectationProblems];
  if (batch.length === 0) reasons.push("no candidates");
  if (eligible !== batch.length) reasons.push(`${batch.length - eligible} candidate(s) failed the backup gate — whole batch blocked`);

  return {
    candidates: batch.length,
    eligible,
    ineligible: batch.length - eligible,
    originalBytes,
    thumbnailBytes,
    totalBytes: originalBytes + thumbnailBytes,
    separateThumbnails: batch.filter((c) => c.thumbnail === "separate").length,
    selfThumbnails: batch.filter((c) => c.thumbnail === "self").length,
    expectationProblems,
    verified: reasons.length === 0,
    reasons,
    fingerprint: batchFingerprint(batch),
  };
}

/**
 * Immediately-before-removal re-check (apply only): the freshly re-read row
 * and live object sizes must still match exactly what was gated.
 */
export function recheckProblems(
  gated: GatedCandidate,
  fresh: { is_available: boolean; unfuddle_id: unknown; storage_path: string; thumbnail_path: string | null } | null,
  liveSizes: ReadonlyMap<string, number | null>,
): string[] {
  if (!fresh) return ["row no longer exists"];
  const problems: string[] = [];
  if (fresh.unfuddle_id === null || fresh.unfuddle_id === undefined) problems.push("unfuddle_id is now null");
  if (!fresh.is_available) problems.push("row is already is_available = false");
  if (fresh.storage_path !== gated.row.storage_path) problems.push("storage_path changed");
  if (fresh.thumbnail_path !== gated.row.thumbnail_path) problems.push("thumbnail_path changed");
  if (liveSizes.get(gated.row.storage_path) !== gated.originalBytes) problems.push("original object missing or size changed");
  if (gated.thumbnail === "separate" && liveSizes.get(gated.row.thumbnail_path!) !== gated.thumbnailBytes) {
    problems.push("thumbnail object missing or size changed");
  }
  return problems;
}

export type CliArgs =
  | { mode: "dry-run"; backupDir: string | null }
  | { mode: "apply"; backupDir: string | null; confirm: string };

/** Strict: unknown/malformed/duplicate arguments throw; --apply requires --confirm=<fingerprint> and vice versa. */
export function parseCliArgs(argv: ReadonlyArray<string>): CliArgs {
  let apply = false;
  let confirm: string | null = null;
  let backupDir: string | null = null;
  const seen = new Set<string>();
  for (const arg of argv) {
    const name = arg.split("=")[0];
    if (seen.has(name)) throw new Error(`Duplicate argument: ${name}`);
    seen.add(name);
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    let match = /^--confirm=([0-9a-f]{16})$/.exec(arg);
    if (match) {
      confirm = match[1];
      continue;
    }
    match = /^--backup=(.+)$/.exec(arg);
    if (match) {
      backupDir = match[1];
      continue;
    }
    throw new Error(`Unknown or malformed argument: ${arg}`);
  }
  if (apply && !confirm) throw new Error("--apply requires --confirm=<fingerprint> from a fresh dry run.");
  if (!apply && confirm) throw new Error("--confirm is only valid together with --apply.");
  return apply ? { mode: "apply", backupDir, confirm: confirm! } : { mode: "dry-run", backupDir };
}
