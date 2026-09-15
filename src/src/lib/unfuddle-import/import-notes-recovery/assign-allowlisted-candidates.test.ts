import { describe, it, expect } from "vitest";
import { assignAllowlistedCandidates } from "./assign-allowlisted-candidates";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST, EXPECTED_ALLOWLISTED_TOTAL } from "./notebook-project-allowlist";
import type { LogicalNoteCandidate } from "../types/notes-recovery";

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
    createdByUnfuddleId: 1,
    updatedAt: "2020-01-01T00:00:00Z",
    updatedByUnfuddleId: 1,
  };
}

describe("assignAllowlistedCandidates", () => {
  it("routes a candidate from an allowlisted notebook into its bucket", () => {
    const result = assignAllowlistedCandidates([candidate(168, 1)]);
    const campSunshineBucket = result.allowlisted.find((b) => b.mapping.notebookUnfuddleId === 168)!;
    expect(campSunshineBucket.candidates).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });

  it("excludes a candidate from a non-allowlisted notebook, fail-closed — no fuzzy matching, no fallback path", () => {
    const result = assignAllowlistedCandidates([candidate(9999, 1)]);
    expect(result.excluded).toHaveLength(1);
    for (const b of result.allowlisted) expect(b.candidates).toHaveLength(0);
  });

  it("excludes Notebook 255 (Addison Smith) — ambiguous destination, deliberately never allowlisted", () => {
    const result = assignAllowlistedCandidates([candidate(255, 1)]);
    expect(result.excluded.map((c) => c.notebookUnfuddleId)).toContain(255);
  });

  it("excludes Notebook 224 (KTDrive your career) — deliberately never allowlisted", () => {
    const result = assignAllowlistedCandidates([candidate(224, 1)]);
    expect(result.excluded.map((c) => c.notebookUnfuddleId)).toContain(224);
  });

  it("always returns exactly 6 allowlist buckets, in allowlist order, regardless of input", () => {
    const result = assignAllowlistedCandidates([]);
    expect(result.allowlisted).toHaveLength(6);
    expect(result.allowlisted.map((b) => b.mapping.notebookUnfuddleId)).toEqual(APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((m) => m.notebookUnfuddleId));
  });

  it("flags a count mismatch when a bucket's actual count differs from its expected count, independently of every other bucket", () => {
    // Every allowlisted notebook gets its own exact expected count EXCEPT
    // KTVibe (216, expects 1), which gets 2 — isolating a single mismatch.
    const candidates: LogicalNoteCandidate[] = [];
    for (const m of APPROVED_NOTEBOOK_PROJECT_ALLOWLIST) {
      const count = m.notebookUnfuddleId === 216 ? 2 : m.expectedLogicalNotes;
      for (let i = 1; i <= count; i++) candidates.push(candidate(m.notebookUnfuddleId, i));
    }
    const result = assignAllowlistedCandidates(candidates);
    expect(result.countMismatches).toHaveLength(1);
    expect(result.countMismatches[0].mapping.notebookUnfuddleId).toBe(216);
    expect(result.countMismatches[0].expected).toBe(1);
    expect(result.countMismatches[0].actual).toBe(2);
  });

  it("flags every allowlist entry with 0 matching candidates as unmapped", () => {
    const result = assignAllowlistedCandidates([]);
    expect(result.unmappedAllowlistEntries).toHaveLength(6);
  });

  it("B: with the real 158-Note source shape (28 allowlisted + 130 from other notebooks), excludes exactly 130", () => {
    const candidates: LogicalNoteCandidate[] = [];
    for (const m of APPROVED_NOTEBOOK_PROJECT_ALLOWLIST) {
      for (let i = 1; i <= m.expectedLogicalNotes; i++) candidates.push(candidate(m.notebookUnfuddleId, i));
    }
    for (let i = 0; i < 130; i++) candidates.push(candidate(9000 + i, 1)); // 130 non-allowlisted notebooks, incl. a stand-in for 255/224
    expect(candidates).toHaveLength(158);

    const result = assignAllowlistedCandidates(candidates);
    const allowlistedTotal = result.allowlisted.reduce((sum, b) => sum + b.candidates.length, 0);
    expect(allowlistedTotal).toBe(28);
    expect(result.excluded).toHaveLength(130);
  });

  it("matches the real backup.xml's exact expected distribution (7+3+8+1+8+1=28) when every allowlisted notebook has its exact expected count", () => {
    const candidates: LogicalNoteCandidate[] = [];
    for (const m of APPROVED_NOTEBOOK_PROJECT_ALLOWLIST) {
      for (let i = 1; i <= m.expectedLogicalNotes; i++) candidates.push(candidate(m.notebookUnfuddleId, i));
    }
    const result = assignAllowlistedCandidates(candidates);
    const total = result.allowlisted.reduce((sum, b) => sum + b.candidates.length, 0);
    expect(total).toBe(28);
    expect(total).toBe(EXPECTED_ALLOWLISTED_TOTAL);
    expect(result.countMismatches).toHaveLength(0);
    expect(result.unmappedAllowlistEntries).toHaveLength(0);
  });
});
