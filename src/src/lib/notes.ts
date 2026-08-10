// Loads and writes real Project Notes — the replacement data source for
// src/lib/mock-notes.ts's hardcoded array on the /projects/[slug]/notes
// screen (notes-screen.tsx, note-detail-modal.tsx). See
// supabase/migrations/20260811000000_add_project_notes.sql for the
// project_notes / project_note_activity tables this reads/writes.
//
// RLS on project_notes (project_notes_select) already scopes rows to
// whoever can see the parent project via can_view_project(project_id), so
// no client-side role filtering is needed here.
//
// Tag is intentionally NOT persisted — same "still mock, unwired" precedent
// as New Ticket's "More Options" fields (see CLAUDE.md's "Still mock"
// section): the Tag picker in NewNoteModal/NoteDetailModal keeps working as
// local-only UI state, but no column exists for it and it's never sent to
// or read from Supabase. Activity logging (create/update/delete) is handled
// entirely by database triggers — see the migration above — so none of the
// functions below write to project_note_activity directly.

import { getSupabaseBrowserClient } from "./supabase-client";
import { resolveAvatarUrl } from "./membership";
import { FALLBACK_AVATAR } from "./current-user";
import { generateAttachmentThumbnail } from "./attachment-thumbnail";
import type { ProjectNote, ProjectNoteAttachment } from "./mock-notes";

type SupabaseClient = ReturnType<typeof getSupabaseBrowserClient>;

// Private Storage bucket for Project Note attachments — same "private,
// signed-URL reads" shape as ticket_attachments' own "ticket-attachments"
// bucket (lib/tickets.ts), just a separate bucket so nothing here ever
// touches that table/bucket's own RLS or grants. See
// 20260917000000_add_project_note_attachments.sql.
const NOTE_ATTACHMENTS_BUCKET = "project-note-attachments";

// Same reasoning as ATTACHMENT_UPLOAD_CACHE_CONTROL (lib/tickets.ts): every
// object here is written once to a uuid-derived path and never overwritten,
// so a long Cache-Control is safe. Cached Egress Phase 3.
const NOTE_ATTACHMENT_UPLOAD_CACHE_CONTROL = "31536000";

export type NotesResult =
  | { status: "ready"; notes: ProjectNote[] }
  | { status: "error"; message: string };

export type NoteResult =
  | { status: "success"; note: ProjectNote }
  | { status: "error"; message: string };

export type DeleteNoteResult =
  | { status: "success" }
  | { status: "error"; message: string };

interface NoteRow {
  id: string;
  title: string;
  content: string;
  created_by: string | null;
  updated_at: string;
}

interface AuthorProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  updated_at: string;
}

const NOTE_COLUMNS = "id, title, content, created_by, updated_at";

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[notes]", ...args);
}

// Same relative-time buckets as lib/projects.ts's own formatUpdatedAt — kept
// as its own local copy rather than a shared import, matching how every
// other data module in this app (tickets.ts, projects.ts) formats this
// independently instead of sharing one helper.
function formatUpdatedAt(isoTimestamp: string): string {
  const diffHours = (Date.now() - new Date(isoTimestamp).getTime()) / (1000 * 60 * 60);
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
}

async function loadAuthorsByIds(supabase: SupabaseClient, ids: string[]): Promise<Map<string, AuthorProfileRow>> {
  const byId = new Map<string, AuthorProfileRow>();
  if (ids.length === 0) return byId;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, updated_at")
    .in("id", ids)
    .returns<AuthorProfileRow[]>();
  if (error) {
    logDev("author profiles lookup failed", error);
    return byId;
  }
  for (const row of data ?? []) byId.set(row.id, row);
  return byId;
}

function rowToNote(
  row: NoteRow,
  slug: string,
  author: AuthorProfileRow | undefined,
  attachments: ProjectNoteAttachment[] = []
): ProjectNote {
  const name = author ? [author.first_name, author.last_name].filter(Boolean).join(" ") || "Unnamed" : "Unknown";
  return {
    id: row.id,
    projectSlug: slug,
    title: row.title,
    body: row.content,
    updatedAt: formatUpdatedAt(row.updated_at),
    author: {
      name,
      avatar: (author ? resolveAvatarUrl(author.avatar_url, author.updated_at) : null) ?? FALLBACK_AVATAR,
    },
    attachments,
  };
}

interface NoteAttachmentRow {
  id: string;
  filename: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  thumbnail_path: string | null;
}

function rowToNoteAttachment(row: NoteAttachmentRow, uploaderRow: AuthorProfileRow | undefined): ProjectNoteAttachment {
  const name = uploaderRow
    ? [uploaderRow.first_name, uploaderRow.last_name].filter(Boolean).join(" ") || "Unnamed"
    : "Unknown";
  return {
    id: row.id,
    filename: row.filename,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    uploadedByName: name,
    uploadedByAvatar:
      (uploaderRow ? resolveAvatarUrl(uploaderRow.avatar_url, uploaderRow.updated_at) : null) ?? FALLBACK_AVATAR,
    uploadedByProfileId: row.uploaded_by,
    uploadedAt: formatUpdatedAt(row.created_at),
    thumbnailPath: row.thumbnail_path,
  };
}

async function resolveProjectId(
  supabase: SupabaseClient,
  organizationId: string,
  slug: string
): Promise<{ id: string } | { error: string } | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (error) return { error: error.message };
  if (!data) return null;
  return data;
}

export async function loadProjectNotes(organizationId: string, slug: string): Promise<NotesResult> {
  const supabase = getSupabaseBrowserClient();

  const project = await resolveProjectId(supabase, organizationId, slug);
  if (project && "error" in project) {
    logDev("project lookup for notes failed", project.error);
    return { status: "error", message: project.error };
  }
  if (!project) return { status: "ready", notes: [] };

  const { data: rows, error } = await supabase
    .from("project_notes")
    .select(NOTE_COLUMNS)
    .eq("project_id", project.id)
    .order("updated_at", { ascending: false })
    .returns<NoteRow[]>();

  if (error) {
    logDev("notes query failed", error);
    return { status: "error", message: error.message };
  }

  const authorIds = Array.from(
    new Set((rows ?? []).map((row) => row.created_by).filter((id): id is string => Boolean(id)))
  );
  const authorsById = await loadAuthorsByIds(supabase, authorIds);

  // Every attachment for every note in this project, fetched once (same
  // "one extra query no matter how many rows" shape ticket_attachments'
  // own batching uses) and grouped in memory — never a per-note query.
  const noteIds = (rows ?? []).map((row) => row.id);
  const attachmentsByNoteId = new Map<string, ProjectNoteAttachment[]>();
  if (noteIds.length > 0) {
    const { data: attachmentRows, error: attachmentsError } = await supabase
      .from("project_note_attachments")
      .select("id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at, thumbnail_path, note_id")
      .in("note_id", noteIds)
      .order("created_at", { ascending: true })
      .returns<(NoteAttachmentRow & { note_id: string })[]>();

    if (attachmentsError) {
      logDev("note attachments query failed", attachmentsError);
    } else {
      const uploaderIds = Array.from(
        new Set((attachmentRows ?? []).map((row) => row.uploaded_by).filter((id): id is string => Boolean(id)))
      );
      const uploadersById = await loadAuthorsByIds(supabase, uploaderIds);
      for (const row of attachmentRows ?? []) {
        const list = attachmentsByNoteId.get(row.note_id) ?? [];
        list.push(rowToNoteAttachment(row, row.uploaded_by ? uploadersById.get(row.uploaded_by) : undefined));
        attachmentsByNoteId.set(row.note_id, list);
      }
    }
  }

  const notes = (rows ?? []).map((row) =>
    rowToNote(row, slug, row.created_by ? authorsById.get(row.created_by) : undefined, attachmentsByNoteId.get(row.id))
  );

  return { status: "ready", notes };
}

export interface CreateNoteInput {
  title: string;
  body: string;
}

export async function createNote(organizationId: string, slug: string, input: CreateNoteInput): Promise<NoteResult> {
  const supabase = getSupabaseBrowserClient();

  const project = await resolveProjectId(supabase, organizationId, slug);
  if (project && "error" in project) return { status: "error", message: project.error };
  if (!project) return { status: "error", message: "Project not found." };

  const { data: row, error } = await supabase
    .from("project_notes")
    .insert({ project_id: project.id, title: input.title, content: input.body })
    .select(NOTE_COLUMNS)
    .single<NoteRow>();

  if (error) {
    logDev("note insert failed", error);
    return { status: "error", message: error.message };
  }

  const author = row.created_by ? (await loadAuthorsByIds(supabase, [row.created_by])).get(row.created_by) : undefined;

  return { status: "success", note: rowToNote(row, slug, author) };
}

export interface UpdateNoteInput {
  title: string;
  body: string;
}

export async function updateNote(noteId: string, slug: string, input: UpdateNoteInput): Promise<NoteResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: row, error } = await supabase
    .from("project_notes")
    .update({ title: input.title, content: input.body })
    .eq("id", noteId)
    .select(NOTE_COLUMNS)
    .single<NoteRow>();

  if (error) {
    logDev("note update failed", error);
    return { status: "error", message: error.message };
  }

  const author = row.created_by ? (await loadAuthorsByIds(supabase, [row.created_by])).get(row.created_by) : undefined;

  return { status: "success", note: rowToNote(row, slug, author) };
}

// First free "(Copy)" / "(Copy 2)" / "(Copy 3)"... suffix for a given base
// title, checked against every title that currently exists in the project
// (not just what's loaded client-side) so two people duplicating the same
// note around the same time still land on distinct titles.
function nextCopyTitle(baseTitle: string, existingTitles: Set<string>): string {
  const firstCopy = `${baseTitle} (Copy)`;
  if (!existingTitles.has(firstCopy)) return firstCopy;
  let n = 2;
  while (existingTitles.has(`${baseTitle} (Copy ${n})`)) n++;
  return `${baseTitle} (Copy ${n})`;
}

// Duplicates one note into a new row in the same project — title/content
// copied from the note already loaded client-side (no need to re-fetch the
// original), everything else (id, created_by, created_at, updated_at) is a
// fresh value from the same insert defaults/triggers createNote already
// relies on. updated_by is set explicitly to the real authenticated user
// (via auth.getUser(), never a caller-supplied value) since — unlike a
// normal create — the duplicate should read as "authored and touched by me
// just now," not wait for a future edit to get its first updated_by. The
// existing project_notes_log_created trigger logs this exactly like any
// other creation; the original note's own history/activity is never copied.
export async function duplicateNote(organizationId: string, slug: string, note: ProjectNote): Promise<NoteResult> {
  const supabase = getSupabaseBrowserClient();

  const project = await resolveProjectId(supabase, organizationId, slug);
  if (project && "error" in project) return { status: "error", message: project.error };
  if (!project) return { status: "error", message: "Project not found." };

  const { data: titleRows, error: titleError } = await supabase
    .from("project_notes")
    .select("title")
    .eq("project_id", project.id)
    .returns<{ title: string }[]>();

  if (titleError) {
    logDev("note titles lookup for duplicate failed", titleError);
    return { status: "error", message: titleError.message };
  }

  const existingTitles = new Set((titleRows ?? []).map((row) => row.title));
  const duplicateTitle = nextCopyTitle(note.title, existingTitles);

  const { data: authData } = await supabase.auth.getUser();
  const actorId = authData.user?.id ?? null;

  const { data: row, error } = await supabase
    .from("project_notes")
    .insert({ project_id: project.id, title: duplicateTitle, content: note.body, updated_by: actorId })
    .select(NOTE_COLUMNS)
    .single<NoteRow>();

  if (error) {
    logDev("note duplicate insert failed", error);
    return { status: "error", message: error.message };
  }

  const author = row.created_by ? (await loadAuthorsByIds(supabase, [row.created_by])).get(row.created_by) : undefined;

  return { status: "success", note: rowToNote(row, slug, author) };
}

// Deleting the note itself already cascade-deletes its own
// project_note_attachments rows for free (note_id ON DELETE CASCADE,
// 20260917000000) — but that cascade never touches the underlying Storage
// objects (Postgres FKs don't reach into Storage). This reads each
// attachment's storage_path *before* the delete (their row wouldn't exist
// to query afterward), then best-effort removes them from the bucket once
// the note itself is confirmed gone — same "the row is the source of
// truth, Storage cleanup is best-effort" precedent as
// deleteTicketAttachment (lib/tickets.ts).
export async function deleteNote(noteId: string): Promise<DeleteNoteResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: attachmentRows } = await supabase
    .from("project_note_attachments")
    .select("storage_path, thumbnail_path")
    .eq("note_id", noteId)
    .returns<{ storage_path: string; thumbnail_path: string | null }[]>();

  const { error } = await supabase.from("project_notes").delete().eq("id", noteId);

  if (error) {
    logDev("note delete failed", error);
    return { status: "error", message: error.message };
  }

  const storagePaths = (attachmentRows ?? []).flatMap((row) =>
    row.thumbnail_path ? [row.storage_path, row.thumbnail_path] : [row.storage_path]
  );
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).remove(storagePaths);
    if (storageError) {
      // The note (and its attachment rows, via cascade) are already gone —
      // log for visibility but don't surface this as a failure of the
      // delete action.
      logDev("note attachment storage cleanup failed", storageError);
    }
  }

  return { status: "success" };
}

export type UploadNoteAttachmentResult =
  | { status: "success"; attachment: ProjectNoteAttachment }
  | { status: "error"; message: string };

// Storage path is "<note_id>/<uuid>-<sanitized filename>" — the leading
// note_id segment is exactly what the Storage RLS policies check via
// storage.foldername(name), same convention as uploadTicketAttachment
// (lib/tickets.ts). uploaded_by is never sent — the column defaults to
// auth.uid() at the database level.
export async function uploadProjectNoteAttachment(noteId: string, file: File): Promise<UploadNoteAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniquePrefix = crypto.randomUUID();
  const storagePath = `${noteId}/${uniquePrefix}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(NOTE_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, { cacheControl: NOTE_ATTACHMENT_UPLOAD_CACHE_CONTROL });

  if (uploadError) {
    logDev("note attachment storage upload failed", uploadError);
    return { status: "error", message: uploadError.message };
  }

  // Same best-effort thumbnail step as uploadTicketAttachment (lib/tickets.ts)
  // — generation/upload failure never fails the already-succeeded original
  // upload, it just leaves thumbnail_path null. Not yet consumed by the
  // Notes UI (note-attachments.tsx still resolves storagePath directly, out
  // of this task's scope) — stored now so a future pass can wire it up
  // without a second upload-time backfill.
  let thumbnailPath: string | null = null;
  try {
    const thumbnail = await generateAttachmentThumbnail(file);
    if (thumbnail) {
      const candidatePath = `${noteId}/thumbnails/${uniquePrefix}-${safeName}.${thumbnail.ext}`;
      const { error: thumbnailUploadError } = await supabase.storage
        .from(NOTE_ATTACHMENTS_BUCKET)
        .upload(candidatePath, thumbnail.blob, {
          contentType: thumbnail.blob.type,
          cacheControl: NOTE_ATTACHMENT_UPLOAD_CACHE_CONTROL,
        });
      if (thumbnailUploadError) {
        logDev("note attachment thumbnail upload failed", thumbnailUploadError);
      } else {
        thumbnailPath = candidatePath;
      }
    }
  } catch (err) {
    logDev("note attachment thumbnail generation failed", err);
  }

  const { data: row, error: insertError } = await supabase
    .from("project_note_attachments")
    .insert({
      note_id: noteId,
      storage_path: storagePath,
      filename: file.name,
      size_bytes: file.size,
      mime_type: file.type || null,
      thumbnail_path: thumbnailPath,
    })
    .select("id, filename, storage_path, size_bytes, mime_type, uploaded_by, created_at, thumbnail_path")
    .single<NoteAttachmentRow>();

  if (insertError) {
    logDev("note attachment record insert failed", insertError);
    // Best-effort cleanup — don't leave an orphaned Storage object with no
    // corresponding row if the insert failed after the upload succeeded.
    const orphanedPaths = thumbnailPath ? [storagePath, thumbnailPath] : [storagePath];
    await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).remove(orphanedPaths);
    return { status: "error", message: insertError.message };
  }

  const uploaderRow = row.uploaded_by
    ? (await loadAuthorsByIds(supabase, [row.uploaded_by])).get(row.uploaded_by)
    : undefined;

  return { status: "success", attachment: rowToNoteAttachment(row, uploaderRow) };
}

export type DownloadNoteAttachmentResult = { status: "success" } | { status: "error"; message: string };

// The bucket is private, so a plain public URL doesn't work — this fetches
// the object through the authenticated client (same
// project_note_attachments_storage_select RLS policy) and saves it via a
// temporary object URL, so the browser downloads it with its original
// filename regardless of the randomized storage path. Same approach as
// downloadTicketAttachment (lib/tickets.ts).
export async function downloadProjectNoteAttachment(
  storagePath: string,
  filename: string
): Promise<DownloadNoteAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  const { data: blob, error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).download(storagePath);

  if (error || !blob) {
    logDev("note attachment download failed", error);
    return { status: "error", message: error?.message ?? "Download failed" };
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { status: "success" };
}

export type NoteAttachmentPreviewUrlResult = { status: "success"; url: string } | { status: "error"; message: string };

// The bucket is private, so previewing (embedding in an <img>/<iframe>)
// needs a signed URL rather than getPublicUrl — same 3600s convention as
// getTicketAttachmentPreviewUrl (lib/tickets.ts; Cached Egress Phase 3, up
// from an earlier 300s). No in-memory cache layer here (unlike tickets.ts's
// resolveTicketAttachmentPreviewUrl) — out of this phase's scope to add one.
export async function getProjectNoteAttachmentPreviewUrl(storagePath: string): Promise<NoteAttachmentPreviewUrlResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).createSignedUrl(storagePath, 3600);

  if (error || !data) {
    logDev("note attachment preview signed url failed", error);
    return { status: "error", message: error?.message ?? "Preview failed" };
  }

  return { status: "success", url: data.signedUrl };
}

export type DeleteNoteAttachmentResult = { status: "success" } | { status: "error"; message: string };

// Deletes the metadata row first — that row is what the attachments list
// actually depends on. The Storage object is then removed best-effort,
// same "row is source of truth, Storage cleanup best-effort" precedent as
// deleteTicketAttachment (lib/tickets.ts). .select() after .delete() is
// required to tell "deleted" apart from "RLS silently matched zero rows."
export async function deleteProjectNoteAttachment(
  attachmentId: string,
  storagePath: string,
  thumbnailPath: string | null
): Promise<DeleteNoteAttachmentResult> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase.from("project_note_attachments").delete().eq("id", attachmentId).select("id");

  if (error) {
    logDev("note attachment delete failed", error);
    return { status: "error", message: error.message };
  }
  if (!data || data.length === 0) {
    return { status: "error", message: "You don't have permission to delete this attachment." };
  }

  const pathsToRemove = thumbnailPath ? [storagePath, thumbnailPath] : [storagePath];
  const { error: storageError } = await supabase.storage.from(NOTE_ATTACHMENTS_BUCKET).remove(pathsToRemove);
  if (storageError) {
    logDev("note attachment storage cleanup failed", storageError);
  }

  return { status: "success" };
}
