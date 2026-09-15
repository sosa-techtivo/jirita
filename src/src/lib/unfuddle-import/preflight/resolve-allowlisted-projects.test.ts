import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAllowlistedProjects } from "./resolve-allowlisted-projects";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST } from "../import-notes-recovery/notebook-project-allowlist";

interface ProjectFakeRow {
  id: string;
  name: string;
}

function fakeAdmin(rows: ProjectFakeRow[], error: { message: string } | null = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          returns: () => Promise.resolve({ data: error ? null : rows, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("resolveAllowlistedProjects", () => {
  it("resolves all 6 allowlisted projects when every UUID exists with the expected name", async () => {
    const rows = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((m) => ({ id: m.jiritaProjectUuid, name: m.jiritaProjectName }));
    const admin = fakeAdmin(rows);
    const result = await resolveAllowlistedProjects(admin);
    expect(result).toHaveLength(6);
    expect(result.every((r) => r.ok)).toBe(true);
    expect(result.every((r) => r.projectId !== null)).toBe(true);
  });

  it("reports a missing project as a blocking, non-ok resolution — never silently skipped", async () => {
    const rows = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.slice(1).map((m) => ({ id: m.jiritaProjectUuid, name: m.jiritaProjectName }));
    const admin = fakeAdmin(rows);
    const result = await resolveAllowlistedProjects(admin);
    const missing = result.find((r) => r.mapping.notebookUnfuddleId === APPROVED_NOTEBOOK_PROJECT_ALLOWLIST[0].notebookUnfuddleId)!;
    expect(missing.ok).toBe(false);
    expect(missing.projectId).toBeNull();
    expect(missing.error).toMatch(/not found/);
  });

  it("reports a name drift as a blocking, non-ok resolution — never silently accepted", async () => {
    const rows = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((m) => ({ id: m.jiritaProjectUuid, name: m.jiritaProjectName }));
    const driftedRows = rows.map((r, i) => (i === 0 ? { ...r, name: "Some Renamed Project" } : r));
    const admin = fakeAdmin(driftedRows);
    const result = await resolveAllowlistedProjects(admin);
    expect(result[0].ok).toBe(false);
    expect(result[0].error).toMatch(/Drift detected/);
    expect(result[0].actualName).toBe("Some Renamed Project");
  });

  it("propagates a query error as a blocking result for every entry", async () => {
    const admin = fakeAdmin([], { message: "network error" });
    const result = await resolveAllowlistedProjects(admin);
    expect(result.every((r) => !r.ok)).toBe(true);
    expect(result.every((r) => r.error?.includes("network error"))).toBe(true);
  });
});
