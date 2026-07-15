"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectNote } from "@/lib/mock-notes";
import { TAG_OPTIONS, TagBadge, INPUT, FIELD_LABEL } from "@/components/notes-shared";

export function NoteDetailModal({
  note,
  startInEditMode = false,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
}: {
  note: ProjectNote;
  startInEditMode?: boolean;
  onClose: () => void;
  onSave: (input: { title: string; body: string; tag?: string }) => Promise<boolean>;
  onDuplicate: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">(startInEditMode ? "edit" : "view");
  const [title, setTitle] = useState(note.title);
  const [tag, setTag] = useState<string | undefined>(note.tag);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const canSave = title.trim().length > 0 && !saving;

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  function enterEditMode() {
    setTitle(note.title);
    setTag(note.tag);
    setBody(note.body);
    setMode("edit");
  }

  async function handleSave() {
    if (!canSave) {
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    const success = await onSave({
      title: title.trim(),
      tag,
      body: body.trim() || "No additional details yet.",
    });
    setSaving(false);
    if (success) setMode("view");
  }

  async function handleDelete() {
    const success = await onDelete();
    if (success) handleClose();
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
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
          aria-label={note.title}
          className={
            "pointer-events-auto w-full max-w-2xl flex flex-col " +
            "max-h-[calc(100dvh-3rem)] bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          {mode === "view" ? (
            <>
              <div className="flex items-center justify-end gap-1.5 px-6 pt-5 flex-shrink-0">
                {note.tag && <TagBadge tag={note.tag} />}
                <NoteDetailMenu onEdit={enterEditMode} onDuplicate={onDuplicate} onDelete={() => { void handleDelete(); }} />
                <CloseButton onClick={handleClose} />
              </div>

              <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-8">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug dark:text-zinc-50">
                  {note.title}
                </h1>

                <div className="flex items-center gap-2 mt-3 text-xs text-slate-400 dark:text-zinc-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={note.author.avatar} alt={note.author.name} className="w-6 h-6 rounded-full" />
                  <span className="text-slate-600 font-medium dark:text-zinc-300">{note.author.name}</span>
                  <span className="text-slate-300 dark:text-zinc-700">·</span>
                  <span>Updated {note.updatedAt}</span>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-zinc-800">
                  <p className="text-[15px] leading-relaxed text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {note.body}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Edit Note</h2>
                <CloseButton onClick={handleClose} />
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
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
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
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    className={INPUT + " resize-none"}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
                <button
                  onClick={() => setMode("view")}
                  className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className={
                    "inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all " +
                    (canSave
                      ? "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed")
                  }
                >
                  Save Changes
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function NoteDetailMenu({
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Note actions"
        className={
          "p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800" : "")
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
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
