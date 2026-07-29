import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingProjectRow, PlannedProjectFields, ReconciliationResult } from "../types/phase2";
import { reconcileInsertedRow } from "./reconcile-project-row";
import { EXPECTED_SCHEMA_DEFAULTS } from "./build-project-row";

const PROJECT_ROW_COLUMNS =
  "id, organization_id, slug, name, project_code, description, status, health, category, owner_profile_id, created_by, unfuddle_id, unfuddle_imported_at, created_at, updated_at";

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

export interface InsertProjectOutcome {
  insertedRow: ExistingProjectRow;
  reconciliation: ReconciliationResult;
  projectMembershipsCreated: number;
}

/**
 * APPLY only: inserts exactly one `projects` row, then re-reads it (never
 * trusts the insert's own `.select()` payload alone) and reconciles every
 * field this importer controls, plus verifies the known
 * projects_add_creator_membership trigger (20260803000000) created zero
 * project_memberships rows — the concrete, evidence-based check that
 * `created_by: null` actually suppressed it, not an assumption.
 */
export async function insertProject(admin: SupabaseClient, planned: PlannedProjectFields): Promise<InsertProjectOutcome> {
  const { data: insertedData, error: insertError } = await admin
    .from("projects")
    .insert(planned)
    .select(PROJECT_ROW_COLUMNS)
    .single<ProjectRow>();

  if (insertError || !insertedData) {
    throw new Error(`projects insert failed: ${insertError?.message ?? "no row returned"}`);
  }

  const { data: rereadData, error: rereadError } = await admin
    .from("projects")
    .select(PROJECT_ROW_COLUMNS)
    .eq("id", insertedData.id)
    .single<ProjectRow>();

  if (rereadError || !rereadData) {
    throw new Error(`post-insert re-read failed: ${rereadError?.message ?? "no row returned"}`);
  }

  const insertedRow = toExistingProjectRow(rereadData);
  const reconciliation = reconcileInsertedRow(planned, insertedRow, {
    health: EXPECTED_SCHEMA_DEFAULTS.health,
    category: EXPECTED_SCHEMA_DEFAULTS.category,
  });

  const { count: membershipCount, error: membershipError } = await admin
    .from("project_memberships")
    .select("id", { count: "exact", head: true })
    .eq("project_id", insertedRow.id);

  if (membershipError) {
    throw new Error(`post-insert project_memberships check failed: ${membershipError.message}`);
  }

  return { insertedRow, reconciliation, projectMembershipsCreated: membershipCount ?? 0 };
}
