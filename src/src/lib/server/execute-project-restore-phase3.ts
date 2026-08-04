// Third execution layer of the project-backup IMPORTER: uploads the
// physical attachment files to the private `ticket-attachments` Storage
// bucket, for a project whose metadata was already restored by
// executeProjectRestorePhase1()/executeProjectRestorePhase2() (see those
// files — neither is modified here). Uses rows already computed by
// buildProjectRestorePlan() — no id, path, or mapping is recomputed here.
//
// No Postgres writes of any kind: this phase never inserts, updates, or
// deletes a database row (only a read, to confirm Phase 2's own metadata
// really exists before uploading anything against it). Storage has no
// transactions, so correctness here comes from a different mechanism than
// Phase 1/2's single-RPC atomicity: files are uploaded one at a time, every
// successfully-uploaded destination path is tracked in memory as it
// happens, and if anything fails partway through, only the paths this
// same invocation uploaded are removed — never a preexisting object this
// invocation didn't create.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRestorePlan, PlannedTicketAttachmentRow } from "./build-project-restore-plan";

const ATTACHMENTS_BUCKET = "ticket-attachments";
const ID_CHUNK_SIZE = 200;

// Same service-role justification as every other backend-only stage in
// this pipeline: no caller session exists at this layer, and the private
// `ticket-attachments` bucket's own RLS-equivalent Storage policies don't
// grant a plain authenticated client the kind of cross-project write this
// phase needs.
function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ExecuteProjectRestorePhase3Result {
  projectId: string;
  uploaded: number;
  uploadedBytes: number;
  verified: number;
  paths: string[];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function attachmentLabel(attachment: PlannedTicketAttachmentRow): string {
  return `attachment id=${attachment.id} filename="${attachment.filename}" storage_path="${attachment.storage_path}"`;
}

// ── Requirement 7: Phase 2's own metadata must already exist and match ─────
// exactly — checked once, up front, for every attachment, before any
// upload starts. A missing or mismatched row means Phase 2 either never
// ran or ran against a different plan; uploading a file for it anyway
// would create Storage bytes with no trustworthy metadata pointing at
// them.
async function verifyAttachmentMetadataExists(client: SupabaseClient, attachments: PlannedTicketAttachmentRow[]): Promise<void> {
  interface MetadataRow {
    id: string;
    ticket_id: string;
    storage_path: string;
    filename: string;
    size_bytes: number;
  }
  const rowsById = new Map<string, MetadataRow>();

  for (const idChunk of chunk(attachments.map((a) => a.id), ID_CHUNK_SIZE)) {
    const { data, error } = await client
      .from("ticket_attachments")
      .select("id, ticket_id, storage_path, filename, size_bytes")
      .in("id", idChunk);
    if (error) {
      throw new Error(`[executeProjectRestorePhase3] Could not verify attachment metadata: ${error.message}`);
    }
    for (const row of (data ?? []) as MetadataRow[]) rowsById.set(row.id, row);
  }

  for (const attachment of attachments) {
    const label = attachmentLabel(attachment);
    const row = rowsById.get(attachment.id);
    if (!row) {
      throw new Error(`[executeProjectRestorePhase3] No ticket_attachments row found for ${label} — run executeProjectRestorePhase2() first.`);
    }
    if (row.ticket_id !== attachment.ticket_id) {
      throw new Error(`[executeProjectRestorePhase3] ticket_attachments.ticket_id mismatch for ${label}: expected "${attachment.ticket_id}", found "${row.ticket_id}".`);
    }
    if (row.storage_path !== attachment.storage_path) {
      throw new Error(`[executeProjectRestorePhase3] ticket_attachments.storage_path mismatch for ${label}: expected "${attachment.storage_path}", found "${row.storage_path}".`);
    }
    if (row.filename !== attachment.filename) {
      throw new Error(`[executeProjectRestorePhase3] ticket_attachments.filename mismatch for ${label}: expected "${attachment.filename}", found "${row.filename}".`);
    }
    if (Number(row.size_bytes) !== Number(attachment.size_bytes)) {
      throw new Error(`[executeProjectRestorePhase3] ticket_attachments.size_bytes mismatch for ${label}: expected ${attachment.size_bytes}, found ${row.size_bytes}.`);
    }
  }
}

// ── Requirement 5: never overwrite an existing object ───────────────────────
async function destinationExists(client: SupabaseClient, storagePath: string): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf("/");
  const folder = lastSlash === -1 ? "" : storagePath.slice(0, lastSlash);
  const filename = lastSlash === -1 ? storagePath : storagePath.slice(lastSlash + 1);
  const { data, error } = await client.storage.from(ATTACHMENTS_BUCKET).list(folder, { search: filename, limit: 100 });
  if (error) {
    throw new Error(`[executeProjectRestorePhase3] Could not check whether "${storagePath}" already exists: ${error.message}`);
  }
  return (data ?? []).some((entry) => entry.name === filename);
}

// Uploads one attachment's bytes and immediately verifies them (size +
// SHA-256, requirement 6) by reading the object back — never trusts the
// upload call's own success response alone.
async function uploadAndVerifyOne(client: SupabaseClient, attachment: PlannedTicketAttachmentRow): Promise<void> {
  const label = attachmentLabel(attachment);
  const sourceBytes = attachment.sourceBytes as Uint8Array; // presence already validated by the caller

  if (await destinationExists(client, attachment.storage_path)) {
    throw new Error(`[executeProjectRestorePhase3] Destination already exists — aborting rather than overwriting (${label}).`);
  }

  const { error: uploadError } = await client.storage.from(ATTACHMENTS_BUCKET).upload(attachment.storage_path, Buffer.from(sourceBytes), {
    contentType: attachment.mime_type ?? undefined,
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`[executeProjectRestorePhase3] Upload failed (${label}): ${uploadError.message}`);
  }

  const { data: downloaded, error: downloadError } = await client.storage.from(ATTACHMENTS_BUCKET).download(attachment.storage_path);
  if (downloadError || !downloaded) {
    throw new Error(`[executeProjectRestorePhase3] Post-upload verification download failed (${label}): ${downloadError?.message ?? "no data returned"}`);
  }
  const storedBytes = new Uint8Array(await downloaded.arrayBuffer());

  if (storedBytes.length !== sourceBytes.length) {
    throw new Error(
      `[executeProjectRestorePhase3] Size mismatch after upload (${label}): expected ${sourceBytes.length} byte(s), stored object has ${storedBytes.length}.`
    );
  }
  const sourceHash = sha256(sourceBytes);
  const storedHash = sha256(storedBytes);
  if (sourceHash !== storedHash) {
    throw new Error(`[executeProjectRestorePhase3] SHA-256 mismatch after upload (${label}): expected ${sourceHash}, stored object hashes to ${storedHash}.`);
  }
}

// Best-effort: removes only the paths this same invocation uploaded. A
// failure here is logged, never allowed to hide the original upload/
// verification error that triggered the cleanup in the first place.
async function cleanupUploaded(client: SupabaseClient, uploadedPaths: string[]): Promise<void> {
  if (uploadedPaths.length === 0) return;
  const { error } = await client.storage.from(ATTACHMENTS_BUCKET).remove(uploadedPaths);
  if (error) {
    console.error(`[executeProjectRestorePhase3] Cleanup failed to remove ${uploadedPaths.length} file(s) uploaded by this run: ${error.message}`);
  }
}

/**
 * Uploads every physical attachment file in the plan to the private
 * `ticket-attachments` bucket, at exactly the destination storage_path
 * already computed by buildProjectRestorePlan(). Writes no database row of
 * any kind (Phase 2 already restored ticket_attachments metadata) — only
 * verifies that metadata already exists and matches before uploading
 * against it. Sequential, one file at a time, so a failure partway through
 * always leaves a precisely-known set of this-run's-own uploads to clean
 * up — never a preexisting object, never a guess.
 */
export async function executeProjectRestorePhase3(plan: ProjectRestorePlan): Promise<ExecuteProjectRestorePhase3Result> {
  if (!plan || typeof plan !== "object") {
    throw new Error("[executeProjectRestorePhase3] plan must be the object returned by buildProjectRestorePlan().");
  }
  if (!plan.project || typeof plan.project.id !== "string") {
    throw new Error("[executeProjectRestorePhase3] plan.project.id must be a string.");
  }
  if (!Array.isArray(plan.attachments)) {
    throw new Error("[executeProjectRestorePhase3] plan.attachments must be an array.");
  }

  const attachments = plan.attachments;

  // A Data Only backup (plan.attachmentsIncluded === false) never had
  // physical files to begin with — attachments.json metadata still
  // produces plan.attachments rows (already restored by Phase 2), but
  // every sourceBytes is null by construction (see
  // build-project-restore-plan.ts). This is a normal, successful outcome,
  // not an error: nothing is uploaded, and the restoration is expected to
  // finish without any attachment file present.
  if (!plan.attachmentsIncluded) {
    return { projectId: plan.project.id, uploaded: 0, uploadedBytes: 0, verified: 0, paths: [] };
  }

  if (attachments.length === 0) {
    return { projectId: plan.project.id, uploaded: 0, uploadedBytes: 0, verified: 0, paths: [] };
  }

  // ── Requirement 3: pre-upload validations ────────────────────────────────
  // Reaching here means plan.attachmentsIncluded is true — every attachment
  // must genuinely have its bytes; a missing one now signals real plan
  // corruption, not a Data Only backup (already handled above).
  const missingBytes = attachments.filter((a) => a.sourceBytes === null);
  if (missingBytes.length > 0) {
    throw new Error(
      `[executeProjectRestorePhase3] ${missingBytes.length} attachment(s) have no sourceBytes: ${missingBytes.map(attachmentLabel).join("; ")}.`
    );
  }

  const withBytes = attachments.filter((a) => a.sourceBytes !== null);
  if (withBytes.length !== attachments.length) {
    throw new Error(
      `[executeProjectRestorePhase3] Physical file count (${withBytes.length}) does not match plan.attachments.length (${attachments.length}).`
    );
  }

  const seenPaths = new Set<string>();
  for (const attachment of attachments) {
    if (seenPaths.has(attachment.storage_path)) {
      throw new Error(`[executeProjectRestorePhase3] Duplicate destination storage_path in the plan: "${attachment.storage_path}" (${attachmentLabel(attachment)}).`);
    }
    seenPaths.add(attachment.storage_path);
  }

  const client = getAdminClient();

  // ── Requirement 7: Phase 2's own metadata must already exist and match ──
  await verifyAttachmentMetadataExists(client, attachments);

  // ── Upload, one at a time, tracking successes for recoverable cleanup ───
  const uploadedPaths: string[] = [];
  let uploadedBytes = 0;

  try {
    for (const attachment of attachments) {
      await uploadAndVerifyOne(client, attachment);
      uploadedPaths.push(attachment.storage_path);
      uploadedBytes += (attachment.sourceBytes as Uint8Array).length;
    }
  } catch (err) {
    await cleanupUploaded(client, uploadedPaths);
    throw err;
  }

  return {
    projectId: plan.project.id,
    uploaded: uploadedPaths.length,
    uploadedBytes,
    verified: uploadedPaths.length,
    paths: uploadedPaths,
  };
}
