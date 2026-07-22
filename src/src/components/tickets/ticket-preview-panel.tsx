"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { Ticket, TicketPriority } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import {
  StatusBadge,
  PriorityBadge,
  LabelTag,
  TicketTypeIcon,
  EditableStatusBadge,
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
  loadTicketActivity,
  updateTicket,
  type TicketComment,
  type TicketActivityEvent,
  type UpdateTicketInput,
} from "@/lib/tickets";
import { MemberTrigger } from "@/components/member-profile";
import { FALLBACK_AVATAR } from "@/lib/current-user";
import type { OrgMember } from "@/lib/projects";

const FIELD_LABEL = "text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1";
const FIELD_VALUE = "text-[12px] font-medium text-slate-800 dark:text-zinc-200";

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
        className={INPUT_BASE + " py-0.5 text-[12px]"}
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
  onChange,
  projectSlug,
  members,
}: {
  value: { name: string; avatar: string };
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
        className={INPUT_BASE + " py-0.5 text-[12px]"}
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
        projectSlug={projectSlug}
        className="flex items-center gap-1.5 min-w-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value.avatar} alt={value.name} className="w-4 h-4 rounded-full flex-shrink-0" />
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
      <span>{value !== undefined ? `${value} h` : "—"}</span>
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

function PreviewLabelsControl({
  value,
  onChange,
  allLabels,
  onCreateLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  allLabels: string[];
  onCreateLabel?: (name: string) => Promise<{ status: "success"; name: string } | { status: "error"; message: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = (label: string) => {
    setDraft((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  const resetPicker = () => { setSearch(""); setCreateError(null); };
  const save = () => { onChange(draft); setEditing(false); resetPicker(); };
  const cancel = () => { setDraft(value); setEditing(false); resetPicker(); };

  useEffect(() => {
    if (!editing) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) save();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft]);

  const trimmedSearch = search.trim();
  const filteredLabels = trimmedSearch
    ? allLabels.filter((l) => l.toLowerCase().includes(trimmedSearch.toLowerCase()))
    : allLabels;
  const exactMatch = allLabels.some((l) => l.toLowerCase() === trimmedSearch.toLowerCase());
  const showCreateOption = Boolean(onCreateLabel) && trimmedSearch.length > 0 && trimmedSearch.length <= 40 && !exactMatch;

  const handleCreate = async () => {
    if (!showCreateOption || !onCreateLabel || creating) return;
    setCreating(true);
    setCreateError(null);
    const result = await onCreateLabel(trimmedSearch);
    setCreating(false);
    if (result.status === "error") {
      setCreateError(result.message);
      return;
    }
    setDraft((prev) => (prev.includes(result.name) ? prev : [...prev, result.name]));
    setSearch("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter") {
      if (showCreateOption) {
        e.preventDefault();
        handleCreate();
      } else {
        save();
      }
    }
  };

  return (
    <div ref={containerRef}>
      {editing ? (
        <div onKeyDown={onKeyDown} tabIndex={-1} className="outline-none">
          <div className="flex items-center gap-1.5 px-2 py-1 mb-2 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
            <svg className="w-3 h-3 text-slate-400 dark:text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search or create…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCreateError(null); }}
              className="flex-1 min-w-0 bg-transparent text-[12px] text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-600"
            />
          </div>

          <div className="flex flex-wrap gap-1 mb-2">
            {filteredLabels.map((label) => {
              const active = draft.includes(label);
              return (
                <button
                  key={label}
                  onClick={() => toggle(label)}
                  className={
                    `px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ` +
                    (active
                      ? "bg-brand-500 text-white dark:bg-brand-600"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700")
                  }
                >
                  {label}
                </button>
              );
            })}
            {showCreateOption && (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-dashed border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                {creating ? "Creating…" : `➕ Create "${trimmedSearch}"`}
              </button>
            )}
          </div>

          {createError && (
            <p className="text-[10px] text-red-600 dark:text-red-400 mb-2">{createError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={save}
              className="text-[10px] font-medium text-brand-600 dark:text-brand-500 hover:underline"
            >
              Done
            </button>
            <button
              onClick={cancel}
              className="text-[10px] font-medium text-slate-400 dark:text-zinc-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="group flex items-start gap-1.5 cursor-pointer"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          <div className="flex flex-wrap gap-1 mt-0.5 flex-1">
            {value.length > 0
              ? value.map((l) => <LabelTag key={l} label={l} />)
              : <span className="text-slate-400 dark:text-zinc-600">None</span>}
          </div>
          <button className={EDIT_BTN + " mt-0.5"} aria-label="Edit labels"><PencilIcon /></button>
        </div>
      )}
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
}: {
  ticket: Ticket;
  slug: string;
  onClose: () => void;
  onBeforeNavigate?: () => void;
  /**
   * Enables inline editing of Title/Status/Priority/Assignee/Hours/Due Date/
   * Labels — reusing the exact same updateTicket() action and value domains
   * as Ticket Detail's own inline edits (see persistPatch below). Only
   * screens with real backing data (currently the Tickets board) pass this;
   * every other caller omits it and keeps the original read-only panel,
   * unchanged.
   */
  editable?: boolean;
  isDevFallback?: boolean;
  /** Real organization members for the Assignee editor — no mock names. */
  members?: OrgMember[];
  /** Real per-org label catalog (merged with the static seed list by the caller via buildLabelCatalog) for the Labels editor. */
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

  // ESC key to close
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  // Real Comments/Activity for the displayed ticket only — this panel has no
  // comment-creation UI, but edits made here (when editable) do generate
  // real Activity Log rows, refetched by persistPatch below after each save.
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activity, setActivity] = useState<TicketActivityEvent[]>([]);
  // Surfaces a failed inline edit (see persistPatch below) — previously only
  // logged to the console, with no indication the change didn't save.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTicketComments(displayedTicket.id).then((result) => {
      if (cancelled) return;
      setComments(result.status === "ready" ? result.comments : []);
    });
    loadTicketActivity(displayedTicket.id).then((result) => {
      if (cancelled) return;
      setActivity(result.status === "ready" ? result.events : []);
    });
    return () => {
      cancelled = true;
    };
  }, [displayedTicket.id]);

  const t = displayedTicket;

  // The single gateway every editable field below goes through — same
  // updateTicket() action Ticket Detail's own inline edits use (see
  // ticket-detail-screen.tsx's persist()). A real trigger already logs the
  // Activity Log row as part of the same update (20260728000000), so this
  // only needs to refetch it, never invent a local entry. Local state only
  // updates after a confirmed success, so a failed edit never leaves an
  // incorrect optimistic value on screen — the field just keeps showing
  // whatever was last actually saved. applyLocally covers only the
  // dev-fallback path (no real ticket row to write to).
  function persistPatch(patch: UpdateTicketInput, applyLocally: (prev: Ticket) => Ticket) {
    if (isDevFallback) {
      setDisplayedTicket(applyLocally);
      return;
    }
    updateTicket(t.id, slug, patch).then((result) => {
      if (result.status === "error") {
        console.warn("[ticket-preview] failed to save change:", result.message);
        setErrorMessage(result.message);
        return;
      }
      setDisplayedTicket(result.ticket);
      onTicketUpdated?.(result.ticket);
      loadTicketActivity(result.ticket.id).then((r) => {
        if (r.status === "ready") setActivity(r.events);
      });
    }).catch((err) => {
      console.warn("[ticket-preview] failed to save change:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    });
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
                onChange={(v) => persistPatch({ status: v }, (prev) => ({ ...prev, status: v }))}
              />
            ) : (
              <StatusBadge status={t.status} />
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
          {/* ── Compact two-column metadata grid ────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 grid grid-cols-2 gap-x-6 gap-y-4">

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

            <div className="min-w-0">
              <p className={FIELD_LABEL}>Assignee</p>
              <div className={FIELD_VALUE}>
                {editable ? (
                  <PreviewAssigneeControl
                    value={t.assignee}
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
                    projectSlug={t.projectSlug}
                    className="flex items-center gap-1.5 min-w-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.assignee.avatar}
                      alt={t.assignee.name}
                      className="w-4 h-4 rounded-full flex-shrink-0"
                    />
                    <span className="truncate">{t.assignee.name}</span>
                  </MemberTrigger>
                )}
              </div>
            </div>

            {/* Estimated Hours — always visible when set (fixed product
                rule; unchanged from before showTicketEstimates existed). */}
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
                    <p>{t.hours} h</p>
                  )}
                </div>
              </div>
            )}

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

            {t.labels.length > 0 && (
              <div>
                <p className={FIELD_LABEL}>Labels</p>
                {editable ? (
                  <PreviewLabelsControl
                    value={t.labels}
                    allLabels={allLabels}
                    onCreateLabel={onCreateLabel}
                    onChange={(v) => persistPatch({ labels: v }, (prev) => ({ ...prev, labels: v }))}
                  />
                ) : (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {t.labels.map((l) => (
                      <span
                        key={l}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-medium text-slate-600 dark:text-zinc-400"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Description ──────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-2.5`}>Description</p>
            <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
              {t.description}
            </p>
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

          {/* ── Comments ─────────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-3`}>
              Comments
              {t.commentCount !== undefined && t.commentCount > 2 && (
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                  · {t.commentCount} total
                </span>
              )}
            </p>

            {comments.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-zinc-600">No comments yet.</p>
            ) : (
            <div className="space-y-4">
              {comments.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <MemberTrigger
                    name={c.name}
                    avatar={c.avatar}
                    projectSlug={t.projectSlug}
                    className="flex-shrink-0 mt-0.5 rounded-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-white dark:ring-zinc-900"
                    />
                  </MemberTrigger>
                  <div className="flex-1 min-w-0">
                    {/* Author · timestamp on one line */}
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
                      <MemberTrigger name={c.name} avatar={c.avatar} projectSlug={t.projectSlug} className="hover:underline">
                        {c.name}
                      </MemberTrigger>
                      <span className="ml-1.5 font-normal text-slate-400 dark:text-zinc-600">
                        · {c.timeAgo}
                      </span>
                    </p>
                    <p className="text-[12px] text-slate-600 dark:text-zinc-400 leading-relaxed mt-1">
                      {c.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>

          {/* ── Activity (vertical timeline) ─────────────────────────────────── */}
          <div className="px-5 pt-4 pb-6 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-3`}>Activity</p>

            {activity.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-zinc-600">No activity yet.</p>
            ) : (
            <div>
              {activity.map((a, i) => {
                const isLast = i === activity.length - 1;
                return (
                  <div key={i} className="flex gap-3">
                    {/* Timeline track: dot + connecting line */}
                    <div className="flex flex-col items-center w-4 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ring-white dark:ring-zinc-950" />
                      {!isLast && (
                        <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[16px]" />
                      )}
                    </div>

                    {/* Event label + timestamp */}
                    <div className={`flex-1 min-w-0 ${isLast ? "pb-1" : "pb-3.5"}`}>
                      <p className="text-[12px] text-slate-700 dark:text-zinc-300 leading-snug">
                        {a.label}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">
                        {a.timeAgo}
                      </p>
                    </div>
                  </div>
                );
              })}
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
