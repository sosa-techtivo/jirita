// First layer of the project-backup IMPORTER: reads raw ZIP bytes produced
// by buildProjectBackupZip() (see build-project-backup-zip.ts — untouched
// here) and turns them back into validated, in-memory data. Read and
// validate ONLY: no Supabase writes, no project creation, no ticket
// restoration, no attachment upload, no UI, no Route Handler, no Server
// Action, no permissions, no deletion/replacement of existing projects, no
// disk I/O. Those are all later layers.
//
// Field names below were re-audited directly against export-project.ts and
// serialize-exported-project.ts (both untouched by this file, only their
// types/constants are imported) rather than assumed — see each Exported*Row
// type there for the authoritative shape, and the real backups this file
// was tested against (JIRITA Live, KTVibe) for the authoritative runtime
// values.
//
// Backups now optionally carry physical attachment files under files/
// (see serialize-exported-project.ts / collect-project-backup-attachment-
// files.ts). A backup produced before that feature existed has none of
// those entries and no manifest.attachmentsIncluded field at all — this
// parser must keep accepting it (requirement: "no deben rechazarse
// únicamente por ser backups anteriores"), resolving attachmentsIncluded
// to false in that case rather than treating the absence as an error.

import { unzipSync, type UnzipFileFilter } from "fflate";
import type {
  ExportedProjectRow,
  ExportedProjectMembershipRow,
  ExportedTicketStatusRow,
  ExportedTicketRow,
  ExportedTicketCommentRow,
  ExportedTicketActivityRow,
  ExportedTicketTimeEntryRow,
  ExportedTicketAttachmentRow,
  ExportedTicketRelationRow,
  ExportedProjectNoteRow,
  ExportedProjectNoteActivityRow,
} from "./export-project";
import {
  PROJECT_BACKUP_FORMAT,
  PROJECT_BACKUP_VERSION,
  type ProjectBackupManifest,
} from "./serialize-exported-project";

// ── Structured error ────────────────────────────────────────────────────────

export type ProjectBackupParseErrorCategory =
  | "zip" // the bytes aren't a readable zip at all
  | "structure" // wrong/duplicate/nested entries, or a JSON value with the wrong shape
  | "json" // a known entry's bytes aren't valid JSON
  | "manifest" // manifest.json fails its own field-level validation
  | "consistency" // manifest disagrees with project.json or with the real collection counts
  | "referential" // a foreign-key-shaped reference points at a row that doesn't exist
  | "duplicate"; // two rows in the same collection share an identity that must be unique

export class ProjectBackupParseError extends Error {
  readonly category: ProjectBackupParseErrorCategory;
  readonly file?: string;

  constructor(category: ProjectBackupParseErrorCategory, file: string | undefined, message: string) {
    super(message);
    this.name = "ProjectBackupParseError";
    this.category = category;
    this.file = file;
  }
}

// ── Result shape ─────────────────────────────────────────────────────────────

export interface ParsedProjectBackup {
  manifest: ProjectBackupManifest;
  project: ExportedProjectRow;
  members: ExportedProjectMembershipRow[];
  statuses: ExportedTicketStatusRow[];
  tickets: ExportedTicketRow[];
  comments: ExportedTicketCommentRow[];
  activity: ExportedTicketActivityRow[];
  timeEntries: ExportedTicketTimeEntryRow[];
  attachments: ExportedTicketAttachmentRow[];
  relations: ExportedTicketRelationRow[];
  notes: ExportedProjectNoteRow[];
  noteActivity: ExportedProjectNoteActivityRow[];
  /** Resolved, always-present signal — true only when every attachments.json
   *  row has a verified, matching files/<storage_path> entry in the zip.
   *  false for any older-style backup, regardless of what (if anything)
   *  manifest.json itself says. */
  attachmentsIncluded: boolean;
  /** Physical file bytes, keyed by the exact (unmodified) storage_path from
   *  attachments.json. Empty when attachmentsIncluded is false. */
  attachmentFiles: Record<string, Uint8Array>;
}

// Mirrors serialize-exported-project.ts's own (private, unexported)
// VIRTUAL_FILENAMES list — re-declared here rather than imported since that
// file must not be modified to export it. SerializedProjectBackup is now a
// generic Record<string, ...> (to admit files/<path> entries), so the old
// `satisfies ReadonlyArray<keyof SerializedProjectBackup>` compile-time
// cross-check no longer catches a typo here — this list is the one place
// the 12 fixed root names are still spelled out.
const EXPECTED_FILENAMES = [
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

// Physical attachment files live under this prefix — anything else outside
// the 12 fixed names above is rejected.
const FILES_PREFIX = "files/";

const SUMMARY_KEYS = [
  "members",
  "statuses",
  "tickets",
  "comments",
  "activity",
  "timeEntries",
  "attachments",
  "relations",
  "notes",
  "noteActivity",
] as const;

// ── Small, local type guards (no external validation library) ──────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  return !Number.isNaN(new Date(value).getTime());
}

// ── Zip structure ────────────────────────────────────────────────────────────

// A safe entry name under files/: no empty remainder, no leading "/", no
// backslash, no empty/"."/".." path segment (directory traversal). Mirrors
// build-project-backup-zip.ts's own isSafeEntryName rule for the same
// reason that file's rule exists — never re-derived from it via import,
// since that file must not be modified to export it.
function isSafeFilesRemainder(remainder: string): boolean {
  if (remainder === "" || remainder.startsWith("/")) return false;
  if (remainder.includes("\\")) return false;
  return remainder.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

interface UnzippedEntries {
  jsonFiles: Record<string, Uint8Array>;
  /** Keyed by the storage_path remainder after "files/" — i.e. exactly
   *  attachment.storage_path, unmodified. */
  attachmentFiles: Map<string, Uint8Array>;
}

// Reads the zip and validates its entries: exactly the 12 expected JSON
// files at the root, plus zero or more physical attachment files under
// files/<safe path> — nothing else, no folders, no duplicate name.
//
// `unzipSync`'s own returned object can't be used to detect duplicates: it
// is keyed by filename, so two entries sharing a name simply have the
// second silently overwrite the first with no signal at all. Its `filter`
// callback, however, fires once per central-directory record fflate parses,
// in order — including duplicates — which is the only reliable way to spot
// one without hand-parsing the ZIP central directory ourselves.
function unzipAndValidateEntries(zipBytes: Uint8Array): UnzippedEntries {
  const encounteredNames: string[] = [];
  let files: Record<string, Uint8Array>;

  const filter: UnzipFileFilter = (entry) => {
    encounteredNames.push(entry.name);
    return true;
  };

  try {
    files = unzipSync(zipBytes, { filter });
  } catch (err) {
    throw new ProjectBackupParseError(
      "zip",
      undefined,
      `Could not read the ZIP archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Explicit directory-marker entries (trailing "/") or backslashes are
  // never valid, regardless of where they appear.
  const folderLike = encounteredNames.find((name) => name.endsWith("/") || name.includes("\\"));
  if (folderLike) {
    throw new ProjectBackupParseError("structure", folderLike, `Entry "${folderLike}" is a folder or uses an unsafe path separator.`);
  }

  const seen = new Set<string>();
  for (const name of encounteredNames) {
    if (seen.has(name)) {
      throw new ProjectBackupParseError("structure", name, `Duplicate zip entry: "${name}".`);
    }
    seen.add(name);
  }

  const expectedJson = new Set<string>(EXPECTED_FILENAMES);
  const jsonFiles: Record<string, Uint8Array> = {};
  const attachmentFiles = new Map<string, Uint8Array>();

  for (const name of encounteredNames) {
    if (expectedJson.has(name)) {
      jsonFiles[name] = files[name];
      continue;
    }
    if (name.startsWith(FILES_PREFIX)) {
      const remainder = name.slice(FILES_PREFIX.length);
      if (!isSafeFilesRemainder(remainder)) {
        throw new ProjectBackupParseError("structure", name, `Entry "${name}" under files/ has an unsafe or invalid path.`);
      }
      attachmentFiles.set(remainder, files[name]);
      continue;
    }
    throw new ProjectBackupParseError(
      "structure",
      name,
      `Unexpected entry "${name}" — only the 12 known JSON files at the root, or entries under "files/", are allowed.`
    );
  }

  const missing = EXPECTED_FILENAMES.find((name) => !seen.has(name));
  if (missing) {
    throw new ProjectBackupParseError("structure", missing, `Missing expected entry "${missing}".`);
  }

  return { jsonFiles, attachmentFiles };
}

const textDecoder = new TextDecoder("utf-8");

function parseJsonFile(files: Record<string, Uint8Array>, filename: string): unknown {
  const text = textDecoder.decode(files[filename]);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ProjectBackupParseError("json", filename, `Invalid JSON in "${filename}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

function requireArray(value: unknown, file: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProjectBackupParseError("structure", file, `"${file}" must contain a JSON array.`);
  }
  return value.map((row, index) => {
    if (!isPlainObject(row)) {
      throw new ProjectBackupParseError("structure", file, `"${file}"[${index}] must be a JSON object.`);
    }
    return row;
  });
}

function requireFieldString(row: Record<string, unknown>, field: string, file: string, index: number): string {
  const value = row[field];
  if (!isNonEmptyString(value)) {
    throw new ProjectBackupParseError("structure", file, `"${file}"[${index}].${field} must be a non-empty string.`);
  }
  return value;
}

// null is a genuine, valid value for nullable FK-shaped fields (e.g.
// attachments.comment_id, note-activity.note_id) — never treated as "field
// missing", matching the real column nullability and export-project.ts's
// own equivalent checks.
function readNullableFieldString(row: Record<string, unknown>, field: string, file: string, index: number): string | null {
  const value = row[field];
  if (value === null) return null;
  if (!isNonEmptyString(value)) {
    throw new ProjectBackupParseError("structure", file, `"${file}"[${index}].${field} must be a string or null.`);
  }
  return value;
}

// ── manifest.json / project.json ────────────────────────────────────────────

function validateManifest(raw: unknown): ProjectBackupManifest {
  if (!isPlainObject(raw)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `"manifest.json" must be a JSON object.`);
  }
  if (raw.format !== PROJECT_BACKUP_FORMAT) {
    throw new ProjectBackupParseError(
      "manifest",
      "manifest.json",
      `Unsupported backup format "${String(raw.format)}" — expected "${PROJECT_BACKUP_FORMAT}".`
    );
  }
  if (raw.version !== PROJECT_BACKUP_VERSION) {
    throw new ProjectBackupParseError(
      "manifest",
      "manifest.json",
      `Unsupported backup version "${String(raw.version)}" — expected ${PROJECT_BACKUP_VERSION}.`
    );
  }
  if (!isValidIsoDate(raw.exportedAt)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.exportedAt "${String(raw.exportedAt)}" is not a valid ISO date.`);
  }

  const rawProject = raw.project;
  if (!isPlainObject(rawProject)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.project must be an object.`);
  }
  if (!isNonEmptyString(rawProject.id)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.project.id must be a non-empty string.`);
  }
  if (!isNonEmptyString(rawProject.name)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.project.name must be a non-empty string.`);
  }
  if (!isNonEmptyString(rawProject.slug)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.project.slug must be a non-empty string.`);
  }

  const rawSummary = raw.summary;
  if (!isPlainObject(rawSummary)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.summary must be an object.`);
  }
  for (const key of SUMMARY_KEYS) {
    if (!isNonNegativeInteger(rawSummary[key])) {
      throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.summary.${key} must be an integer >= 0.`);
    }
  }

  // Both optional — absent entirely on a backup produced before physical
  // attachment files existed (requirement: older backups must keep
  // parsing). When present, though, they must have the right shape; the
  // actual cross-check against the zip's real files/ entries happens later
  // in parseProjectBackupZip(), once attachments.json itself is parsed.
  if (raw.attachmentsIncluded !== undefined && typeof raw.attachmentsIncluded !== "boolean") {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.attachmentsIncluded must be a boolean when present.`);
  }
  if (raw.attachmentBytes !== undefined && !isNonNegativeInteger(raw.attachmentBytes)) {
    throw new ProjectBackupParseError("manifest", "manifest.json", `manifest.attachmentBytes must be an integer >= 0 when present.`);
  }

  return raw as unknown as ProjectBackupManifest;
}

function validateProject(raw: unknown): ExportedProjectRow {
  if (!isPlainObject(raw)) {
    throw new ProjectBackupParseError("structure", "project.json", `"project.json" must be a JSON object.`);
  }
  if (!isNonEmptyString(raw.id)) {
    throw new ProjectBackupParseError("structure", "project.json", `project.json.id must be a non-empty string.`);
  }
  if (!isNonEmptyString(raw.name)) {
    throw new ProjectBackupParseError("structure", "project.json", `project.json.name must be a non-empty string.`);
  }
  if (!isNonEmptyString(raw.slug)) {
    throw new ProjectBackupParseError("structure", "project.json", `project.json.slug must be a non-empty string.`);
  }
  return raw as unknown as ExportedProjectRow;
}

function validateManifestMatchesProject(manifest: ProjectBackupManifest, project: ExportedProjectRow): void {
  if (manifest.project.id !== project.id) {
    throw new ProjectBackupParseError(
      "consistency",
      "manifest.json",
      `manifest.project.id ("${manifest.project.id}") does not match project.json.id ("${project.id}").`
    );
  }
  if (manifest.project.name !== project.name) {
    throw new ProjectBackupParseError(
      "consistency",
      "manifest.json",
      `manifest.project.name ("${manifest.project.name}") does not match project.json.name ("${project.name}").`
    );
  }
  if (manifest.project.slug !== project.slug) {
    throw new ProjectBackupParseError(
      "consistency",
      "manifest.json",
      `manifest.project.slug ("${manifest.project.slug}") does not match project.json.slug ("${project.slug}").`
    );
  }
}

function validateSummaryCounts(manifest: ProjectBackupManifest, counts: Record<(typeof SUMMARY_KEYS)[number], number>): void {
  for (const key of SUMMARY_KEYS) {
    if (manifest.summary[key] !== counts[key]) {
      throw new ProjectBackupParseError(
        "consistency",
        "manifest.json",
        `manifest.summary.${key} (${manifest.summary[key]}) does not match the real ${key}.json array length (${counts[key]}).`
      );
    }
  }
}

// ── Duplicate-identity checks (requirement 7) ───────────────────────────────

function requireUniqueIds(rows: Record<string, unknown>[], file: string): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const id = requireFieldString(row, "id", file, index);
    if (seen.has(id)) {
      throw new ProjectBackupParseError("duplicate", file, `"${file}" contains a duplicate id: "${id}".`);
    }
    seen.add(id);
  });
}

// ticket_relations' real uniqueness contract is the composite
// (ticket_id, related_ticket_id, kind) — see
// 20260802000000_add_ticket_relations.sql's own
// `ticket_relations_unique unique (ticket_id, related_ticket_id, kind)`
// constraint — not just each row's own `id`. Checked in addition to (not
// instead of) requireUniqueIds above, which still covers the plain pk.
function requireUniqueRelationIdentity(rows: Record<string, unknown>[], file: string): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const ticketId = requireFieldString(row, "ticket_id", file, index);
    const relatedTicketId = requireFieldString(row, "related_ticket_id", file, index);
    const kind = requireFieldString(row, "kind", file, index);
    const key = `${ticketId}::${relatedTicketId}::${kind}`;
    if (seen.has(key)) {
      throw new ProjectBackupParseError(
        "duplicate",
        file,
        `"${file}" contains a duplicate relation (ticket_id=${ticketId}, related_ticket_id=${relatedTicketId}, kind=${kind}).`
      );
    }
    seen.add(key);
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function parseProjectBackupZip(zipBytes: Uint8Array): ParsedProjectBackup {
  const { jsonFiles, attachmentFiles: rawAttachmentFiles } = unzipAndValidateEntries(zipBytes);

  const manifest = validateManifest(parseJsonFile(jsonFiles, "manifest.json"));
  const project = validateProject(parseJsonFile(jsonFiles, "project.json"));
  validateManifestMatchesProject(manifest, project);

  const members = requireArray(parseJsonFile(jsonFiles, "members.json"), "members.json");
  const statuses = requireArray(parseJsonFile(jsonFiles, "statuses.json"), "statuses.json");
  const tickets = requireArray(parseJsonFile(jsonFiles, "tickets.json"), "tickets.json");
  const comments = requireArray(parseJsonFile(jsonFiles, "comments.json"), "comments.json");
  const activity = requireArray(parseJsonFile(jsonFiles, "activity.json"), "activity.json");
  const timeEntries = requireArray(parseJsonFile(jsonFiles, "time-entries.json"), "time-entries.json");
  const attachments = requireArray(parseJsonFile(jsonFiles, "attachments.json"), "attachments.json");
  const relations = requireArray(parseJsonFile(jsonFiles, "relations.json"), "relations.json");
  const notes = requireArray(parseJsonFile(jsonFiles, "notes.json"), "notes.json");
  const noteActivity = requireArray(parseJsonFile(jsonFiles, "note-activity.json"), "note-activity.json");

  validateSummaryCounts(manifest, {
    members: members.length,
    statuses: statuses.length,
    tickets: tickets.length,
    comments: comments.length,
    activity: activity.length,
    timeEntries: timeEntries.length,
    attachments: attachments.length,
    relations: relations.length,
    notes: notes.length,
    noteActivity: noteActivity.length,
  });

  // statuses.json is deliberately NOT required to be non-empty here (the
  // legacy schema — no per-project ticket_statuses, tickets carrying only
  // their legacy `status` and no `status_id` — is a fully valid backup, per
  // this importer layer's own compatibility requirement).
  requireUniqueIds(members, "members.json");
  requireUniqueIds(statuses, "statuses.json");
  requireUniqueIds(tickets, "tickets.json");
  requireUniqueIds(comments, "comments.json");
  requireUniqueIds(activity, "activity.json");
  requireUniqueIds(timeEntries, "time-entries.json");
  requireUniqueIds(attachments, "attachments.json");
  requireUniqueIds(relations, "relations.json");
  requireUniqueRelationIdentity(relations, "relations.json");
  requireUniqueIds(notes, "notes.json");
  requireUniqueIds(noteActivity, "note-activity.json");

  const ticketIds = new Set(tickets.map((t) => t.id as string));
  const commentIds = new Set(comments.map((c) => c.id as string));
  const noteIds = new Set(notes.map((n) => n.id as string));

  tickets.forEach((row, index) => {
    const projectId = requireFieldString(row, "project_id", "tickets.json", index);
    if (projectId !== project.id) {
      throw new ProjectBackupParseError(
        "referential",
        "tickets.json",
        `tickets.json[${index}] (id=${row.id}) has project_id "${projectId}", which does not match project.json.id "${project.id}".`
      );
    }
  });

  members.forEach((row, index) => {
    const projectId = requireFieldString(row, "project_id", "members.json", index);
    if (projectId !== project.id) {
      throw new ProjectBackupParseError(
        "referential",
        "members.json",
        `members.json[${index}] (id=${row.id}) has project_id "${projectId}", which does not match project.json.id "${project.id}".`
      );
    }
  });

  comments.forEach((row, index) => {
    const ticketId = requireFieldString(row, "ticket_id", "comments.json", index);
    if (!ticketIds.has(ticketId)) {
      throw new ProjectBackupParseError(
        "referential",
        "comments.json",
        `comments.json[${index}] (id=${row.id}) references ticket_id "${ticketId}", which does not exist in tickets.json.`
      );
    }
  });

  activity.forEach((row, index) => {
    const ticketId = requireFieldString(row, "ticket_id", "activity.json", index);
    if (!ticketIds.has(ticketId)) {
      throw new ProjectBackupParseError(
        "referential",
        "activity.json",
        `activity.json[${index}] (id=${row.id}) references ticket_id "${ticketId}", which does not exist in tickets.json.`
      );
    }
  });

  timeEntries.forEach((row, index) => {
    const ticketId = requireFieldString(row, "ticket_id", "time-entries.json", index);
    if (!ticketIds.has(ticketId)) {
      throw new ProjectBackupParseError(
        "referential",
        "time-entries.json",
        `time-entries.json[${index}] (id=${row.id}) references ticket_id "${ticketId}", which does not exist in tickets.json.`
      );
    }
  });

  attachments.forEach((row, index) => {
    const ticketId = requireFieldString(row, "ticket_id", "attachments.json", index);
    if (!ticketIds.has(ticketId)) {
      throw new ProjectBackupParseError(
        "referential",
        "attachments.json",
        `attachments.json[${index}] (id=${row.id}) references ticket_id "${ticketId}", which does not exist in tickets.json.`
      );
    }
    const commentId = readNullableFieldString(row, "comment_id", "attachments.json", index);
    if (commentId !== null && !commentIds.has(commentId)) {
      throw new ProjectBackupParseError(
        "referential",
        "attachments.json",
        `attachments.json[${index}] (id=${row.id}) references comment_id "${commentId}", which does not exist in comments.json.`
      );
    }
  });

  relations.forEach((row, index) => {
    const ticketId = requireFieldString(row, "ticket_id", "relations.json", index);
    const relatedTicketId = requireFieldString(row, "related_ticket_id", "relations.json", index);
    if (!ticketIds.has(ticketId)) {
      throw new ProjectBackupParseError(
        "referential",
        "relations.json",
        `relations.json[${index}] (id=${row.id}) references ticket_id "${ticketId}", which does not exist in tickets.json.`
      );
    }
    if (!ticketIds.has(relatedTicketId)) {
      throw new ProjectBackupParseError(
        "referential",
        "relations.json",
        `relations.json[${index}] (id=${row.id}) references related_ticket_id "${relatedTicketId}", which does not exist in tickets.json.`
      );
    }
  });

  notes.forEach((row, index) => {
    const projectId = requireFieldString(row, "project_id", "notes.json", index);
    if (projectId !== project.id) {
      throw new ProjectBackupParseError(
        "referential",
        "notes.json",
        `notes.json[${index}] (id=${row.id}) has project_id "${projectId}", which does not match project.json.id "${project.id}".`
      );
    }
  });

  // note_id is nullable (ON DELETE SET NULL when the note itself was later
  // deleted — see 20260811000000_add_project_notes.sql and
  // export-project.ts's own equivalent check) — null is valid, never
  // treated as a dangling reference.
  noteActivity.forEach((row, index) => {
    const noteId = readNullableFieldString(row, "note_id", "note-activity.json", index);
    if (noteId !== null && !noteIds.has(noteId)) {
      throw new ProjectBackupParseError(
        "referential",
        "note-activity.json",
        `note-activity.json[${index}] (id=${row.id}) references note_id "${noteId}", which does not exist in notes.json.`
      );
    }
  });

  // ── Physical attachment files (requirement 7) ───────────────────────────
  // hasPhysicalFiles is the structural fact — what the zip actually
  // contains under files/ — independent of whatever manifest.json claims.
  // A backup produced before this feature existed has zero files/ entries
  // and no manifest.attachmentsIncluded field at all: that combination
  // must keep parsing (requirement 9), never be rejected. Any other
  // mismatch between the claim and reality is treated as a real
  // inconsistency, the same way manifest.summary disagreeing with the
  // real array lengths already is above.
  //
  // The claim/reality cross-check below only applies when there is at
  // least one attachment row: with zero attachments there are necessarily
  // zero files/ entries regardless of what attachmentsIncluded says
  // (serializeExportedProject always writes `true`, even for a project
  // with no attachments at all — there is nothing incomplete about that),
  // so that combination is valid and must not be rejected.
  const hasPhysicalFiles = rawAttachmentFiles.size > 0;
  const manifestClaimsIncluded = manifest.attachmentsIncluded === true;

  if (attachments.length > 0) {
    if (manifestClaimsIncluded && !hasPhysicalFiles) {
      throw new ProjectBackupParseError(
        "consistency",
        "manifest.json",
        `manifest.attachmentsIncluded is true, but the zip contains no files/ entries.`
      );
    }
    if (!manifestClaimsIncluded && hasPhysicalFiles) {
      throw new ProjectBackupParseError(
        "consistency",
        "manifest.json",
        `The zip contains files/ entries, but manifest.attachmentsIncluded is not true.`
      );
    }
  }

  if (hasPhysicalFiles) {
    // Every attachments.json row must have exactly one physical file...
    const declaredStoragePaths = new Set<string>();
    attachments.forEach((row, index) => {
      const storagePath = requireFieldString(row, "storage_path", "attachments.json", index);
      declaredStoragePaths.add(storagePath);
      if (!rawAttachmentFiles.has(storagePath)) {
        throw new ProjectBackupParseError(
          "referential",
          "attachments.json",
          `attachments.json[${index}] (id=${row.id}, filename=${row.filename}) has no matching physical file at "files/${storagePath}".`
        );
      }
    });
    // ...and every physical file must have a matching attachments.json row
    // (requirement: "rechazar archivos físicos que no tengan metadata").
    for (const storagePath of rawAttachmentFiles.keys()) {
      if (!declaredStoragePaths.has(storagePath)) {
        throw new ProjectBackupParseError(
          "referential",
          `${FILES_PREFIX}${storagePath}`,
          `Physical file "files/${storagePath}" has no matching row in attachments.json.`
        );
      }
    }

    const realAttachmentBytes = Array.from(rawAttachmentFiles.values()).reduce((sum, bytes) => sum + bytes.length, 0);
    if (typeof manifest.attachmentBytes === "number" && manifest.attachmentBytes !== realAttachmentBytes) {
      throw new ProjectBackupParseError(
        "consistency",
        "manifest.json",
        `manifest.attachmentBytes (${manifest.attachmentBytes}) does not match the real total bytes of files/ entries (${realAttachmentBytes}).`
      );
    }
  }

  return {
    manifest,
    project,
    members: members as unknown as ExportedProjectMembershipRow[],
    statuses: statuses as unknown as ExportedTicketStatusRow[],
    tickets: tickets as unknown as ExportedTicketRow[],
    comments: comments as unknown as ExportedTicketCommentRow[],
    activity: activity as unknown as ExportedTicketActivityRow[],
    timeEntries: timeEntries as unknown as ExportedTicketTimeEntryRow[],
    attachments: attachments as unknown as ExportedTicketAttachmentRow[],
    relations: relations as unknown as ExportedTicketRelationRow[],
    notes: notes as unknown as ExportedProjectNoteRow[],
    noteActivity: noteActivity as unknown as ExportedProjectNoteActivityRow[],
    // Always present. With at least one attachment row, this mirrors the
    // structural fact (hasPhysicalFiles) — already proven consistent with
    // the manifest's own claim above. With zero attachment rows there is
    // no structural signal either way (0 files either way), so the
    // manifest's own claim is what's trusted instead — true only for a
    // backup produced by this pipeline, false for an absent/legacy field.
    attachmentsIncluded: attachments.length > 0 ? hasPhysicalFiles : manifestClaimsIncluded,
    attachmentFiles: Object.fromEntries(rawAttachmentFiles),
  };
}
