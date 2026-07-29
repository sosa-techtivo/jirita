import type { OrganizationPrecheckResult } from "./phase2";
import type { UserMapEntry, UserMapEntryStatus, UserMapResult } from "./phase3";

export type { UserMapEntry, UserMapEntryStatus, UserMapResult };

/** The exact fields this importer controls on `ticket_comments` — nothing else is touched. */
export interface PlannedCommentFields {
  ticket_id: string;
  unfuddle_id: string;
  body: string;
  author_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExistingCommentRow {
  id: string;
  ticketId: string;
  unfuddleId: string | null;
  body: string;
  authorProfileId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface TicketParentResolutionResult {
  /** Unfuddle ticket id (numeric) -> real JIRITA ticket UUID, for every parent that resolved. */
  map: Map<number, string>;
  /** Unfuddle ticket ids referenced by a comment but not found among the imported 170 tickets. */
  missingParents: number[];
  totalTicketsInProject: number;
  ok: boolean;
}

export interface MappingError {
  commentUnfuddleId: number;
  ticketUnfuddleId: number;
  reason: string;
}

export interface CommentMappingResult {
  planned: PlannedCommentFields[];
  errors: MappingError[];
  ok: boolean;
}

export interface CommentIdempotencyResult {
  newComments: PlannedCommentFields[];
  alreadyImportedMatching: { planned: PlannedCommentFields; existing: ExistingCommentRow }[];
  conflicting: { planned: PlannedCommentFields; existing: ExistingCommentRow; diffs: string[] }[];
  duplicateUnfuddleIdsInBatch: string[];
  identicalContentDifferentIds: { key: string; unfuddleIds: string[] }[];
  ok: boolean;
}

export interface SideEffectAudit {
  activityRowsPerInsertedComment: number;
  activityActorSource: string;
  activityTimestampIssue: string;
  projectMembershipSideEffect: string;
  blocksApply: boolean;
  reason: string;
}

export interface CommentsStats {
  total: number;
  withBody: number;
  emptyBody: number;
  withKnownAuthor: number;
  withRemovedButKnownAuthor: number;
  withOrphanAuthor150: number;
  withOrphanAuthor153: number;
  withEmptyAuthorId: number;
  unexpectedAuthorIds: number[];
  updatedDiffersFromCreated: number;
  withPendingAttachments: number;
  ticketsWithComments: number;
  maxCommentsPerTicket: number;
}

export interface Phase4PrecheckResult {
  organization: OrganizationPrecheckResult;
  project: { projectId: string | null; ok: boolean; error: string | null };
  ticketsReconciled: { total: number; ok: boolean; error: string | null };
  parents: TicketParentResolutionResult;
  userMap: UserMapResult;
  commentStats: CommentsStats;
  mapping: CommentMappingResult;
  idempotency: CommentIdempotencyResult;
  sideEffects: SideEffectAudit;
  ok: boolean;
  blockingReasons: string[];
}

export interface ApplyOutcome {
  attempted: number;
  inserted: number;
  skippedAlreadyImported: number;
  failed: number;
  possiblePartialImport: boolean;
  insertedUnfuddleIds: string[];
  reconciledOk: number;
  reconciliationDiffs: { unfuddleId: string; diffs: string[] }[];
  error: string | null;
}

export type Phase4Outcome = "preview_success" | "apply_success" | "failed";

export interface Phase4Report {
  mode: "PREVIEW" | "APPLY";
  precheck: Phase4PrecheckResult;
  applyOutcome: ApplyOutcome | null;
  outcome: Phase4Outcome;
  failureReasons: string[];
}
