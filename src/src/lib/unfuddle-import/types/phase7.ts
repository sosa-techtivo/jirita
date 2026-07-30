import type { OrganizationPrecheckResult } from "./phase2";

/** Raw relationship type strings observed in the backup's <relationship> elements (spec §1/§4). */
export type UnfuddleRelationType = string;

/** The 3 kinds ticket_relations actually persists — see supabase/migrations/20260802000000_add_ticket_relations.sql. */
export type JiritaRelationKind = "related_to" | "blocks" | "duplicates";

export interface RawRelationRecord {
  fromTicketUnfuddleId: number;
  toTicketUnfuddleId: number;
  type: UnfuddleRelationType;
}

/**
 * - both_resolved: both ends are among the 170 imported KTVibe tickets.
 * - target_cross_project: the target resolves to a real JIRITA ticket, but
 *   in a different project — ticket_relations_insert's RLS, and now also
 *   insert_ticket_relations_bypassing_activity_log's own in-function guard
 *   (20260827000000/20260828000000), would reject this outright.
 * - target_not_imported: the target is a real Unfuddle ticket present in
 *   the backup (Unfuddle always embeds a full shallow copy — never a
 *   dangling id, confirmed by validateRelations' own comment) but it was
 *   never imported into JIRITA because it belongs to a different Milestone.
 *   "Category E" (target doesn't exist in the backup at all) is therefore
 *   structurally impossible for this parser's output — documented, not
 *   silently assumed.
 * Either non-"both_resolved" status is reported as excluded_external in the
 * PREVIEW output — approved product decision, not an error/conflict.
 */
export type RelationResolutionStatus = "both_resolved" | "target_cross_project" | "target_not_imported";

export interface ResolvedRelationEnd {
  ticketUnfuddleId: number;
  ticketId: string | null;
  ticketNumber: number | null;
  projectId: string | null;
}

export interface ResolvedRelation {
  raw: RawRelationRecord;
  source: ResolvedRelationEnd;
  target: ResolvedRelationEnd;
  status: RelationResolutionStatus;
  mappedKind: JiritaRelationKind;
  /** True whenever Unfuddle's own type carries information the mapped JIRITA kind can't express (child/parent direction collapses to symmetric related_to; sibling's "derived from a shared parent" provenance is lost too). Only a literal "related"/"duplicate" type maps without loss. Approved: map anyway, report the loss — never invent a "blocks" direction for it. */
  semanticLossy: boolean;
}

/** The parent_child family the historical key preserves even though `kind` itself is always the generic related_to. Null for related/sibling/duplicate — nothing to orient. */
export interface ParentChildOrientation {
  parentUnfuddleId: number;
  childUnfuddleId: number;
}

/** The exact row shape a future insert_ticket_relations_bypassing_activity_log call would send — never actually sent by this PREVIEW-only phase. created_by is always null (Unfuddle gives no relation-level creator; see the schema audit) and created_at is intentionally absent (the RPC doesn't accept it — see 20260826000000). */
export interface PlannedRelationRow {
  ticket_id: string;
  related_ticket_id: string;
  kind: JiritaRelationKind;
  created_by: null;
  unfuddle_relation_key: string;
}

/**
 * One planned `ticket_relations` row — what a mirrored pair of raw XML
 * records (e.g. A "child" of B, and B "parent" of A) collapses onto once
 * canonicalized exactly the way createTicketRelation (src/lib/tickets.ts)
 * itself canonicalizes a symmetric kind: ticket_id/related_ticket_id sorted
 * by the JIRITA ticket UUID, not the Unfuddle id.
 */
export interface CanonicalRelationCandidate {
  /** `${plannedTicketId}-${plannedRelatedTicketId}-${mappedKind}` — matches ticket_relations_unique's own column order; used only for the secondary functional-uniqueness check, never for historical idempotency (see unfuddleRelationKey for that). */
  key: string;
  /** unfuddle:related:<min>:<max> | unfuddle:sibling:<min>:<max> | unfuddle:parent_child:<parent>:<child> — see import-relations/build-relation-key.ts. This is the real historical identity, identical for both raw records of a mirrored pair. */
  unfuddleRelationKey: string;
  plannedTicketId: string;
  plannedRelatedTicketId: string;
  aTicketUnfuddleId: number;
  bTicketUnfuddleId: number;
  aTicketNumber: number;
  bTicketNumber: number;
  mappedKind: JiritaRelationKind;
  /** e.g. ["child", "parent"] or ["sibling", "sibling"] — every raw type that collapsed onto this one candidate. */
  rawTypes: string[];
  rawRecordCount: number;
  isMirrored: boolean;
  /** Set only when rawTypes includes "child"/"parent" — which original ticket was the parent, determined from XML evidence (see build-relation-key.ts), never guessed. */
  orientation: ParentChildOrientation | null;
  /** The exact row a future RPC call would insert for this candidate. */
  plannedRow: PlannedRelationRow;
}

export interface RelationScopeSummary {
  /** Static, documented fact confirmed by a one-time full, unscoped scan of backup.xml (10,000 `<relationship>` tags counted directly) — never recomputed by this phase's own runtime code, which deliberately keeps the production parser's existing per-Milestone scoping (widening it would be an architecture change outside this task). See runner/phase7-print-report.ts for the citation. */
  globalRelationsInBackup: 10000;
  /** Raw relation records whose SOURCE ticket is one of the 170 KTVibe tickets — this is the live-computed "39". */
  initiallyAssociatedWithKTVibe: number;
  bothEndsInScopeRaw: number;
  targetNotImportedRaw: number;
  targetCrossProjectRaw: number;
  /** targetNotImportedRaw + targetCrossProjectRaw — reported as excluded_external, the approved terminology (never "error"/"conflict"). */
  excludedExternalRaw: number;
  typeDistribution: Record<string, number>;
  directedTypeCount: number;
  symmetricTypeCount: number;
  untypedCount: number;
  selfRelationCount: number;
  invalidTypeCount: number;
}

export interface DuplicateAudit {
  /** Exact (from, to, type) triples repeated more than once among the resolved records — expect 0; the natural "duplication" here is the mirror (A->B / B->A), audited separately below. */
  duplicateRawTriples: { key: string; count: number }[];
  /** Mirrored pairs found among the both-resolved records: A->B with type X and B->A with type Y present together. */
  invertedPairs: { a: number; b: number; forwardType: string; inverseType: string }[];
  /** An unordered pair whose mapped KIND differs depending on which raw record you read — would mean the mirror assumption doesn't hold for this pair. Expect empty. */
  samePairConflictingMappedKind: { a: number; b: number; kinds: string[] }[];
  selfRelations: RawRelationRecord[];
}

export interface RelationSchemaAudit {
  /** ticket_relations.unfuddle_relation_key — added by 20260826000000, deployed and verified live. */
  hasHistoricalIdentityColumn: boolean;
  historicalIdentityColumnName: string;
  storageModel: string;
  symmetricKindsCanonicalizedByClient: boolean;
  selfRelationConstraint: boolean;
  uniqueConstraint: string;
  historicalKeyUniqueConstraint: string;
  createdByNullable: boolean;
  /** True only as of 20260827000000/20260828000000 — the RPC now validates same-project itself, not just RLS (which service_role, the RPC's only caller, bypasses). Verified empirically: a live cross-project attempt was rejected (P0001), 0 rows persisted. */
  crossProjectGuardedInFunction: boolean;
  activityTrigger: { exists: boolean; unconditional: boolean; rowsPerInsert: number; description: string };
  bypassRpcExists: boolean;
  bypassRpcName: string;
  blockingReasons: string[];
}

export interface ExistingJiritaRelation {
  id: string;
  ticketId: string;
  relatedTicketId: string;
  kind: string;
  createdAt: string;
  createdBy: string | null;
  unfuddleRelationKey: string | null;
}

export interface RelationIdempotencyClassification {
  newCandidates: CanonicalRelationCandidate[];
  /** Matched by unfuddle_relation_key — real historical idempotency, not a content-based approximation. */
  alreadyImportedMatching: { candidate: CanonicalRelationCandidate; existing: ExistingJiritaRelation }[];
  /** Same unfuddle_relation_key already exists, but its (ticket_id, related_ticket_id, kind) differs from what this candidate would plan — should never happen for a deterministic key; checked defensively. */
  conflicting: { candidate: CanonicalRelationCandidate; existing: ExistingJiritaRelation; diffs: string[] }[];
  /** Two candidates in this batch computed the same unfuddle_relation_key — should never happen (checked defensively; canonicalize-relations.ts already guarantees a mirrored pair collapses to one candidate). */
  duplicateKeysInBatch: string[];
  /** True once ticket_relations.unfuddle_relation_key exists and is used for classification — see hasHistoricalIdentityColumn. False would mean falling back to a content-only comparison. */
  hasHistoricalIdentity: boolean;
  /** ticket_relations rows touching a KTVibe ticket that don't match any of this batch's candidates by key — e.g. the 2 live, manually-created relations between native (non-Unfuddle) tickets, unfuddle_relation_key = null. Purely informational, never confused with this batch. */
  unrelatedExistingRelationsInJirita: ExistingJiritaRelation[];
}

export interface RelationsPrecheckResult {
  organization: OrganizationPrecheckResult;
  project: { projectId: string | null; ok: boolean; error: string | null };
  scope: RelationScopeSummary;
  resolved: ResolvedRelation[];
  canonicalCandidates: CanonicalRelationCandidate[];
  /** The excluded_external relations — reported, never silently converted or imported. */
  blockedRelations: ResolvedRelation[];
  duplicates: DuplicateAudit;
  schemaAudit: RelationSchemaAudit;
  idempotency: RelationIdempotencyClassification | null;
  ok: boolean;
  blockingReasons: string[];
}

export interface RelationApplyOutcome {
  attempted: number;
  inserted: number;
  insertedKeys: string[];
  failed: number;
  possiblePartialImport: boolean;
  reconciledOk: number;
  reconciliationDiffs: { unfuddleRelationKey: string; diffs: string[] }[];
  error: string | null;
  durationMs: number;
}

export type Phase7Outcome = "preview_success" | "apply_success" | "failed" | "apply_rejected";

export interface Phase7Report {
  mode: "PREVIEW" | "APPLY";
  precheck: RelationsPrecheckResult | null;
  applyOutcome: RelationApplyOutcome | null;
  outcome: Phase7Outcome;
  failureReasons: string[];
}
