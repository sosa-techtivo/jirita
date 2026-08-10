// Shared types for the historical thumbnail backfill — a standalone CLI
// (see runner/backfill-run.ts), never imported by the Next.js app itself.
// Mirrors the live app's own thumbnail_path semantics (ticket_attachments /
// project_note_attachments, both nullable thumbnail_path columns added in
// 20260922000000_add_attachment_thumbnails.sql) without importing
// src/lib/tickets.ts or src/lib/notes.ts — those are browser-oriented
// modules (getSupabaseBrowserClient, DOM APIs) with no place in a Node CLI.

export type AttachmentTable = "ticket_attachments" | "project_note_attachments";

export interface CandidateRow {
  table: AttachmentTable;
  bucket: string;
  id: string;
  /** ticket_id for ticket_attachments, note_id for project_note_attachments
   *  — the first path segment of storagePath, and of the thumbnail path
   *  this backfill will write to. */
  entityId: string;
  storagePath: string;
  filename: string;
  mimeType: string | null;
}

export type ProcessOutcome =
  | { kind: "created"; thumbnailPath: string; thumbnailSizeBytes: number; width: number; height: number }
  // <=600px wide — no physical thumbnail file is created (would only
  // duplicate storage for zero size reduction); instead thumbnail_path is
  // set to the row's own storage_path, so the original doubles as its own
  // thumbnail. This is what makes the row stop being a candidate — without
  // it, a <=600px row's thumbnail_path stayed NULL forever and got
  // re-fetched (and re-downloaded, just to be skipped again) on every
  // future run.
  | { kind: "self-thumbnail"; width: number; height: number }
  | { kind: "skipped-not-image"; reason: string }
  | { kind: "failed"; stage: "download" | "generate" | "upload" | "db-update"; message: string };

export interface ProcessResult {
  row: CandidateRow;
  outcome: ProcessOutcome;
}

export interface FailureDetail {
  table: AttachmentTable;
  id: string;
  storagePath: string;
  stage: string;
  message: string;
}

export interface TableSummary {
  /** Rows with thumbnail_path IS NULL seen for this table. */
  candidates: number;
  /** Candidates that are raster images this backfill attempted to download + decode. */
  attempted: number;
  /** PREVIEW: would generate a physical thumbnail file (decode ok, width > 600).
   *  APPLY: thumbnail actually generated, uploaded, and persisted. */
  created: number;
  /** <=600px wide. PREVIEW: would set thumbnail_path = storage_path (no new
   *  file). APPLY: thumbnail_path actually set to storage_path — the
   *  original becomes its own thumbnail, no file duplicated. */
  selfThumbnail: number;
  /** Non-raster (pdf, doc, svg, zip, etc.) or unsupported extension — never downloaded. */
  skippedNotImage: number;
  failed: number;
  /** APPLY only — rows whose thumbnail_path was actually persisted (created
   *  + selfThumbnail). Always 0 in PREVIEW. */
  rowsUpdated: number;
}

export function emptyTableSummary(): TableSummary {
  return {
    candidates: 0,
    attempted: 0,
    created: 0,
    selfThumbnail: 0,
    skippedNotImage: 0,
    failed: 0,
    rowsUpdated: 0,
  };
}

export interface BackfillReport {
  mode: "preview" | "apply";
  batchSize: number;
  perTable: Record<AttachmentTable, TableSummary>;
  total: TableSummary;
  failures: FailureDetail[];
  elapsedMs: number;
}
