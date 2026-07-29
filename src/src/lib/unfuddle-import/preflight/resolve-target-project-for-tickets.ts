import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketProjectPrecheckResult } from "../types/phase3";

/**
 * Resolves the KTVibe project by `unfuddle_id` (never a hardcoded UUID as
 * the primary lookup mechanism) and validates it hasn't drifted from what
 * Phase 2 reconciled: exactly one row, `slug`/`project_code` unchanged,
 * still owned by the resolved organization.
 */
export async function resolveTargetProjectForTickets(
  admin: SupabaseClient,
  organizationId: string | null,
  unfuddleMilestoneId: string,
  expectedSlug: string,
  expectedProjectCode: string,
): Promise<TicketProjectPrecheckResult> {
  if (!organizationId) {
    return {
      organizationId: null,
      projectId: null,
      slug: null,
      projectCode: null,
      organizationMatches: false,
      slugMatches: false,
      projectCodeMatches: false,
      ok: false,
      error: "Organization was not resolved — cannot look up the project.",
    };
  }

  const { data, error } = await admin
    .from("projects")
    .select("id, organization_id, slug, project_code, unfuddle_id")
    .eq("unfuddle_id", unfuddleMilestoneId);

  if (error) {
    return {
      organizationId,
      projectId: null,
      slug: null,
      projectCode: null,
      organizationMatches: false,
      slugMatches: false,
      projectCodeMatches: false,
      ok: false,
      error: `projects lookup failed: ${error.message}`,
    };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      organizationId,
      projectId: null,
      slug: null,
      projectCode: null,
      organizationMatches: false,
      slugMatches: false,
      projectCodeMatches: false,
      ok: false,
      error: `No project found with unfuddle_id "${unfuddleMilestoneId}" — Phase 2 must run first.`,
    };
  }
  if (rows.length > 1) {
    return {
      organizationId,
      projectId: null,
      slug: null,
      projectCode: null,
      organizationMatches: false,
      slugMatches: false,
      projectCodeMatches: false,
      ok: false,
      error: `${rows.length} projects matched unfuddle_id "${unfuddleMilestoneId}" — expected exactly one.`,
    };
  }

  const row = rows[0];
  const organizationMatches = row.organization_id === organizationId;
  const slugMatches = row.slug === expectedSlug;
  const projectCodeMatches = row.project_code === expectedProjectCode;
  const ok = organizationMatches && slugMatches && projectCodeMatches;

  return {
    organizationId,
    projectId: row.id,
    slug: row.slug,
    projectCode: row.project_code,
    organizationMatches,
    slugMatches,
    projectCodeMatches,
    ok,
    error: ok
      ? null
      : `Project ${row.id} drifted from Phase 2's reconciled configuration: organization ${organizationMatches ? "OK" : `expected ${organizationId}, got ${row.organization_id}`}, slug ${slugMatches ? "OK" : `expected "${expectedSlug}", got "${row.slug}"`}, project_code ${projectCodeMatches ? "OK" : `expected "${expectedProjectCode}", got "${row.project_code}"`}.`,
  };
}
