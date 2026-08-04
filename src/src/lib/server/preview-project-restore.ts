// Second layer of the project-backup IMPORTER: analyzes a backup already
// parsed and validated by parseProjectBackupZip() (see
// parse-project-backup-zip.ts — untouched here, reused as-is, never
// reparsed) against a destination organization, and returns a read-only
// preview. No writes anywhere: no project creation, no ticket restoration,
// no attachment upload, no migrations, no UI, no Route Handler, no Server
// Action. Every Supabase call below is a plain `select`.
//
// Field names were re-audited directly against export-project.ts's
// Exported*Row types (the same source of truth parseProjectBackupZip()
// already returns) and against the live `organizations`/`profiles`/
// `organization_memberships` schema (20260708000000_mvp_schema.sql) before
// writing any of the checks below — see the profile-reference field list
// next to collectProfileReferences.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExportedProjectSummary } from "./export-project";
import type { ParsedProjectBackup } from "./parse-project-backup-zip";

// This function's own signature (parsedBackup, organizationId) carries no
// caller session/access token — unlike a Server Action, there is no
// per-request identity to build an RLS-scoped client from here. That
// mirrors exportProject(projectId)'s own precedent (same file convention,
// same env vars) rather than introducing a second client pattern. Per
// requirement 9, this is *not* used to bypass any write policy — nothing
// below ever writes — only to run the small, fixed set of read-only
// existence/membership lookups requirement 2 actually asks for (never a
// broader "just in case" query).
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Public shape ─────────────────────────────────────────────────────────────

export interface ProfileReferenceEntry {
  profileId: string;
  /** Which backup fields referenced this profile id, e.g. "tickets.assignee_profile_id". */
  referencedIn: string[];
}

export interface ProjectRestorePreviewSourceProject {
  id: string;
  name: string;
  slug: string;
  projectCode: string;
}

export interface ProjectRestorePreviewConflicts {
  slugInUse: boolean;
  projectCodeInUse: boolean;
}

export interface ProjectRestorePreviewProfileReferences {
  resolvable: ProfileReferenceEntry[];
  missing: ProfileReferenceEntry[];
  outsideOrganization: ProfileReferenceEntry[];
}

export interface ProjectRestorePreview {
  sourceProject: ProjectRestorePreviewSourceProject;
  destinationOrganizationId: string;
  conflicts: ProjectRestorePreviewConflicts;
  profileReferences: ProjectRestorePreviewProfileReferences;
  summary: ExportedProjectSummary;
  warnings: string[];
  canRestore: boolean;
}

// ── Profile reference collection ────────────────────────────────────────────
// Every field in the backup that stores a profile id, exactly as required —
// audited against export-project.ts's Exported*Row types immediately above.

const EMPTY_SUMMARY: ExportedProjectSummary = {
  members: 0,
  statuses: 0,
  tickets: 0,
  comments: 0,
  activity: 0,
  timeEntries: 0,
  attachments: 0,
  relations: 0,
  notes: 0,
  noteActivity: 0,
};

function collectProfileReferences(backup: ParsedProjectBackup): Map<string, Set<string>> {
  const byProfileId = new Map<string, Set<string>>();

  const add = (field: string, value: string | null | undefined) => {
    // Nullable per requirement 4 — a null reference is simply not tracked;
    // there is nothing to resolve or classify for it.
    if (!value) return;
    if (!byProfileId.has(value)) byProfileId.set(value, new Set());
    byProfileId.get(value)!.add(field);
  };

  add("project.created_by", backup.project.created_by);
  add("project.owner_profile_id", backup.project.owner_profile_id);

  for (const m of backup.members) add("members.profile_id", m.profile_id);

  for (const t of backup.tickets) {
    add("tickets.assignee_profile_id", t.assignee_profile_id);
    add("tickets.created_by", t.created_by);
  }

  for (const c of backup.comments) add("comments.author_profile_id", c.author_profile_id);
  for (const a of backup.activity) add("activity.actor_profile_id", a.actor_profile_id);
  for (const te of backup.timeEntries) add("timeEntries.logged_by", te.logged_by);
  for (const at of backup.attachments) add("attachments.uploaded_by", at.uploaded_by);

  for (const n of backup.notes) {
    add("notes.created_by", n.created_by);
    add("notes.updated_by", n.updated_by);
  }

  for (const na of backup.noteActivity) add("noteActivity.actor_profile_id", na.actor_profile_id);

  return byProfileId;
}

// ── Defensive re-check (requirement 7's "backup inconsistente" case) ──────
// parseProjectBackupZip() already validated all of this — this is only a
// cheap backstop so previewProjectRestore() never throws on a malformed
// caller-supplied object, consistent with this function always returning a
// structured preview (canRestore carries the signal, never an exception).
function looksLikeAValidBackup(candidate: unknown): candidate is ParsedProjectBackup {
  if (!candidate || typeof candidate !== "object") return false;
  const backup = candidate as Partial<ParsedProjectBackup>;
  const project = backup.project;
  const summary = backup.manifest?.summary;
  if (!project || typeof project.id !== "string" || !project.id) return false;
  if (typeof project.slug !== "string" || !project.slug) return false;
  if (typeof project.project_code !== "string" || !project.project_code) return false;
  if (!summary) return false;
  return (
    Array.isArray(backup.members) && backup.members.length === summary.members &&
    Array.isArray(backup.statuses) && backup.statuses.length === summary.statuses &&
    Array.isArray(backup.tickets) && backup.tickets.length === summary.tickets &&
    Array.isArray(backup.comments) && backup.comments.length === summary.comments &&
    Array.isArray(backup.activity) && backup.activity.length === summary.activity &&
    Array.isArray(backup.timeEntries) && backup.timeEntries.length === summary.timeEntries &&
    Array.isArray(backup.attachments) && backup.attachments.length === summary.attachments &&
    Array.isArray(backup.relations) && backup.relations.length === summary.relations &&
    Array.isArray(backup.notes) && backup.notes.length === summary.notes &&
    Array.isArray(backup.noteActivity) && backup.noteActivity.length === summary.noteActivity
  );
}

function blockedPreview(
  organizationId: string,
  sourceProject: ProjectRestorePreviewSourceProject,
  summary: ExportedProjectSummary,
  reason: string
): ProjectRestorePreview {
  return {
    sourceProject,
    destinationOrganizationId: organizationId,
    conflicts: { slugInUse: false, projectCodeInUse: false },
    profileReferences: { resolvable: [], missing: [], outsideOrganization: [] },
    summary,
    warnings: [reason],
    canRestore: false,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function previewProjectRestore(
  parsedBackup: ParsedProjectBackup,
  organizationId: string
): Promise<ProjectRestorePreview> {
  // Widened to `unknown` before the shape check on purpose: the exported
  // signature above requires a real ParsedProjectBackup (requirement 1 —
  // "reutilizar ParsedProjectBackup"), but this function must never throw
  // on a caller that ignores TypeScript at runtime, so the check itself is
  // written against the same untyped input a JS caller could actually pass.
  const candidate: unknown = parsedBackup;
  if (!looksLikeAValidBackup(candidate)) {
    const partial = candidate as Partial<ParsedProjectBackup> | null | undefined;
    return blockedPreview(
      organizationId,
      {
        id: partial?.project?.id ?? "",
        name: partial?.project?.name ?? "",
        slug: partial?.project?.slug ?? "",
        projectCode: partial?.project?.project_code ?? "",
      },
      partial?.manifest?.summary ?? EMPTY_SUMMARY,
      "The provided backup failed a basic consistency check and cannot be previewed — it should already have been rejected by parseProjectBackupZip()."
    );
  }

  const project = parsedBackup.project;
  const sourceProject: ProjectRestorePreviewSourceProject = {
    id: project.id,
    name: project.name,
    slug: project.slug,
    projectCode: project.project_code,
  };
  const summary = parsedBackup.manifest.summary;

  if (typeof organizationId !== "string" || organizationId.trim() === "") {
    return blockedPreview(organizationId, sourceProject, summary, "Invalid destination organization id.");
  }

  const client = getAdminClient();

  // ── organizationId must exist ───────────────────────────────────────────
  let organizationExists: boolean;
  try {
    const { data, error } = await client.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (error) throw error;
    organizationExists = !!data;
  } catch (err) {
    return blockedPreview(organizationId, sourceProject, summary, `Could not verify the destination organization: ${errorMessage(err)}`);
  }
  if (!organizationExists) {
    return blockedPreview(organizationId, sourceProject, summary, `Destination organization "${organizationId}" does not exist.`);
  }

  // ── Conflicts: slug / project_code already used in the destination org ──
  // Non-blocking per requirement 7 — reported via warnings/conflicts only.
  let slugInUse = false;
  let projectCodeInUse = false;
  try {
    const [slugResult, codeResult] = await Promise.all([
      client.from("projects").select("id").eq("organization_id", organizationId).eq("slug", project.slug).limit(1),
      client.from("projects").select("id").eq("organization_id", organizationId).eq("project_code", project.project_code).limit(1),
    ]);
    if (slugResult.error) throw slugResult.error;
    if (codeResult.error) throw codeResult.error;
    slugInUse = (slugResult.data?.length ?? 0) > 0;
    projectCodeInUse = (codeResult.data?.length ?? 0) > 0;
  } catch (err) {
    return blockedPreview(organizationId, sourceProject, summary, `Could not check for slug/project_code conflicts: ${errorMessage(err)}`);
  }

  const warnings: string[] = [];
  if (slugInUse) {
    warnings.push(`Slug "${project.slug}" is already in use by another project in the destination organization.`);
  }
  if (projectCodeInUse) {
    warnings.push(`Project code "${project.project_code}" is already in use by another project in the destination organization.`);
  }

  // ── Profile references ───────────────────────────────────────────────────
  const referenceMap = collectProfileReferences(parsedBackup);
  const referencedIds = Array.from(referenceMap.keys());

  let existingProfileIds = new Set<string>();
  let orgMemberProfileIds = new Set<string>();
  if (referencedIds.length > 0) {
    try {
      const [profilesResult, membershipsResult] = await Promise.all([
        // "perfiles disponibles": do these ids correspond to a real person
        // at all, regardless of organization (profiles is org-agnostic).
        client.from("profiles").select("id").in("id", referencedIds),
        // "membresías existentes de esos perfiles": of those, which are
        // currently *active* members of *this* destination organization —
        // matches every other "is this person a real destination member"
        // check in the codebase (loadOrganizationMembers in lib/projects.ts,
        // requireAdminCaller). A profile with a disabled membership is not
        // a valid restore target and must classify as outsideOrganization,
        // not resolvable — a real gap this had before (real disabled
        // memberships exist in production data), caught while building the
        // Stage 2 profile-mapping UI, which relies on this classification
        // to decide which references are safe to preselect to themselves.
        client
          .from("organization_memberships")
          .select("profile_id")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .in("profile_id", referencedIds),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (membershipsResult.error) throw membershipsResult.error;
      existingProfileIds = new Set((profilesResult.data ?? []).map((r) => r.id as string));
      orgMemberProfileIds = new Set((membershipsResult.data ?? []).map((r) => r.profile_id as string));
    } catch (err) {
      return blockedPreview(organizationId, sourceProject, summary, `Could not resolve referenced profiles: ${errorMessage(err)}`);
    }
  }

  const resolvable: ProfileReferenceEntry[] = [];
  const missing: ProfileReferenceEntry[] = [];
  const outsideOrganization: ProfileReferenceEntry[] = [];

  for (const profileId of referencedIds.slice().sort()) {
    const referencedIn = Array.from(referenceMap.get(profileId) ?? []).sort();
    if (!existingProfileIds.has(profileId)) {
      missing.push({ profileId, referencedIn });
    } else if (!orgMemberProfileIds.has(profileId)) {
      outsideOrganization.push({ profileId, referencedIn });
    } else {
      resolvable.push({ profileId, referencedIn });
    }
  }

  if (missing.length > 0) {
    warnings.push(
      `${missing.length} referenced profile id(s) do not exist and cannot be resolved: ${missing.map((m) => m.profileId).join(", ")}.`
    );
  }
  if (outsideOrganization.length > 0) {
    warnings.push(
      `${outsideOrganization.length} referenced profile id(s) exist but are not members of the destination organization: ${outsideOrganization
        .map((m) => m.profileId)
        .join(", ")}.`
    );
  }

  // ── Structural warnings (requirement 8) ──────────────────────────────────
  if (parsedBackup.statuses.length === 0) {
    warnings.push(
      "statuses.json is empty — this backup was exported under the legacy ticket-status schema (no per-project ticket_statuses / tickets.status_id)."
    );
  }
  // parsedBackup.attachmentsIncluded (not attachments.length alone) is the
  // real signal — a Full backup genuinely does contain every attachment's
  // physical file (see serialize-exported-project.ts), so this warning
  // must only fire for a Data Only or pre-physical-files legacy backup,
  // never unconditionally whenever there happens to be at least one
  // attachment row.
  if (parsedBackup.attachments.length > 0 && !parsedBackup.attachmentsIncluded) {
    warnings.push("This backup does not include attachment files.");
  }

  return {
    sourceProject,
    destinationOrganizationId: organizationId,
    conflicts: { slugInUse, projectCodeInUse },
    profileReferences: { resolvable, missing, outsideOrganization },
    summary,
    warnings,
    // Never false just for slug/project_code conflicts or unresolved
    // profiles (requirement 7) — only for the blocking cases returned
    // early above (invalid/missing organization, backup inconsistency, a
    // Supabase read failure).
    canRestore: true,
  };
}
