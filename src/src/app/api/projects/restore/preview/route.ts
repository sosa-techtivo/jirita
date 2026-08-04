// POST /api/projects/restore/preview
//
// Receives a backup .zip directly as multipart/form-data (field "file") and
// runs the read-only diagnostic pipeline: parseProjectBackupZip() ->
// previewProjectRestore() (see those two files — neither is modified here;
// buildProjectRestorePlan() and executeProjectRestore() are still never
// called). Nothing is written anywhere: no database row, no project.
//
// Also returns the parsed backup itself, minus attachmentFiles (the
// physical attachment bytes) — the second "configure & build plan" stage
// (see /api/projects/restore/plan/route.ts and restore-project-preview-
// modal.tsx) needs this JSON to hand back unmodified when asking the
// backend to build a ProjectRestorePlan, without ever re-uploading the
// .zip. Physical bytes are deliberately never included here: a Data Only
// backup has none, and a Full backup's bytes stay client-side (the
// already-selected File the browser still holds) for whenever a future
// execution stage needs them — this stage only ever needs the metadata.
//
// A direct-upload architecture (browser -> temporary Supabase Storage ->
// this endpoint receiving only a reference) was evaluated and built for
// large (Full, attachments-included) backups, but discarded: Supabase
// Storage's project-wide global upload size limit on the Free plan is a
// hard 50MB, confirmed live, and making Restore depend on a paid plan
// upgrade was explicitly rejected. Instead, oversized backups are avoided
// at the source — see build-project-backup-zip.ts's "Data Only" export
// mode, which omits attachment files entirely and produces a backup that
// comfortably fits under Vercel's own ~4.5MB Serverless Function request
// body limit for any realistically-sized project. This endpoint therefore
// goes back to the simpler direct-upload shape.
//
// Admin-only (requireAdminCaller — verifies an active Admin session and
// derives organizationId from the caller's own membership, never from
// client input).

import { NextResponse } from "next/server";
import { requireAdminCaller } from "@/lib/server/require-admin-caller";
import { parseProjectBackupZip, ProjectBackupParseError } from "@/lib/server/parse-project-backup-zip";
import { previewProjectRestore } from "@/lib/server/preview-project-restore";

export const runtime = "nodejs";

function errorResponse(status: number, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireAdminCaller(request);
  if (!authResult.ok) return authResult.response;
  const { organizationId } = authResult.caller;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "Invalid request body — expected multipart/form-data.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse(400, "Missing file.");
  }
  if (file.size === 0) {
    return errorResponse(400, "The uploaded file is empty.");
  }

  const zipBytes = new Uint8Array(await file.arrayBuffer());

  let parsed;
  try {
    parsed = parseProjectBackupZip(zipBytes);
  } catch (err) {
    if (err instanceof ProjectBackupParseError) {
      return errorResponse(400, err.message, { category: err.category, file: err.file ?? null });
    }
    return errorResponse(400, err instanceof Error ? err.message : "Could not read this backup.");
  }

  const preview = await previewProjectRestore(parsed, organizationId);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { attachmentFiles, ...backupWithoutFiles } = parsed;

  return NextResponse.json({
    preview,
    exportedAt: parsed.manifest.exportedAt,
    attachmentsIncluded: parsed.attachmentsIncluded,
    attachmentBytes: parsed.manifest.attachmentBytes ?? 0,
    // The full parsed backup, minus physical attachment bytes — see the
    // header comment above for why this stage returns it.
    backup: backupWithoutFiles,
  });
}
