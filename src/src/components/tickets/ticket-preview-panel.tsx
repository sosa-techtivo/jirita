"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { Ticket, TicketPriority } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import {
  StatusBadge,
  PriorityBadge,
  TicketTypeIcon,
  EditableStatusBadge,
  EditableDescription,
  PRIORITY_LABEL,
  EDIT_BTN,
  INPUT_BASE,
  PencilIcon,
  CalendarIcon,
  parseDisplayDate,
  formatISODate,
  ErrorToast,
} from "@/components/tickets/ticket-ui";
import {
  loadTicketComments,
  groupCommentThreads,
  loadTicketAttachments,
  resolveTicketAttachmentThumbnailUrl,
  downloadTicketAttachment,
  loadProfileSummary,
  updateTicket,
  STATUS_FROM_DB,
  type TicketComment,
  type TicketAttachment,
  type UpdateTicketInput,
  type TicketStatusOption,
} from "@/lib/tickets";
import { MemberTrigger } from "@/components/member-profile";
import { RichTextViewer } from "@/components/rich-text/rich-text-viewer";
import { round1 } from "@/components/time-tracking-screen";
import { Avatar } from "@/components/ui/avatar";
import { FALLBACK_AVATAR } from "@/lib/current-user";
import type { OrgMember } from "@/lib/projects";

const FIELD_LABEL = "text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1";
const FIELD_VALUE = "text-[12px] font-medium text-slate-800 dark:text-zinc-200";

// ── Attachments (read-only) ─────────────────────────────────────────────────
// Same visual criteria as the New Ticket modal's own staged-attachment rows
// (an image gets an inline thumbnail; anything else gets a list row), but
// these are real, already-uploaded attachments — preview goes through a
// short-lived signed URL and download through the authenticated fetch, the
// same two gateways ticket-detail-screen.tsx's own Attachments section uses,
// since the Storage bucket is private and has no direct public URL.

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Same extension allowlist as ticket-detail-screen.tsx's own
// PREVIEWABLE_IMAGE_EXTS. Never attempted when !isAvailable — a Data Only
// Backup restore has no physical Storage object to fetch a preview for.
const PREVIEWABLE_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

function isPreviewableImage(attachment: TicketAttachment): boolean {
  return attachment.isAvailable && PREVIEWABLE_IMAGE_EXTS.has(getExt(attachment.filename));
}

// Image attachment — fetches its own short-lived, width-capped signed URL
// (same resolveTicketAttachmentThumbnailUrl every other inline thumbnail in
// the app uses — Image Transformations, deduped/shared across every instance
// of the same attachment) and renders it as an inline thumbnail: fit to
// width, aspect ratio preserved via object-contain inside a capped-height
// box, so it can never overflow the panel regardless of the image's own
// dimensions.
function PreviewAttachmentImageRow({ attachment }: { attachment: TicketAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveTicketAttachmentThumbnailUrl(attachment.storagePath, attachment.thumbnailPath).then((result) => {
      if (cancelled) return;
      if (result.status === "error") { setFailed(true); return; }
      setUrl(result.url);
    });
    return () => { cancelled = true; };
  }, [attachment.storagePath, attachment.thumbnailPath]);

  return (
    <div className="w-full rounded-lg border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 overflow-hidden">
      <div className="w-full h-48 flex items-center justify-center bg-slate-100 dark:bg-zinc-900">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={attachment.filename} loading="lazy" className="max-w-full max-h-full object-contain" />
        )}
        {!url && !failed && (
          <svg className="w-4 h-4 animate-spin text-slate-300 dark:text-zinc-700" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {failed && (
          <p className="text-[11px] text-slate-400 dark:text-zinc-600">Couldn&apos;t load preview.</p>
        )}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-slate-100 dark:border-zinc-800">
        <span className="flex-1 min-w-0 text-[12px] font-medium text-slate-700 dark:text-zinc-300 truncate">
          {attachment.filename}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-zinc-600 flex-shrink-0">
          {formatBytes(attachment.sizeBytes)}
        </span>
      </div>
    </div>
  );
}

// Non-image attachment — plain list row. The filename itself is the
// open/download action (same authenticated downloadTicketAttachment every
// other real Attachments UI in the app uses — the bucket is private, so a
// plain href can't work), disabled with an explanatory title when the file
// has no physical Storage object to fetch (!isAvailable).
function PreviewAttachmentFileRow({ attachment }: { attachment: TicketAttachment }) {
  const ext = getExt(attachment.filename);
  const extColor = EXT_COLOR[ext] ?? "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400";

  return (
    <div className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60">
      <span className={"w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[7px] font-bold uppercase tracking-wide " + extColor}>
        {ext}
      </span>
      <button
        type="button"
        disabled={!attachment.isAvailable}
        onClick={() => downloadTicketAttachment(attachment.storagePath, attachment.filename)}
        title={attachment.isAvailable ? `Download "${attachment.filename}"` : "File not included in this backup"}
        className="flex-1 min-w-0 text-left text-[12px] font-medium text-slate-700 dark:text-zinc-300 truncate hover:text-brand-600 dark:hover:text-brand-400 hover:underline disabled:hover:no-underline disabled:hover:text-slate-700 dark:disabled:hover:text-zinc-300 disabled:cursor-default"
      >
        {attachment.filename}
      </button>
      <span className="text-[11px] text-slate-400 dark:text-zinc-600 flex-shrink-0">
        {formatBytes(attachment.sizeBytes)}
      </span>
    </div>
  );
}

// ── Editable field controls (preview-panel-sized) ───────────────────────────
// Mirror Ticket Detail's EditableSidebarXxx components in ticket-detail-screen.tsx
// one-for-one (same value domains via PRIORITY_LABEL/STATUS_LABEL, same
// interaction model, same EDIT_BTN/INPUT_BASE/PencilIcon tokens) but without
// their SidebarField label wrapper, since this panel already renders its own
// FIELD_LABEL above each value in a two-column grid — reusing SidebarField
// here would add a second label plus its border/padding and change the
// panel's existing layout. Persistence itself is never duplicated: every
// control below only ever calls the single persistPatch() in
// TicketPreviewPanel, which is the one place that calls updateTicket().

function PreviewEditableTitle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => { onChange(draft.trim() || value); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={
          "w-full text-[16px] font-semibold text-slate-900 dark:text-zinc-50 leading-snug " +
          "bg-transparent border-0 border-b-2 border-brand-500 outline-none pb-0.5"
        }
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={onKey}
      />
    );
  }

  return (
    <div className="group flex items-start gap-0">
      <h2
        className="text-[16px] font-semibold text-slate-900 dark:text-zinc-50 leading-snug cursor-text"
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value}
      </h2>
      <button
        className={EDIT_BTN + " mt-0.5"}
        onClick={() => { setDraft(value); setEditing(true); }}
        aria-label="Edit title"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function PreviewPriorityControl({ value, onChange }: { value: TicketPriority; onChange: (v: TicketPriority) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref}
        className={INPUT_BASE + " py-0.5 text-[16px] sm:text-[12px]"}
        value={value}
        onChange={(e) => { onChange(e.target.value as TicketPriority); setEditing(false); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      >
        {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((k) => (
          <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="group flex items-center gap-1.5 cursor-pointer" onClick={() => setEditing(true)}>
      <PriorityBadge priority={value} />
      <button className={EDIT_BTN} aria-label="Edit priority"><PencilIcon /></button>
    </div>
  );
}

function PreviewAssigneeControl({
  value,
  assigneeProfileId,
  onChange,
  projectSlug,
  members,
}: {
  value: { name: string; avatar: string };
  /** Real profiles.id backing `value`, when known — passed straight through
   *  to the read-only MemberTrigger below so it opens the real profile
   *  instead of falling back to a name-based guess. */
  assigneeProfileId?: string | null;
  onChange: (v: { name: string; avatar: string }) => void;
  projectSlug?: string;
  members: OrgMember[];
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const handleChange = (name: string) => {
    if (name === "Unassigned") {
      onChange({ name: "Unassigned", avatar: FALLBACK_AVATAR });
      setEditing(false);
      return;
    }
    const member = members.find((m) => m.name === name);
    if (member) { onChange({ name: member.name, avatar: member.avatar }); setEditing(false); }
  };

  if (editing) {
    return (
      <select
        ref={ref}
        className={INPUT_BASE + " py-0.5 text-[16px] sm:text-[12px]"}
        value={value.name}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      >
        <option value="Unassigned">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.name}>{m.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="group flex items-center gap-1.5 min-w-0">
      <MemberTrigger
        name={value.name}
        avatar={value.avatar}
        profileId={assigneeProfileId ?? undefined}
        projectSlug={projectSlug}
        className="flex items-center gap-1.5 min-w-0"
      >
        <Avatar src={value.avatar} name={value.name} className="w-4 h-4 rounded-full flex-shrink-0" />
        <span className="truncate">{value.name}</span>
      </MemberTrigger>
      <button
        type="button"
        className={EDIT_BTN}
        aria-label="Edit assignee"
        onClick={() => setEditing(true)}
      >
        <PencilIcon />
      </button>
    </div>
  );
}

function PreviewHoursControl({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => {
    const n = parseInt(draft, 10);
    onChange(isNaN(n) || n < 0 ? undefined : n);
    setEditing(false);
  };
  const cancel = () => { setDraft(value?.toString() ?? ""); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={ref}
          type="number"
          min="0"
          step="1"
          className={INPUT_BASE + " w-20"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
        />
        <span className="text-[12px] text-slate-500 dark:text-zinc-400 flex-shrink-0">h</span>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-1.5 cursor-pointer"
      onClick={() => { setDraft(value?.toString() ?? ""); setEditing(true); }}
    >
      <span>{value !== undefined ? `${round1(value)} h` : "—"}</span>
      <button className={EDIT_BTN} aria-label="Edit hours"><PencilIcon /></button>
    </div>
  );
}

function PreviewDueDateControl({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? parseDisplayDate(value) : "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => { onChange(draft ? formatISODate(draft) : undefined); setEditing(false); };
  const cancel = () => { setDraft(value ? parseDisplayDate(value) : ""); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  const display = value ?? "—";

  if (editing) {
    return (
      <input
        ref={ref}
        type="date"
        className={INPUT_BASE}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={onKey}
      />
    );
  }

  return (
    <div
      className="group flex items-center gap-1 cursor-pointer"
      onClick={() => { setDraft(value ? parseDisplayDate(value) : ""); setEditing(true); }}
    >
      {value ? (
        <>
          <CalendarIcon />
          <span>{display}</span>
        </>
      ) : (
        <span className="text-slate-400 dark:text-zinc-600">{display}</span>
      )}
      <button className={EDIT_BTN} aria-label="Edit due date"><PencilIcon /></button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TicketPreviewPanel({
  ticket,
  slug,
  onClose,
  onBeforeNavigate,
  editable = false,
  isDevFallback = false,
  members = [],
  allLabels = [],
  onCreateLabel,
  onTicketUpdated,
  statuses,
}: {
  ticket: Ticket;
  slug: string;
  onClose: () => void;
  onBeforeNavigate?: () => void;
  /** This ticket's own project's real, ordered ticket_statuses (Fase 2) —
   *  the Status editor's options. Undefined falls back to
   *  FALLBACK_TICKET_STATUSES (identical to the old fixed list). */
  statuses?: TicketStatusOption[];
  /**
   * Enables inline editing of Title/Status/Priority/Assignee/Hours/Due Date/
   * Description — reusing the exact same updateTicket() action, value
   * domains, and (for Description) RichTextEditor component as Ticket
   * Detail's own inline edits (see persistPatch below and
   * EditableDescription in ticket-ui.tsx). Only screens with real backing
   * data (currently the Tickets board) pass this; every other caller omits
   * it and keeps the original read-only panel, unchanged.
   */
  editable?: boolean;
  isDevFallback?: boolean;
  /** Real organization members for the Assignee editor — no mock names. */
  members?: OrgMember[];
  /** Unused since Labels was removed from this compact preview — kept only
   *  so its many existing callers don't need updating just to stop passing
   *  it. */
  allLabels?: string[];
  onCreateLabel?: (name: string) => Promise<{ status: "success"; name: string } | { status: "error"; message: string }>;
  /** Called after every successful edit with the fresh ticket, so the caller can keep its own list/board state (and this panel) in sync without a page reload. */
  onTicketUpdated?: (ticket: Ticket) => void;
}) {
  // Panel open/close animation
  const [visible, setVisible] = useState(false);

  // Content cross-fade state when switching between tickets
  const [displayedTicket, setDisplayedTicket] = useState(ticket);
  const [contentFaded, setContentFaded] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entrance animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Cross-fade when a different ticket is selected while the panel is open
  useEffect(() => {
    if (ticket.id === displayedTicket.id) return;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: starts the fade-out the instant a different ticket is selected
    setContentFaded(true);
    fadeTimerRef.current = setTimeout(() => {
      setDisplayedTicket(ticket);
      setContentFaded(false);
      fadeTimerRef.current = null;
    }, 150);
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // ESC key to close — but not while an inline field edit is focused (an
  // <input>/<select> or the Description RichTextEditor's contentEditable
  // area). Those already own Escape themselves (cancel the local edit, or
  // no-op for Description, matching Ticket Detail's own editor there); this
  // must never also close the whole panel and discard whatever the user was
  // mid-typing along with it.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const isFieldEdit =
        target &&
        (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isFieldEdit) return;
      handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  // Real Comments/Attachments for the displayed ticket only — this panel has
  // no comment-creation or attachment-upload UI, both are read-only here.
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  // Real creator name/avatar for "Created by" — Ticket only ever carries a
  // bare createdByProfileId, never a resolved name/avatar (unlike assignee,
  // which the ticket loader already resolves server-side), so this is looked
  // up here the same way Comments/Attachments are.
  const [creator, setCreator] = useState<{ name: string; avatar: string } | null>(null);
  // Surfaces a failed inline edit (see persistPatch below) — previously only
  // logged to the console, with no indication the change didn't save.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTicketComments(displayedTicket.id).then((result) => {
      if (cancelled) return;
      setComments(result.status === "ready" ? result.comments : []);
    });
    loadTicketAttachments(displayedTicket.id).then((result) => {
      if (cancelled) return;
      setAttachments(result.status === "ready" ? result.attachments : []);
    });
    const creatorId = displayedTicket.createdByProfileId;
    (creatorId ? loadProfileSummary(creatorId) : Promise.resolve({ status: "not-found" as const })).then((result) => {
      if (cancelled) return;
      setCreator(result.status === "ready" ? { name: result.name, avatar: result.avatar } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [displayedTicket.id, displayedTicket.createdByProfileId]);

  const t = displayedTicket;

  // The single gateway every editable field below goes through — same
  // updateTicket() action Ticket Detail's own inline edits use (see
  // ticket-detail-screen.tsx's persist()). Local state only updates after a
  // confirmed success, so a failed edit never leaves an incorrect optimistic
  // value on screen — the field just keeps showing whatever was last
  // actually saved. applyLocally covers only the dev-fallback path (no real
  // ticket row to write to).
  // Returns whether the save actually succeeded — EditableDescription (a
  // Save/Cancel flow, unlike every other field here) needs this to know
  // whether to leave edit mode, the same contract ticket-detail-screen.tsx's
  // own persist() already gives it. Every other field below fires this
  // without awaiting the result, which remains valid: a plain unused Promise.
  function persistPatch(patch: UpdateTicketInput, applyLocally: (prev: Ticket) => Ticket): Promise<boolean> {
    if (isDevFallback) {
      setDisplayedTicket(applyLocally);
      return Promise.resolve(true);
    }
    return updateTicket(t.id, slug, patch).then((result) => {
      if (result.status === "error") {
        console.warn("[ticket-preview] failed to save change:", result.message);
        setErrorMessage(result.message);
        return false;
      }
      setDisplayedTicket(result.ticket);
      onTicketUpdated?.(result.ticket);
      return true;
    }).catch((err) => {
      console.warn("[ticket-preview] failed to save change:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return false;
    });
  }

  // Read-only here (this panel has no reply/edit/delete UI at all) — reuses
  // the exact same grouping Ticket Detail's own real comment threads use,
  // so a reply shows up correctly indented under its parent instead of as
  // an indistinguishable flat entry.
  function renderCommentRow(c: TicketComment) {
    return (
      <div key={c.id} className="flex items-start gap-2.5">
        <MemberTrigger
          name={c.name}
          avatar={c.avatar}
          profileId={c.authorProfileId ?? undefined}
          projectSlug={t.projectSlug}
          className="flex-shrink-0 mt-0.5 rounded-full"
        >
          <Avatar
            src={c.avatar}
            name={c.name}
            className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-white dark:ring-zinc-900"
          />
        </MemberTrigger>
        <div className="flex-1 min-w-0">
          {/* Author · timestamp on one line */}
          <p className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
            <MemberTrigger name={c.name} avatar={c.avatar} profileId={c.authorProfileId ?? undefined} projectSlug={t.projectSlug} className="hover:underline">
              {c.name}
            </MemberTrigger>
            <span className="ml-1.5 font-normal text-slate-400 dark:text-zinc-600">
              · {c.timeAgo}
            </span>
          </p>
          <RichTextViewer
            content={c.text}
            className="text-[12px] text-slate-600 dark:text-zinc-400 mt-1"
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={[
          "fixed inset-0 z-40 bg-black/20 dark:bg-black/40",
          "transition-opacity duration-[250ms]",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Ticket preview: ${getTicketDisplayKey(t)}`}
        className={[
          "fixed inset-y-0 right-0 z-50",
          "w-[520px] max-w-[calc(100vw-3rem)]",
          "flex flex-col",
          "bg-white dark:bg-zinc-950",
          "border-l border-slate-200 dark:border-zinc-800",
          "shadow-2xl shadow-black/10 dark:shadow-black/50",
          "transition-transform duration-[250ms] ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* ── Header (always visible, updates immediately) ─────────────────── */}
        <div className="flex-shrink-0 px-5 pt-4 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-widest text-slate-400 dark:text-zinc-500">
              <TicketTypeIcon type={t.type} />
              {getTicketDisplayKey(t)}
            </span>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close preview"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {editable ? (
            <PreviewEditableTitle
              value={t.title}
              onChange={(v) => persistPatch({ title: v }, (prev) => ({ ...prev, title: v }))}
            />
          ) : (
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-zinc-50 leading-snug">
              {t.title}
            </h2>
          )}

          {/* Status badge directly below the title */}
          <div className="mt-2.5">
            {editable ? (
              <EditableStatusBadge
                value={t.status}
                statusId={t.statusId}
                label={t.statusName}
                statuses={statuses}
                onChange={(option) =>
                  persistPatch({ statusId: option.id }, (prev) => ({
                    ...prev,
                    status: option.legacyEnumValue ? STATUS_FROM_DB[option.legacyEnumValue] ?? prev.status : prev.status,
                    statusId: option.id,
                    statusName: option.name,
                    statusGroupType: option.groupType,
                  }))
                }
              />
            ) : (
              <StatusBadge status={t.status} label={t.statusName} />
            )}
          </div>
        </div>

        {/* ── Scrollable body (cross-fades when ticket changes) ─────────────── */}
        <div
          className={[
            "flex-1 overflow-y-auto",
            "transition-opacity duration-[150ms]",
            contentFaded ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          {/* ── Main info section ───────────────────────────────────────────────
              Row 1 (always 3 columns): Assignee / Created by / Priority.
              Row 2: Due Date / Hours, each only when the ticket actually has
              one — omitted entirely when neither exists, and down to a single
              full-width column (never a blank slot) when only one does. */}
          <div className="px-5 pt-4 pb-5 space-y-4">

            <div className="grid grid-cols-3 gap-x-6 gap-y-4">

              <div className="min-w-0">
                <p className={FIELD_LABEL}>Assignee</p>
                <div className={FIELD_VALUE}>
                  {editable ? (
                    <PreviewAssigneeControl
                      value={t.assignee}
                      assigneeProfileId={t.assigneeProfileId}
                      projectSlug={t.projectSlug}
                      members={members}
                      onChange={(v) => {
                        const member = members.find((m) => m.name === v.name);
                        persistPatch(
                          { assigneeProfileId: member ? member.id : null },
                          (prev) => ({ ...prev, assignee: v })
                        );
                      }}
                    />
                  ) : (
                    <MemberTrigger
                      name={t.assignee.name}
                      avatar={t.assignee.avatar}
                      profileId={t.assigneeProfileId ?? undefined}
                      projectSlug={t.projectSlug}
                      className="flex items-center gap-1.5 min-w-0"
                    >
                      <Avatar src={t.assignee.avatar} name={t.assignee.name} className="w-4 h-4 rounded-full flex-shrink-0" />
                      <span className="truncate">{t.assignee.name}</span>
                    </MemberTrigger>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <p className={FIELD_LABEL}>Created by</p>
                <div className={FIELD_VALUE}>
                  {creator ? (
                    <MemberTrigger
                      name={creator.name}
                      avatar={creator.avatar}
                      profileId={t.createdByProfileId ?? undefined}
                      projectSlug={t.projectSlug}
                      className="flex items-center gap-1.5 min-w-0"
                    >
                      <Avatar src={creator.avatar} name={creator.name} className="w-4 h-4 rounded-full flex-shrink-0" />
                      <span className="truncate">{creator.name}</span>
                    </MemberTrigger>
                  ) : (
                    <span className="text-slate-400 dark:text-zinc-600">—</span>
                  )}
                </div>
              </div>

              <div>
                <p className={FIELD_LABEL}>Priority</p>
                <div className={FIELD_VALUE}>
                  {editable ? (
                    <PreviewPriorityControl
                      value={t.priority}
                      onChange={(v) => persistPatch({ priority: v }, (prev) => ({ ...prev, priority: v }))}
                    />
                  ) : (
                    <PriorityBadge priority={t.priority} />
                  )}
                </div>
              </div>

            </div>

            {(t.dueDate || t.hours !== undefined) && (
              <div
                className={`grid gap-x-6 gap-y-4 ${
                  t.dueDate && t.hours !== undefined ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {t.dueDate && (
                  <div>
                    <p className={FIELD_LABEL}>Due date</p>
                    <div className={FIELD_VALUE}>
                      {editable ? (
                        <PreviewDueDateControl
                          value={t.dueDate}
                          onChange={(v) => persistPatch(
                            { dueDate: v ? parseDisplayDate(v) : null },
                            (prev) => ({ ...prev, dueDate: v })
                          )}
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <CalendarIcon />
                          {t.dueDate}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {t.hours !== undefined && (
                  <div>
                    <p className={FIELD_LABEL}>Hours</p>
                    <div className={FIELD_VALUE}>
                      {editable ? (
                        <PreviewHoursControl
                          value={t.hours}
                          onChange={(v) => persistPatch({ hours: v ?? null }, (prev) => ({ ...prev, hours: v }))}
                        />
                      ) : (
                        <p>{round1(t.hours)} h</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Description ──────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-2.5`}>Description</p>
            {editable ? (
              <EditableDescription
                value={t.description}
                onSave={(v) => persistPatch({ description: v }, (prev) => ({ ...prev, description: v }))}
                viewerClassName="text-[13px] text-slate-700 dark:text-zinc-300"
                emptyClassName="text-[13px] text-slate-400 dark:text-zinc-600 italic leading-relaxed"
                editorContentClassName="sm:text-[13px]"
              />
            ) : (
              <RichTextViewer content={t.description} className="text-[13px] text-slate-700 dark:text-zinc-300" />
            )}
          </div>

          {/* ── Acceptance Criteria ──────────────────────────────────────────── */}
          {t.acceptanceCriteria !== undefined && t.acceptanceCriteria.length > 0 && (
            <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
              <p className={`${FIELD_LABEL} mb-2.5`}>Acceptance Criteria</p>
              <ul className="space-y-1.5">
                {t.acceptanceCriteria.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-zinc-600 flex-shrink-0 mt-[7px]" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Attachments ──────────────────────────────────────────────────── */}
          {attachments.length > 0 && (
            <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
              <p className={`${FIELD_LABEL} mb-3`}>Attachments</p>
              <div className="space-y-2">
                {attachments.map((a) =>
                  isPreviewableImage(a) ? (
                    <PreviewAttachmentImageRow key={a.id} attachment={a} />
                  ) : (
                    <PreviewAttachmentFileRow key={a.id} attachment={a} />
                  )
                )}
              </div>
            </div>
          )}

          {/* ── Comments ─────────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-6 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-3`}>
              Comments
              {t.commentCount !== undefined && t.commentCount > 2 && (
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-400 dark:text-zinc-600">
                  · {t.commentCount} total
                </span>
              )}
            </p>

            {comments.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-zinc-600">No comments yet.</p>
            ) : (
            <div className="space-y-4">
              {groupCommentThreads(comments).map(({ parent, replies }) => (
                <div key={parent.id}>
                  {renderCommentRow(parent)}
                  {replies.length > 0 && (
                    <div className="mt-3 space-y-3 pl-5 ml-3 border-l-2 border-slate-100 dark:border-zinc-800/80">
                      {replies.map((r) => renderCommentRow(r))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {/* ── Footer: always visible, outside scroll container ─────────────── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <Link
            href={`/projects/${slug}/tickets/${getTicketDisplayKey(ticket)}`}
            onClick={onBeforeNavigate}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white text-sm font-semibold shadow-sm shadow-brand-600/20 dark:shadow-brand-500/20 transition-colors"
          >
            Expand
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M3 8h18M3 16h18" />
            </svg>
          </Link>
        </div>
      </aside>

      {errorMessage && <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />}
    </>
  );
}
