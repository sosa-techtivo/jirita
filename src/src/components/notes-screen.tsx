"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ProjectNote, ProjectNoteAttachment } from "@/lib/mock-notes";
import {
  loadProjectNotes,
  createNote,
  updateNote,
  deleteNote,
  duplicateNote,
  uploadProjectNoteAttachment,
  deleteProjectNoteAttachment,
} from "@/lib/notes";
import Link from "next/link";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { NoteDetailModal } from "@/components/note-detail-modal";
import { ErrorToast } from "@/components/tickets/ticket-ui";
import { TAG_OPTIONS, TagBadge, INPUT, FIELD_LABEL } from "@/components/notes-shared";
import { Avatar } from "@/components/ui/avatar";
import { NoteAttachmentsField, newPendingNoteFileId, type PendingNoteFile } from "@/components/note-attachments";
import { RichTextEditor } from "@/components/rich-text/rich-text-editor";
import { sanitizeRichTextHtml, isRichTextEmpty, richTextToPlainText } from "@/components/rich-text/rich-text-utils";

// Real project name for the breadcrumb — previously read server-side from
// mock-projects.ts's getProjectBySlug (app/projects/[slug]/notes/page.tsx),
// which has no row for any real, Supabase-backed project, so it always
// fell through to that function's own hardcoded "Mobile Banking App"
// fallback regardless of the real project's actual name. Same
// useOrganizationProjects()-based pattern every other project sub-page's
// own Breadcrumb (Tickets/Settings/Reports/etc.) already uses; falls back
// to the slug itself (never a mock name) if the list hasn't loaded yet.
export function NotesBreadcrumb({ slug }: { slug: string }) {
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;
  return (
    <>
      <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
        Projects
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <Link
        href={`/projects/${slug}`}
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        {projectName}
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200">Notes</span>
    </>
  );
}

// Real replacement for src/lib/mock-notes.ts's hardcoded array — see
// src/lib/notes.ts's header comment for the full data story (project_notes
// in Supabase, RLS-scoped to the current org/project, Activity Log written
// entirely by database triggers). Tag stays local-only/unwired, same
// precedent as New Ticket's "More Options" fields — see notes.ts.

export function NotesScreen({ slug }: { slug: string }) {
  const { organization, isDevFallback } = useCurrentUser();
  // Same real source (and the same "fall back to the slug itself, never a
  // mock name" rule) as NotesBreadcrumb above — used only for the New Note
  // modal's own small project-name subtitle.
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;

  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  const [search, setSearch] = useState("");
  const [showNewNote, setShowNewNote] = useState(false);
  const [activeNote, setActiveNote] = useState<ProjectNote | null>(null);
  const [activeNoteEditMode, setActiveNoteEditMode] = useState(false);
  const searchId = useId();

  const runFetch = useCallback(() => setRequestId((id) => id + 1), []);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;

    loadProjectNotes(organization.id, slug).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(result.message);
        return;
      }
      setNotes(result.notes);
      setLoadState("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, slug, requestId]);

  const query = search.trim().toLowerCase();
  const filtered = notes.filter((note) => {
    if (query === "") return true;
    return note.title.toLowerCase().includes(query) || note.body.toLowerCase().includes(query);
  });

  // Attachments only ever start uploading after the note itself exists —
  // never before "Create Note" is pressed, and never at all if the note
  // insert fails. Same "attach only after the real entity exists" pattern
  // ticket-detail-screen.tsx's own submitComment already uses.
  async function handleCreateNote(input: { title: string; body: string; tag?: string; files: File[] }): Promise<boolean> {
    if (!organization) return false;
    const result = await createNote(organization.id, slug, { title: input.title, body: input.body });
    if (result.status === "error") {
      setErrorMessage(result.message);
      return false;
    }
    let note = result.note;

    if (input.files.length > 0) {
      const uploads = await Promise.all(input.files.map((file) => uploadProjectNoteAttachment(note.id, file)));
      const attachments: ProjectNoteAttachment[] = [];
      const failedNames: string[] = [];
      uploads.forEach((upload, i) => {
        if (upload.status === "error") {
          console.warn("[notes] attachment upload failed:", upload.message);
          failedNames.push(input.files[i].name);
        } else {
          attachments.push(upload.attachment);
        }
      });
      note = { ...note, attachments };
      if (failedNames.length > 0) {
        setErrorMessage(
          failedNames.length === 1
            ? `Note created, but "${failedNames[0]}" failed to attach.`
            : `Note created, but these files failed to attach: ${failedNames.join(", ")}.`
        );
      }
    }

    setNotes((prev) => [note, ...prev]);
    setShowNewNote(false);
    return true;
  }

  async function handleSaveNote(input: { title: string; body: string; tag?: string }): Promise<boolean> {
    if (!activeNote) return false;
    const result = await updateNote(activeNote.id, slug, { title: input.title, body: input.body });
    if (result.status === "error") {
      setErrorMessage(result.message);
      return false;
    }
    // Preserve the note's already-loaded attachments — updateNote's own
    // result never re-reads them (same "attachments: []" placeholder
    // ticket-detail-screen.tsx's saveCommentEdit-equivalent leaves alone).
    // saveNoteAttachmentEdits (called separately by NoteDetailModal right
    // after this, only when attachments actually changed) refines this
    // further; this alone must never wipe them.
    const updated = { ...result.note, attachments: activeNote.attachments };
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setActiveNote(updated);
    return true;
  }

  // Applies the attachment side of editing an existing note — called once
  // by NoteDetailModal, right after handleSaveNote above already
  // succeeded. Takes the pre-edit attachments list explicitly (rather than
  // re-reading activeNote from this closure) so it can never act on a
  // stale snapshot from before that same save. Reuses the exact same
  // deleteProjectNoteAttachment/uploadProjectNoteAttachment calls a
  // standalone attachments manager would — never a second
  // upload/deletion implementation.
  async function saveNoteAttachmentEdits(
    noteId: string,
    currentAttachments: ProjectNoteAttachment[],
    toRemove: ProjectNoteAttachment[],
    newFiles: File[]
  ): Promise<void> {
    let attachments = currentAttachments;

    for (const attachment of toRemove) {
      const result = await deleteProjectNoteAttachment(attachment.id, attachment.storagePath);
      if (result.status === "error") {
        console.warn("[notes] attachment delete failed:", result.message);
        setErrorMessage(result.message);
        continue;
      }
      attachments = attachments.filter((a) => a.id !== attachment.id);
    }

    if (newFiles.length > 0) {
      const uploads = await Promise.all(newFiles.map((file) => uploadProjectNoteAttachment(noteId, file)));
      const failedNames: string[] = [];
      uploads.forEach((upload, i) => {
        if (upload.status === "error") {
          console.warn("[notes] attachment upload failed:", upload.message);
          failedNames.push(newFiles[i].name);
        } else {
          attachments = [...attachments, upload.attachment];
        }
      });
      if (failedNames.length > 0) {
        setErrorMessage(
          failedNames.length === 1
            ? `Note updated, but "${failedNames[0]}" failed to attach.`
            : `Note updated, but these files failed to attach: ${failedNames.join(", ")}.`
        );
      }
    }

    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, attachments } : n)));
    setActiveNote((prev) => (prev && prev.id === noteId ? { ...prev, attachments } : prev));
  }

  async function handleDuplicateNote(note: ProjectNote): Promise<boolean> {
    if (!organization) return false;
    const result = await duplicateNote(organization.id, slug, note);
    if (result.status === "error") {
      setErrorMessage(result.message);
      return false;
    }
    setNotes((prev) => [result.note, ...prev]);
    return true;
  }

  async function handleDeleteNote(noteId: string): Promise<boolean> {
    const result = await deleteNote(noteId);
    if (result.status === "error") {
      setErrorMessage(result.message);
      return false;
    }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    return true;
  }

  function handleOpenNote(note: ProjectNote, opts?: { edit?: boolean }) {
    setActiveNote(note);
    setActiveNoteEditMode(!!opts?.edit);
  }

  const hasAnyNotes = notes.length > 0;

  if (loadState === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading notes…
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load notes</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {loadErrorMessage ?? "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={runFetch}
            className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Project Notes</h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
            Capture decisions, links, meeting notes, and project context.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewNote(true)}
          className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors flex-shrink-0 dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          + New Note
        </button>
      </div>

      <div className="mt-6">
        <label htmlFor={searchId} className="relative block w-full sm:w-72">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id={searchId}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes..."
            className="w-full text-[16px] sm:text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState hasAnyNotes={hasAnyNotes} onCreate={() => setShowNewNote(true)} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onOpen={handleOpenNote}
                onDelete={handleDeleteNote}
                onDuplicate={handleDuplicateNote}
              />
            ))}
          </div>
        )}
      </div>

      {showNewNote && (
        <NewNoteModal
          projectName={projectName}
          onClose={() => setShowNewNote(false)}
          onCreated={handleCreateNote}
        />
      )}

      {activeNote && (
        <NoteDetailModal
          note={activeNote}
          startInEditMode={activeNoteEditMode}
          onClose={() => setActiveNote(null)}
          onSave={handleSaveNote}
          onSaveAttachments={(toRemove, newFiles) => saveNoteAttachmentEdits(activeNote.id, activeNote.attachments, toRemove, newFiles)}
          onDuplicate={() => { void handleDuplicateNote(activeNote); }}
          onDelete={() => handleDeleteNote(activeNote.id)}
        />
      )}

      {errorMessage && <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />}
    </div>
  );
}

function NoteCard({
  note,
  onOpen,
  onDelete,
  onDuplicate,
}: {
  note: ProjectNote;
  onOpen: (note: ProjectNote, opts?: { edit?: boolean }) => void;
  onDelete: (noteId: string) => Promise<boolean>;
  onDuplicate: (note: ProjectNote) => Promise<boolean>;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(note);
        }
      }}
      className="group relative flex flex-col min-h-[152px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 cursor-pointer outline-none transition-all duration-150 hover:-translate-y-px hover:bg-slate-50/60 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20 dark:hover:bg-zinc-800/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex-1 min-w-0 text-sm font-semibold text-slate-900 dark:text-zinc-100 leading-snug">
          {note.title}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {note.tag && <TagBadge tag={note.tag} />}
          <NoteCardMenu
            onEdit={() => onOpen(note, { edit: true })}
            onDuplicate={() => { void onDuplicate(note); }}
            onDelete={() => { void onDelete(note.id); }}
          />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1.5 line-clamp-2">{richTextToPlainText(note.body)}</p>

      <div className="flex items-center justify-between mt-auto pt-3.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar src={note.author.avatar} name={note.author.name} className="w-5 h-5 rounded-full flex-shrink-0" />
          <span className="text-xs text-slate-500 dark:text-zinc-400 truncate">{note.author.name}</span>
        </div>
        <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-zinc-500 flex-shrink-0">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {note.updatedAt}
        </span>
      </div>
    </div>
  );
}

function NoteCardMenu({
  onEdit,
  onDuplicate,
  onDelete,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const items: { label: string; danger?: boolean; onSelect: () => void }[] = [
    { label: "Edit", onSelect: onEdit },
    { label: "Duplicate", onSelect: onDuplicate },
    { label: "Delete", danger: true, onSelect: onDelete },
  ];

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Note actions"
        className={
          "p-1 rounded-md text-slate-300 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800" : "opacity-0 group-hover:opacity-100 focus:opacity-100")
        }
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      <div
        className={
          "absolute right-0 top-full mt-1.5 z-10 w-32 rounded-lg border bg-white dark:bg-zinc-900 " +
          "shadow-lg shadow-black/10 dark:shadow-black/40 border-slate-200 dark:border-zinc-700/60 " +
          "transition-all duration-150 origin-top-right " +
          (open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none")
        }
      >
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={
                "w-full px-3 py-1.5 text-[13px] text-left transition-colors duration-150 " +
                (item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasAnyNotes, onCreate }: { hasAnyNotes: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h6" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
        {hasAnyNotes ? "No matching notes" : "No notes yet"}
      </h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
        {hasAnyNotes
          ? "Try a different search term."
          : "Capture decisions, links, and meeting notes so context never gets lost."}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
      >
        Create your first note
      </button>
    </div>
  );
}

export function NewNoteModal({
  projectName,
  onClose,
  onCreated,
}: {
  projectName: string;
  onClose: () => void;
  onCreated: (input: { title: string; body: string; tag?: string; files: File[] }) => Promise<boolean>;
}) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingNoteFile[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  const canSubmit = title.trim().length > 0 && !saving;

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function handleSubmit() {
    if (!canSubmit) {
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    await onCreated({
      title: title.trim(),
      tag,
      body: isRichTextEmpty(body) ? "No additional details yet." : sanitizeRichTextHtml(body),
      files: pendingFiles.map((item) => item.file),
    });
    setSaving(false);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        aria-hidden
        onClick={handleClose}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label="New Note"
          className={
            "pointer-events-auto w-full max-w-lg flex flex-col " +
            "max-h-[calc(100dvh-3rem)] bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">New Note</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{projectName}</p>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-5">
            <div>
              <label className={FIELD_LABEL}>
                Title
                <span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
              </label>
              <input
                ref={titleRef}
                type="text"
                placeholder="What's this note about?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
                }}
                className={INPUT + " text-[16px] sm:text-[15px] py-2.5"}
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Tag</label>
              <div className="flex flex-wrap gap-1.5">
                {TAG_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTag((current) => (current === option ? undefined : option))}
                    className={
                      "px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors " +
                      (tag === option
                        ? "bg-brand-500 dark:bg-brand-600 text-white border-transparent"
                        : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-transparent hover:border-brand-200 dark:hover:border-brand-800")
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Details</label>
              <RichTextEditor
                content={body}
                onChange={setBody}
                placeholder="Capture the decision, link, or context..."
                contentClassName="sm:text-[13px]"
              />
            </div>

            <NoteAttachmentsField
              pendingFiles={pendingFiles}
              onFilesSelected={(files) => {
                const items = files.map((file) => ({ id: newPendingNoteFileId(), file }));
                setPendingFiles((prev) => [...prev, ...items]);
              }}
              onRemovePending={(id) => setPendingFiles((prev) => prev.filter((p) => p.id !== id))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={
                "inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all " +
                (canSubmit
                  ? "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed")
              }
            >
              Create Note
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
