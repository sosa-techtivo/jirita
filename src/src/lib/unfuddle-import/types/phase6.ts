import type { OrganizationPrecheckResult } from "./phase2";
import type { TicketParentResolutionResult } from "./phase4";

export type { TicketParentResolutionResult };

export interface CommentParentResolutionResult {
  /** Unfuddle comment id -> real JIRITA ticket_comments.id, for every parent that resolved. */
  map: Map<number, string>;
  /** Unfuddle comment ids referenced by an attachment but not found among the imported 412 comments. */
  missingParents: number[];
  ok: boolean;
}

export interface AttachmentSchemaAudit {
  hasUnfuddleIdColumn: boolean;
  hasCommentIdColumn: boolean;
  storagePathUniqueConstraint: boolean;
  storagePathDeterministic: boolean;
  uploadedByNullable: boolean;
  hasUpdatedAtColumn: boolean;
  activityTrigger: { exists: boolean; unconditional: boolean; description: string };
  membershipTrigger: { exists: boolean; description: string };
  blockingReasons: string[];
}

export interface AttachmentStorageAudit {
  bucketId: string;
  isPublic: boolean;
  pathConvention: string;
  selectPolicy: string;
  insertPolicy: string;
  deletePolicy: string;
  sizeLimitConfigured: string;
}

export interface AttachmentXmlStats {
  total: number;
  ticketLevel: number;
  commentLevel: number;
  unexpectedParentTypes: string[];
  emptyFilename: number;
  emptyMime: number;
  emptySize: number;
  zeroSize: number;
  emptyCreatedAt: number;
  emptyUpdatedAt: number;
  genericMime: number;
  duplicateAttachmentIds: number;
  uniqueFilenames: number;
  repeatedFilenames: { filename: string; count: number }[];
  extensionCounts: { ext: string; count: number }[];
  dangerousExtensionFiles: { unfuddleId: number; filename: string; contentType: string }[];
  archiveFiles: number;
  noExtensionFiles: number;
  ticketsWithAttachments: number;
  commentsWithAttachments: number;
}

export interface PhysicalFileStats {
  resolved: number;
  missing: number;
  missingIds: number[];
  ambiguous: number;
  totalBytes: number;
  maxBytes: number;
  minBytes: number;
  avgBytes: number;
  medianBytes: number;
  sizeDistribution: Record<string, number>;
  emptyFiles: number;
  sizeMismatches: { unfuddleId: number; declared: number; real: number }[];
  filesOverLimit: { unfuddleId: number; filename: string; bytes: number }[];
  duplicateContentGroups: { hash: string; unfuddleIds: number[] }[];
}

export interface ObjectPathProposal {
  pattern: string;
  example: string;
  ticketLevelExample: string;
  commentLevelExample: string;
  rationale: string[];
}

/** What `insert_ticket_attachments_bypassing_activity_log` would receive — not yet callable anywhere (see AttachmentSchemaAudit). */
export interface PlannedAttachmentFields {
  ticketUnfuddleId: number;
  attachmentUnfuddleId: number;
  ticket_id: string;
  comment_id: string | null;
  unfuddle_id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: null;
  created_at: string;
  updated_at: string | null;
  /** Optional and set only by a later, separate step (see
   *  import-attachments/plan-attachment-thumbnails.ts) — mapAttachmentRows
   *  itself never sets this key at all, so a planned row built the exact
   *  same way the already-completed KTVibe import built it (never re-run)
   *  omits the key entirely, and the RPC (20260923000000) inserts NULL for
   *  it, unchanged from before this field existed. */
  thumbnail_path?: string | null;
}

export type AttachmentThumbnailKind = "physical" | "self" | "not-image" | "error";

/** Per-attachment outcome of import-attachments/plan-attachment-thumbnails.ts
 *  — the single source of truth both the PREVIEW report and APPLY
 *  (apply-attachments.ts) read from, so the two can never disagree about
 *  which attachments get a thumbnail. */
export interface AttachmentThumbnailPlanItem {
  attachmentUnfuddleId: number;
  kind: AttachmentThumbnailKind;
  /** Set only when a raster image was successfully decoded (kind "physical" or "self"). */
  width: number | null;
  height: number | null;
  /** kind "physical": the path a new WebP object would be uploaded to.
   *  kind "self": the row's own storage_path — no new object, the
   *  original doubles as its own thumbnail.
   *  kind "not-image" | "error": null — thumbnail_path stays NULL. */
  thumbnailPath: string | null;
  /** Only populated for kind "physical" — the encoded WebP bytes, read
   *  once and consumed by the very next step (APPLY's upload, or nothing
   *  at all in PREVIEW) rather than retained across attachments. */
  thumbnailBuffer: Buffer | null;
  /** Always set for "not-image"/"error", null otherwise. */
  reason: string | null;
}

export interface AttachmentThumbnailStats {
  totalAttachments: number;
  wouldCreatePhysicalThumbnail: number;
  wouldUseOriginalAsThumbnail: number;
  notImage: number;
  errors: number;
  errorDetails: { attachmentUnfuddleId: number; reason: string }[];
}

export interface ExistingAttachmentRow {
  id: string;
  ticketId: string;
  commentId: string | null;
  unfuddleId: string | null;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface AttachmentMappingError {
  attachmentUnfuddleId: number;
  parentType: string;
  parentUnfuddleId: number;
  reason: string;
}

export interface AttachmentMappingResult {
  planned: PlannedAttachmentFields[];
  errors: AttachmentMappingError[];
  ok: boolean;
}

export interface AttachmentDbIdempotencyResult {
  newRows: PlannedAttachmentFields[];
  alreadyImportedMatching: { planned: PlannedAttachmentFields; existing: ExistingAttachmentRow }[];
  conflicting: { planned: PlannedAttachmentFields; existing: ExistingAttachmentRow; diffs: string[] }[];
  duplicateUnfuddleIdsInBatch: string[];
  ok: boolean;
}

export type StorageObjectStatus = "not_exists" | "exists_matching" | "exists_differs";

export interface StorageObjectFinding {
  attachmentUnfuddleId: number;
  storagePath: string;
  status: StorageObjectStatus;
  detail: string | null;
}

export interface StorageIdempotencyResult {
  checked: number;
  notExists: number;
  existsMatching: number;
  existsDiffers: number;
  findings: StorageObjectFinding[];
  pathCollisions: { path: string; attachmentUnfuddleIds: number[] }[];
  ok: boolean;
}

export interface Phase6PrecheckResult {
  organization: OrganizationPrecheckResult;
  project: { projectId: string | null; ok: boolean; error: string | null };
  ticketsReconciled: { total: number; ok: boolean; error: string | null };
  commentsReconciled: { total: number; ok: boolean; error: string | null };
  ticketParents: TicketParentResolutionResult;
  commentParents: CommentParentResolutionResult;
  xmlStats: AttachmentXmlStats;
  physicalFiles: PhysicalFileStats;
  schemaAudit: AttachmentSchemaAudit;
  storageAudit: AttachmentStorageAudit;
  objectPathProposal: ObjectPathProposal;
  mapping: AttachmentMappingResult;
  dbIdempotency: AttachmentDbIdempotencyResult | null;
  storageIdempotency: StorageIdempotencyResult | null;
  ok: boolean;
  blockingReasons: string[];
}

export interface AttachmentApplyBatchSummary {
  index: number;
  attachmentUnfuddleIds: number[];
  uploaded: number;
  inserted: number;
  reconciled: number;
  errors: string[];
  durationMs: number;
  /** Always 0 unless a thumbnailPlanByAttachmentId map was passed to
   *  applyAttachments (opt-in — the already-completed KTVibe run never
   *  passes one, see apply-attachments.ts). */
  thumbnailsCreated: number;
  thumbnailsSelf: number;
  thumbnailsFailed: number;
}

export interface AttachmentApplyOutcome {
  attempted: number;
  uploaded: number;
  inserted: number;
  skippedAlreadyImported: number;
  failed: number;
  possiblePartialImport: boolean;
  insertedUnfuddleIds: string[];
  /** Object uploaded by this run, but its row insert did not complete — never deleted automatically. */
  orphanObjects: { attachmentUnfuddleId: number; storagePath: string }[];
  reconciledOk: number;
  reconciliationDiffs: { unfuddleId: string; diffs: string[] }[];
  batches: AttachmentApplyBatchSummary[];
  error: string | null;
  /** Physical WebP thumbnails uploaded (kind "physical" in the thumbnail plan). */
  thumbnailsCreated: number;
  /** Rows where thumbnail_path was set to the row's own storage_path (kind "self", <=600px). */
  thumbnailsSelf: number;
  /** A thumbnail failure never fails the attachment itself — the original
   *  still uploads/inserts normally with thumbnail_path left NULL; this
   *  only counts and records what happened. */
  thumbnailsFailed: number;
  thumbnailFailures: { attachmentUnfuddleId: number; reason: string }[];
}

export type Phase6Outcome = "preview_success" | "apply_success" | "failed";

export interface Phase6Report {
  mode: "PREVIEW" | "APPLY";
  precheck: Phase6PrecheckResult;
  applyOutcome: AttachmentApplyOutcome | null;
  outcome: Phase6Outcome;
  failureReasons: string[];
}
