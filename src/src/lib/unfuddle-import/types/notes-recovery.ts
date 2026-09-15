/**
 * Types for the Unfuddle Notebook/Page -> project_notes recovery importer.
 * A targeted recovery (not a Phase 1-7 rewrite): Unfuddle Notes are
 * Notebook -> Page -> Page revision, never modeled by the original importer
 * (see parser/backup-xml-parser.ts, which explicitly skips <notebooks>).
 *
 * NEVER hold/print a full note body outside `content` on the final
 * candidate/insert-row shapes below — every report-facing type exposes only
 * safe metadata (contentLength/contentSha256, never the text itself).
 */

/** One raw <page> revision, scoped to the target Unfuddle project's notebooks. */
export interface NotebookPageRevision {
  notebookUnfuddleId: number;
  notebookTitle: string;
  notebookProjectUnfuddleId: number;
  pageUnfuddleId: number;
  pageNumber: number;
  pageTitle: string;
  version: number;
  body: string;
  bodyFormat: string | null;
  authorUnfuddleId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ParsedNotebookPages {
  revisions: NotebookPageRevision[];
  notebookCount: number;
}

/** A version-continuity problem for one logical page — reported, never silently ignored. */
export interface VersionContinuityIssue {
  notebookUnfuddleId: number;
  pageNumber: number;
  versionsPresent: number[];
  reason: "duplicate_version" | "non_consecutive" | "missing_v1";
}

/**
 * One logical page (notebook_id, page_number), canonicalized from its
 * revision history: v1 for creation metadata, highest version for current
 * state. `content`/`contentSha256`/`contentLength` are the only places the
 * actual body text is carried past this point — every report type below
 * exposes only the hash/length.
 */
export interface LogicalNoteCandidate {
  notebookUnfuddleId: number;
  notebookTitle: string;
  pageNumber: number;
  unfuddleNoteKey: string;
  title: string;
  content: string;
  contentLength: number;
  contentSha256: string;
  versionCount: number;
  latestVersion: number;
  createdAt: string;
  createdByUnfuddleId: number | null;
  updatedAt: string;
  updatedByUnfuddleId: number | null;
}

export interface GroupingResult {
  candidates: LogicalNoteCandidate[];
  continuityIssues: VersionContinuityIssue[];
  duplicateTitles: { title: string; count: number }[];
}

/**
 * One approved Notebook -> JIRITA project destination. See
 * import-notes-recovery/notebook-project-allowlist.ts for the single
 * source of truth (the 6 entries) and its full rationale/fail-closed
 * guarantee. `notebookTitle`/`historicalMilestoneId`/`jiritaProjectName`
 * are informative/audit-trail only; matching is by `notebookUnfuddleId` ->
 * `jiritaProjectUuid` exclusively.
 */
export interface NotebookProjectMapping {
  notebookUnfuddleId: number;
  notebookTitle: string;
  historicalMilestoneId: number;
  jiritaProjectName: string;
  jiritaProjectUuid: string;
  expectedLogicalNotes: number;
}

export interface AllowlistedProjectResolution {
  mapping: NotebookProjectMapping;
  projectId: string | null;
  actualName: string | null;
  ok: boolean;
  error: string | null;
}

export interface AllowlistedBucket {
  mapping: NotebookProjectMapping;
  candidates: LogicalNoteCandidate[];
}

export interface CountMismatch {
  mapping: NotebookProjectMapping;
  expected: number;
  actual: number;
}

export interface AllowlistAssignmentResult {
  /** One bucket per allowlist entry, in allowlist order — always 6 entries, even if a bucket ends up empty (see unmappedAllowlistEntries). */
  allowlisted: AllowlistedBucket[];
  /** Every candidate whose notebook is NOT in the allowlist — never planned, never resolved, never written. */
  excluded: LogicalNoteCandidate[];
  /** An allowlist entry whose actual candidate count doesn't match its expected count — always a blocker. */
  countMismatches: CountMismatch[];
  /** An allowlist entry with 0 matching candidates in the source at all — the notebook id itself may be wrong. */
  unmappedAllowlistEntries: NotebookProjectMapping[];
}

export type AuthorResolutionStatus =
  | "resolved_via_backup_person"
  | "resolved_via_orphan_profile_fallback"
  | "unresolved";

export interface AuthorResolutionEntry {
  unfuddleId: number;
  status: AuthorResolutionStatus;
  profileId: string | null;
  email: string | null;
  fullName: string | null;
  detail: string | null;
}

export interface AuthorResolutionResult {
  map: Map<number, string>;
  entries: AuthorResolutionEntry[];
  ok: boolean;
  blockingReasons: string[];
}

/** The exact JSON row insert_project_notes_bypassing_activity_log(jsonb) expects. Never logged in full — see runner/notes-recovery-print-report.ts. */
export interface PlannedNoteInsertRow {
  project_id: string;
  title: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  unfuddle_note_key: string;
}

export interface NoteInsertPlan {
  candidate: LogicalNoteCandidate;
  plannedRow: PlannedNoteInsertRow;
}

export interface ExistingJiritaNote {
  id: string;
  projectId: string;
  title: string;
  unfuddleNoteKey: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface NoteConflict {
  plan: NoteInsertPlan;
  existing: ExistingJiritaNote;
  diffs: string[];
}

export interface NoteIdempotencyClassification {
  newPlans: NoteInsertPlan[];
  alreadyImportedMatching: { plan: NoteInsertPlan; existing: ExistingJiritaNote }[];
  conflicting: NoteConflict[];
  duplicateKeysInBatch: string[];
  existingNativeNotes: ExistingJiritaNote[];
}

export interface NotesRecoveryPrecheckResult {
  projectResolutions: AllowlistedProjectResolution[];
  parsed: { notebookCount: number; revisionCount: number };
  grouping: GroupingResult;
  allowlistAssignment: AllowlistAssignmentResult;
  authorResolution: AuthorResolutionResult;
  plans: NoteInsertPlan[];
  idempotency: NoteIdempotencyClassification | null;
  ok: boolean;
  blockingReasons: string[];
}

export interface NoteReconciliationDiff {
  unfuddleNoteKey: string;
  diffs: string[];
}

export interface NoteApplyOutcome {
  attempted: number;
  inserted: number;
  insertedKeys: string[];
  failed: number;
  possiblePartialImport: boolean;
  reconciledOk: number;
  reconciliationDiffs: NoteReconciliationDiff[];
  error: string | null;
  durationMs: number;
}

/** Per-destination post-write verification — see import-notes-recovery/reconcile-note-recovery.ts. */
export interface DestinationReconciliation {
  mapping: NotebookProjectMapping;
  expectedCount: number;
  actualCount: number;
  missingKeys: string[];
  wrongProjectKeys: string[];
}

/**
 * Independent, fresh, from-DB verification of the full expected 28-Note
 * state after an apply attempt — checked against the ORIGINAL planned
 * mapping (never against what the RPC merely claims it inserted), and
 * required before an APPLY may be declared successful, even if the RPC
 * itself reported success.
 */
export interface PostWriteReconciliationResult {
  ok: boolean;
  totalExpected: number;
  totalActualMatching: number;
  perDestination: DestinationReconciliation[];
  missingKeys: string[];
  unexpectedDestinationKeys: { key: string; expectedProjectId: string; actualProjectId: string }[];
  /** project_note_activity rows found for the reconciled recovery Note ids — must be 0. */
  recoveryActivityRowCount: number;
  blockingReasons: string[];
}

export interface NotesRecoveryReport {
  mode: "PREVIEW" | "APPLY";
  precheck: NotesRecoveryPrecheckResult | null;
  applyOutcome: NoteApplyOutcome | null;
  reconciliation: PostWriteReconciliationResult | null;
  outcome: "preview_success" | "apply_success" | "apply_rejected" | "failed";
  failureReasons: string[];
}
