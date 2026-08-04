// Pure serialization layer on top of exportProject()'s in-memory snapshot
// (see export-project.ts — untouched by this file) plus the physical
// attachment files collected by collect-project-backup-attachment-files.ts.
// Turns them into a set of virtual backup "files", still fully in memory:
// no disk writes, no ZIP, no compression, no Storage, no download, no
// restoration. Just (object, files[]) -> Record<path, string | Uint8Array>.
//
// Two backup types, same format/version (no parser compatibility break):
// "full" includes every physical attachment file under files/ (the
// original, only behavior this feature had); "data-only" includes exactly
// the same 12 JSON files — attachments.json's metadata (including every
// original storage_path) is never altered or dropped — but no files/
// entries at all. Introduced because Supabase Storage's project-wide
// upload size limit on the Free plan (a hard 50MB, confirmed live) makes a
// Storage-based large-file transport for Restore's preview upload
// impractical without a paid-plan dependency; a Data Only backup is the
// alternative path to a backup small enough to upload directly.

import type { ExportedProjectData, ExportedProjectSummary } from "./export-project";
import type { CollectedAttachmentFile } from "./collect-project-backup-attachment-files";

const JSON_INDENT = 2;

export const PROJECT_BACKUP_FORMAT = "jirita-project-backup" as const;
export const PROJECT_BACKUP_VERSION = 1 as const;

export type ProjectBackupType = "full" | "data-only";

// Minimal identification fields only — a copy of what's already in
// project.json's own id/name/slug, not a restatement of the full row, so
// manifest.json can name the backup (and tell backups apart) without
// requiring project.json to be opened first.
export interface ProjectBackupManifestProject {
  id: string;
  name: string;
  slug: string;
}

export interface ProjectBackupManifest {
  format: typeof PROJECT_BACKUP_FORMAT;
  version: typeof PROJECT_BACKUP_VERSION;
  exportedAt: string;
  summary: ExportedProjectSummary;
  project: ProjectBackupManifestProject;
  /** Whether the zip's files/ entries carry every attachment's physical
   *  content. Optional in the type because a backup produced before this
   *  feature existed simply never has this field at all — but
   *  serializeExportedProject() itself always sets it (to `true`).
   *  parseProjectBackupZip() is what resolves an absent field to `false`
   *  on its own, always-present ParsedProjectBackup.attachmentsIncluded. */
  attachmentsIncluded?: boolean;
  /** Real sum of every included attachment file's byte length. Optional for
   *  the same reason as attachmentsIncluded above; always set (to a real
   *  number, 0 included) by serializeExportedProject(). */
  attachmentBytes?: number;
}

// The 12 JSON files that always sit at the zip root — unchanged from
// before this feature. Attachment physical files are added separately,
// under "files/", and are not part of this fixed list (their names are
// data-dependent: one per attachment.storage_path).
const VIRTUAL_FILENAMES = [
  "manifest.json",
  "project.json",
  "members.json",
  "statuses.json",
  "tickets.json",
  "comments.json",
  "activity.json",
  "time-entries.json",
  "attachments.json",
  "relations.json",
  "notes.json",
  "note-activity.json",
] as const;

// Deliberately a plain, open Record rather than trying to encode "the 12
// fixed JSON keys, plus any number of files/<path> keys with a different
// value type" as a single static TypeScript type (a template-literal index
// signature intersected with a fixed-key Record works in principle, but
// adds real type-system complexity for no runtime benefit) — the actual
// guarantee ("exactly these files, exactly these types") is enforced at
// runtime below, the same way VIRTUAL_FILENAMES/COLLECTION_FILES already
// enforced the closed 12-key contract before this feature existed.
export type SerializedProjectBackup = Record<string, string | Uint8Array>;

const FILES_PREFIX = "files/";

// The array-shaped collections on ExportedProjectData, paired with the
// virtual filename each one becomes and the summary key that must match its
// length — one list, so filenames/collections/summary keys can never drift
// out of sync with each other.
const COLLECTION_FILES = [
  { collectionKey: "members", summaryKey: "members", filename: "members.json" },
  { collectionKey: "statuses", summaryKey: "statuses", filename: "statuses.json" },
  { collectionKey: "tickets", summaryKey: "tickets", filename: "tickets.json" },
  { collectionKey: "comments", summaryKey: "comments", filename: "comments.json" },
  { collectionKey: "activity", summaryKey: "activity", filename: "activity.json" },
  { collectionKey: "timeEntries", summaryKey: "timeEntries", filename: "time-entries.json" },
  { collectionKey: "attachments", summaryKey: "attachments", filename: "attachments.json" },
  { collectionKey: "relations", summaryKey: "relations", filename: "relations.json" },
  { collectionKey: "notes", summaryKey: "notes", filename: "notes.json" },
  { collectionKey: "noteActivity", summaryKey: "noteActivity", filename: "note-activity.json" },
] as const satisfies ReadonlyArray<{
  collectionKey: keyof ExportedProjectData;
  summaryKey: keyof ExportedProjectSummary;
  filename: string;
}>;

function toIndentedJson(value: unknown): string {
  return JSON.stringify(value, null, JSON_INDENT);
}

/**
 * Pure function: same input always produces the same output, no I/O, no
 * mutation of `exportedProject` or `attachmentFiles`. Validates the shape
 * it was actually given (this runs after exportProject() and
 * collectProjectBackupAttachmentFiles() in separate steps, so it can't
 * assume either was passed untampered) before building anything.
 *
 * `backupType` controls whether physical attachment files are included:
 * - "full": `attachmentFiles` must correspond 1:1 with
 *   `exportedProject.attachments` (same set of ids/storage_paths) —
 *   collectProjectBackupAttachmentFiles() already guarantees this by
 *   construction (it downloads exactly one file per attachment row or
 *   aborts entirely), so the check here is a defensive re-confirmation,
 *   not the primary enforcement point. Every file becomes a files/<path>
 *   entry; manifest.attachmentsIncluded is true.
 * - "data-only": `attachmentFiles` must be empty — the caller is expected
 *   to skip collectProjectBackupAttachmentFiles() entirely rather than
 *   download files only to discard them here. attachments.json is still
 *   built from exportedProject.attachments exactly as in "full" (every
 *   row, including its original storage_path, unchanged) — only the
 *   physical files/ entries are omitted. manifest.attachmentsIncluded is
 *   false, manifest.attachmentBytes is 0.
 */
export function serializeExportedProject(
  exportedProject: ExportedProjectData,
  attachmentFiles: CollectedAttachmentFile[],
  backupType: ProjectBackupType = "full"
): SerializedProjectBackup {
  if (!exportedProject || typeof exportedProject !== "object") {
    throw new Error("[serializeExportedProject] exportedProject must be the object returned by exportProject().");
  }
  if (!Array.isArray(attachmentFiles)) {
    throw new Error("[serializeExportedProject] attachmentFiles must be the array returned by collectProjectBackupAttachmentFiles().");
  }
  if (backupType !== "full" && backupType !== "data-only") {
    throw new Error(`[serializeExportedProject] backupType must be "full" or "data-only", got "${String(backupType)}".`);
  }
  if (backupType === "data-only" && attachmentFiles.length > 0) {
    throw new Error(
      `[serializeExportedProject] backupType is "data-only" but ${attachmentFiles.length} attachmentFiles were provided — pass an empty array (skip collectProjectBackupAttachmentFiles() entirely for a Data Only backup).`
    );
  }
  if (typeof exportedProject.exportedAt !== "string" || exportedProject.exportedAt.trim() === "") {
    throw new Error("[serializeExportedProject] exportedProject.exportedAt must be a non-empty string.");
  }
  if (!exportedProject.project || typeof exportedProject.project !== "object") {
    throw new Error("[serializeExportedProject] exportedProject.project must be a real project row.");
  }
  if (!exportedProject.summary || typeof exportedProject.summary !== "object") {
    throw new Error("[serializeExportedProject] exportedProject.summary must be a real summary object.");
  }
  const { id: projectId, name: projectName, slug: projectSlug } = exportedProject.project;
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("[serializeExportedProject] exportedProject.project.id must be a non-empty string.");
  }
  if (typeof projectName !== "string" || !projectName) {
    throw new Error("[serializeExportedProject] exportedProject.project.name must be a non-empty string.");
  }
  if (typeof projectSlug !== "string" || !projectSlug) {
    throw new Error("[serializeExportedProject] exportedProject.project.slug must be a non-empty string.");
  }

  for (const { collectionKey, summaryKey } of COLLECTION_FILES) {
    const collection = exportedProject[collectionKey];
    if (!Array.isArray(collection)) {
      throw new Error(`[serializeExportedProject] exportedProject.${collectionKey} must be an array.`);
    }
    const expectedCount = exportedProject.summary[summaryKey];
    if (expectedCount !== collection.length) {
      throw new Error(
        `[serializeExportedProject] summary.${summaryKey} (${expectedCount}) does not match ${collectionKey}.length (${collection.length}).`
      );
    }
  }

  // Defensive 1:1 cross-check between attachments.json rows and the
  // physical files handed in — every attachment must have exactly one
  // file, and no unattached file may be smuggled in. Only meaningful for
  // "full" — "data-only" already guaranteed attachmentFiles is empty above.
  if (backupType === "full") {
    const attachmentStoragePaths = new Set(exportedProject.attachments.map((a) => a.storage_path));
    const providedStoragePaths = new Set(attachmentFiles.map((f) => f.storagePath));
    if (attachmentFiles.length !== exportedProject.attachments.length || providedStoragePaths.size !== attachmentStoragePaths.size) {
      throw new Error(
        `[serializeExportedProject] attachmentFiles.length (${attachmentFiles.length}) does not match exportedProject.attachments.length (${exportedProject.attachments.length}).`
      );
    }
    for (const attachment of exportedProject.attachments) {
      if (!providedStoragePaths.has(attachment.storage_path)) {
        throw new Error(
          `[serializeExportedProject] No physical file was provided for attachment id=${attachment.id} storage_path="${attachment.storage_path}".`
        );
      }
    }
  }

  const attachmentBytes = attachmentFiles.reduce((sum, f) => sum + f.bytes.length, 0);

  const manifest: ProjectBackupManifest = {
    format: PROJECT_BACKUP_FORMAT,
    version: PROJECT_BACKUP_VERSION,
    exportedAt: exportedProject.exportedAt,
    summary: exportedProject.summary,
    project: { id: projectId, name: projectName, slug: projectSlug },
    attachmentsIncluded: backupType === "full",
    attachmentBytes,
  };

  const files: SerializedProjectBackup = {
    "manifest.json": toIndentedJson(manifest),
    "project.json": toIndentedJson(exportedProject.project),
  };

  for (const { collectionKey, filename } of COLLECTION_FILES) {
    // attachments.json itself is built exactly like every other JSON file
    // here — its rows, including every storage_path, are never touched.
    files[filename] = toIndentedJson(exportedProject[collectionKey]);
  }

  for (const attachmentFile of attachmentFiles) {
    files[`${FILES_PREFIX}${attachmentFile.storagePath}`] = attachmentFile.bytes;
  }

  // Confirms the output is exactly the announced set of files — the 12
  // fixed JSON names plus exactly one files/<storage_path> entry per
  // attachment — rather than trusting the construction above alone.
  const producedFilenames = new Set(Object.keys(files));
  for (const name of VIRTUAL_FILENAMES) {
    if (!producedFilenames.has(name)) {
      throw new Error(`[serializeExportedProject] missing expected file "${name}".`);
    }
  }
  const expectedFileEntries = new Set(attachmentFiles.map((f) => `${FILES_PREFIX}${f.storagePath}`));
  const actualFileEntries = new Set([...producedFilenames].filter((name) => name.startsWith(FILES_PREFIX)));
  const fileEntriesMatch =
    expectedFileEntries.size === actualFileEntries.size && [...expectedFileEntries].every((name) => actualFileEntries.has(name));
  if (!fileEntriesMatch) {
    throw new Error(`[serializeExportedProject] files/ entries produced do not match the attachment files provided.`);
  }
  if (producedFilenames.size !== VIRTUAL_FILENAMES.length + expectedFileEntries.size) {
    throw new Error(`[serializeExportedProject] produced an unexpected extra file beyond the 12 known JSON files and the attachment files.`);
  }

  return files;
}
