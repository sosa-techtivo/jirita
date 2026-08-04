// POST /api/projects/restore/plan
//
// Stage 2 of Restore Project: given a backup already validated by
// /api/projects/restore/preview (its JSON `backup` field, echoed back
// unmodified by the client — never the .zip itself, never physical
// attachment bytes) plus the Admin's chosen destination project
// name/slug/code and profile mappings, this is VALIDATION AND PREVIEW
// ONLY. No executeProjectRestore() call, no project row, no ticket row,
// no Storage write, nothing functional written anywhere. Admin-only
// (requireAdminCaller).
//
// Nothing about canRestore, conflicts, or profileReferences is ever
// trusted from the client — this handler re-derives all three itself:
//   - previewProjectRestore() is re-run fresh against the *current*
//     database state (time may have passed since the client's own
//     preview call; someone else could have taken the destination slug
//     in the meantime).
//   - slug/project_code availability is re-checked against the Admin's
//     *chosen* destination values (which may differ from the backup's
//     original ones — that's the whole point of this stage), not the
//     values previewProjectRestore() itself checks (always the backup's
//     own original slug/code, informational only).
//   - every non-null profileMappings value is verified to be a real,
//     currently-active member of the destination organization before
//     buildProjectRestorePlan() ever sees it — buildProjectRestorePlan()
//     itself does not (and should not) re-verify that a mapped-to id is a
//     real destination profile; that check belongs here, at the
//     API boundary, so a manipulated request can never point a restored
//     row at a profile outside the destination organization.
//
// buildProjectRestorePlan() is still called internally — it's the only
// real, single place that already knows how to enforce "every required
// profile reference has a mapping" (via ProjectRestorePlanError) and how
// a full configuration hangs together — but the resulting
// ProjectRestorePlan is used ONLY to derive a small, safe summary below
// and is then discarded (never assigned outside this request's own local
// scope, never returned, never cached, never written anywhere). Two
// reasons this must never reach the client as-is:
//   1. It carries every row this restore would insert (tickets, comments,
//      activity, time entries, full attachment metadata) and every
//      source->destination id map — far more than the UI needs to show a
//      summary, and not data that belongs in a browser response.
//   2. Because this endpoint never receives physical attachment bytes
//      (see /api/projects/restore/preview/route.ts's own header comment —
//      attachmentFiles is deliberately stripped there, and forced empty
//      again below), this plan's attachments always have sourceBytes:
//      null — including for a Full Backup, where real bytes DO exist,
//      just not here. A plan in this state is unsafe to execute (Phase 3
//      would have nothing to upload) and must never be mistaken for one
//      that is.
//
// This is why there is deliberately no mechanism to "keep" or "resume"
// this plan later: the future confirm-and-restore step (not built yet)
// must have the browser re-submit the ORIGINAL .zip file (still held
// client-side — see restore-project-preview-modal.tsx's own `selectedFile`
// state) plus projectName/projectSlug/projectCode/profileMappings, and the
// backend for that step must re-run the entire pipeline from scratch —
// parseProjectBackupZip() -> previewProjectRestore() ->
// buildProjectRestorePlan() -> executeProjectRestore() — against that
// fresh upload. That's the only way to (a) recover real attachmentFiles/
// sourceBytes for a Full Backup, (b) never execute a plan the client could
// have tampered with, and (c) re-validate slug/project code/profile
// mappings/permissions at the actual moment of writing, not against
// however stale this request's own state might be by then.

import { NextResponse } from "next/server";
import { requireAdminCaller } from "@/lib/server/require-admin-caller";
import { previewProjectRestore } from "@/lib/server/preview-project-restore";
import { buildProjectRestorePlan, ProjectRestorePlanError } from "@/lib/server/build-project-restore-plan";
import type { ParsedProjectBackup } from "@/lib/server/parse-project-backup-zip";
import type { ExportedProjectSummary } from "@/lib/server/export-project";

export const runtime = "nodejs";

function errorResponse(status: number, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The only shape this endpoint ever returns on success — deliberately far
// narrower than ProjectRestorePlan. Every field here is either a scalar,
// a count, or the existing warnings array previewProjectRestore() already
// produces; never a row array, an id map, or attachment bytes.
interface ProjectRestorePlanSummary {
  project: {
    /** The id buildProjectRestorePlan() generated for this validation-only
     *  run — informational only. The future execution stage builds its
     *  own plan from scratch and will generate a different id. */
    id: string;
    name: string;
    slug: string;
    projectCode: string;
  };
  summary: ExportedProjectSummary;
  attachmentsIncluded: boolean;
  attachmentBytes: number;
  mappedProfiles: number;
  omittedProfiles: number;
  warnings: string[];
  readyToRestore: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireAdminCaller(request);
  if (!authResult.ok) return authResult.response;
  const { organizationId, admin } = authResult.caller;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Invalid request body.");
  }
  if (!isPlainObject(body)) {
    return errorResponse(400, "Invalid request body.");
  }

  const { backup, projectName, projectSlug, projectCode, profileMappings } = body;

  if (!isPlainObject(backup)) {
    return errorResponse(400, "Missing backup — analyze a backup first via /api/projects/restore/preview.");
  }
  if (typeof projectName !== "string" || projectName.trim() === "") {
    return errorResponse(400, "Project Name is required.");
  }
  if (typeof projectSlug !== "string" || projectSlug.trim() === "") {
    return errorResponse(400, "Slug is required.");
  }
  if (typeof projectCode !== "string" || projectCode.trim() === "") {
    return errorResponse(400, "Project Code is required.");
  }
  if (!isPlainObject(profileMappings)) {
    return errorResponse(400, "Invalid profileMappings.");
  }

  // The client never sends physical attachment bytes to this endpoint (see
  // the preview route's own header comment) — attachmentFiles is always
  // forced to empty here, regardless of whatever the client's `backup`
  // object claims, so nothing resembling binary content can ever reach
  // buildProjectRestorePlan() through this path.
  const parsedBackup = { ...backup, attachmentFiles: {} } as unknown as ParsedProjectBackup;

  // ── Re-derive canRestore/conflicts/profileReferences fresh — never trust the client's own copy ──
  let freshPreview;
  try {
    freshPreview = await previewProjectRestore(parsedBackup, organizationId);
  } catch (err) {
    return errorResponse(400, err instanceof Error ? err.message : "Could not re-validate this backup.");
  }
  if (!freshPreview.canRestore) {
    return errorResponse(400, "This backup is inconsistent and cannot be restored.", { warnings: freshPreview.warnings });
  }

  // ── Destination slug/project_code availability — the Admin's *chosen* values, not the backup's own ──
  const [slugResult, codeResult] = await Promise.all([
    admin.from("projects").select("id").eq("organization_id", organizationId).eq("slug", projectSlug).limit(1),
    admin.from("projects").select("id").eq("organization_id", organizationId).eq("project_code", projectCode).limit(1),
  ]);
  if (slugResult.error || codeResult.error) {
    return errorResponse(500, "Could not verify slug/project code availability.");
  }
  if ((slugResult.data?.length ?? 0) > 0) {
    return errorResponse(409, `Slug "${projectSlug}" is already in use in the destination organization.`, { field: "projectSlug" });
  }
  if ((codeResult.data?.length ?? 0) > 0) {
    return errorResponse(409, `Project code "${projectCode}" is already in use in the destination organization.`, { field: "projectCode" });
  }

  // ── profileMappings: every non-null destination id must be a real, active member of this organization ──
  const mappedIds = Array.from(new Set(Object.values(profileMappings).filter((v): v is string => typeof v === "string")));
  let activeMemberIds = new Set<string>();
  if (mappedIds.length > 0) {
    const { data: memberships, error: membershipsError } = await admin
      .from("organization_memberships")
      .select("profile_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("profile_id", mappedIds);
    if (membershipsError) {
      return errorResponse(500, "Could not verify profile mappings.");
    }
    activeMemberIds = new Set((memberships ?? []).map((m) => m.profile_id as string));
  }
  const invalidMappings = Object.entries(profileMappings).filter(
    ([, v]) => typeof v === "string" && !activeMemberIds.has(v)
  );
  if (invalidMappings.length > 0) {
    return errorResponse(
      400,
      `${invalidMappings.length} profile mapping(s) point at a profile that is not an active member of the destination organization.`,
      { invalid: invalidMappings.map(([source, dest]) => ({ source, dest })) }
    );
  }

  const cleanMappings: Record<string, string | null> = {};
  for (const [sourceId, destId] of Object.entries(profileMappings)) {
    cleanMappings[sourceId] = typeof destId === "string" ? destId : null;
  }

  // ── Build the plan — buildProjectRestorePlan() itself enforces that every
  // required reference (members.profile_id) has a real mapping, via
  // ProjectRestorePlanError below. `plan` only ever exists in this local
  // scope, only to be reduced to `summary` immediately afterward — never
  // returned, never persisted, never referenced again once this function
  // returns. See the header comment for why. ──
  let readyToRestore: boolean;
  let planProject: { id: string; name: string; slug: string; project_code: string };
  let planAttachmentsIncluded: boolean;
  try {
    const plan = buildProjectRestorePlan(parsedBackup, freshPreview, {
      destinationOrganizationId: organizationId,
      projectName,
      projectSlug,
      projectCode,
      profileMappings: cleanMappings,
    });
    readyToRestore = true;
    planProject = plan.project;
    planAttachmentsIncluded = plan.attachmentsIncluded;
  } catch (err) {
    if (err instanceof ProjectRestorePlanError) {
      return errorResponse(400, "This configuration cannot be turned into a restore plan yet.", { issues: err.issues });
    }
    return errorResponse(400, err instanceof Error ? err.message : "Could not build the restore plan.");
  }

  const mappedProfiles = Object.values(cleanMappings).filter((v) => v !== null).length;
  const omittedProfiles = Object.values(cleanMappings).filter((v) => v === null).length;

  const summary: ProjectRestorePlanSummary = {
    project: {
      id: planProject.id,
      name: planProject.name,
      slug: planProject.slug,
      projectCode: planProject.project_code,
    },
    summary: freshPreview.summary,
    attachmentsIncluded: planAttachmentsIncluded,
    attachmentBytes: parsedBackup.manifest.attachmentBytes ?? 0,
    mappedProfiles,
    omittedProfiles,
    warnings: freshPreview.warnings,
    readyToRestore,
  };

  return NextResponse.json(summary);
}
