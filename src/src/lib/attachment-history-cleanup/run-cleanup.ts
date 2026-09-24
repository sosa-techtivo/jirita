// I/O for the historical Unfuddle attachment cleanup. Discovery reuses the
// backup tool's fresh read-only inventory (exact DB paths vs. live Storage
// listing); the backup gate reads the verified backup's manifest + journal
// and re-hashes each candidate's local file. Every rule lives in policy.ts.
//
// DRY RUN (default) only reads. APPLY — never run without Alex's explicit
// authorization — re-discovers and re-gates from scratch, refuses to start
// unless the fresh batch fingerprint equals --confirm, then per candidate:
// re-check fresh row + live object → remove() → verify every path is really
// absent → only then UPDATE is_available = false (row never deleted). Any
// failure stops the batch immediately.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findUnremovedPaths } from "../attachment-storage-remove";
import type { ManifestRecord } from "../attachment-history-backup/plan";
import { BUCKET, loadInventory, sha256File } from "../attachment-history-backup/run-backup";
import {
  gateCandidate,
  recheckProblems,
  selectCandidates,
  summarizeBatch,
  type BackupEvidence,
  type BackupObjectEvidence,
  type BatchSummary,
  type GatedCandidate,
} from "./policy";

export const DEFAULT_BACKUP_DIR = "backups/unfuddle-ticket-attachments/2026-09-24T13-16-59-345Z";
const JOURNAL = "download-journal.jsonl";

interface BackupIndex {
  byAttachment: Map<string, ManifestRecord>;
  journal: Map<string, { sizeBytes: number; sha256: string }>;
}

async function loadBackupIndex(root: string): Promise<BackupIndex> {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as {
    kind?: string;
    summary?: { status?: string };
    records?: ManifestRecord[];
  };
  if (manifest.kind !== "jirita-unfuddle-ticket-attachments-backup") throw new Error(`${root}/manifest.json is not a JIRITA attachment backup manifest.`);
  if (manifest.summary?.status !== "BACKUP VERIFIED") throw new Error(`Backup at ${root} is not BACKUP VERIFIED — refusing to use it as a gate.`);
  const byAttachment = new Map((manifest.records ?? []).map((r) => [r.attachment_id, r]));

  const journal = new Map<string, { sizeBytes: number; sha256: string }>();
  for (const line of (await readFile(path.join(root, JOURNAL), "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { key: string; sizeBytes: number; sha256: string };
    journal.set(entry.key, entry);
  }
  return { byAttachment, journal };
}

function resolveInside(root: string, relative: string): string {
  const full = path.resolve(root, relative);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`Backup path escapes backup root: ${relative}`);
  return full;
}

async function objectEvidence(
  root: string,
  index: BackupIndex,
  key: string,
  localRelative: string | null,
  manifest: { size: number | null; status: string | null; sha256: string | null },
): Promise<BackupObjectEvidence> {
  const journal = index.journal.get(key);
  let localSize: number | null = null;
  let localSha256: string | null = null;
  if (localRelative) {
    const file = resolveInside(root, localRelative);
    localSize = await stat(file).then((s) => s.size, () => null);
    if (localSize !== null) localSha256 = await sha256File(file);
  }
  return {
    manifestSize: manifest.size,
    manifestStatus: manifest.status,
    manifestSha256: manifest.sha256,
    journalSize: journal?.sizeBytes ?? null,
    journalSha256: journal?.sha256 ?? null,
    localSize,
    localSha256,
  };
}

async function backupEvidence(root: string, index: BackupIndex, attachmentId: string): Promise<BackupEvidence | null> {
  const r = index.byAttachment.get(attachmentId);
  if (!r) return null;
  return {
    manifestStoragePath: r.storage_path,
    manifestThumbnailPath: r.thumbnail_path,
    original: await objectEvidence(root, index, `original:${r.storage_path}`, r.local_original_path, {
      size: r.expected_original_size,
      status: r.original_status,
      sha256: r.original_sha256,
    }),
    thumbnail:
      r.thumbnail_path && r.thumbnail_path !== r.storage_path
        ? await objectEvidence(root, index, `thumbnail:${r.thumbnail_path}`, r.local_thumbnail_path, {
            size: r.expected_thumbnail_size,
            status: r.thumbnail_status,
            sha256: r.thumbnail_sha256,
          })
        : null,
  };
}

export interface CandidateContext {
  project: string;
  ticket: string;
}

async function loadContext(admin: SupabaseClient, ticketIds: string[]): Promise<Map<string, CandidateContext>> {
  const context = new Map<string, CandidateContext>();
  if (ticketIds.length === 0) return context;
  const { data, error } = await admin
    .from("tickets")
    .select("id, ticket_number, projects(name, project_code)")
    .in("id", ticketIds);
  if (error) throw new Error(`ticket/project context load failed: ${error.message}`);
  for (const t of (data ?? []) as unknown as { id: string; ticket_number: number; projects: { name: string; project_code: string } | null }[]) {
    context.set(t.id, {
      project: t.projects ? `${t.projects.name} (${t.projects.project_code})` : "(unknown project)",
      ticket: t.projects ? `${t.projects.project_code}-${t.ticket_number}` : `#${t.ticket_number}`,
    });
  }
  return context;
}

export interface DiscoveryResult {
  historicalRows: number;
  batch: GatedCandidate[];
  summary: BatchSummary;
  context: Map<string, CandidateContext>;
}

/** Fresh read-only discovery + backup gate. Shared by DRY RUN and APPLY — APPLY never reuses an old result. */
export async function discover(admin: SupabaseClient, backupRoot: string): Promise<DiscoveryResult> {
  const index = await loadBackupIndex(backupRoot);
  const { rows, plan } = await loadInventory(admin);
  const candidates = selectCandidates(plan.rows);
  const batch: GatedCandidate[] = [];
  for (const c of candidates) batch.push(gateCandidate(c, await backupEvidence(backupRoot, index, c.row.id)));
  const context = await loadContext(admin, [...new Set(batch.map((c) => c.row.ticket_id))]);
  return { historicalRows: rows.length, batch, summary: summarizeBatch(batch), context };
}

/** Live size of one exact Storage path (null = absent), via a name-filtered listing of its folder. */
async function liveObjectSize(admin: SupabaseClient, storagePath: string): Promise<number | null> {
  const slash = storagePath.lastIndexOf("/");
  const folder = slash === -1 ? "" : storagePath.slice(0, slash);
  const name = storagePath.slice(slash + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 1000, search: name });
  if (error) throw new Error(`Storage list "${folder}" failed: ${error.message}`);
  const entry = (data ?? []).find((e) => e.id !== null && e.name === name);
  if (!entry) return null;
  const size = Number((entry.metadata as { size?: number } | null)?.size);
  if (!Number.isFinite(size)) throw new Error(`Storage object ${storagePath} has no size metadata`);
  return size;
}

export interface ApplyItemResult {
  attachmentId: string;
  outcome: "archived" | "failed";
  detail: string;
}

export interface ApplyResult {
  aborted: string | null;
  items: ApplyItemResult[];
}

/**
 * APPLY. Never invoked by the default dry run. Re-discovers from scratch
 * and refuses unless the fresh batch is verified and its fingerprint equals
 * `confirm` (i.e. exactly the batch Alex approved, with unchanged backup
 * evidence). Stops at the first item that cannot be fully confirmed.
 */
export async function applyCleanup(admin: SupabaseClient, backupRoot: string, confirm: string): Promise<{ discovery: DiscoveryResult; apply: ApplyResult }> {
  const discovery = await discover(admin, backupRoot);
  const apply: ApplyResult = { aborted: null, items: [] };
  if (!discovery.summary.verified) {
    apply.aborted = `fresh dry run is NOT VERIFIED (${discovery.summary.reasons.join("; ")}) — nothing removed.`;
    return { discovery, apply };
  }
  if (discovery.summary.fingerprint !== confirm) {
    apply.aborted = `fresh batch fingerprint ${discovery.summary.fingerprint} ≠ --confirm=${confirm} — state changed since the approved dry run; nothing removed.`;
    return { discovery, apply };
  }

  for (const c of discovery.batch) {
    const failure = await archiveOne(admin, c);
    if (failure) {
      apply.items.push({ attachmentId: c.row.id, outcome: "failed", detail: failure });
      apply.aborted = `stopped at ${c.row.id}: ${failure}`;
      break;
    }
    apply.items.push({ attachmentId: c.row.id, outcome: "archived", detail: `removed ${c.pathsToRemove.length} object(s); is_available=false` });
  }
  return { discovery, apply };
}

/** One candidate, in the only permitted order. Returns a failure detail, or null when fully archived. */
async function archiveOne(admin: SupabaseClient, c: GatedCandidate): Promise<string | null> {
  // 1. Fresh re-check immediately before removal.
  const { data: fresh, error } = await admin
    .from("ticket_attachments")
    .select("is_available, unfuddle_id, storage_path, thumbnail_path")
    .eq("id", c.row.id)
    .maybeSingle();
  if (error) return `re-check query failed: ${error.message}`;
  const liveSizes = new Map<string, number | null>();
  for (const p of c.pathsToRemove) liveSizes.set(p, await liveObjectSize(admin, p));
  const problems = recheckProblems(c, fresh, liveSizes);
  if (problems.length > 0) return `pre-removal re-check: ${problems.join("; ")}`;

  // 2. Remove the physical object(s) — a self-thumbnail is one object.
  const { data: removed, error: removeError } = await admin.storage.from(BUCKET).remove(c.pathsToRemove);
  const notRemoved = findUnremovedPaths(c.pathsToRemove, removed);

  // 3. Never trust remove()'s response alone: every exact path must now be absent.
  const stillPresent: string[] = [];
  for (const p of c.pathsToRemove) if ((await liveObjectSize(admin, p)) !== null) stillPresent.push(p);
  if (removeError || notRemoved.length > 0 || stillPresent.length > 0) {
    const why = [
      removeError?.message,
      notRemoved.length ? `not reported removed: ${notRemoved.join(", ")}` : "",
      stillPresent.length ? `still present: ${stillPresent.join(", ")}` : "",
    ].filter(Boolean);
    return `Storage removal not confirmed (${why.join("; ")}) — is_available left unchanged`;
  }

  // 4. Only now mark the row unavailable. Row, paths, and history are preserved.
  const { data: updated, error: updateError } = await admin
    .from("ticket_attachments")
    .update({ is_available: false })
    .eq("id", c.row.id)
    .eq("is_available", true)
    .eq("storage_path", c.row.storage_path)
    .select("id");
  if (updateError) return `objects removed but is_available update failed: ${updateError.message} — needs manual follow-up`;
  if ((updated ?? []).length !== 1) return `objects removed but is_available update touched ${(updated ?? []).length} rows — needs manual follow-up`;
  return null;
}
