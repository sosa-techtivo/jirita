// POST /api/projects/restore/execute
//
// The final stage of Restore Project: given the ORIGINAL backup .zip
// (multipart/form-data, field "file" — never a previously-parsed backup,
// never a previously-built plan) plus the Admin's chosen destination
// project name/slug/code and profile mappings, runs the entire pipeline
// from scratch and — unlike every earlier stage — actually writes:
//
//   parseProjectBackupZip() -> previewProjectRestore() -> [re-validate
//   slug/project_code/profileMappings] -> buildProjectRestorePlan() ->
//   executeProjectRestore()
//
// None of those five functions is modified here. Nothing about a
// previously-computed preview or plan is ever accepted from the client —
// this handler does not even define a shape for one; the only inputs are
// the raw .zip and the four destination values, exactly like a completely
// fresh restore attempt. This is deliberate: a plan built earlier in the
// UI's own "Configure Restore" step (see /api/projects/restore/plan/
// route.ts) always has attachmentFiles: {} (no physical bytes ever reach
// that endpoint) and can silently go stale (someone else could take the
// destination slug in the meantime) — reusing it here would either lose a
// Full Backup's real attachment bytes or execute against outdated
// validation. Re-deriving everything from the original .zip, right here,
// right before writing, avoids both.
//
// Admin-only (requireAdminCaller — verifies an active Admin session and
// derives organizationId from the caller's own membership, never from
// client input). Every non-null profileMappings value is verified to be a
// real, currently-active member of the destination organization before
// buildProjectRestorePlan() ever sees it, same as /api/projects/restore/
// plan/route.ts's own check (intentionally duplicated rather than shared —
// two call sites, not worth a shared abstraction for this).
//
// The .zip is read into memory once (request.formData() -> File ->
// arrayBuffer()) and processed entirely there — never written to Supabase
// Storage, disk, a database row, or any cache. The only Storage writes
// that happen at all are executeProjectRestore()'s own Phase 3 uploads of
// individual attachment files to the real `ticket-attachments` bucket —
// the intended destination of a restore, not a copy of the .zip itself.
//
// Same ~4.4MB size ceiling as the client's own pre-check in
// restore-project-preview-modal.tsx (Vercel's Serverless Function request
// body limit is a hard ~4.5MB) — re-enforced here server-side rather than
// trusted from the client, with the same guidance on failure: a Full
// Backup that doesn't fit isn't restorable from this UI at all yet: use a
// Data Only Backup, not "raise a limit somewhere." No temporary Storage
// bucket, no suggestion to change any Supabase setting — that architecture
// was evaluated and explicitly rejected earlier in this feature's history.

import { NextResponse } from "next/server";
import { requireAdminCaller } from "@/lib/server/require-admin-caller";
import { parseProjectBackupZip, ProjectBackupParseError } from "@/lib/server/parse-project-backup-zip";
import { previewProjectRestore } from "@/lib/server/preview-project-restore";
import { buildProjectRestorePlan, ProjectRestorePlanError } from "@/lib/server/build-project-restore-plan";
import { executeProjectRestore, ProjectRestoreExecutionError } from "@/lib/server/execute-project-restore";

export const runtime = "nodejs";

// Mirrors MAX_ZIP_BYTES in restore-project-preview-modal.tsx — must stay
// in sync with that constant (both exist because Vercel's own ~4.5MB
// Serverless Function request body limit is the real, external ceiling
// neither one can move).
const MAX_ZIP_BYTES = 4.4 * 1024 * 1024;

type RestoreExecuteStage = "upload" | "parse" | "preview" | "validation" | "plan" | "phase1" | "phase2" | "phase3" | "cleanup";

function errorResponse(status: number, stage: RestoreExecuteStage, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ stage, message, ...extra }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireAdminCaller(request);
  if (!authResult.ok) return authResult.response;
  const { organizationId, admin } = authResult.caller;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "upload", "Invalid request body — expected multipart/form-data.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse(400, "upload", "Missing file.");
  }
  if (file.size === 0) {
    return errorResponse(400, "upload", "The uploaded file is empty.");
  }
  if (file.size > MAX_ZIP_BYTES) {
    return errorResponse(
      413,
      "upload",
      `That file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB) to restore from this screen — the limit here is ${(MAX_ZIP_BYTES / (1024 * 1024)).toFixed(1)}MB. ` +
        `A large Full Backup can't be restored from this screen yet; export and restore a Data Only Backup instead (excludes attachment files, keeps everything else).`
    );
  }

  const projectName = formData.get("projectName");
  const projectSlug = formData.get("projectSlug");
  const projectCode = formData.get("projectCode");
  const profileMappingsRaw = formData.get("profileMappings");

  if (typeof projectName !== "string" || projectName.trim() === "") {
    return errorResponse(400, "upload", "Project Name is required.");
  }
  if (typeof projectSlug !== "string" || projectSlug.trim() === "") {
    return errorResponse(400, "upload", "Slug is required.");
  }
  if (typeof projectCode !== "string" || projectCode.trim() === "") {
    return errorResponse(400, "upload", "Project Code is required.");
  }
  if (typeof profileMappingsRaw !== "string") {
    return errorResponse(400, "upload", "Missing profileMappings.");
  }
  let profileMappings: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(profileMappingsRaw);
    if (!isPlainObject(parsed)) throw new Error("not an object");
    profileMappings = parsed;
  } catch {
    return errorResponse(400, "upload", "profileMappings must be a JSON object.");
  }

  // ── parseProjectBackupZip() — fresh, from the original .zip's own bytes ──
  const zipBytes = new Uint8Array(await file.arrayBuffer());
  let parsedBackup;
  try {
    parsedBackup = parseProjectBackupZip(zipBytes);
  } catch (err) {
    if (err instanceof ProjectBackupParseError) {
      return errorResponse(400, "parse", err.message, { category: err.category, file: err.file ?? null });
    }
    return errorResponse(400, "parse", err instanceof Error ? err.message : "Could not read this backup.");
  }

  // ── previewProjectRestore() — fresh, against the current database state ──
  let freshPreview;
  try {
    freshPreview = await previewProjectRestore(parsedBackup, organizationId);
  } catch (err) {
    return errorResponse(400, "preview", err instanceof Error ? err.message : "Could not validate this backup.");
  }
  if (!freshPreview.canRestore) {
    return errorResponse(400, "preview", "This backup is inconsistent and cannot be restored.", { warnings: freshPreview.warnings });
  }

  // ── Destination slug/project_code availability — right before writing ──
  const [slugResult, codeResult] = await Promise.all([
    admin.from("projects").select("id").eq("organization_id", organizationId).eq("slug", projectSlug).limit(1),
    admin.from("projects").select("id").eq("organization_id", organizationId).eq("project_code", projectCode).limit(1),
  ]);
  if (slugResult.error || codeResult.error) {
    return errorResponse(500, "validation", "Could not verify slug/project code availability.");
  }
  if ((slugResult.data?.length ?? 0) > 0) {
    return errorResponse(409, "validation", `Slug "${projectSlug}" is already in use in the destination organization.`, { field: "projectSlug" });
  }
  if ((codeResult.data?.length ?? 0) > 0) {
    return errorResponse(409, "validation", `Project code "${projectCode}" is already in use in the destination organization.`, { field: "projectCode" });
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
      return errorResponse(500, "validation", "Could not verify profile mappings.");
    }
    activeMemberIds = new Set((memberships ?? []).map((m) => m.profile_id as string));
  }
  const invalidMappings = Object.entries(profileMappings).filter(([, v]) => typeof v === "string" && !activeMemberIds.has(v));
  if (invalidMappings.length > 0) {
    return errorResponse(
      400,
      "validation",
      `${invalidMappings.length} profile mapping(s) point at a profile that is not an active member of the destination organization.`,
      { invalid: invalidMappings.map(([source, dest]) => ({ source, dest })) }
    );
  }

  const cleanMappings: Record<string, string | null> = {};
  for (const [sourceId, destId] of Object.entries(profileMappings)) {
    cleanMappings[sourceId] = typeof destId === "string" ? destId : null;
  }

  // ── buildProjectRestorePlan() — this time with REAL attachmentFiles from
  // the original .zip (parsedBackup came straight from it above), so a
  // Full Backup's attachments carry real sourceBytes for Phase 3 ──
  let plan;
  try {
    plan = buildProjectRestorePlan(parsedBackup, freshPreview, {
      destinationOrganizationId: organizationId,
      projectName,
      projectSlug,
      projectCode,
      profileMappings: cleanMappings,
    });
  } catch (err) {
    if (err instanceof ProjectRestorePlanError) {
      return errorResponse(400, "plan", "This configuration cannot be turned into a restore plan.", { issues: err.issues });
    }
    return errorResponse(400, "plan", err instanceof Error ? err.message : "Could not build the restore plan.");
  }

  // ── executeProjectRestore() — the only step in this entire feature that
  // actually writes anything. Its own orchestrator already guarantees
  // cleanup on failure (see execute-project-restore.ts, untouched here) ──
  try {
    const result = await executeProjectRestore(plan);
    return NextResponse.json({
      status: "success",
      project: {
        id: result.projectId,
        name: projectName,
        slug: projectSlug,
        projectCode: projectCode,
      },
      restored: result.restored,
    });
  } catch (err) {
    if (err instanceof ProjectRestoreExecutionError) {
      return errorResponse(500, err.stage, err.message, { cleanupSucceeded: err.cleanupSucceeded });
    }
    return errorResponse(500, "phase1", err instanceof Error ? err.message : "Could not restore this project.");
  }
}
