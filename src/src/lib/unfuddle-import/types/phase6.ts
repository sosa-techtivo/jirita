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
}

export type Phase6Outcome = "preview_success" | "apply_success" | "failed";

export interface Phase6Report {
  mode: "PREVIEW" | "APPLY";
  precheck: Phase6PrecheckResult;
  applyOutcome: AttachmentApplyOutcome | null;
  outcome: Phase6Outcome;
  failureReasons: string[];
}
