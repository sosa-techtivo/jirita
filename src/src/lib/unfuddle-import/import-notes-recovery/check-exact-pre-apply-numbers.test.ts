import { describe, it, expect } from "vitest";
import { checkExactPreApplyNumbers } from "./check-exact-pre-apply-numbers";
import { assignAllowlistedCandidates } from "./assign-allowlisted-candidates";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST } from "./notebook-project-allowlist";
import type { LogicalNoteCandidate, NoteInsertPlan, NotesRecoveryPrecheckResult } from "../types/notes-recovery";

function candidate(notebookUnfuddleId: number, pageNumber: number): LogicalNoteCandidate {
  return {
    notebookUnfuddleId,
    notebookTitle: `Notebook ${notebookUnfuddleId}`,
    pageNumber,
    unfuddleNoteKey: `unfuddle:note:${notebookUnfuddleId}:${pageNumber}`,
    title: `Notebook ${notebookUnfuddleId} — Page ${pageNumber}`,
    content: "body",
    contentLength: 4,
    contentSha256: "x",
    versionCount: 1,
    latestVersion: 1,
    createdAt: "2020-01-01T00:00:00Z",
    createdByUnfuddleId: null,
    updatedAt: "2020-01-01T00:00:00Z",
    updatedByUnfuddleId: null,
  };
}

/** 28 allowlisted candidates (exact expected distribution) + 130 excluded ones = 158 total. */
function buildAllCandidates(): LogicalNoteCandidate[] {
  const candidates: LogicalNoteCandidate[] = [];
  for (const m of APPROVED_NOTEBOOK_PROJECT_ALLOWLIST) {
    for (let i = 1; i <= m.expectedLogicalNotes; i++) candidates.push(candidate(m.notebookUnfuddleId, i));
  }
  for (let i = 0; i < 130; i++) candidates.push(candidate(9000 + i, 1));
  return candidates;
}

function buildValidPrecheck(): NotesRecoveryPrecheckResult {
  const allCandidates = buildAllCandidates();
  const allowlistAssignment = assignAllowlistedCandidates(allCandidates);

  const projectResolutions = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((mapping) => ({
    mapping,
    projectId: `proj-${mapping.notebookUnfuddleId}`,
    actualName: mapping.jiritaProjectName,
    ok: true,
    error: null,
  }));
  const projectIdByNotebook = new Map(projectResolutions.map((r) => [r.mapping.notebookUnfuddleId, r.projectId]));

  const plans: NoteInsertPlan[] = [];
  for (const bucket of allowlistAssignment.allowlisted) {
    const projectId = projectIdByNotebook.get(bucket.mapping.notebookUnfuddleId)!;
    for (const c of bucket.candidates) {
      plans.push({
        candidate: c,
        plannedRow: {
          project_id: projectId,
          title: c.title,
          content: c.content,
          created_by: null,
          updated_by: null,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          unfuddle_note_key: c.unfuddleNoteKey,
        },
      });
    }
  }

  return {
    projectResolutions,
    parsed: { notebookCount: 53, revisionCount: 248 },
    grouping: { candidates: allCandidates, continuityIssues: [], duplicateTitles: [] },
    allowlistAssignment,
    authorResolution: { map: new Map(), entries: [], ok: true, blockingReasons: [] },
    plans,
    idempotency: { newPlans: plans, alreadyImportedMatching: [], conflicting: [], duplicateKeysInBatch: [], existingNativeNotes: [] },
    ok: true,
    blockingReasons: [],
  };
}

describe("checkExactPreApplyNumbers", () => {
  it("passes (empty problems) for a valid first-run precheck: 28 new / 0 already imported", () => {
    const precheck = buildValidPrecheck();
    expect(checkExactPreApplyNumbers(precheck)).toEqual([]);
  });

  it("D (gate-level): passes for a valid idempotent second-run precheck: 0 new / 28 already imported", () => {
    const precheck = buildValidPrecheck();
    precheck.idempotency = { newPlans: [], alreadyImportedMatching: precheck.plans.map((plan) => ({ plan, existing: { id: "x", projectId: plan.plannedRow.project_id, title: plan.plannedRow.title, unfuddleNoteKey: plan.plannedRow.unfuddle_note_key, createdAt: plan.plannedRow.created_at, createdBy: null, updatedBy: null } })), conflicting: [], duplicateKeysInBatch: [], existingNativeNotes: [] };
    expect(checkExactPreApplyNumbers(precheck)).toEqual([]);
  });

  it("E: candidate count != 28 blocks APPLY", () => {
    const precheck = buildValidPrecheck();
    // Drop one allowlisted candidate (Camp Sunshine, 168) — 27 total instead of 28.
    precheck.grouping.candidates = precheck.grouping.candidates.filter((c) => !(c.notebookUnfuddleId === 168 && c.pageNumber === 7));
    precheck.allowlistAssignment = assignAllowlistedCandidates(precheck.grouping.candidates);
    precheck.plans = precheck.plans.filter((p) => !(p.candidate.notebookUnfuddleId === 168 && p.candidate.pageNumber === 7));
    precheck.idempotency = { newPlans: precheck.plans, alreadyImportedMatching: [], conflicting: [], duplicateKeysInBatch: [], existingNativeNotes: [] };

    const problems = checkExactPreApplyNumbers(precheck);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("allowlisted total"))).toBe(true);
  });

  it("F: per-project distribution mismatch blocks APPLY", () => {
    const precheck = buildValidPrecheck();
    // Give KTVibe (216, expects 1) a second candidate.
    const extra = candidate(216, 99);
    precheck.grouping.candidates = [...precheck.grouping.candidates, extra];
    precheck.allowlistAssignment = assignAllowlistedCandidates(precheck.grouping.candidates);

    const problems = checkExactPreApplyNumbers(precheck);
    expect(problems.some((p) => p.includes("KTVibe"))).toBe(true);
  });

  it("G: an unallowlisted candidate reaching the write set blocks APPLY (defense in depth)", () => {
    const precheck = buildValidPrecheck();
    const rogueCandidate = candidate(9999, 1);
    precheck.plans = [
      ...precheck.plans,
      {
        candidate: rogueCandidate,
        plannedRow: {
          project_id: "some-project",
          title: rogueCandidate.title,
          content: rogueCandidate.content,
          created_by: null,
          updated_by: null,
          created_at: rogueCandidate.createdAt,
          updated_at: rogueCandidate.updatedAt,
          unfuddle_note_key: rogueCandidate.unfuddleNoteKey,
        },
      },
    ];

    const problems = checkExactPreApplyNumbers(precheck);
    expect(problems.some((p) => p.includes("NOT in the allowlist"))).toBe(true);
  });

  it("blocks APPLY when a project resolution has drifted (not ok)", () => {
    const precheck = buildValidPrecheck();
    precheck.projectResolutions = precheck.projectResolutions.map((r, i) => (i === 0 ? { ...r, ok: false, error: "drift" } : r));
    const problems = checkExactPreApplyNumbers(precheck);
    expect(problems.some((p) => p.includes("resolved cleanly"))).toBe(true);
  });

  it("blocks APPLY when idempotency reports a conflict", () => {
    const precheck = buildValidPrecheck();
    precheck.idempotency!.conflicting = [{ plan: precheck.plans[0], existing: { id: "x", projectId: "wrong", title: "t", unfuddleNoteKey: precheck.plans[0].plannedRow.unfuddle_note_key, createdAt: "2020-01-01T00:00:00Z", createdBy: null, updatedBy: null }, diffs: ["project_id mismatch"] }];
    const problems = checkExactPreApplyNumbers(precheck);
    expect(problems.some((p) => p.includes("conflicting"))).toBe(true);
  });
});
