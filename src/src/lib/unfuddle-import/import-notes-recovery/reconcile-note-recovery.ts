import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteInsertPlan, PostWriteReconciliationResult } from "../types/notes-recovery";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST } from "./notebook-project-allowlist";

interface NoteRow {
  id: string;
  project_id: string;
  unfuddle_note_key: string | null;
}

/**
 * Independent, fresh, from-DB reconciliation run AFTER an apply attempt
 * (whether this invocation inserted anything or everything was already
 * imported) — never trusts applyNoteRecovery's own internal re-read alone.
 * Checks the FULL expected 28-Note state against the 6 approved
 * destinations, not just whatever this specific call inserted, since a
 * second (idempotent) APPLY run inserts 0 new rows but the full 28 must
 * still be verifiably present and correctly distributed.
 *
 * Verifies, per this task's explicit post-write requirements:
 *   - every expected unfuddle_note_key exists;
 *   - each one sits in its EXACT expected project_id (a key found in the
 *     wrong project is reported, never silently accepted);
 *   - exact per-destination counts (7/3/8/1/8/1);
 *   - 0 project_note_activity rows exist for these recovery note ids (the
 *     historical-import bypass must have suppressed all of them).
 *
 * Read-only — never updates/deletes/moves a misplaced row. A failed
 * reconciliation is reported as a FAIL and left for a human to
 * investigate, exactly as this task requires ("no intentar arreglar
 * automáticamente").
 */
export async function reconcileNoteRecovery(admin: SupabaseClient, expectedPlans: NoteInsertPlan[]): Promise<PostWriteReconciliationResult> {
  const expectedKeys = expectedPlans.map((p) => p.plannedRow.unfuddle_note_key);

  const { data, error } = await admin
    .from("project_notes")
    .select("id, project_id, unfuddle_note_key")
    .in("unfuddle_note_key", expectedKeys)
    .returns<NoteRow[]>();

  if (error) {
    return {
      ok: false,
      totalExpected: expectedPlans.length,
      totalActualMatching: 0,
      perDestination: [],
      missingKeys: [],
      unexpectedDestinationKeys: [],
      recoveryActivityRowCount: 0,
      blockingReasons: [`Post-write reconciliation query failed: ${error.message}`],
    };
  }

  const byKey = new Map((data ?? []).map((r) => [r.unfuddle_note_key as string, r]));

  const perDestination = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((mapping) => ({
    mapping,
    expectedCount: mapping.expectedLogicalNotes,
    actualCount: 0,
    missingKeys: [] as string[],
    wrongProjectKeys: [] as string[],
  }));
  const destByProjectId = new Map(perDestination.map((d) => [d.mapping.jiritaProjectUuid, d]));

  const missingKeys: string[] = [];
  const unexpectedDestinationKeys: PostWriteReconciliationResult["unexpectedDestinationKeys"] = [];

  for (const p of expectedPlans) {
    const key = p.plannedRow.unfuddle_note_key;
    const expectedProjectId = p.plannedRow.project_id;
    const dest = destByProjectId.get(expectedProjectId);
    const row = byKey.get(key);

    if (!row) {
      missingKeys.push(key);
      dest?.missingKeys.push(key);
      continue;
    }
    if (row.project_id !== expectedProjectId) {
      unexpectedDestinationKeys.push({ key, expectedProjectId, actualProjectId: row.project_id });
      dest?.wrongProjectKeys.push(key);
      continue;
    }
    if (dest) dest.actualCount++;
  }

  const matchedIds = [...byKey.values()]
    .filter((row) => {
      const expected = expectedPlans.find((p) => p.plannedRow.unfuddle_note_key === row.unfuddle_note_key);
      return expected && expected.plannedRow.project_id === row.project_id;
    })
    .map((row) => row.id);

  let recoveryActivityRowCount = 0;
  const blockingReasons: string[] = [];

  if (matchedIds.length > 0) {
    const { count, error: activityError } = await admin
      .from("project_note_activity")
      .select("id", { count: "exact", head: true })
      .in("note_id", matchedIds);
    if (activityError) {
      blockingReasons.push(`project_note_activity check failed: ${activityError.message}`);
    } else {
      recoveryActivityRowCount = count ?? 0;
    }
  }

  if (missingKeys.length > 0) blockingReasons.push(`${missingKeys.length} expected unfuddle_note_key(s) not found in project_notes after apply.`);
  if (unexpectedDestinationKeys.length > 0) blockingReasons.push(`${unexpectedDestinationKeys.length} key(s) found in an unexpected project.`);
  for (const d of perDestination) {
    if (d.actualCount !== d.expectedCount) {
      blockingReasons.push(`${d.mapping.jiritaProjectName}: expected ${d.expectedCount} recovery Note(s) after apply, found ${d.actualCount}.`);
    }
  }
  if (recoveryActivityRowCount > 0) {
    blockingReasons.push(`${recoveryActivityRowCount} project_note_activity row(s) found for recovery Notes — expected 0 (bypass should have suppressed all of them).`);
  }

  return {
    ok: blockingReasons.length === 0,
    totalExpected: expectedPlans.length,
    totalActualMatching: perDestination.reduce((sum, d) => sum + d.actualCount, 0),
    perDestination,
    missingKeys,
    unexpectedDestinationKeys,
    recoveryActivityRowCount,
    blockingReasons,
  };
}
