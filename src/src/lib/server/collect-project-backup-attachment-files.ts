// New pipeline stage, inserted between exportProject() and
// serializeExportedProject(): downloads each attachment's physical file
// from the private `ticket-attachments` Storage bucket, entirely in
// memory. exportProject() itself is deliberately left untouched — its own
// header still promises "no Storage access" — so this lives in its own
// module rather than being folded into that one.
//
// All-or-nothing: if any attachment's file is missing or fails to
// download, the whole call rejects and nothing partial is ever produced —
// matching this feature's "no generar un backup incompleto" requirement.
// No writes anywhere: every Storage call below is a `.download()`.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExportedProjectData, ExportedTicketAttachmentRow } from "./export-project";

const ATTACHMENTS_BUCKET = "ticket-attachments";

// A project with hundreds of attachments (KTVibe: 250) shouldn't fire that
// many simultaneous Storage requests at once — downloads run in bounded
// batches instead.
const DOWNLOAD_CONCURRENCY = 20;

// Same service-role justification as export-project.ts's own
// getAdminClient(): this stage has no caller session to build an
// RLS-scoped client from (it's invoked from the Route Handler as a plain
// backend step, same as exportProject(projectId) itself), and reading a
// private bucket's objects for a backup is exactly the kind of
// administrative read RLS on `ticket-attachments` doesn't grant to a
// plain authenticated client in the first place.
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface CollectedAttachmentFile {
  attachmentId: string;
  /** Exactly attachment.storage_path, unmodified — never recomputed here. */
  storagePath: string;
  bytes: Uint8Array;
}

async function downloadOne(client: SupabaseClient, attachment: ExportedTicketAttachmentRow): Promise<CollectedAttachmentFile> {
  const { data, error } = await client.storage.from(ATTACHMENTS_BUCKET).download(attachment.storage_path);
  if (error || !data) {
    throw new Error(
      `[collectProjectBackupAttachmentFiles] Could not download physical file for attachment id=${attachment.id} filename="${attachment.filename}" storage_path="${attachment.storage_path}": ${
        error ? error.message : "no data returned"
      }`
    );
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { attachmentId: attachment.id, storagePath: attachment.storage_path, bytes };
}

export async function collectProjectBackupAttachmentFiles(exportedProject: ExportedProjectData): Promise<CollectedAttachmentFile[]> {
  const { attachments } = exportedProject;
  if (attachments.length === 0) return [];

  const client = getAdminClient();
  const results: CollectedAttachmentFile[] = new Array(attachments.length);

  for (let start = 0; start < attachments.length; start += DOWNLOAD_CONCURRENCY) {
    const batch = attachments.slice(start, start + DOWNLOAD_CONCURRENCY);
    // Promise.all rejects on the first failure in the batch — any single
    // missing/failed file aborts the whole collection, never a partial
    // result silently returned.
    const batchResults = await Promise.all(batch.map((attachment) => downloadOne(client, attachment)));
    batchResults.forEach((result, i) => {
      results[start + i] = result;
    });
  }

  return results;
}
