import type { Project } from "../types/models";
import type { PlannedProjectFields } from "../types/phase2";
import { generateProjectCode, slugify } from "./slug-and-code";

/**
 * Builds the exact `projects` insert payload for the target Milestone,
 * per the audit in the Phase 2 task and src/lib/projects.ts's own
 * createProject precedent:
 *
 * - status: 'active', not the column's own 'planning' default — the exact
 *   override createProject already applies ("the schema's own column
 *   default is 'planning' — this overrides it per product requirement"),
 *   and 'planning' would be actively wrong for a project with 8+ years of
 *   real historical tickets.
 * - health / category / priority / owner_profile_id / short_name /
 *   client_name / default_hourly_rate / target_date / repository_* are all
 *   deliberately left unset — createProject's own precedent leaves these
 *   "at their column defaults — not part of this flow", and there is no
 *   Unfuddle-side data to derive them from (milestone 183's
 *   person-responsible-id is 0/unset; no `clients` row named "KTVibe"
 *   exists to link a category='client').
 * - created_by: explicitly `null`, never omitted. The column's own default
 *   is `auth.uid()`, and an AFTER INSERT trigger
 *   (add_project_creator_membership, 20260803000000) creates a
 *   project_memberships row whenever `new.created_by is not null` — which
 *   this phase must not do (memberships are out of scope). Passing null
 *   explicitly makes that guaranteed, not just a side effect of running
 *   unauthenticated.
 */
export function buildPlannedProjectFields(project: Project, organizationId: string, executedAt: Date): PlannedProjectFields {
  return {
    organization_id: organizationId,
    slug: slugify(project.name),
    name: project.name,
    project_code: generateProjectCode(project.name),
    description: project.description || null,
    status: "active",
    unfuddle_id: String(project.unfuddleMilestoneId),
    unfuddle_imported_at: executedAt.toISOString(),
    created_by: null,
    owner_profile_id: null,
  };
}

/** Schema-default columns this insert deliberately leaves unset — shown in the report for full transparency. */
export const EXPECTED_SCHEMA_DEFAULTS: Record<string, string> = {
  health: "healthy",
  category: "internal",
  priority: "medium",
  short_name: "null",
  client_name: "null",
  default_hourly_rate: "null",
  target_date: "null",
  repository_provider: "null",
  repository_url: "null",
};
