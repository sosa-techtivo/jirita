// I/O for the ticket-attachments orphan cleanup — discovery, reference
// checks, and (APPLY only) removal. Service-role client throughout: this is
// an administrative operation and must not depend on Storage RLS. All
// eligibility decisions are delegated to eligibility.ts.
//
// Discovery is always done live at run time (never from a previously
// captured list), and every candidate is re-checked against
// ticket_attachments right before it's reported eligible — and, in APPLY,
// again immediately before each removal batch.
import type { SupabaseClient } from "@supabase/supabase-js";
import { findUnremovedPaths } from "../attachment-storage-remove";
import {
  classifyObjects,
  collectReferencedPaths,
  excludeNewlyReferenced,
  RECENT_WINDOW_MS,
  type ReferenceRow,
  type StorageObjectInfo,
} from "./eligibility";

export const BUCKET = "ticket-attachments";

const LIST_PAGE_SIZE = 1000;
const REFERENCE_PAGE_SIZE = 1000;
const RECHECK_BATCH_SIZE = 50;
const REMOVE_BATCH_SIZE = 100;

export interface CleanupOptions {
  mode: "dry-run" | "apply";
  /** APPLY aborts without deleting anything when more objects than this are eligible. */
  maxDelete: number;
  now?: Date;
}

export interface CleanupReport {
  mode: "dry-run" | "apply";
  now: Date;
  totalObjects: number;
  totalObjectBytes: number;
  referencedRows: number;
  referencedObjects: number;
  recentUnreferenced: StorageObjectInfo[];
  /** Became referenced between discovery and the re-check — skipped. */
  nowReferenced: StorageObjectInfo[];
  eligible: StorageObjectInfo[];
  apply?: {
    aborted: string | null;
    requested: number;
    removed: string[];
    notRemoved: string[];
    skippedAtFinalRecheck: string[];
    errors: string[];
  };
}

const LIST_MAX_ATTEMPTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Read-only list() with bounded backoff — walking thousands of per-ticket
// folders can trip Storage's transient "Too many connections" limit even
// when requests are strictly sequential. Still throws after the last
// attempt, so an incomplete listing never silently shrinks the scan.
async function listPage(admin: SupabaseClient, prefix: string, offset: number) {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (!error) return data;
    if (attempt >= LIST_MAX_ATTEMPTS) {
      throw new Error(`Storage list failed at "${prefix || "/"}" after ${attempt} attempts: ${error.message}`);
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
}

async function listAllObjects(admin: SupabaseClient, prefix = ""): Promise<StorageObjectInfo[]> {
  const objects: StorageObjectInfo[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const data = await listPage(admin, prefix, offset);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // Folder — recurse; Storage list() is one level deep per call.
        objects.push(...(await listAllObjects(admin, path)));
      } else {
        const size = Number((entry.metadata as { size?: number } | null)?.size ?? 0);
        objects.push({ path, sizeBytes: Number.isFinite(size) ? size : 0, createdAt: entry.created_at });
      }
    }
    if (!data || data.length < LIST_PAGE_SIZE) break;
  }
  return objects;
}

async function loadAllReferenceRows(admin: SupabaseClient): Promise<ReferenceRow[]> {
  const rows: ReferenceRow[] = [];
  for (let from = 0; ; from += REFERENCE_PAGE_SIZE) {
    const { data, error } = await admin
      .from("ticket_attachments")
      .select("id, storage_path, thumbnail_path")
      .order("id", { ascending: true })
      .range(from, from + REFERENCE_PAGE_SIZE - 1);
    if (error) throw new Error(`ticket_attachments reference load failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < REFERENCE_PAGE_SIZE) break;
  }
  return rows;
}

/** Fresh, targeted lookup: which of these exact paths does any row reference right now? */
async function findReferencedAmong(admin: SupabaseClient, paths: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (let i = 0; i < paths.length; i += RECHECK_BATCH_SIZE) {
    const batch = paths.slice(i, i + RECHECK_BATCH_SIZE);
    for (const column of ["storage_path", "thumbnail_path"] as const) {
      const { data, error } = await admin.from("ticket_attachments").select(column).in(column, batch);
      if (error) throw new Error(`Reference re-check on ${column} failed: ${error.message}`);
      for (const row of (data ?? []) as Record<string, string | null>[]) {
        const value = row[column];
        if (value) referenced.add(value);
      }
    }
  }
  return referenced;
}

export async function runOrphanCleanup(admin: SupabaseClient, options: CleanupOptions): Promise<CleanupReport> {
  const now = options.now ?? new Date();

  const objects = await listAllObjects(admin);
  const referenceRows = await loadAllReferenceRows(admin);
  // Fail closed: an empty reference set would make every object look
  // orphaned. This table is never legitimately empty in production.
  if (referenceRows.length === 0) {
    throw new Error("ticket_attachments returned 0 rows — refusing to classify anything as orphaned.");
  }

  const classification = classifyObjects(objects, collectReferencedPaths(referenceRows), now, RECENT_WINDOW_MS);
  const recheck = await findReferencedAmong(admin, classification.candidates.map((o) => o.path));
  const { eligible, nowReferenced } = excludeNewlyReferenced(classification.candidates, recheck);

  const report: CleanupReport = {
    mode: options.mode,
    now,
    totalObjects: objects.length,
    totalObjectBytes: objects.reduce((sum, o) => sum + o.sizeBytes, 0),
    referencedRows: referenceRows.length,
    referencedObjects: classification.referenced.length,
    recentUnreferenced: classification.recentUnreferenced,
    nowReferenced,
    eligible,
  };

  if (options.mode !== "apply") return report;

  const apply: NonNullable<CleanupReport["apply"]> = {
    aborted: null,
    requested: 0,
    removed: [],
    notRemoved: [],
    skippedAtFinalRecheck: [],
    errors: [],
  };
  report.apply = apply;

  if (eligible.length > options.maxDelete) {
    apply.aborted = `${eligible.length} eligible objects exceeds --max-delete=${options.maxDelete}; nothing was deleted.`;
    return report;
  }

  for (let i = 0; i < eligible.length; i += REMOVE_BATCH_SIZE) {
    const batchPaths = eligible.slice(i, i + REMOVE_BATCH_SIZE).map((o) => o.path);
    // Final gate, immediately before deletion.
    const stillReferenced = await findReferencedAmong(admin, batchPaths);
    const toRemove = batchPaths.filter((path) => !stillReferenced.has(path));
    apply.skippedAtFinalRecheck.push(...batchPaths.filter((path) => stillReferenced.has(path)));
    if (toRemove.length === 0) continue;

    apply.requested += toRemove.length;
    const { data: removed, error } = await admin.storage.from(BUCKET).remove(toRemove);
    if (error) apply.errors.push(error.message);
    const notRemoved = findUnremovedPaths(toRemove, removed);
    apply.notRemoved.push(...notRemoved);
    apply.removed.push(...toRemove.filter((path) => !notRemoved.includes(path)));
  }

  return report;
}
