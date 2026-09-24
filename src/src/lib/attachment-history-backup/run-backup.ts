// I/O for the one-off, READ-ONLY backup of historical Unfuddle ticket
// attachments. Service-role client (same as the JIR-98 orphan cleanup), but
// only select() / list() / download() are ever called — no insert, update,
// delete, move, or remove, on the database or on Storage. All classification
// and verification rules live in plan.ts.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBackupPlan,
  buildManifestRecords,
  objectKey,
  toCsv,
  verifyBackup,
  type BackupPlan,
  type HistoricalAttachmentRow,
  type LocalObjectState,
  type PlannedObject,
  type VerificationSummary,
} from "./plan";

export const BUCKET = "ticket-attachments";

const ROW_PAGE_SIZE = 1000;
const LIST_PAGE_SIZE = 1000;
// Storage list() shares the project's DB connection pool and can return a
// transient "Too many connections" under load (seen in production) — keep
// listing gentle and give it a longer, still bounded, backoff.
const LIST_CONCURRENCY = 2;
const LIST_MAX_ATTEMPTS = 8;
const DOWNLOAD_CONCURRENCY = 6;
const MAX_ATTEMPTS = 5;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const JOURNAL = "download-journal.jsonl";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = MAX_ATTEMPTS): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts) {
        throw new Error(`${label} failed after ${attempt} attempts: ${err instanceof Error ? err.message : String(err)}`);
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), 30_000));
    }
  }
}

async function mapPool<T>(items: ReadonlyArray<T>, concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

async function loadHistoricalRows(admin: SupabaseClient): Promise<HistoricalAttachmentRow[]> {
  const rows: HistoricalAttachmentRow[] = [];
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await admin
      .from("ticket_attachments")
      .select("id, ticket_id, unfuddle_id, filename, mime_type, size_bytes, created_at, is_available, storage_path, thumbnail_path")
      .not("unfuddle_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + ROW_PAGE_SIZE - 1);
    if (error) throw new Error(`ticket_attachments load failed: ${error.message}`);
    rows.push(...((data ?? []) as HistoricalAttachmentRow[]));
    if (!data || data.length < ROW_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Lists only the folders the DB paths live in (one level each, paginated),
 * so the source inventory is exact-path based without walking the whole
 * bucket. Throws on a persistently failing listing — an incomplete listing
 * must never silently turn objects into "missing".
 */
async function listSourceObjects(admin: SupabaseClient, paths: ReadonlyArray<string>): Promise<Map<string, { sizeBytes: number }>> {
  const folders = [...new Set(paths.map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")))].sort();
  const wanted = new Set(paths);
  const found = new Map<string, { sizeBytes: number }>();
  await mapPool(folders, LIST_CONCURRENCY, async (folder) => {
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const data = await withRetry(`Storage list "${folder || "/"}"`, async () => {
        const { data, error } = await admin.storage
          .from(BUCKET)
          .list(folder, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(error.message);
        return data ?? [];
      }, LIST_MAX_ATTEMPTS);
      for (const entry of data) {
        if (entry.id === null) continue; // sub-folder
        const full = folder ? `${folder}/${entry.name}` : entry.name;
        if (!wanted.has(full)) continue;
        const size = Number((entry.metadata as { size?: number } | null)?.size);
        if (!Number.isFinite(size)) throw new Error(`Storage object ${full} has no size metadata`);
        found.set(full, { sizeBytes: size });
      }
      if (data.length < LIST_PAGE_SIZE) break;
    }
  });
  return found;
}

export interface Inventory {
  rows: HistoricalAttachmentRow[];
  plan: BackupPlan;
}

export async function loadInventory(admin: SupabaseClient): Promise<Inventory> {
  const rows = await loadHistoricalRows(admin);
  const paths = rows.flatMap((r) => (r.thumbnail_path ? [r.storage_path, r.thumbnail_path] : [r.storage_path]));
  const source = await listSourceObjects(admin, paths);
  return { rows, plan: buildBackupPlan(rows, source, shortHash) };
}

interface JournalEntry {
  key: string;
  sizeBytes: number;
  sha256: string;
}

async function readJournal(root: string): Promise<Map<string, JournalEntry>> {
  const entries = new Map<string, JournalEntry>();
  let text: string;
  try {
    text = await readFile(path.join(root, JOURNAL), "utf8");
  } catch {
    return entries;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as JournalEntry;
      entries.set(entry.key, entry); // last write wins
    } catch {
      /* torn final line from an interrupted run — ignore */
    }
  }
  return entries;
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size;
  } catch {
    return null;
  }
}

/** Resolves a manifest-relative local path, refusing anything that would escape the backup root. */
function resolveInside(root: string, relative: string): string {
  const full = path.resolve(root, relative);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`Refusing local path outside backup root: ${relative}`);
  return full;
}

async function downloadObject(admin: SupabaseClient, root: string, object: PlannedObject): Promise<JournalEntry> {
  const dest = resolveInside(root, object.localPath);
  const partial = `${dest}.partial`;
  await mkdir(path.dirname(dest), { recursive: true });
  return withRetry(`download ${object.storagePath}`, async () => {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .download(object.storagePath, {}, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), cache: "no-store" })
      .asStream();
    if (error || !data) throw new Error(error?.message ?? "empty download body");
    const hash = createHash("sha256");
    let bytes = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        bytes += chunk.length;
        callback(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(data as WebReadableStream<Uint8Array>), tap, createWriteStream(partial, { flags: "w" }));
      if (bytes !== object.sizeBytes) throw new Error(`downloaded ${bytes} bytes, source metadata says ${object.sizeBytes}`);
    } catch (err) {
      await rm(partial, { force: true });
      throw err;
    }
    await rename(partial, dest);
    return { key: objectKey(object), sizeBytes: bytes, sha256: hash.digest("hex") };
  });
}

export interface DownloadReport {
  reused: number;
  downloaded: number;
  failed: Map<string, string>;
}

/**
 * Downloads every planned object not already valid on disk. An existing
 * file is reused only when its size matches the source AND its recomputed
 * SHA-256 matches the one journaled by the download that wrote it —
 * a filename alone is never trusted.
 */
export async function downloadAll(
  admin: SupabaseClient,
  root: string,
  plan: BackupPlan,
  onProgress: (done: number, total: number) => void,
): Promise<DownloadReport> {
  const journal = await readJournal(root);
  const report: DownloadReport = { reused: 0, downloaded: 0, failed: new Map() };
  let done = 0;
  await mapPool(plan.objects, DOWNLOAD_CONCURRENCY, async (object) => {
    const key = objectKey(object);
    const dest = resolveInside(root, object.localPath);
    const recorded = journal.get(key);
    if (recorded && recorded.sizeBytes === object.sizeBytes && (await fileSize(dest)) === object.sizeBytes && (await sha256File(dest)) === recorded.sha256) {
      report.reused++;
    } else {
      try {
        const entry = await downloadObject(admin, root, object);
        await appendFile(path.join(root, JOURNAL), `${JSON.stringify(entry)}\n`);
        report.downloaded++;
      } catch (err) {
        report.failed.set(key, err instanceof Error ? err.message : String(err));
      }
    }
    onProgress(++done, plan.objects.length);
  });
  return report;
}

/** Re-reads every planned object from disk (size + fresh SHA-256) against the journal. */
export async function inspectLocal(root: string, plan: BackupPlan, failed: ReadonlyMap<string, string>): Promise<Map<string, LocalObjectState>> {
  const journal = await readJournal(root);
  const states = new Map<string, LocalObjectState>();
  await mapPool(plan.objects, DOWNLOAD_CONCURRENCY, async (object) => {
    const key = objectKey(object);
    const file = resolveInside(root, object.localPath);
    const sizeBytes = await fileSize(file);
    states.set(key, {
      sizeBytes,
      sha256: sizeBytes === null ? null : await sha256File(file),
      recordedSha256: journal.get(key)?.sha256 ?? null,
      error: failed.get(key) ?? null,
    });
  });
  return states;
}

async function writeAtomic(file: string, content: string): Promise<void> {
  await writeFile(`${file}.tmp`, content);
  await rename(`${file}.tmp`, file);
}

export async function writeManifest(
  root: string,
  plan: BackupPlan,
  local: ReadonlyMap<string, LocalObjectState>,
  summary: VerificationSummary,
  meta: { startedAt: string; verifiedAt: string },
): Promise<void> {
  const records = buildManifestRecords(plan, local);
  const manifest = {
    kind: "jirita-unfuddle-ticket-attachments-backup",
    version: 1,
    bucket: BUCKET,
    source_filter: "public.ticket_attachments WHERE unfuddle_id IS NOT NULL",
    local_path_encoding:
      "objects/originals/<storage_path> and objects/thumbnails/<thumbnail_path>, verbatim per segment; an unsafe segment is written as %enc%<encodeURIComponent(segment)> (or %sha%<hash> if still over 255 bytes). storage_path/thumbnail_path in each record are always canonical.",
    started_at: meta.startedAt,
    verified_at: meta.verifiedAt,
    summary: { ...summary, status: summary.verified ? "BACKUP VERIFIED" : "BACKUP NOT VERIFIED" },
    records,
  };
  await writeAtomic(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeAtomic(path.join(root, "manifest.csv"), toCsv(records));
}

export async function verify(
  admin: SupabaseClient,
  root: string,
  failed: ReadonlyMap<string, string>,
): Promise<{ plan: BackupPlan; local: Map<string, LocalObjectState>; summary: VerificationSummary }> {
  // Fresh inventory — verification never trusts the plan the download used.
  const { plan } = await loadInventory(admin);
  const local = await inspectLocal(root, plan, failed);
  return { plan, local, summary: verifyBackup(plan, local) };
}
