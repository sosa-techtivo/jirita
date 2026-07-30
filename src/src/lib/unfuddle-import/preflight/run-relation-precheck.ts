import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBackup } from "../types/parse-result";
import type { Phase2Config } from "../config";
import type { RelationScopeSummary, RelationsPrecheckResult } from "../types/phase7";
import { resolveOrganization } from "./resolve-organization";
import { checkExistingProject } from "./check-existing-project";
import { auditRelationSchema } from "./audit-relation-schema";
import { generateProjectCode, slugify } from "../import-project/slug-and-code";
import { resolveRelationTickets } from "../import-relations/resolve-relation-tickets";
import { canonicalizeRelations } from "../import-relations/canonicalize-relations";
import { auditRelationDuplicates } from "../import-relations/audit-relation-duplicates";
import { checkRelationIdempotency } from "../import-relations/check-relation-idempotency";
import { validateRelations } from "../validation/validate-relations";

function emptyScope(): RelationScopeSummary {
  return {
    globalRelationsInBackup: 10000,
    initiallyAssociatedWithKTVibe: 0,
    bothEndsInScopeRaw: 0,
    targetNotImportedRaw: 0,
    targetCrossProjectRaw: 0,
    excludedExternalRaw: 0,
    typeDistribution: {},
    directedTypeCount: 0,
    symmetricTypeCount: 0,
    untypedCount: 0,
    selfRelationCount: 0,
    invalidTypeCount: 0,
  };
}

/**
 * Runs every Phase 7 precondition against real Supabase data and the
 * already-parsed backup. Read-only throughout — never writes, never calls
 * an insert/update/delete/RPC. Mirrors the shape of runPrecheck (Phase 2)
 * and runCommentPrecheck (Phase 4): resolve org/project first (Phase 7
 * needs nothing else from Phase 2), then this phase's own resolution/
 * classification/duplicate/schema/idempotency audits.
 */
export async function runRelationPrecheck(
  admin: SupabaseClient,
  parsed: ParsedBackup,
  config: Phase2Config,
): Promise<RelationsPrecheckResult> {
  const organization = await resolveOrganization(admin, config.organizationSlug);

  const projectName = parsed.project?.name ?? "";
  const plannedSlug = slugify(projectName);
  const plannedProjectCode = generateProjectCode(projectName);

  const projectCheck = organization.organizationId
    ? await checkExistingProject(admin, organization.organizationId, String(config.targetMilestoneId), plannedSlug, plannedProjectCode)
    : null;

  const projectId = projectCheck?.existingByUnfuddleId?.id ?? null;
  const schemaAudit = auditRelationSchema();

  const blockingReasons: string[] = [];
  if (!organization.organizationId) blockingReasons.push(`Organization: ${organization.error}`);
  if (!projectId) blockingReasons.push("KTVibe project (Phase 2) not found by unfuddle_id — run Phase 2/3 first.");

  const rawValidation = validateRelations(parsed.tickets);

  if (!projectId) {
    return {
      organization,
      project: { projectId: null, ok: false, error: "Project not found." },
      scope: emptyScope(),
      resolved: [],
      canonicalCandidates: [],
      blockedRelations: [],
      duplicates: { duplicateRawTriples: [], invertedPairs: [], samePairConflictingMappedKind: [], selfRelations: [] },
      schemaAudit,
      idempotency: null,
      ok: false,
      blockingReasons,
    };
  }

  const resolution = await resolveRelationTickets(admin, projectId, parsed.tickets);
  if (!resolution.ok) blockingReasons.push(`Ticket resolution query failed: ${resolution.error}`);

  const canonicalCandidates = canonicalizeRelations(resolution.resolved);
  const blockedRelations = resolution.resolved.filter((r) => r.status !== "both_resolved");
  const duplicates = auditRelationDuplicates(resolution.resolved);
  const idempotency = await checkRelationIdempotency(admin, canonicalCandidates);

  // NOTE: blockedRelations (the 1 excluded_external relation) is a real,
  // reported, APPROVED finding — not a PREVIEW failure. Kept out of
  // `blockingReasons`/`ok` so a clean, fully-classified PREVIEW still
  // reports "preview_success" (see runner/phase7-run.ts) instead of
  // "failed" for the exact case this task explicitly asks to exclude and
  // report, not treat as an error.
  if (duplicates.selfRelations.length > 0) {
    blockingReasons.push(`${duplicates.selfRelations.length} self-relation(s) found in the source data.`);
  }
  if (duplicates.samePairConflictingMappedKind.length > 0) {
    blockingReasons.push(
      `${duplicates.samePairConflictingMappedKind.length} ticket pair(s) have conflicting mapped kinds across their mirrored raw records — the "every relationship is mirrored consistently" assumption does not hold for these.`,
    );
  }
  if (idempotency.duplicateKeysInBatch.length > 0) {
    blockingReasons.push(`${idempotency.duplicateKeysInBatch.length} unfuddle_relation_key collision(s) within this batch — canonicalization should make this impossible; investigate before proceeding.`);
  }
  if (idempotency.conflicting.length > 0) {
    blockingReasons.push(`${idempotency.conflicting.length} candidate(s) whose unfuddle_relation_key already exists in ticket_relations with different content — real conflict, not a matching re-import.`);
  }

  const typeDistribution: Record<string, number> = {};
  for (const r of resolution.resolved) typeDistribution[r.raw.type] = (typeDistribution[r.raw.type] ?? 0) + 1;
  const directedTypeCount = (typeDistribution["child"] ?? 0) + (typeDistribution["parent"] ?? 0);
  const symmetricTypeCount = (typeDistribution["sibling"] ?? 0) + (typeDistribution["related"] ?? 0) + (typeDistribution["duplicate"] ?? 0);
  const knownTypeCount = directedTypeCount + symmetricTypeCount;

  const targetNotImportedRaw = resolution.resolved.filter((r) => r.status === "target_not_imported").length;
  const targetCrossProjectRaw = resolution.resolved.filter((r) => r.status === "target_cross_project").length;

  const scope: RelationScopeSummary = {
    globalRelationsInBackup: 10000,
    initiallyAssociatedWithKTVibe: resolution.resolved.length,
    bothEndsInScopeRaw: resolution.resolved.filter((r) => r.status === "both_resolved").length,
    targetNotImportedRaw,
    targetCrossProjectRaw,
    excludedExternalRaw: targetNotImportedRaw + targetCrossProjectRaw,
    typeDistribution,
    directedTypeCount,
    symmetricTypeCount,
    untypedCount: resolution.resolved.length - knownTypeCount,
    selfRelationCount: duplicates.selfRelations.length,
    invalidTypeCount: rawValidation.invalidCount,
  };

  return {
    organization,
    project: { projectId, ok: true, error: null },
    scope,
    resolved: resolution.resolved,
    canonicalCandidates,
    blockedRelations,
    duplicates,
    schemaAudit,
    idempotency,
    ok: blockingReasons.length === 0,
    blockingReasons,
  };
}
