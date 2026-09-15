import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllowlistedProjectResolution } from "../types/notes-recovery";
import { APPROVED_NOTEBOOK_PROJECT_ALLOWLIST } from "../import-notes-recovery/notebook-project-allowlist";

interface ProjectRow {
  id: string;
  name: string;
}

/**
 * Resolves all 6 approved destination project UUIDs against live
 * `projects` in one query, cross-checking each one's name against the
 * allowlist's expected name as a drift detector (never as the matching
 * mechanism — matching is by UUID only, already fixed in the allowlist).
 *
 * `id` is `projects`' primary key, so "exists more than once" is
 * structurally impossible; "exists exactly once" here means "exists at
 * all, with the expected name" — any UUID absent, or present under a
 * different name than approved, is real drift and a blocker (per this
 * task's own "STOP and report drift" instruction), never silently
 * accepted or corrected.
 */
export async function resolveAllowlistedProjects(admin: SupabaseClient): Promise<AllowlistedProjectResolution[]> {
  const uuids = APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((m) => m.jiritaProjectUuid);

  const { data, error } = await admin.from("projects").select("id, name").in("id", uuids).returns<ProjectRow[]>();

  if (error) {
    const message = `projects lookup failed: ${error.message}`;
    return APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((mapping) => ({ mapping, projectId: null, actualName: null, ok: false, error: message }));
  }

  const byId = new Map((data ?? []).map((r) => [r.id, r]));

  return APPROVED_NOTEBOOK_PROJECT_ALLOWLIST.map((mapping) => {
    const row = byId.get(mapping.jiritaProjectUuid);
    if (!row) {
      return {
        mapping,
        projectId: null,
        actualName: null,
        ok: false,
        error: `Project ${mapping.jiritaProjectUuid} ("${mapping.jiritaProjectName}") not found in projects. Stopping rather than guessing.`,
      };
    }
    if (row.name !== mapping.jiritaProjectName) {
      return {
        mapping,
        projectId: row.id,
        actualName: row.name,
        ok: false,
        error: `Drift detected: expected name "${mapping.jiritaProjectName}" for ${mapping.jiritaProjectUuid}, got "${row.name}". Stopping.`,
      };
    }
    return { mapping, projectId: row.id, actualName: row.name, ok: true, error: null };
  });
}
