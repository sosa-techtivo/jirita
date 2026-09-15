import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileNoteRecovery } from "./reconcile-note-recovery";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST } from "./notebook-project-allowlist";
import type { NoteInsertPlan } from "../types/notes-recovery";

interface FakeNoteRow {
  id: string;
  project_id: string;
  unfuddle_note_key: string | null;
}

/**
 * A fake admin whose `project_notes` table is `noteRows` and whose
 * `project_note_activity` table has `activityCountForNoteIds` matching ids
 * — enough surface for reconcileNoteRecovery's two queries.
 */
function fakeAdmin(noteRows: FakeNoteRow[], activityCount = 0): SupabaseClient {
  let call = 0;
  return {
    from: (table: string) => {
      if (table === "project_notes") {
        return {
          select: () => ({
            in: () => ({
              returns: () => Promise.resolve({ data: noteRows, error: null }),
            }),
          }),
        };
      }
      if (table === "project_note_activity") {
        call++;
        return {
          select: () => ({
            in: () => Promise.resolve({ count: activityCount, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table} (call ${call})`);
    },
  } as unknown as SupabaseClient;
}

function planFor(notebookUnfuddleId: number, pageNumber: number, projectId: string): NoteInsertPlan {
  const key = `unfuddle:note:${notebookUnfuddleId}:${pageNumber}`;
  return {
    candidate: {
      notebookUnfuddleId,
      notebookTitle: "N",
      pageNumber,
      unfuddleNoteKey: key,
      title: "N — P",
      content: "body",
      contentLength: 4,
      contentSha256: "x",
      versionCount: 1,
      latestVersion: 1,
      createdAt: "2020-01-01T00:00:00Z",
      createdByUnfuddleId: null,
      updatedAt: "2020-01-01T00:00:00Z",
      updatedByUnfuddleId: null,
    },
    plannedRow: {
      project_id: projectId,
      title: "N — P",
      content: "body",
      created_by: null,
      updated_by: null,
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
      unfuddle_note_key: key,
    },
  };
}

/** All 28 expected plans, matching the real allowlist's exact distribution. */
function buildExpectedPlans(): NoteInsertPlan[] {
  const plans: NoteInsertPlan[] = [];
  for (const m of APPROVED_NOTEBOOK_PROJECT_ALLOWLIST) {
    for (let i = 1; i <= m.expectedLogicalNotes; i++) plans.push(planFor(m.notebookUnfuddleId, i, m.jiritaProjectUuid));
  }
  return plans;
}

describe("reconcileNoteRecovery", () => {
  it("succeeds when every expected key exists in its exact expected project and 0 activity rows exist", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans.map((p, i) => ({ id: `row-${i}`, project_id: p.plannedRow.project_id, unfuddle_note_key: p.plannedRow.unfuddle_note_key }));
    const admin = fakeAdmin(rows, 0);

    const result = await reconcileNoteRecovery(admin, plans);
    expect(result.ok).toBe(true);
    expect(result.totalExpected).toBe(28);
    expect(result.totalActualMatching).toBe(28);
    expect(result.missingKeys).toHaveLength(0);
    expect(result.unexpectedDestinationKeys).toHaveLength(0);
    expect(result.recoveryActivityRowCount).toBe(0);
    for (const d of result.perDestination) expect(d.actualCount).toBe(d.expectedCount);
  });

  it("J: a native note (no historical key, e.g. Siteground Staging) never affects reconciliation of the recovery keys", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans.map((p, i) => ({ id: `row-${i}`, project_id: p.plannedRow.project_id, unfuddle_note_key: p.plannedRow.unfuddle_note_key }));
    // A native note row mixed into the same query response — must never be matched to any plan.
    rows.push({ id: "native-1", project_id: plans[0].plannedRow.project_id, unfuddle_note_key: null });
    const admin = fakeAdmin(rows, 0);

    const result = await reconcileNoteRecovery(admin, plans);
    expect(result.ok).toBe(true);
    expect(result.totalActualMatching).toBe(28);
  });

  it("K: post-write reconciliation detects a key that landed in the WRONG destination project", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans.map((p, i) => ({
      id: `row-${i}`,
      // The first row (Camp Sunshine's first Note) is corrupted into a different project.
      project_id: i === 0 ? "wrong-project-id" : p.plannedRow.project_id,
      unfuddle_note_key: p.plannedRow.unfuddle_note_key,
    }));
    const admin = fakeAdmin(rows, 0);

    const result = await reconcileNoteRecovery(admin, plans);
    expect(result.ok).toBe(false);
    expect(result.unexpectedDestinationKeys).toHaveLength(1);
    expect(result.blockingReasons.some((r) => r.includes("unexpected project"))).toBe(true);
  });

  it("L: post-write reconciliation detects a missing expected key", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans
      .slice(1) // drop the first expected row entirely — simulates a missing insert
      .map((p, i) => ({ id: `row-${i}`, project_id: p.plannedRow.project_id, unfuddle_note_key: p.plannedRow.unfuddle_note_key }));
    const admin = fakeAdmin(rows, 0);

    const result = await reconcileNoteRecovery(admin, plans);
    expect(result.ok).toBe(false);
    expect(result.missingKeys).toHaveLength(1);
    expect(result.missingKeys[0]).toBe(plans[0].plannedRow.unfuddle_note_key);
    expect(result.blockingReasons.some((r) => r.includes("not found"))).toBe(true);
  });

  it("L (per-destination): a missing key surfaces as a per-destination count shortfall too", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans.slice(1).map((p, i) => ({ id: `row-${i}`, project_id: p.plannedRow.project_id, unfuddle_note_key: p.plannedRow.unfuddle_note_key }));
    const admin = fakeAdmin(rows, 0);

    const result = await reconcileNoteRecovery(admin, plans);
    const campSunshine = result.perDestination.find((d) => d.mapping.notebookUnfuddleId === 168)!;
    expect(campSunshine.actualCount).toBe(campSunshine.expectedCount - 1);
  });

  it("M: recovery activity rows > 0 causes reconciliation to fail even though every key/destination matches", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans.map((p, i) => ({ id: `row-${i}`, project_id: p.plannedRow.project_id, unfuddle_note_key: p.plannedRow.unfuddle_note_key }));
    const admin = fakeAdmin(rows, 3); // 3 synthetic activity rows found — bypass should have suppressed all of them

    const result = await reconcileNoteRecovery(admin, plans);
    expect(result.ok).toBe(false);
    expect(result.recoveryActivityRowCount).toBe(3);
    expect(result.blockingReasons.some((r) => r.includes("project_note_activity"))).toBe(true);
  });

  it("never attempts to fix/move a misplaced row — read-only, reports only", async () => {
    const plans = buildExpectedPlans();
    const rows: FakeNoteRow[] = plans.map((p, i) => ({ id: `row-${i}`, project_id: i === 0 ? "wrong-project-id" : p.plannedRow.project_id, unfuddle_note_key: p.plannedRow.unfuddle_note_key }));
    const admin = {
      from: (table: string) => {
        if (table === "project_notes") {
          return { select: () => ({ in: () => ({ returns: () => Promise.resolve({ data: rows, error: null }) }) }) };
        }
        if (table === "project_note_activity") {
          return { select: () => ({ in: () => Promise.resolve({ count: 0, error: null }) }) };
        }
        // update/delete/insert should never be called by this function.
        throw new Error(`reconcileNoteRecovery must never call ${table} for anything but select`);
      },
    } as unknown as SupabaseClient;

    const result = await reconcileNoteRecovery(admin, plans);
    expect(result.ok).toBe(false); // reported, not repaired
  });
});
