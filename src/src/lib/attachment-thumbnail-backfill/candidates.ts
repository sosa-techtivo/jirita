// Fetches rows with thumbnail_path IS NULL from ticket_attachments /
// project_note_attachments, one small batch at a time — see run-backfill.ts
// for why keyset (WHERE id > lastId ORDER BY id) rather than OFFSET
// pagination: OFFSET would skip rows in APPLY mode, since a processed row's
// thumbnail_path stops being NULL and drops out of the WHERE clause,
// shifting every later page's OFFSET out from under it. Keyset pagination
// has no such failure mode in either mode.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttachmentTable, CandidateRow } from "./types";

export const TICKET_ATTACHMENTS_BUCKET = "ticket-attachments";
export const NOTE_ATTACHMENTS_BUCKET = "project-note-attachments";

interface TicketAttachmentRow {
  id: string;
  ticket_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
}

interface NoteAttachmentRow {
  id: string;
  note_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
}

export async function fetchTicketAttachmentCandidates(
  admin: SupabaseClient,
  afterId: string | null,
  batchSize: number
): Promise<CandidateRow[]> {
  let query = admin
    .from("ticket_attachments")
    .select("id, ticket_id, storage_path, filename, mime_type")
    .is("thumbnail_path", null)
    // Never attempted for a Data Only Backup row — is_available=false means
    // no physical object exists at storage_path to download at all (same
    // guard the live app's own preview/download paths already apply).
    .eq("is_available", true)
    .order("id", { ascending: true })
    .limit(batchSize);
  if (afterId) query = query.gt("id", afterId);

  const { data, error } = await query.returns<TicketAttachmentRow[]>();
  if (error) throw new Error(`ticket_attachments candidate query failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    table: "ticket_attachments" as AttachmentTable,
    bucket: TICKET_ATTACHMENTS_BUCKET,
    id: row.id,
    entityId: row.ticket_id,
    storagePath: row.storage_path,
    filename: row.filename,
    mimeType: row.mime_type,
  }));
}

export async function fetchNoteAttachmentCandidates(
  admin: SupabaseClient,
  afterId: string | null,
  batchSize: number
): Promise<CandidateRow[]> {
  let query = admin
    .from("project_note_attachments")
    .select("id, note_id, storage_path, filename, mime_type")
    .is("thumbnail_path", null)
    .order("id", { ascending: true })
    .limit(batchSize);
  if (afterId) query = query.gt("id", afterId);

  const { data, error } = await query.returns<NoteAttachmentRow[]>();
  if (error) throw new Error(`project_note_attachments candidate query failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    table: "project_note_attachments" as AttachmentTable,
    bucket: NOTE_ATTACHMENTS_BUCKET,
    id: row.id,
    entityId: row.note_id,
    storagePath: row.storage_path,
    filename: row.filename,
    mimeType: row.mime_type,
  }));
}
