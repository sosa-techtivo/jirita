export interface OrganizationPrecheckResult {
  slug: string;
  matchCount: number;
  organizationId: string | null;
  name: string | null;
  error: string | null;
}

export type UserResolutionStatus = "resolved" | "not_found" | "multiple_matches" | "unfuddle_id_conflict" | "missing_from_backup";

export interface UserPrecheckEntry {
  unfuddleId: number;
  email: string;
  fullName: string;
  status: UserResolutionStatus;
  profileId: string | null;
  /** profiles.unfuddle_id currently stored, before this phase writes anything (it never does). */
  currentUnfuddleId: string | null;
  matchCount: number;
  detail: string | null;
}

export interface UserPrecheckResult {
  entries: UserPrecheckEntry[];
  orphanUnfuddleIds: readonly number[];
  ok: boolean;
}

export interface ExistingProjectRow {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  projectCode: string;
  description: string | null;
  status: string;
  health: string;
  category: string;
  ownerProfileId: string | null;
  createdBy: string | null;
  unfuddleId: string | null;
  unfuddleImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConflictRow {
  id: string;
  slug: string;
  projectCode: string;
  unfuddleId: string | null;
}

export interface ProjectPrecheckResult {
  plannedSlug: string;
  plannedProjectCode: string;
  /** Non-null only if a project with this unfuddle_id already exists — the idempotent-replay case. */
  existingByUnfuddleId: ExistingProjectRow | null;
  /** Other projects (different unfuddle_id) already occupying the planned slug. */
  slugConflicts: ProjectConflictRow[];
  /** Other projects (different unfuddle_id) already occupying the planned project_code. */
  projectCodeConflicts: ProjectConflictRow[];
}

export interface Phase2PrecheckResult {
  organization: OrganizationPrecheckResult;
  users: UserPrecheckResult;
  project: ProjectPrecheckResult;
  ok: boolean;
  blockingReasons: string[];
}

/** The exact fields this importer controls on `projects` — everything else is left at its schema default. */
export interface PlannedProjectFields {
  organization_id: string;
  slug: string;
  name: string;
  project_code: string;
  description: string | null;
  status: "active";
  unfuddle_id: string;
  unfuddle_imported_at: string;
  created_by: null;
  owner_profile_id: null;
}

export interface ReconciliationResult {
  ok: boolean;
  diffs: string[];
}

export type Phase2Outcome = "preview_success" | "apply_success" | "already_imported" | "failed";

export interface Phase2Report {
  mode: "PREVIEW" | "APPLY";
  precheck: Phase2PrecheckResult;
  plannedFields: PlannedProjectFields | null;
  schemaDefaultsApplied: Record<string, string>;
  insertedRow: ExistingProjectRow | null;
  reconciliation: ReconciliationResult | null;
  sideEffects: { projectMembershipsCreated: number } | null;
  alreadyImportedDiffs: string[] | null;
  outcome: Phase2Outcome;
  failureReasons: string[];
}
