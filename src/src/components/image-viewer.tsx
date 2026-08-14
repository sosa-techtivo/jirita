"use client";

// Shared zoom/pan/fit viewer for the "image" branch of an attachment
// preview modal — used by ticket-detail-screen.tsx's AttachmentPreviewModal
// (ticket Attachments + the inline attachments on comments, which reuse the
// same modal) and note-attachments.tsx's NoteAttachmentPreviewModal, so all
// three surfaces get identical zoom/pan/fit behavior from one place instead
// of three copies. Deliberately just the viewer chrome (toolbar + zoomable
// canvas) — each modal keeps its own title/close row, backdrop, dialog
// semantics, and (for non-image kinds) its own PDF `<iframe>` untouched.
// Pure UI: takes an already-resolved image `src` and has no idea whether
// that came from a ticket, a comment, or a note — the caller still owns
// which lib function resolved that URL and which one downloads the file.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject, type SyntheticEvent } from "react";
import { Minus, Plus, ExternalLink, Download } from "lucide-react";

const ZOOM_MIN = 25;
const ZOOM_MAX = 300;
const ZOOM_STEP = 25;

export interface ImageViewerController {
  /** "fit" (the default — scales the whole image down, never up, to fit the
   *  available space, same as the old plain `max-w-full h-auto` behavior)
   *  or an explicit percent (25–300, step 25) set via +/-/100%. */
  zoom: number | "fit";
  /** Resolved display percent — the computed fit percentage when `zoom`
   *  is "fit", otherwise just `zoom` itself. What the toolbar shows. */
  zoomPercent: number;
  isFit: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  naturalSize: { width: number; height: number } | null;
  onImageLoad: (e: SyntheticEvent<HTMLImageElement>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setFit: () => void;
  setActualSize: () => void;
  isPanning: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useImageViewer(): ImageViewerController {
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Tracks the canvas's own rendered box (not the window) so "Fit" stays
  // correct if the modal itself is ever resized/reflows — a plain one-off
  // measurement on mount would go stale.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Never upscales past natural size — matches the previous plain
  // `max-w-full h-auto` behavior exactly (a small image stays small in
  // Fit, it doesn't balloon to fill the modal).
  const computeFitPercent = useCallback((): number => {
    if (!naturalSize || !containerSize || naturalSize.width === 0 || naturalSize.height === 0) return 100;
    const scale = Math.min(containerSize.width / naturalSize.width, containerSize.height / naturalSize.height, 1);
    return Math.max(1, Math.round(scale * 100));
  }, [naturalSize, containerSize]);

  const zoomPercent = zoom === "fit" ? computeFitPercent() : zoom;

  const onImageLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const current = prev === "fit" ? computeFitPercent() : prev;
      return Math.min(ZOOM_MAX, (Math.floor(current / ZOOM_STEP) + 1) * ZOOM_STEP);
    });
  }, [computeFitPercent]);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const current = prev === "fit" ? computeFitPercent() : prev;
      return Math.max(ZOOM_MIN, (Math.ceil(current / ZOOM_STEP) - 1) * ZOOM_STEP);
    });
  }, [computeFitPercent]);

  const setFit = useCallback(() => setZoom("fit"), []);
  const setActualSize = useCallback(() => setZoom(100), []);

  // Simple click+drag panning via native scrollLeft/scrollTop — no new
  // dependency: Pointer Events + setPointerCapture already cover "released
  // outside the element" without a document-level listener.
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom === "fit" || !containerRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    };
    setIsPanning(true);
  }, [zoom]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panRef.current || !containerRef.current) return;
    containerRef.current.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.x);
    containerRef.current.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.y);
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    setIsPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // Re-centers on every zoom-level change (Fit → 100%, 100% → 150%, etc.)
  // so a previous scroll offset never leaves the view looking cut off after
  // switching levels — runs after layout has actually applied the new size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    });
  }, [zoom]);

  return {
    zoom, zoomPercent, isFit: zoom === "fit",
    canZoomIn: zoomPercent < ZOOM_MAX,
    canZoomOut: zoomPercent > ZOOM_MIN,
    containerRef, naturalSize, onImageLoad,
    zoomIn, zoomOut, setFit, setActualSize,
    isPanning, onPointerDown, onPointerMove, onPointerUp,
  };
}

const TOOLBAR_BTN =
  "p-1.5 rounded-md text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 " +
  "hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:pointer-events-none";

function toggleBtnClass(active: boolean): string {
  return [
    "px-2 py-1 rounded-md text-[11px] font-semibold transition-colors",
    active
      ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
      : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800",
  ].join(" ");
}

// Discrete controls row for the modal's header, below its existing
// title/close row — never replaces that row, per each caller's own layout.
export function ImageViewerToolbar({
  controller,
  onOpenOriginal,
  onDownload,
}: {
  controller: ImageViewerController;
  /** Opens the real, already-resolved original attachment URL (the same
   *  one already loaded for this preview — never a second fetch/route). */
  onOpenOriginal: () => void;
  /** The caller's own existing attachment download function/mechanism. */
  onDownload: () => void;
}) {
  const { zoomPercent, isFit, canZoomIn, canZoomOut, zoomIn, zoomOut, setFit, setActualSize } = controller;

  return (
    <div className="flex items-center gap-1 px-5 py-2 flex-wrap">
      <button type="button" onClick={zoomOut} disabled={!canZoomOut} aria-label="Zoom out" className={TOOLBAR_BTN}>
        <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
      <span className="w-11 text-center text-[11px] font-semibold tabular-nums text-slate-500 dark:text-zinc-400 select-none">
        {zoomPercent}%
      </span>
      <button type="button" onClick={zoomIn} disabled={!canZoomIn} aria-label="Zoom in" className={TOOLBAR_BTN}>
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>

      <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1.5" aria-hidden="true" />

      <button type="button" onClick={setFit} className={toggleBtnClass(isFit)}>Fit</button>
      <button type="button" onClick={setActualSize} className={toggleBtnClass(!isFit && zoomPercent === 100)}>100%</button>

      <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1.5" aria-hidden="true" />

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

// The zoomable/pannable image area itself — fills whatever fixed-height
// container the caller places it in (each modal's existing scrollable body
// slot). Fit mode never overflows (so nothing to pan); a numeric zoom level
// renders the image at its exact natural-size-derived pixel dimensions
// (width and height always scaled by the *same* factor, so the aspect
// ratio can never distort) inside a native-scrolling container, with
// optional click+drag panning on top of that same native scroll.
export function ImageViewerCanvas({
  controller,
  src,
  alt,
}: {
  controller: ImageViewerController;
  src: string;
  alt: string;
}) {
  const {
    containerRef, isFit, naturalSize, zoomPercent, onImageLoad,
    isPanning, onPointerDown, onPointerMove, onPointerUp,
  } = controller;
  const canPan = !isFit;

  return (
    <div
      ref={containerRef}
      className={[
        "w-full h-full flex items-center justify-center overflow-auto",
        canPan ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "",
      ].join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={onImageLoad}
        draggable={false}
        className="select-none flex-shrink-0"
        style={
          isFit
            ? { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }
            : naturalSize
            ? { width: `${(naturalSize.width * zoomPercent) / 100}px`, height: `${(naturalSize.height * zoomPercent) / 100}px`, maxWidth: "none" }
            : { maxWidth: "100%", height: "auto" }
        }
      />
    </div>
  );
}
