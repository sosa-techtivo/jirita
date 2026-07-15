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
import type { ProjectNote } from "./mock-notes";

type SupabaseClient = ReturnType<typeof getSupabaseBrowserClient>;

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

function rowToNote(row: NoteRow, slug: string, author: AuthorProfileRow | undefined): ProjectNote {
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

  const notes = (rows ?? []).map((row) =>
    rowToNote(row, slug, row.created_by ? authorsById.get(row.created_by) : undefined)
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

export async function deleteNote(noteId: string): Promise<DeleteNoteResult> {
  const supabase = getSupabaseBrowserClient();

  const { error } = await supabase.from("project_notes").delete().eq("id", noteId);

  if (error) {
    logDev("note delete failed", error);
    return { status: "error", message: error.message };
  }

  return { status: "success" };
}
