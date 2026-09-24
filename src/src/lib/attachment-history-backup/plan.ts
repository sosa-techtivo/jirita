// Pure planning/verification logic for the one-off, READ-ONLY backup of
// historical Unfuddle ticket attachments (ticket_attachments rows with
// unfuddle_id IS NOT NULL) — no I/O, so every classification and
// verification rule here is unit-tested (plan.test.ts). Originals and
// thumbnails are identified only by the exact DB paths, never by folder
// naming.

export interface HistoricalAttachmentRow {
  id: string;
  ticket_id: string;
  unfuddle_id: string | number;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  is_available: boolean;
  storage_path: string;
  thumbnail_path: string | null;
}

/** Physical object metadata as listed from Storage (exact path → size). */
export type SourceObjects = ReadonlyMap<string, { sizeBytes: number }>;

export type ObjectKind = "original" | "thumbnail";

export type OriginalClass = "available" | "intentionally_unavailable" | "missing";
export type ThumbnailClass = "none" | "self" | "available" | "missing";

export interface PlannedObject {
  kind: ObjectKind;
  storagePath: string;
  /** Relative to the backup root, e.g. "objects/originals/<storage_path>". */
  localPath: string;
  sizeBytes: number;
}

export interface RowPlan {
  row: HistoricalAttachmentRow;
  original: OriginalClass;
  thumbnail: ThumbnailClass;
  originalObject: PlannedObject | null;
  thumbnailObject: PlannedObject | null;
  notes: string[];
}

export interface BackupPlan {
  rows: RowPlan[];
  /** Unique physical objects to download (deduped by kind + exact path). */
  objects: PlannedObject[];
  /** Local-path collisions (e.g. case-only differences on macOS) — any entry blocks the backup. */
  collisions: string[];
}

const MAX_SEGMENT_BYTES = 255;

/**
 * Local filesystem representation of a canonical Storage path. Segments
 * are kept verbatim when safe; an unsafe segment ("", ".", "..", "~",
 * containing a backslash/NUL/control char, or over 255 bytes) is replaced
 * with "%enc%" + encodeURIComponent(segment) — or, if that is still too
 * long, "%sha%" + a hash supplied by the caller. The manifest always
 * records the canonical storage_path next to the local path, which is
 * what makes every entry reversible.
 */
export function toLocalRelativePath(kind: ObjectKind, storagePath: string, hash: (s: string) => string): string {
  const segments = storagePath.split("/").map((segment) => {
    const unsafe = segment === "" || segment === "." || segment === ".." || segment === "~" || /[\\\x00-\x1f]/.test(segment) || segment.startsWith("%enc%") || segment.startsWith("%sha%");
    if (!unsafe && Buffer.byteLength(segment) <= MAX_SEGMENT_BYTES) return segment;
    const encoded = `%enc%${encodeURIComponent(segment)}`;
    return Buffer.byteLength(encoded) <= MAX_SEGMENT_BYTES ? encoded : `%sha%${hash(segment)}`;
  });
  return ["objects", kind === "original" ? "originals" : "thumbnails", ...segments].join("/");
}

export function buildBackupPlan(
  rows: ReadonlyArray<HistoricalAttachmentRow>,
  source: SourceObjects,
  hash: (s: string) => string,
): BackupPlan {
  const objects = new Map<string, PlannedObject>();
  const plan = (kind: ObjectKind, storagePath: string): PlannedObject => {
    const key = `${kind}:${storagePath}`;
    let object = objects.get(key);
    if (!object) {
      object = {
        kind,
        storagePath,
        localPath: toLocalRelativePath(kind, storagePath, hash),
        sizeBytes: source.get(storagePath)!.sizeBytes,
      };
      objects.set(key, object);
    }
    return object;
  };

  const rowPlans: RowPlan[] = rows.map((row) => {
    const notes: string[] = [];
    let original: OriginalClass;
    let originalObject: PlannedObject | null = null;
    if (source.has(row.storage_path)) {
      original = "available";
      originalObject = plan("original", row.storage_path);
      if (!row.is_available) notes.push("is_available=false but the physical object exists — backed up anyway");
      if (row.size_bytes != null && row.size_bytes !== originalObject.sizeBytes) {
        notes.push(`DB size_bytes ${row.size_bytes} differs from Storage size ${originalObject.sizeBytes}`);
      }
    } else if (!row.is_available) {
      original = "intentionally_unavailable";
      notes.push("intentionally unavailable historical row — metadata only, no physical object expected");
    } else {
      original = "missing";
      notes.push("UNEXPECTED: original object missing from Storage");
    }

    let thumbnail: ThumbnailClass;
    let thumbnailObject: PlannedObject | null = null;
    if (!row.thumbnail_path) {
      thumbnail = "none";
    } else if (row.thumbnail_path === row.storage_path) {
      thumbnail = "self";
      notes.push("self-thumbnail (thumbnail_path = storage_path) — covered by the original, not downloaded twice");
    } else if (source.has(row.thumbnail_path)) {
      thumbnail = "available";
      thumbnailObject = plan("thumbnail", row.thumbnail_path);
    } else {
      thumbnail = "missing";
      notes.push("UNEXPECTED: thumbnail object missing from Storage");
    }

    return { row, original, thumbnail, originalObject, thumbnailObject, notes };
  });

  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const object of objects.values()) {
    const folded = object.localPath.normalize("NFC").toLowerCase();
    const other = seen.get(folded);
    if (other !== undefined) collisions.push(`${other} <-> ${object.localPath}`);
    else seen.set(folded, object.localPath);
  }

  return { rows: rowPlans, objects: [...objects.values()], collisions };
}

export interface LocalObjectState {
  /** Size on disk, or null when the file is absent. */
  sizeBytes: number | null;
  /** SHA-256 recomputed from the file on disk. */
  sha256: string | null;
  /** SHA-256 recorded by the download that wrote the file. */
  recordedSha256: string | null;
  /** Last download error, if the object never completed. */
  error: string | null;
}

export interface VerificationSummary {
  dbRows: number;
  intentionallyUnavailableRows: number;
  expectedOriginals: number;
  downloadedOriginals: number;
  expectedThumbnails: number;
  downloadedThumbnails: number;
  selfThumbnails: number;
  rowsWithoutThumbnail: number;
  expectedBytes: number;
  downloadedBytes: number;
  unexpectedMissing: string[];
  failedDownloads: string[];
  sizeMismatches: string[];
  checksumProblems: string[];
  collisions: string[];
  dbSizeNotes: number;
  verified: boolean;
  reasons: string[];
}

export function objectKey(object: Pick<PlannedObject, "kind" | "storagePath">): string {
  return `${object.kind}:${object.storagePath}`;
}

export function verifyBackup(plan: BackupPlan, local: ReadonlyMap<string, LocalObjectState>): VerificationSummary {
  const unexpectedMissing: string[] = [];
  for (const rp of plan.rows) {
    if (rp.original === "missing") unexpectedMissing.push(`original ${rp.row.storage_path} (attachment ${rp.row.id})`);
    if (rp.thumbnail === "missing") unexpectedMissing.push(`thumbnail ${rp.row.thumbnail_path} (attachment ${rp.row.id})`);
  }

  const failedDownloads: string[] = [];
  const sizeMismatches: string[] = [];
  const checksumProblems: string[] = [];
  let downloadedOriginals = 0;
  let downloadedThumbnails = 0;
  let downloadedBytes = 0;
  for (const object of plan.objects) {
    const state = local.get(objectKey(object));
    const label = `${object.kind} ${object.storagePath}`;
    if (!state || state.sizeBytes === null) {
      failedDownloads.push(state?.error ? `${label}: ${state.error}` : `${label}: not present locally`);
      continue;
    }
    if (state.sizeBytes !== object.sizeBytes) {
      sizeMismatches.push(`${label}: local ${state.sizeBytes} ≠ source ${object.sizeBytes}`);
      continue;
    }
    if (!state.sha256 || !state.recordedSha256 || state.sha256 !== state.recordedSha256) {
      checksumProblems.push(`${label}: SHA-256 ${state.recordedSha256 ? "does not match the download record" : "was never recorded"}`);
      continue;
    }
    downloadedBytes += state.sizeBytes;
    if (object.kind === "original") downloadedOriginals++;
    else downloadedThumbnails++;
  }

  const expectedOriginals = plan.objects.filter((o) => o.kind === "original").length;
  const expectedThumbnails = plan.objects.length - expectedOriginals;
  const expectedBytes = plan.objects.reduce((sum, o) => sum + o.sizeBytes, 0);

  const reasons: string[] = [];
  if (plan.rows.length === 0) reasons.push("no historical rows found");
  if (plan.collisions.length) reasons.push(`${plan.collisions.length} local path collision(s)`);
  if (unexpectedMissing.length) reasons.push(`${unexpectedMissing.length} unexpected missing object(s)`);
  if (failedDownloads.length) reasons.push(`${failedDownloads.length} failed download(s)`);
  if (sizeMismatches.length) reasons.push(`${sizeMismatches.length} size mismatch(es)`);
  if (checksumProblems.length) reasons.push(`${checksumProblems.length} checksum problem(s)`);
  if (downloadedOriginals !== expectedOriginals) reasons.push(`originals ${downloadedOriginals}/${expectedOriginals}`);
  if (downloadedThumbnails !== expectedThumbnails) reasons.push(`thumbnails ${downloadedThumbnails}/${expectedThumbnails}`);
  if (downloadedBytes !== expectedBytes) reasons.push(`bytes ${downloadedBytes}/${expectedBytes}`);

  return {
    dbRows: plan.rows.length,
    intentionallyUnavailableRows: plan.rows.filter((r) => r.original === "intentionally_unavailable").length,
    expectedOriginals,
    downloadedOriginals,
    expectedThumbnails,
    downloadedThumbnails,
    selfThumbnails: plan.rows.filter((r) => r.thumbnail === "self").length,
    rowsWithoutThumbnail: plan.rows.filter((r) => r.thumbnail === "none").length,
    expectedBytes,
    downloadedBytes,
    unexpectedMissing,
    failedDownloads,
    sizeMismatches,
    checksumProblems,
    collisions: plan.collisions,
    dbSizeNotes: plan.rows.filter((r) => r.notes.some((n) => n.startsWith("DB size_bytes"))).length,
    verified: reasons.length === 0,
    reasons,
  };
}

export interface ManifestRecord {
  attachment_id: string;
  ticket_id: string;
  unfuddle_id: string;
  filename: string;
  mime_type: string | null;
  created_at: string;
  is_available: boolean;
  storage_path: string;
  thumbnail_path: string | null;
  db_size_bytes: number | null;
  original_class: OriginalClass;
  expected_original_size: number | null;
  local_original_path: string | null;
  original_status: string;
  original_sha256: string | null;
  thumbnail_class: ThumbnailClass;
  expected_thumbnail_size: number | null;
  local_thumbnail_path: string | null;
  thumbnail_status: string;
  thumbnail_sha256: string | null;
  notes: string;
}

function objectStatus(object: PlannedObject, local: ReadonlyMap<string, LocalObjectState>): { status: string; sha: string | null } {
  const state = local.get(objectKey(object));
  if (!state || state.sizeBytes === null) return { status: state?.error ? "failed" : "missing_locally", sha: null };
  if (state.sizeBytes !== object.sizeBytes) return { status: "size_mismatch", sha: state.sha256 };
  if (!state.sha256 || state.sha256 !== state.recordedSha256) return { status: "checksum_unverified", sha: state.sha256 };
  return { status: "verified", sha: state.sha256 };
}

export function buildManifestRecords(plan: BackupPlan, local: ReadonlyMap<string, LocalObjectState>): ManifestRecord[] {
  return plan.rows.map((rp) => {
    const o = rp.originalObject ? objectStatus(rp.originalObject, local) : null;
    const t = rp.thumbnailObject ? objectStatus(rp.thumbnailObject, local) : null;
    return {
      attachment_id: rp.row.id,
      ticket_id: rp.row.ticket_id,
      unfuddle_id: String(rp.row.unfuddle_id),
      filename: rp.row.filename,
      mime_type: rp.row.mime_type,
      created_at: rp.row.created_at,
      is_available: rp.row.is_available,
      storage_path: rp.row.storage_path,
      thumbnail_path: rp.row.thumbnail_path,
      db_size_bytes: rp.row.size_bytes,
      original_class: rp.original,
      expected_original_size: rp.originalObject?.sizeBytes ?? null,
      local_original_path: rp.originalObject?.localPath ?? null,
      original_status: o?.status ?? (rp.original === "intentionally_unavailable" ? "not_applicable" : "missing_in_source"),
      original_sha256: o?.sha ?? null,
      thumbnail_class: rp.thumbnail,
      expected_thumbnail_size: rp.thumbnailObject?.sizeBytes ?? null,
      local_thumbnail_path: rp.thumbnailObject?.localPath ?? null,
      thumbnail_status: t?.status ?? { none: "not_applicable", self: "same_as_original", available: "?", missing: "missing_in_source" }[rp.thumbnail],
      thumbnail_sha256: t?.sha ?? null,
      notes: rp.notes.join("; "),
    };
  });
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records: ReadonlyArray<ManifestRecord>): string {
  if (records.length === 0) return "";
  const headers = Object.keys(records[0]) as (keyof ManifestRecord)[];
  const lines = [headers.join(",")];
  for (const record of records) lines.push(headers.map((h) => csvCell(record[h])).join(","));
  return `${lines.join("\n")}\n`;
}
