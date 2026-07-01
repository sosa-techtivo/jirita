"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getNotesByProjectSlug } from "@/lib/mock-notes";
import type { ProjectNote } from "@/lib/mock-notes";
import { NoteDetailModal } from "@/components/note-detail-modal";
import { TAG_OPTIONS, TagBadge, INPUT, FIELD_LABEL } from "@/components/notes-shared";

export function NotesScreen({ slug, projectName }: { slug: string; projectName: string }) {
  const [notes, setNotes] = useState<ProjectNote[]>(() => getNotesByProjectSlug(slug));
  const [search, setSearch] = useState("");
  const [showNewNote, setShowNewNote] = useState(false);
  const [activeNote, setActiveNote] = useState<ProjectNote | null>(null);
  const [activeNoteEditMode, setActiveNoteEditMode] = useState(false);
  const searchId = useId();

  const query = search.trim().toLowerCase();
  const filtered = notes.filter((note) => {
    if (query === "") return true;
    return (
      note.title.toLowerCase().includes(query) ||
      note.body.toLowerCase().includes(query) ||
      (note.tag ?? "").toLowerCase().includes(query)
    );
  });

  function handleCreated(note: ProjectNote) {
    setNotes((prev) => [note, ...prev]);
    setShowNewNote(false);
  }

  function handleOpenNote(note: ProjectNote, opts?: { edit?: boolean }) {
    setActiveNote(note);
    setActiveNoteEditMode(!!opts?.edit);
  }

  function handleSaveNote(updated: ProjectNote) {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setActiveNote(updated);
  }

  const hasAnyNotes = notes.length > 0;

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
            className="w-full text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState hasAnyNotes={hasAnyNotes} onCreate={() => setShowNewNote(true)} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((note) => (
              <NoteCard key={note.id} note={note} onOpen={handleOpenNote} />
            ))}
          </div>
        )}
      </div>

      {showNewNote && (
        <NewNoteModal
          slug={slug}
          projectName={projectName}
          onClose={() => setShowNewNote(false)}
          onCreated={handleCreated}
        />
      )}

      {activeNote && (
        <NoteDetailModal
          note={activeNote}
          startInEditMode={activeNoteEditMode}
          onClose={() => setActiveNote(null)}
          onSave={handleSaveNote}
        />
      )}
    </div>
  );
}

function NoteCard({
  note,
  onOpen,
}: {
  note: ProjectNote;
  onOpen: (note: ProjectNote, opts?: { edit?: boolean }) => void;
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
          <NoteCardMenu onEdit={() => onOpen(note, { edit: true })} />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1.5 line-clamp-2">{note.body}</p>

      <div className="flex items-center justify-between mt-auto pt-3.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={note.author.avatar} alt={note.author.name} className="w-5 h-5 rounded-full flex-shrink-0" />
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

function NoteCardMenu({ onEdit }: { onEdit: () => void }) {
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
    { label: "Duplicate", onSelect: () => {} },
    { label: "Delete", danger: true, onSelect: () => {} },
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

function NewNoteModal({
  slug,
  projectName,
  onClose,
  onCreated,
}: {
  slug: string;
  projectName: string;
  onClose: () => void;
  onCreated: (note: ProjectNote) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [body, setBody] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  const canSubmit = title.trim().length > 0;

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function handleSubmit() {
    if (!canSubmit) {
      titleRef.current?.focus();
      return;
    }
    onCreated({
      id: `note-${Date.now()}`,
      projectSlug: slug,
      title: title.trim(),
      body: body.trim() || "No additional details yet.",
      tag,
      updatedAt: "Just now",
      author: { name: "You", avatar: "https://i.pravatar.cc/64?img=1" },
    });
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
                className={INPUT + " text-[15px] py-2.5"}
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
              <textarea
                placeholder="Capture the decision, link, or context..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className={INPUT + " resize-none"}
              />
            </div>
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
