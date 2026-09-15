import { describe, it, expect } from "vitest";
import { groupLogicalPages } from "./group-logical-pages";
import type { NotebookPageRevision } from "../types/notes-recovery";

function rev(overrides: Partial<NotebookPageRevision>): NotebookPageRevision {
  return {
    notebookUnfuddleId: 1,
    notebookTitle: "Notebook A",
    notebookProjectUnfuddleId: 152,
    pageUnfuddleId: 1000,
    pageNumber: 1,
    pageTitle: "Page A",
    version: 1,
    body: "body",
    bodyFormat: "textile",
    authorUnfuddleId: 1,
    createdAt: "2020-01-01T00:00:00Z",
    updatedAt: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupLogicalPages", () => {
  it("builds one candidate for a single-version logical page, using it for both creation and update metadata", () => {
    const { candidates, continuityIssues } = groupLogicalPages([
      rev({ notebookUnfuddleId: 10, pageNumber: 1, version: 1, authorUnfuddleId: 5, createdAt: "2020-01-01T00:00:00Z" }),
    ]);
    expect(continuityIssues).toEqual([]);
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.unfuddleNoteKey).toBe("unfuddle:note:10:1");
    expect(c.versionCount).toBe(1);
    expect(c.latestVersion).toBe(1);
    expect(c.createdByUnfuddleId).toBe(5);
    expect(c.updatedByUnfuddleId).toBe(5);
    expect(c.createdAt).toBe("2020-01-01T00:00:00Z");
    expect(c.updatedAt).toBe("2020-01-01T00:00:00Z");
  });

  it("uses v1 for creation metadata and the highest version for a renamed page's current title/content/author", () => {
    const { candidates } = groupLogicalPages([
      rev({ notebookUnfuddleId: 20, pageNumber: 1, version: 1, pageTitle: "Old Title", body: "old body", authorUnfuddleId: 1, createdAt: "2020-01-01T00:00:00Z" }),
      rev({ notebookUnfuddleId: 20, pageNumber: 1, version: 2, pageTitle: "Middle Title", body: "middle body", authorUnfuddleId: 2, createdAt: "2020-02-01T00:00:00Z" }),
      rev({ notebookUnfuddleId: 20, pageNumber: 1, version: 3, pageTitle: "New Title", body: "new body", authorUnfuddleId: 3, createdAt: "2020-03-01T00:00:00Z" }),
    ]);
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.title).toBe("Notebook A — New Title");
    expect(c.content).toBe("new body");
    expect(c.versionCount).toBe(3);
    expect(c.latestVersion).toBe(3);
    expect(c.createdByUnfuddleId).toBe(1);
    expect(c.createdAt).toBe("2020-01-01T00:00:00Z");
    expect(c.updatedByUnfuddleId).toBe(3);
    expect(c.updatedAt).toBe("2020-03-01T00:00:00Z");
  });

  it("does not depend on document order — the highest version wins even if it appears first in the input", () => {
    const { candidates } = groupLogicalPages([
      rev({ notebookUnfuddleId: 21, pageNumber: 1, version: 2, pageTitle: "Latest", authorUnfuddleId: 9, createdAt: "2020-02-01T00:00:00Z" }),
      rev({ notebookUnfuddleId: 21, pageNumber: 1, version: 1, pageTitle: "First", authorUnfuddleId: 1, createdAt: "2020-01-01T00:00:00Z" }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe("Notebook A — Latest");
    expect(candidates[0].createdByUnfuddleId).toBe(1);
    expect(candidates[0].updatedByUnfuddleId).toBe(9);
  });

  it("flags a duplicate version number within a logical page and still reports the other issue types independently", () => {
    const { continuityIssues, candidates } = groupLogicalPages([
      rev({ notebookUnfuddleId: 30, pageNumber: 1, version: 1 }),
      rev({ notebookUnfuddleId: 30, pageNumber: 1, version: 1 }),
    ]);
    expect(continuityIssues).toContainEqual({ notebookUnfuddleId: 30, pageNumber: 1, versionsPresent: [1, 1], reason: "duplicate_version" });
    // A candidate is still produced (v1 exists) — duplicate detection doesn't block building one, it's a reported issue the runner's exact-number gate catches.
    expect(candidates).toHaveLength(1);
  });

  it("flags a non-consecutive version history (gap)", () => {
    const { continuityIssues } = groupLogicalPages([
      rev({ notebookUnfuddleId: 31, pageNumber: 1, version: 1 }),
      rev({ notebookUnfuddleId: 31, pageNumber: 1, version: 3 }),
    ]);
    expect(continuityIssues).toContainEqual({ notebookUnfuddleId: 31, pageNumber: 1, versionsPresent: [1, 3], reason: "non_consecutive" });
  });

  it("flags a missing v1 and never fabricates creation metadata for it — no candidate is produced", () => {
    const { continuityIssues, candidates } = groupLogicalPages([
      rev({ notebookUnfuddleId: 32, pageNumber: 1, version: 2 }),
      rev({ notebookUnfuddleId: 32, pageNumber: 1, version: 3 }),
    ]);
    expect(continuityIssues.some((i) => i.notebookUnfuddleId === 32 && i.reason === "missing_v1")).toBe(true);
    expect(candidates).toHaveLength(0);
  });

  it("keeps distinct notebooks/page numbers as separate logical pages", () => {
    const { candidates } = groupLogicalPages([
      rev({ notebookUnfuddleId: 1, pageNumber: 1 }),
      rev({ notebookUnfuddleId: 1, pageNumber: 2 }),
      rev({ notebookUnfuddleId: 2, pageNumber: 1 }),
    ]);
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((c) => c.unfuddleNoteKey)).size).toBe(3);
  });

  it("reports duplicate resulting titles across different logical pages", () => {
    const { duplicateTitles } = groupLogicalPages([
      rev({ notebookUnfuddleId: 1, notebookTitle: "Shared", pageNumber: 1, pageTitle: "Same" }),
      rev({ notebookUnfuddleId: 2, notebookTitle: "Shared", pageNumber: 1, pageTitle: "Same" }),
    ]);
    expect(duplicateTitles).toEqual([{ title: "Shared — Same", count: 2 }]);
  });

  it("computes a stable contentSha256/contentLength off the latest version's body only", () => {
    const { candidates } = groupLogicalPages([rev({ notebookUnfuddleId: 40, pageNumber: 1, version: 1, body: "hello world" })]);
    expect(candidates[0].contentLength).toBe("hello world".length);
    expect(candidates[0].contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
