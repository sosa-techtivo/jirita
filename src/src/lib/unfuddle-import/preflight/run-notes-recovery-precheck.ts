import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserReference } from "../types/models";
import type { NoteIdempotencyClassification, NoteInsertPlan, NotesRecoveryPrecheckResult, PlannedNoteInsertRow } from "../types/notes-recovery";
import { parseNotebookPagesXml } from "../parser/notebook-pages-xml-parser";
import { groupLogicalPages } from "../import-notes-recovery/group-logical-pages";
import { assignAllowlistedCandidates } from "../import-notes-recovery/assign-allowlisted-candidates";
import { resolveNoteAuthors } from "../import-notes-recovery/resolve-note-authors";
import { checkNoteIdempotency } from "../import-notes-recovery/check-note-idempotency";
import { resolveAllowlistedProjects } from "./resolve-allowlisted-projects";

export interface NotesRecoveryPrecheckConfig {
  backupXmlPath: string;
  targetUnfuddleProjectId: number;
}

/**
 * Runs every precondition for the Unfuddle Notes recovery against real
 * Supabase data and a fresh parse of backup.xml. Read-only throughout —
 * never writes, never calls insert/update/delete/rpc.
 *
 * Multi-project, fail-closed (fixes the first recovery's KTVibe-only
 * premise): every one of the 158 logical Notes parsed from the source is
 * classified as either allowlisted (its notebook is one of the 6 approved
 * entries in import-notes-recovery/notebook-project-allowlist.ts, assigned
 * to that entry's exact JIRITA project) or excluded (every other notebook —
 * never planned, never resolved, never written, regardless of how similar
 * its name looks to a live project).
 */
export async function runNotesRecoveryPrecheck(
  admin: SupabaseClient,
  backupUsers: UserReference[],
  config: NotesRecoveryPrecheckConfig,
): Promise<NotesRecoveryPrecheckResult> {
  const blockingReasons: string[] = [];

  const projectResolutions = await resolveAllowlistedProjects(admin);
  for (const r of projectResolutions) {
    if (!r.ok) blockingReasons.push(`Project mapping (notebook ${r.mapping.notebookUnfuddleId} "${r.mapping.notebookTitle}" -> ${r.mapping.jiritaProjectName}): ${r.error}`);
  }

  const parsedNotebooks = await parseNotebookPagesXml({
    backupXmlPath: config.backupXmlPath,
    targetProjectId: config.targetUnfuddleProjectId,
  });
  const grouping = groupLogicalPages(parsedNotebooks.revisions);

  if (grouping.continuityIssues.length > 0) {
    blockingReasons.push(`${grouping.continuityIssues.length} version-continuity issue(s) found in the source — see grouping.continuityIssues.`);
  }

  const allowlistAssignment = assignAllowlistedCandidates(grouping.candidates);

  for (const mismatch of allowlistAssignment.countMismatches) {
    blockingReasons.push(
      `Notebook ${mismatch.mapping.notebookUnfuddleId} (${mismatch.mapping.jiritaProjectName}): expected ${mismatch.expected} logical Notes, found ${mismatch.actual}.`,
    );
  }
  for (const unmapped of allowlistAssignment.unmappedAllowlistEntries) {
    blockingReasons.push(`Notebook ${unmapped.notebookUnfuddleId} (${unmapped.jiritaProjectName}) has 0 candidates in the source — allowlist entry may be wrong.`);
  }

  // Author resolution is scoped ONLY to allowlisted candidates — an
  // excluded Note is never planned/written, so its authors are irrelevant
  // to this recovery and are never looked up.
  const referencedAuthorIds = new Set<number>();
  for (const bucket of allowlistAssignment.allowlisted) {
    for (const c of bucket.candidates) {
      if (c.createdByUnfuddleId !== null) referencedAuthorIds.add(c.createdByUnfuddleId);
      if (c.updatedByUnfuddleId !== null) referencedAuthorIds.add(c.updatedByUnfuddleId);
    }
  }

  const authorResolution = await resolveNoteAuthors(admin, backupUsers, [...referencedAuthorIds].sort((a, b) => a - b));
  if (!authorResolution.ok) blockingReasons.push(...authorResolution.blockingReasons);

  // No silent null authors: a candidate whose created_by/updated_by author
  // failed to resolve is never planned with a guessed/null profile — it is
  // dropped from `plans` and reported as a blocking reason instead. Each
  // plan's project_id is the allowlist entry's own resolved UUID — never
  // inferred, never shared across buckets.
  const plans: NoteInsertPlan[] = [];
  for (const bucket of allowlistAssignment.allowlisted) {
    const resolution = projectResolutions.find((r) => r.mapping.notebookUnfuddleId === bucket.mapping.notebookUnfuddleId);
    if (!resolution?.projectId) continue;

    for (const c of bucket.candidates) {
      const createdBy = c.createdByUnfuddleId !== null ? (authorResolution.map.get(c.createdByUnfuddleId) ?? null) : null;
      const updatedBy = c.updatedByUnfuddleId !== null ? (authorResolution.map.get(c.updatedByUnfuddleId) ?? null) : null;

      if (c.createdByUnfuddleId !== null && !createdBy) {
        blockingReasons.push(`Candidate ${c.unfuddleNoteKey}: created_by author ${c.createdByUnfuddleId} did not resolve to a profile.`);
        continue;
      }
      if (c.updatedByUnfuddleId !== null && !updatedBy) {
        blockingReasons.push(`Candidate ${c.unfuddleNoteKey}: updated_by author ${c.updatedByUnfuddleId} did not resolve to a profile.`);
        continue;
      }

      const plannedRow: PlannedNoteInsertRow = {
        project_id: resolution.projectId,
        title: c.title,
        content: c.content,
        created_by: createdBy,
        updated_by: updatedBy,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
        unfuddle_note_key: c.unfuddleNoteKey,
      };
      plans.push({ candidate: c, plannedRow });
    }
  }

  // Wrapped, not left to throw: an idempotency query failure (e.g. the
  // historical-identity migration not deployed) must surface as a normal,
  // reported blocking reason so every other precheck section still
  // renders, never an unhandled crash.
  let idempotency: NoteIdempotencyClassification | null = null;
  const resolvedDestinationProjectIds = projectResolutions.filter((r) => r.projectId).map((r) => r.projectId!);
  if (resolvedDestinationProjectIds.length > 0) {
    try {
      idempotency = await checkNoteIdempotency(admin, resolvedDestinationProjectIds, plans);
    } catch (err) {
      blockingReasons.push(`Idempotency check failed — the historical-identity migration may not be deployed: ${(err as Error).message}`);
    }
  }

  if (idempotency) {
    if (idempotency.duplicateKeysInBatch.length > 0) {
      blockingReasons.push(`${idempotency.duplicateKeysInBatch.length} unfuddle_note_key collision(s) within this batch — grouping should make this impossible; investigate before proceeding.`);
    }
    if (idempotency.conflicting.length > 0) {
      blockingReasons.push(`${idempotency.conflicting.length} candidate(s) whose unfuddle_note_key already exists in project_notes with a conflicting project/title/author — real conflict, not a matching re-import.`);
    }
  }

  return {
    projectResolutions,
    parsed: { notebookCount: parsedNotebooks.notebookCount, revisionCount: parsedNotebooks.revisions.length },
    grouping,
    allowlistAssignment,
    authorResolution,
    plans,
    idempotency,
    ok: blockingReasons.length === 0,
    blockingReasons,
  };
}
