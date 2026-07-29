import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBackup } from "../types/parse-result";
import type { Phase2Config } from "../config";
import type { Phase2PrecheckResult } from "../types/phase2";
import { generateProjectCode, slugify } from "../import-project/slug-and-code";
import { resolveOrganization } from "./resolve-organization";
import { resolveTargetUsers } from "./resolve-target-users";
import { checkExistingProject } from "./check-existing-project";

/** Runs every Phase 2 precondition against real Supabase data. Read-only — never writes. */
export async function runPrecheck(admin: SupabaseClient, parsed: ParsedBackup, config: Phase2Config): Promise<Phase2PrecheckResult> {
  const organization = await resolveOrganization(admin, config.organizationSlug);
  const users = await resolveTargetUsers(admin, parsed.users, config.targetUserUnfuddleIds, config.knownOrphanUnfuddleIds);

  const projectName = parsed.project?.name ?? "";
  const plannedSlug = slugify(projectName);
  const plannedProjectCode = generateProjectCode(projectName);

  const project = organization.organizationId
    ? await checkExistingProject(admin, organization.organizationId, String(config.targetMilestoneId), plannedSlug, plannedProjectCode)
    : { plannedSlug, plannedProjectCode, existingByUnfuddleId: null, slugConflicts: [], projectCodeConflicts: [] };

  const blockingReasons: string[] = [];

  if (!parsed.projectMeta) blockingReasons.push(`Unfuddle Project ${config.targetProjectId} was not found in the backup.`);
  if (!parsed.project) blockingReasons.push(`Unfuddle Milestone ${config.targetMilestoneId} was not found in the backup.`);
  if (organization.error) blockingReasons.push(`Organization: ${organization.error}`);

  for (const entry of users.entries) {
    if (entry.status !== "resolved") {
      blockingReasons.push(`User ${entry.fullName || entry.unfuddleId} (unfuddle id ${entry.unfuddleId}): ${entry.detail}`);
    }
  }

  // The idempotent "already imported" case is not itself blocking — the
  // runner short-circuits to PROJECT ALREADY IMPORTED for it. Only a
  // *different* project squatting on the planned slug/project_code blocks.
  if (project.slugConflicts.length > 0) {
    blockingReasons.push(
      `Slug "${project.plannedSlug}" is already used by ${project.slugConflicts.length} other project(s): ${project.slugConflicts.map((c) => c.id).join(", ")}.`,
    );
  }
  if (project.projectCodeConflicts.length > 0) {
    blockingReasons.push(
      `project_code "${project.plannedProjectCode}" is already used by ${project.projectCodeConflicts.length} other project(s): ${project.projectCodeConflicts.map((c) => c.id).join(", ")}.`,
    );
  }

  return { organization, users, project, ok: blockingReasons.length === 0, blockingReasons };
}
