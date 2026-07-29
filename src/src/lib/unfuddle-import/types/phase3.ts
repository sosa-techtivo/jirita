import type { OrganizationPrecheckResult } from "./phase2";

export type JiritaTicketStatus = "backlog" | "to_do" | "in_progress" | "review" | "blocked" | "done";
export type JiritaTicketPriority = "highest" | "high" | "medium" | "low";

/** The exact fields this importer controls on `tickets` — `type`/`labels`/etc. are left at their schema default. */
export interface PlannedTicketFields {
  project_id: string;
  unfuddle_id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  status: JiritaTicketStatus;
  priority: JiritaTicketPriority;
  created_by: string | null;
  assignee_profile_id: string | null;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  hours: number | null;
  unfuddle_imported_at: string;
}

export interface ExistingTicketRow {
  id: string;
  projectId: string;
  unfuddleId: string | null;
  ticketNumber: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdBy: string | null;
  assigneeProfileId: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  hours: number | null;
  unfuddleImportedAt: string | null;
}

export type UserMapEntryStatus = "resolved" | "orphan_no_backup_record" | "not_found_in_profiles" | "multiple_matches";

export interface UserMapEntry {
  unfuddleId: number;
  status: UserMapEntryStatus;
  profileId: string | null;
  email: string | null;
  fullName: string | null;
  detail: string | null;
}

export interface UserMapResult {
  /** Unfuddle person id -> resolved profile id, or null (orphan / unresolved). */
  map: Map<number, string | null>;
  entries: UserMapEntry[];
  /** false if any referenced id is a *known* (backup-listed) person that failed to resolve uniquely — never for a genuine orphan (no backup record at all). */
  ok: boolean;
  blockingReasons: string[];
}

export interface TicketProjectPrecheckResult {
  organizationId: string | null;
  projectId: string | null;
  slug: string | null;
  projectCode: string | null;
  organizationMatches: boolean;
  slugMatches: boolean;
  projectCodeMatches: boolean;
  ok: boolean;
  error: string | null;
}

export interface MappingError {
  ticketUnfuddleId: number;
  ticketNumber: number | null;
  reason: string;
}

export interface TicketMappingResult {
  planned: PlannedTicketFields[];
  errors: MappingError[];
  ok: boolean;
}

export interface TicketIdempotencyResult {
  newTickets: PlannedTicketFields[];
  alreadyImportedMatching: { planned: PlannedTicketFields; existing: ExistingTicketRow }[];
  conflicting: { planned: PlannedTicketFields; existing: ExistingTicketRow; diffs: string[] }[];
  ticketNumberCollisions: { planned: PlannedTicketFields; existing: ExistingTicketRow }[];
  duplicateTicketNumbersInBatch: number[];
  duplicateUnfuddleIdsInBatch: string[];
  ok: boolean;
}

export interface SideEffectAudit {
  /** ticket_activity rows the `tickets_log_created` trigger (20260728000000) will unconditionally create — one per inserted ticket. */
  activityRowsPerInsertedTicket: number;
  activityActorSource: string;
  activityTimestampIssue: string;
  projectMembershipSideEffect: string;
  blocksApply: boolean;
  reason: string;
}

export interface TicketsStats {
  total: number;
  byOriginalStatus: Record<string, number>;
  byJiritaStatus: Record<string, number>;
  byOriginalPriority: Record<string, number>;
  byJiritaPriority: Record<string, number>;
  withDescription: number;
  withoutDescription: number;
  withDueDate: number;
  withoutDueDate: number;
  withEstimate: number;
  withoutEstimate: number;
  withAssignee: number;
  withoutAssignee: number;
  withOrphanReporter: number;
  withOrphanAssignee: number;
}

export interface Phase3PrecheckResult {
  organization: OrganizationPrecheckResult;
  project: TicketProjectPrecheckResult;
  userMap: UserMapResult;
  ticketStats: TicketsStats;
  mapping: TicketMappingResult;
  idempotency: TicketIdempotencyResult;
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

export type Phase3Outcome = "preview_success" | "apply_success" | "failed";

export interface Phase3Report {
  mode: "PREVIEW" | "APPLY";
  precheck: Phase3PrecheckResult;
  applyOutcome: ApplyOutcome | null;
  outcome: Phase3Outcome;
  failureReasons: string[];
}
