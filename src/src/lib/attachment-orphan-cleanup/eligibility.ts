// Pure eligibility logic for the ticket-attachments orphan cleanup (JIR-98
// follow-up) — no I/O, so every safety rule here is unit-tested
// (eligibility.test.ts). An object is a deletion candidate only when its
// exact path is referenced by neither ticket_attachments.storage_path nor
// ticket_attachments.thumbnail_path AND it is older than the safety window
// (an upload that has reached Storage but not yet inserted its row must
// never be mistaken for an orphan). An object with no usable created_at is
// treated as recent — fail closed, never eligible.

export const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface StorageObjectInfo {
  /** Full object path inside the bucket, e.g. "<ticket_id>/<uuid>-file.png". */
  path: string;
  sizeBytes: number;
  createdAt: string | null;
}

export interface ReferenceRow {
  storage_path: string | null;
  thumbnail_path: string | null;
}

export interface Classification {
  candidates: StorageObjectInfo[];
  referenced: StorageObjectInfo[];
  /** Unreferenced, but inside the safety window (or with no created_at) — skipped. */
  recentUnreferenced: StorageObjectInfo[];
}

/** Every path any ticket_attachments row references, from either column. */
export function collectReferencedPaths(rows: ReadonlyArray<ReferenceRow>): Set<string> {
  const paths = new Set<string>();
  for (const row of rows) {
    if (row.storage_path) paths.add(row.storage_path);
    if (row.thumbnail_path) paths.add(row.thumbnail_path);
  }
  return paths;
}

export function isOutsideSafetyWindow(createdAt: string | null, now: Date, windowMs = RECENT_WINDOW_MS): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created >= windowMs;
}

export function classifyObjects(
  objects: ReadonlyArray<StorageObjectInfo>,
  referencedPaths: ReadonlySet<string>,
  now: Date,
  windowMs = RECENT_WINDOW_MS
): Classification {
  const result: Classification = { candidates: [], referenced: [], recentUnreferenced: [] };
  for (const object of objects) {
    if (referencedPaths.has(object.path)) {
      result.referenced.push(object);
    } else if (!isOutsideSafetyWindow(object.createdAt, now, windowMs)) {
      result.recentUnreferenced.push(object);
    } else {
      result.candidates.push(object);
    }
  }
  return result;
}

/** Drops every candidate a fresh reference re-check found referenced — the
 *  last gate before a candidate is reported eligible or deleted. */
export function excludeNewlyReferenced(
  candidates: ReadonlyArray<StorageObjectInfo>,
  freshlyReferencedPaths: ReadonlySet<string>
): { eligible: StorageObjectInfo[]; nowReferenced: StorageObjectInfo[] } {
  const eligible: StorageObjectInfo[] = [];
  const nowReferenced: StorageObjectInfo[] = [];
  for (const candidate of candidates) {
    (freshlyReferencedPaths.has(candidate.path) ? nowReferenced : eligible).push(candidate);
  }
  return { eligible, nowReferenced };
}

export function totalBytes(objects: ReadonlyArray<StorageObjectInfo>): number {
  return objects.reduce((sum, object) => sum + object.sizeBytes, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}
