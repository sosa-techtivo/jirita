"use client";

// Shared simple image preview chrome for attachment preview modals — used by
// ticket-detail-screen.tsx's AttachmentPreviewModal (ticket Attachments +
// the inline attachments on comments, which reuse the same modal) and
// note-attachments.tsx's NoteAttachmentPreviewModal, so all three surfaces
// get identical preview behavior from one place instead of three copies.
// Deliberately just the viewer chrome (toolbar + image) — each modal keeps
// its own title/close row, backdrop, dialog semantics, and (for non-image
// kinds) its own PDF `<iframe>` untouched.
// Pure UI: takes an already-resolved image `src` and has no idea whether
// that came from a ticket, a comment, or a note — the caller still owns
// which lib function resolved that URL and which one downloads the file.

import { ExternalLink, Download } from "lucide-react";

// Discrete controls row for the modal's header, below its existing
// title/close row — never replaces that row, per each caller's own layout.
export function ImageViewerToolbar({
  onOpenOriginal,
  onDownload,
}: {
  /** Opens the real, already-resolved original attachment URL (the same
   *  one already loaded for this preview — never a second fetch/route). */
  onOpenOriginal: () => void;
  /** The caller's own existing attachment download function/mechanism. */
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center gap-1 px-5 py-2 flex-wrap">
      <button
        type="button"
        onClick={onOpenOriginal}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
        Open original
      </button>
      <button
        type="button"
        onClick={onDownload}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Download className="w-3.5 h-3.5" strokeWidth={2} />
        Download
      </button>
    </div>
  );
}

// The image preview area itself — fills whatever fixed-height container the
// caller places it in (each modal's existing scrollable body slot). Always
// scales to fit entirely within the available space, preserving aspect
// ratio and never upscaling past natural size or stretching/distorting.
export function ImageViewerCanvas({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="max-w-full max-h-full w-auto h-auto select-none" />
    </div>
  );
}
