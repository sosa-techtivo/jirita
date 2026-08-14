"use client";

// Attachments for Project Notes — ported from (not imported/refactored out
// of) ticket-detail-screen.tsx's own CommentAttachmentRow/
// AttachmentPreviewModal/PendingCommentFileRow, same "near-duplicate
// variant" precedent that file's own CommentAttachmentRow already is of
// its sibling AttachmentRow, rather than a shared abstraction. Keeps this
// feature from ever touching Ticket Attachments' own code/behavior. Unlike
// Ticket Attachments, there's no historical-import "Data Only Backup"
// concept for Notes, so there's no `isAvailable` field/branch here at all
// — every note attachment is always a real, downloadable object.
//
// One exception to "near-duplicate, not shared": the zoom/pan/fit viewer
// chrome inside NoteAttachmentPreviewModal's own "image" branch below comes
// from components/image-viewer.tsx, the same module ticket-detail-screen.tsx's
// AttachmentPreviewModal now uses — pure UI with no idea which feature it's
// in, so sharing it doesn't reintroduce the cross-feature coupling the rest
// of this file deliberately avoids.

import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { createPortal } from "react-dom";
import {
  getProjectNoteAttachmentPreviewUrl,
  downloadProjectNoteAttachment,
} from "@/lib/notes";
import type { ProjectNoteAttachment } from "@/lib/mock-notes";
import { FIELD_LABEL } from "@/components/notes-shared";
import { useImageViewer, ImageViewerToolbar, ImageViewerCanvas } from "@/components/image-viewer";

export type NoteAttachmentItem = {
  id: string;
  name: string;
  ext: string;
  size: string;
  storagePath: string;
};

// A file picked in the New/Edit Note attachments field, staged locally
// before the note (and therefore its note id) exists, or before Save is
// pressed on an edit — see NoteAttachmentsField/note-detail-modal.tsx.
export type PendingNoteFile = {
  id: string;
  file: File;
};

const EXT_COLOR: Record<string, string> = {
  fig:  "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  pdf:  "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  mp4:  "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  mov:  "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  png:  "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  jpg:  "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  jpeg: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  svg:  "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  zip:  "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  doc:  "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
  docx: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
};

function getExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "file";
}

// Image formats every evergreen browser can render directly in an <img>
// tag. Anything else (Office docs, zips, video, etc.) gets no inline
// preview, per this feature's explicit scope — same allowlist as Ticket
// Attachments' own getPreviewKind.
const PREVIEWABLE_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

function getPreviewKind(ext: string): "image" | "pdf" | null {
  if (ext === "pdf") return "pdf";
  if (PREVIEWABLE_IMAGE_EXTS.has(ext)) return "image";
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let pendingNoteFileIdCounter = 0;

// Date.now() + Math.random() alone can collide when several files are
// selected in the same synchronous batch (same millisecond) — the counter
// guarantees uniqueness regardless of timing, same reasoning as
// ticket-detail-screen.tsx's own newId().
export function newPendingNoteFileId(): string {
  pendingNoteFileIdCounter += 1;
  return `note-att-${Date.now()}-${pendingNoteFileIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function toNoteAttachmentItem(a: ProjectNoteAttachment): NoteAttachmentItem {
  return {
    id: a.id,
    name: a.filename,
    ext: getExt(a.filename),
    size: formatBytes(a.sizeBytes),
    storagePath: a.storagePath,
  };
}

// ── NoteAttachmentPreviewModal ───────────────────────────────────────────────

function NoteAttachmentPreviewModal({
  file,
  kind,
  onClose,
}: {
  file: NoteAttachmentItem;
  kind: "image" | "pdf";
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const imageViewer = useImageViewer();

  useEffect(() => {
    let cancelled = false;
    getProjectNoteAttachmentPreviewUrl(file.storagePath).then((result) => {
      if (cancelled) return;
      if (result.status === "error") { setFailed(true); return; }
      setUrl(result.url);
    });
    return () => { cancelled = true; };
  }, [file.storagePath]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-2xl max-h-[calc(100dvh-3rem)] flex flex-col rounded-2xl border shadow-2xl bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 shadow-black/15 dark:shadow-black/50 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-attachment-preview-title"
      >
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-zinc-800">
            <h2 id="note-attachment-preview-title" className="text-[15px] font-bold text-slate-900 dark:text-zinc-50 truncate pr-4">
              {file.name}
            </h2>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {kind === "image" && url && !failed && (
            <div className="border-b border-slate-100 dark:border-zinc-800">
              <ImageViewerToolbar
                controller={imageViewer}
                onOpenOriginal={() => window.open(url, "_blank", "noopener,noreferrer")}
                onDownload={() => {
                  downloadProjectNoteAttachment(file.storagePath, file.name).then((result) => {
                    if (result.status === "error") {
                      console.warn("[note-attachments] attachment download failed:", result.message);
                    }
                  });
                }}
              />
            </div>
          )}
        </div>

        <div className={`flex-1 min-h-0 bg-slate-50 dark:bg-zinc-950/40 ${kind === "image" ? "overflow-hidden" : "overflow-auto"}`}>
          {!url && !failed && (
            <div className="flex items-center justify-center h-[70vh]">
              <svg className="w-5 h-5 animate-spin text-slate-300 dark:text-zinc-700" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {failed && (
            <p className="text-[13px] text-slate-400 dark:text-zinc-600 text-center py-16">
              Couldn&apos;t load preview.
            </p>
          )}

          {url && kind === "image" && (
            <div className="h-[70vh]">
              <ImageViewerCanvas controller={imageViewer} src={url} alt={file.name} />
            </div>
          )}

          {url && kind === "pdf" && (
            <iframe src={url} title={file.name} className="w-full h-[70vh] border-0" />
          )}
        </div>
      </div>
    </div>
  );
}

// ── NoteAttachmentRow ─────────────────────────────────────────────────────────
// Image → inline thumbnail preview; anything else → a plain clickable row
// for download. Read-only unless `onRemove` is passed (only while editing
// a note — see NoteAttachmentsField), matching CommentAttachmentRow's own
// convention exactly.

function NoteAttachmentRow({
  file,
  onRemove,
}: {
  file: NoteAttachmentItem;
  onRemove?: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const previewKind = getPreviewKind(file.ext);
  const isImage = previewKind === "image";
  const extColor = EXT_COLOR[file.ext] ?? "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400";

  const [inlineImageUrl, setInlineImageUrl] = useState<string | null>(null);
  const [inlineImageFailed, setInlineImageFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getProjectNoteAttachmentPreviewUrl(file.storagePath).then((result) => {
      if (cancelled) return;
      if (result.status === "error") { setInlineImageFailed(true); return; }
      setInlineImageUrl(result.url);
    });
    return () => { cancelled = true; };
  }, [isImage, file.storagePath]);

  const handleClick = () => {
    if (previewKind) {
      setPreviewOpen(true);
      return;
    }
    downloadProjectNoteAttachment(file.storagePath, file.name).then((result) => {
      if (result.status === "error") {
        console.warn("[note-attachments] download failed:", result.message);
      }
    });
  };

  if (onRemove && confirmingRemove) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20">
        <span className="flex-1 min-w-0 text-[12px] text-slate-700 dark:text-zinc-300 truncate">
          Remove <strong className="font-semibold">{file.name}</strong>?
        </span>
        <button
          type="button"
          onClick={() => { setConfirmingRemove(false); onRemove(); }}
          className="flex-shrink-0 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={() => setConfirmingRemove(false)}
          className="flex-shrink-0 text-[12px] text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleClick}
          className="w-full rounded-lg border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 hover:border-slate-200 dark:hover:border-zinc-700 transition-colors overflow-hidden text-left"
        >
          <div className="w-full h-48 flex items-center justify-center bg-slate-50 dark:bg-zinc-900">
            {inlineImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={inlineImageUrl} alt={file.name} className="max-w-full max-h-full object-contain" />
            )}
            {!inlineImageUrl && !inlineImageFailed && (
              <svg className="w-4 h-4 animate-spin text-slate-300 dark:text-zinc-700" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {inlineImageFailed && (
              <p className="text-[11px] text-slate-400 dark:text-zinc-600">Couldn&apos;t load preview.</p>
            )}
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-slate-100 dark:border-zinc-800">
            <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-700 dark:text-zinc-300 truncate">
              {file.name}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-zinc-600 flex-shrink-0">{file.size}</span>
          </div>
        </button>

        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => setConfirmingRemove(true)}
            className="absolute top-1.5 right-1.5 p-1 rounded-md bg-white/90 dark:bg-zinc-950/80 text-slate-400 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-zinc-900 shadow-sm transition-colors"
          >
            <TrashIcon className="w-3 h-3" />
          </button>
        )}

        {previewOpen && previewKind && createPortal(
          <NoteAttachmentPreviewModal file={file} kind={previewKind} onClose={() => setPreviewOpen(false)} />,
          document.body
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className={
          "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 hover:border-slate-200 dark:hover:border-zinc-700 transition-colors text-left" +
          (onRemove ? " pr-8" : "")
        }
      >
        <span className={"w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[7px] font-bold uppercase tracking-wide " + extColor}>
          {file.ext}
        </span>
        <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-700 dark:text-zinc-300 truncate">
          {file.name}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-zinc-600 flex-shrink-0">{file.size}</span>
      </button>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${file.name}`}
          onClick={() => setConfirmingRemove(true)}
          className="absolute top-1/2 -translate-y-1/2 right-2 p-1 rounded text-slate-300 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <TrashIcon className="w-3 h-3" />
        </button>
      )}

      {previewOpen && previewKind && createPortal(
        <NoteAttachmentPreviewModal file={file} kind={previewKind} onClose={() => setPreviewOpen(false)} />,
        document.body
      )}
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-3 h-3"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── PendingNoteFileRow ────────────────────────────────────────────────────────
// Staged, not-yet-uploaded file — same ext badge/size formatting as
// NoteAttachmentRow, but with a Remove action instead of preview/download
// since there's nothing to open yet.

function PendingNoteFileRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  const ext = getExt(file.name);
  const extColor = EXT_COLOR[ext] ?? "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400";

  return (
    <div className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60">
      <span className={"w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[7px] font-bold uppercase tracking-wide " + extColor}>
        {ext}
      </span>
      <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-700 dark:text-zinc-300 truncate">
        {file.name}
      </span>
      <span className="text-[11px] text-slate-400 dark:text-zinc-600 flex-shrink-0">{formatBytes(file.size)}</span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="p-1 rounded text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── NoteAttachmentsField ──────────────────────────────────────────────────────
// The one attachments editor used by both NewNoteModal and NoteDetailModal's
// edit mode — file picker, drag & drop, and paste-from-clipboard, all
// staging into the same pendingFiles/onFilesSelected the caller owns.
// `existing`/`onRemoveExisting` are only ever passed by NoteDetailModal
// (an existing, already-uploaded attachment can't exist yet in NewNoteModal).
// Purely a staging UI — nothing here ever calls upload/delete itself; the
// real writes only happen when the caller's own Save handler runs.

export function NoteAttachmentsField({
  existing,
  onRemoveExisting,
  pendingFiles,
  onFilesSelected,
  onRemovePending,
}: {
  existing?: ProjectNoteAttachment[];
  onRemoveExisting?: (id: string) => void;
  pendingFiles: PendingNoteFile[];
  onFilesSelected: (files: File[]) => void;
  onRemovePending: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Page-scoped: only one of NewNoteModal/NoteDetailModal is ever open at a
  // time (both are full-screen overlays), so a plain document-level paste
  // listener — scoped to this field's own mount lifetime — never competes
  // with another attachments field the way Ticket Detail's page-level
  // paste handler has to arbitrate between several open comment editors.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length > 0) onFilesSelected(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onFilesSelected]);

  function isFileDrag(e: ReactDragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes("Files");
  }

  const hasFiles = (existing && existing.length > 0) || pendingFiles.length > 0;

  return (
    <div>
      <label className={FIELD_LABEL}>Attachments</label>
      <div
        className={
          "rounded-lg transition-colors " +
          (dragOver ? "ring-2 ring-brand-500 dark:ring-brand-500/70" : "")
        }
        onDragEnter={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragCounterRef.current += 1;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!isFileDrag(e)) return;
          dragCounterRef.current -= 1;
          if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setDragOver(false);
          }
        }}
        onDrop={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          dragCounterRef.current = 0;
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) onFilesSelected(Array.from(e.dataTransfer.files));
        }}
      >
        {hasFiles && (
          <div className="space-y-1.5 mb-2">
            {existing?.map((a) => (
              <NoteAttachmentRow
                key={a.id}
                file={toNoteAttachmentItem(a)}
                onRemove={onRemoveExisting ? () => onRemoveExisting(a.id) : undefined}
              />
            ))}
            {pendingFiles.map((item) => (
              <PendingNoteFileRow key={item.id} file={item.file} onRemove={() => onRemovePending(item.id)} />
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              onFilesSelected(Array.from(e.target.files));
              e.target.value = "";
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed border-slate-200 dark:border-zinc-700 text-[12px] font-medium text-slate-400 dark:text-zinc-600 hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Attach files or drag &amp; drop
        </button>
      </div>
    </div>
  );
}

// ── NoteAttachmentsList ───────────────────────────────────────────────────────
// Read-only rendering for NoteDetailModal's view mode — no picker, no drag
// zone, no remove affordance, just the same NoteAttachmentRow every other
// context uses.

export function NoteAttachmentsList({ attachments }: { attachments: ProjectNoteAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {attachments.map((a) => (
        <NoteAttachmentRow key={a.id} file={toNoteAttachmentItem(a)} />
      ))}
    </div>
  );
}
