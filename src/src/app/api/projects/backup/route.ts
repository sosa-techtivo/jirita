// GET /api/projects/backup?projectId=<real project id>&type=full|data-only
//
// Runs the project-backup pipeline — exportProject() ->
// collectProjectBackupAttachmentFiles() (skipped entirely for "data-only",
// see below) -> serializeExportedProject() -> buildProjectBackupZip() —
// and streams the resulting ZIP back as a real HTTP download response.
// Replaces the earlier Server-Action-based transfer: a Server Action's
// return value goes through React's Flight serialization, which isn't a
// good fit for a raw binary download with real HTTP response headers
// (Content-Disposition, Cache-Control) — a Route Handler returning a plain
// Response is the standard mechanism for that in Next.js.
//
// type=full (default, backward-compatible with every existing caller):
// includes every attachment's physical file, exactly as before this
// query param existed. type=data-only: skips
// collectProjectBackupAttachmentFiles() outright (no point downloading
// files from Storage only to discard them in serializeExportedProject())
// — attachments.json still lists every attachment row, unchanged, just
// without the files/ entries. Chosen over always including attachments
// and filtering later so a Data Only export never pays the Storage
// download cost at all.
//
// No permission/auth checks yet (explicitly out of scope for this step,
// same as the Server Action it replaces), no restoration, no progress
// reporting. Query-param convention (?projectId=) matches the existing
// /api/integrations/github/connect Route Handler rather than a dynamic
// path segment.

import { NextResponse, type NextRequest } from "next/server";
import { exportProject } from "@/lib/server/export-project";
import { collectProjectBackupAttachmentFiles, type CollectedAttachmentFile } from "@/lib/server/collect-project-backup-attachment-files";
import { serializeExportedProject, type ProjectBackupType } from "@/lib/server/serialize-exported-project";
import { buildProjectBackupZip } from "@/lib/server/build-project-backup-zip";
import { buildProjectBackupFilename } from "@/lib/server/project-backup-filename";

export const runtime = "nodejs";

type BackupStage = "export" | "files" | "serialize" | "zip";

function stageErrorResponse(stage: BackupStage, err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ stage, message }, { status: 500 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ stage: "export", message: "Missing projectId." }, { status: 400 });
  }

  const rawType = request.nextUrl.searchParams.get("type");
  if (rawType !== null && rawType !== "full" && rawType !== "data-only") {
    return NextResponse.json({ stage: "export", message: `Invalid type "${rawType}" — expected "full" or "data-only".` }, { status: 400 });
  }
  const backupType: ProjectBackupType = rawType === "data-only" ? "data-only" : "full";

  let exported;
  try {
    exported = await exportProject(projectId);
  } catch (err) {
    return stageErrorResponse("export", err);
  }

  let attachmentFiles: CollectedAttachmentFile[];
  try {
    attachmentFiles = backupType === "full" ? await collectProjectBackupAttachmentFiles(exported) : [];
  } catch (err) {
    return stageErrorResponse("files", err);
  }

  let serialized;
  try {
    serialized = serializeExportedProject(exported, attachmentFiles, backupType);
  } catch (err) {
    return stageErrorResponse("serialize", err);
  }

  let zip: Buffer;
  try {
    zip = buildProjectBackupZip(serialized);
  } catch (err) {
    return stageErrorResponse("zip", err);
  }

  const filename = buildProjectBackupFilename(exported.project.name, exported.exportedAt);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
