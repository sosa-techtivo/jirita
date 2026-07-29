import type { OrganizationPrecheckResult } from "./phase2";
import type { UserMapEntry, UserMapEntryStatus, UserMapResult } from "./phase3";
import type { TicketParentResolutionResult } from "./phase4";

export type { UserMapEntry, UserMapEntryStatus, UserMapResult, TicketParentResolutionResult };

/** The exact fields this importer controls on `ticket_time_entries` (migration 20260824000000). */
export interface PlannedTimeEntryFields {
  ticketUnfuddleId: number;
  ticket_id: string;
  unfuddle_id: string;
  minutes: number;
  work_date: string;
  comment: string | null;
  logged_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ExistingTimeEntryRow {
  id: string;
  ticketId: string;
  unfuddleId: string | null;
  minutes: number;
  workDate: string;
  comment: string | null;
  loggedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface MappingError {
  timeEntryUnfuddleId: number;
  ticketUnfuddleId: number;
  reason: string;
}

export interface TimeEntryMappingResult {
  planned: PlannedTimeEntryFields[];
  errors: MappingError[];
  ok: boolean;
}

export interface DuplicateContentGroup {
  key: string;
  unfuddleIds: number[];
}

export interface TimeEntryStats {
  total: number;
  /** Primary source of truth for the total — integer minutes, never float hours. */
  totalMinutes: number;
  totalHoursRounded: number;
  withDescription: number;
  withoutDescription: number;
  withKnownUser: number;
  withRemovedButKnownUser: number;
  withOrphanUser: number;
  withoutPersonId: number;
  unexpectedUserIds: number[];
  updatedDiffersFromCreated: number;
  ticketsWithEntries: number;
  maxEntriesPerTicket: number;
  maxHoursSingleEntry: number;
  minPositiveHours: number;
  zeroHoursCount: number;
  negativeHoursCount: number;
  precisionLossCount: number;
  precisionLossExamples: { unfuddleId: number; hours: number; minutes: number }[];
}

/** A structural/schema audit finding — not data-dependent. See preflight/audit-time-entry-schema.ts. */
export interface SchemaAudit {
  hasUnfuddleIdColumn: boolean;
  hasUpdatedAtColumn: boolean;
  loggedByNullable: boolean;
  minutesConstraint: string;
  activityTrigger: { exists: boolean; unconditional: boolean; description: string };
  membershipTrigger: { exists: boolean; description: string };
  blocksApply: boolean;
  reason: string;
}

export interface HoursComparison {
  sumTicketsHours: number;
  sumTimeEntries: number;
  ticketsWithHoursButNoEntries: number;
  ticketsWithEntrySumDifferentFromHours: number;
  ticketsWithEntries: number;
}

export interface TimeEntryIdempotencyResult {
  newEntries: PlannedTimeEntryFields[];
  alreadyImportedMatching: { planned: PlannedTimeEntryFields; existing: ExistingTimeEntryRow }[];
  conflicting: { planned: PlannedTimeEntryFields; existing: ExistingTimeEntryRow; diffs: string[] }[];
  duplicateUnfuddleIdsInBatch: string[];
  ok: boolean;
}

export interface Phase5PrecheckResult {
  organization: OrganizationPrecheckResult;
  project: { projectId: string | null; ok: boolean; error: string | null };
  ticketsReconciled: { total: number; ok: boolean; error: string | null };
  parents: TicketParentResolutionResult;
  userMap: UserMapResult;
  stats: TimeEntryStats;
  duplicateContentGroups: DuplicateContentGroup[];
  mapping: TimeEntryMappingResult;
  schemaAudit: SchemaAudit;
  hoursComparison: HoursComparison | null;
  idempotency: TimeEntryIdempotencyResult | null;
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

export type Phase5Outcome = "preview_success" | "apply_success" | "failed";

export interface Phase5Report {
  mode: "PREVIEW" | "APPLY";
  precheck: Phase5PrecheckResult;
  applyOutcome: ApplyOutcome | null;
  outcome: Phase5Outcome;
  failureReasons: string[];
}
