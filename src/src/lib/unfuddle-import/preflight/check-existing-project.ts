import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingProjectRow, ProjectConflictRow, ProjectPrecheckResult } from "../types/phase2";

interface ProjectRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  project_code: string;
  description: string | null;
  status: string;
  health: string;
  category: string;
  owner_profile_id: string | null;
  created_by: string | null;
  unfuddle_id: string | null;
  unfuddle_imported_at: string | null;
  created_at: string;
  updated_at: string;
}

const PROJECT_ROW_COLUMNS =
  "id, organization_id, slug, name, project_code, description, status, health, category, owner_profile_id, created_by, unfuddle_id, unfuddle_imported_at, created_at, updated_at";

function toExistingProjectRow(row: ProjectRow): ExistingProjectRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    projectCode: row.project_code,
    description: row.description,
    status: row.status,
    health: row.health,
    category: row.category,
    ownerProfileId: row.owner_profile_id,
    createdBy: row.created_by,
    unfuddleId: row.unfuddle_id,
    unfuddleImportedAt: row.unfuddle_imported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Looks up `projects.unfuddle_id = <targetMilestoneId>` (the idempotent
 * replay case, spec §10) and separately checks the planned slug/
 * project_code for collisions with any *other* project (a project with a
 * different, or no, unfuddle_id already sitting on the same slug/code).
 */
export async function checkExistingProject(
  admin: SupabaseClient,
  organizationId: string,
  unfuddleId: string,
  plannedSlug: string,
  plannedProjectCode: string,
): Promise<ProjectPrecheckResult> {
  const { data: byUnfuddleId, error: byUnfuddleIdError } = await admin
    .from("projects")
    .select(PROJECT_ROW_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("unfuddle_id", unfuddleId);

  if (byUnfuddleIdError) {
    throw new Error(`projects lookup by unfuddle_id failed: ${byUnfuddleIdError.message}`);
  }

  const existingByUnfuddleId = (byUnfuddleId ?? [])[0] ? toExistingProjectRow((byUnfuddleId ?? [])[0] as ProjectRow) : null;

  const { data: slugRows, error: slugError } = await admin
    .from("projects")
    .select("id, slug, project_code, unfuddle_id")
    .eq("organization_id", organizationId)
    .eq("slug", plannedSlug);
  if (slugError) throw new Error(`projects lookup by slug failed: ${slugError.message}`);

  const { data: codeRows, error: codeError } = await admin
    .from("projects")
    .select("id, slug, project_code, unfuddle_id")
    .eq("organization_id", organizationId)
    .eq("project_code", plannedProjectCode);
  if (codeError) throw new Error(`projects lookup by project_code failed: ${codeError.message}`);

  const toConflictRow = (r: { id: string; slug: string; project_code: string; unfuddle_id: string | null }): ProjectConflictRow => ({
    id: r.id,
    slug: r.slug,
    projectCode: r.project_code,
    unfuddleId: r.unfuddle_id,
  });

  const slugConflicts = (slugRows ?? []).filter((r) => r.unfuddle_id !== unfuddleId).map(toConflictRow);
  const projectCodeConflicts = (codeRows ?? []).filter((r) => r.unfuddle_id !== unfuddleId).map(toConflictRow);

  return { plannedSlug, plannedProjectCode, existingByUnfuddleId, slugConflicts, projectCodeConflicts };
}
