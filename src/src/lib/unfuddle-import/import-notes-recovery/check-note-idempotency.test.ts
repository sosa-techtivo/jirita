import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkNoteIdempotency } from "./check-note-idempotency";
import type { NoteInsertPlan } from "../types/notes-recovery";

interface FakeNoteRow {
  id: string;
  project_id: string;
  title: string;
  unfuddle_note_key: string | null;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
}

function fakeAdmin(existingRows: FakeNoteRow[], error: { message: string } | null = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          returns: () => Promise.resolve({ data: error ? null : existingRows, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function plan(overrides: Partial<NoteInsertPlan["plannedRow"]>): NoteInsertPlan {
  return {
    candidate: {
      notebookUnfuddleId: 1,
      notebookTitle: "N",
      pageNumber: 1,
      unfuddleNoteKey: overrides.unfuddle_note_key ?? "unfuddle:note:1:1",
      title: overrides.title ?? "N — P",
      content: "body",
      contentLength: 4,
      contentSha256: "x",
      versionCount: 1,
      latestVersion: 1,
      createdAt: "2020-01-01T00:00:00Z",
      createdByUnfuddleId: 1,
      updatedAt: "2020-01-01T00:00:00Z",
      updatedByUnfuddleId: 1,
    },
    plannedRow: {
      project_id: "proj-1",
      title: "N — P",
      content: "body",
      created_by: "profile-1",
      updated_by: "profile-1",
      created_at: "2020-01-01T00:00:00Z",
      updated_at: "2020-01-01T00:00:00Z",
      unfuddle_note_key: "unfuddle:note:1:1",
      ...overrides,
    },
  };
}

describe("checkNoteIdempotency", () => {
  it("classifies a plan with no matching key in project_notes as new", async () => {
    const admin = fakeAdmin([]);
    const result = await checkNoteIdempotency(admin, ["proj-1"], [plan({})]);
    expect(result.newPlans).toHaveLength(1);
    expect(result.alreadyImportedMatching).toHaveLength(0);
    expect(result.conflicting).toHaveLength(0);
  });

  it("classifies a plan whose key already exists in the SAME project with matching content as already-imported", async () => {
    const admin = fakeAdmin([
      { id: "existing-1", project_id: "proj-1", title: "N — P", unfuddle_note_key: "unfuddle:note:1:1", created_at: "2020-01-01T00:00:00Z", created_by: "profile-1", updated_by: "profile-1" },
    ]);
    const result = await checkNoteIdempotency(admin, ["proj-1"], [plan({})]);
    expect(result.newPlans).toHaveLength(0);
    expect(result.alreadyImportedMatching).toHaveLength(1);
    expect(result.conflicting).toHaveLength(0);
  });

  it("classifies a plan whose key already exists with DIFFERENT content as conflicting, never as a silent match", async () => {
    const admin = fakeAdmin([
      { id: "existing-1", project_id: "proj-1", title: "Different Title", unfuddle_note_key: "unfuddle:note:1:1", created_at: "2020-01-01T00:00:00Z", created_by: "profile-1", updated_by: "profile-1" },
    ]);
    const result = await checkNoteIdempotency(admin, ["proj-1"], [plan({})]);
    expect(result.newPlans).toHaveLength(0);
    expect(result.alreadyImportedMatching).toHaveLength(0);
    expect(result.conflicting).toHaveLength(1);
    expect(result.conflicting[0].diffs.some((d) => d.startsWith("title"))).toBe(true);
  });

  it("classifies a plan whose key already exists in a DIFFERENT project as a conflict — the exact failure mode the first (KTVibe-only) recovery must never repeat", async () => {
    const admin = fakeAdmin([
      { id: "existing-1", project_id: "wrong-project", title: "N — P", unfuddle_note_key: "unfuddle:note:1:1", created_at: "2020-01-01T00:00:00Z", created_by: "profile-1", updated_by: "profile-1" },
    ]);
    const result = await checkNoteIdempotency(admin, ["proj-1", "wrong-project"], [plan({ project_id: "proj-1" })]);
    expect(result.newPlans).toHaveLength(0);
    expect(result.alreadyImportedMatching).toHaveLength(0);
    expect(result.conflicting).toHaveLength(1);
    expect(result.conflicting[0].diffs.some((d) => d.startsWith("project_id"))).toBe(true);
  });

  it("classifies plans targeting different destination projects independently", async () => {
    const admin = fakeAdmin([]);
    const planA = plan({ project_id: "proj-a", unfuddle_note_key: "unfuddle:note:1:1" });
    const planB = plan({ project_id: "proj-b", unfuddle_note_key: "unfuddle:note:2:1" });
    const result = await checkNoteIdempotency(admin, ["proj-a", "proj-b"], [planA, planB]);
    expect(result.newPlans).toHaveLength(2);
  });

  it("never uses title matching for idempotency — a same-titled row with no historical key is not matched at all", async () => {
    const admin = fakeAdmin([{ id: "native-1", project_id: "proj-1", title: "N — P", unfuddle_note_key: null, created_at: "2020-01-01T00:00:00Z", created_by: null, updated_by: null }]);
    const result = await checkNoteIdempotency(admin, ["proj-1"], [plan({})]);
    expect(result.newPlans).toHaveLength(1);
    expect(result.alreadyImportedMatching).toHaveLength(0);
    expect(result.conflicting).toHaveLength(0);
  });

  it("reports every row with no historical key as an existing native note, never touched by classification", async () => {
    const admin = fakeAdmin([
      { id: "native-1", project_id: "proj-1", title: "Siteground Staging", unfuddle_note_key: null, created_at: "2026-08-03T14:27:15.012754+00:00", created_by: "mex-profile", updated_by: null },
    ]);
    const result = await checkNoteIdempotency(admin, ["proj-1"], []);
    expect(result.existingNativeNotes).toHaveLength(1);
    expect(result.existingNativeNotes[0].title).toBe("Siteground Staging");
  });

  it("flags duplicate unfuddle_note_key values within the same batch", async () => {
    const admin = fakeAdmin([]);
    const dup = plan({});
    const result = await checkNoteIdempotency(admin, ["proj-1"], [dup, dup]);
    expect(result.duplicateKeysInBatch).toEqual(["unfuddle:note:1:1"]);
  });

  it("throws (never silently returns empty) when the underlying query errors", async () => {
    const admin = fakeAdmin([], { message: "column project_notes.unfuddle_note_key does not exist" });
    await expect(checkNoteIdempotency(admin, ["proj-1"], [])).rejects.toThrow(/does not exist/);
  });
});
