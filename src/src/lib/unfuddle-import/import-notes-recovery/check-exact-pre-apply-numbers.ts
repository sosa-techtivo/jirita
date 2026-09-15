import type { NotesRecoveryPrecheckResult } from "../types/notes-recovery";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST, EXPECTED_ALLOWLISTED_TOTAL } from "./notebook-project-allowlist";

const EXPECTED_EXCLUDED_TOTAL = 130;
const EXPECTED_LOGICAL_TOTAL = 158;
const EXPECTED_NOTEBOOK_COUNT = 53;
const EXPECTED_REVISION_COUNT = 248;

/**
 * Every exact number this recovery requires before APPLY may write
 * anything, re-checked against a FRESH precheck in the same invocation
 * (see runner/notes-recovery-run.ts). Includes a defense-in-depth
 * structural check (no plan may reference a notebook outside the
 * allowlist) even though assign-allowlisted-candidates.ts already makes
 * that impossible by construction — belt and suspenders for a write path
 * this sensitive. Pure and independently testable. Returns the list of
 * mismatches — empty means "go".
 */
export function checkExactPreApplyNumbers(precheck: NotesRecoveryPrecheckResult): string[] {
  const problems: string[] = [];

  if (precheck.parsed.notebookCount !== EXPECTED_NOTEBOOK_COUNT) problems.push(`parsed.notebookCount=${precheck.parsed.notebookCount}, expected ${EXPECTED_NOTEBOOK_COUNT}`);
  if (precheck.parsed.revisionCount !== EXPECTED_REVISION_COUNT) problems.push(`parsed.revisionCount=${precheck.parsed.revisionCount}, expected ${EXPECTED_REVISION_COUNT}`);
  if (precheck.grouping.candidates.length !== EXPECTED_LOGICAL_TOTAL) problems.push(`grouping.candidates.length=${precheck.grouping.candidates.length}, expected ${EXPECTED_LOGICAL_TOTAL}`);
  if (precheck.grouping.continuityIssues.length !== 0) problems.push(`grouping.continuityIssues.length=${precheck.grouping.continuityIssues.length}, expected 0`);

  const allowlistedTotal = precheck.allowlistAssignment.allowlisted.reduce((sum, b) => sum + b.candidates.length, 0);
  if (allowlistedTotal !== EXPECTED_ALLOWLISTED_TOTAL) problems.push(`allowlisted total=${allowlistedTotal}, expected ${EXPECTED_ALLOWLISTED_TOTAL} (7+3+8+1+8+1)`);
  if (precheck.allowlistAssignment.excluded.length !== EXPECTED_EXCLUDED_TOTAL) problems.push(`excluded total=${precheck.allowlistAssignment.excluded.length}, expected ${EXPECTED_EXCLUDED_TOTAL}`);
  if (precheck.allowlistAssignment.countMismatches.length !== 0) problems.push(`allowlistAssignment.countMismatches.length=${precheck.allowlistAssignment.countMismatches.length}, expected 0`);
  if (precheck.allowlistAssignment.unmappedAllowlistEntries.length !== 0) problems.push(`allowlistAssignment.unmappedAllowlistEntries.length=${precheck.allowlistAssignment.unmappedAllowlistEntries.length}, expected 0`);

  for (const bucket of precheck.allowlistAssignment.allowlisted) {
    if (bucket.candidates.length !== bucket.mapping.expectedLogicalNotes) {
      problems.push(`${bucket.mapping.jiritaProjectName}: expected ${bucket.mapping.expectedLogicalNotes}, got ${bucket.candidates.length}`);
    }
  }

  if (!precheck.projectResolutions.every((r) => r.ok)) problems.push("Not every allowlisted project resolved cleanly (drift or missing project).");
  if (precheck.authorResolution.entries.some((e) => e.status === "unresolved")) problems.push("At least one required author is unresolved.");
  if (precheck.plans.length !== EXPECTED_ALLOWLISTED_TOTAL) problems.push(`plans.length=${precheck.plans.length}, expected ${EXPECTED_ALLOWLISTED_TOTAL}`);

  // Defense in depth: every planned row's notebook must be in the
  // allowlist. Structurally guaranteed already by
  // assignAllowlistedCandidates (a plan is only ever built from an
  // allowlisted bucket) — checked again explicitly here so there is no
  // possible future refactor that could reach the RPC with an
  // unallowlisted candidate without this gate catching it first.
  const allowlistedNotebookIds = new Set(APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((m) => m.notebookUnfuddleId));
  const rogue = precheck.plans.filter((p) => !allowlistedNotebookIds.has(p.candidate.notebookUnfuddleId));
  if (rogue.length > 0) problems.push(`${rogue.length} plan(s) reference a notebook NOT in the allowlist — refusing to write.`);

  if (!precheck.idempotency) {
    problems.push("idempotency is null.");
  } else {
    if (precheck.idempotency.conflicting.length !== 0) problems.push(`idempotency.conflicting.length=${precheck.idempotency.conflicting.length}, expected 0`);
    if (precheck.idempotency.duplicateKeysInBatch.length !== 0) problems.push(`idempotency.duplicateKeysInBatch.length=${precheck.idempotency.duplicateKeysInBatch.length}, expected 0`);
    // Either a first run (28 new / 0 already) or a valid idempotent second
    // run (0 new / 28 already) — both are acceptable; what must never
    // happen is the two not summing to the full expected 28.
    const total = precheck.idempotency.newPlans.length + precheck.idempotency.alreadyImportedMatching.length;
    if (total !== EXPECTED_ALLOWLISTED_TOTAL) {
      problems.push(
        `idempotency.newPlans(${precheck.idempotency.newPlans.length}) + alreadyImportedMatching(${precheck.idempotency.alreadyImportedMatching.length}) = ${total}, expected ${EXPECTED_ALLOWLISTED_TOTAL}`,
      );
    }
  }

  return problems;
}
