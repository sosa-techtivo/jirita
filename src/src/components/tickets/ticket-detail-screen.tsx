"use client";

import { useState, useRef, useEffect, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Ticket, TicketStatus, TicketPriority, TicketType } from "@/lib/mock-tickets";
import { tickets as ALL_TICKETS, getTicketDisplayKey } from "@/lib/mock-tickets";
import {
  StatusBadge,
  PriorityBadge,
  LabelTag,
  TicketTypeIcon,
  TicketTypeSelect,
  STATUS_LABEL,
  PRIORITY_LABEL,
  buildLabelCatalog,
  EDIT_BTN,
  INPUT_BASE,
  PencilIcon,
  CalendarIcon,
  parseDisplayDate,
  formatISODate,
  getTodayISO,
  EditableStatusBadge,
  ErrorToast,
} from "@/components/tickets/ticket-ui";
import { BackToTicketsButton } from "@/components/tickets/back-to-tickets-button";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { getRegisteredTicketByCode } from "@/lib/pending-tickets";
import {
  loadTicketByCode,
  loadTicketComments,
  loadTicketActivity,
  createTicketComment,
  updateTicket,
  loadOrganizationLabels,
  createOrganizationLabel,
  loadTicketAttachments,
  uploadTicketAttachment,
  downloadTicketAttachment,
  getTicketAttachmentPreviewUrl,
  renameTicketAttachment,
  deleteTicketAttachment,
  loadTicketTimeEntries,
  logTicketTime,
  loadProjectTickets,
  loadTicketRelations,
  createTicketRelation,
  deleteTicketRelation,
  type TicketComment,
  type TicketActivityEvent,
  type UpdateTicketInput,
  type TicketAttachment,
  type TimeEntryRecord,
  type LogTimeInput,
  type RelatedTicket,
  type TicketRelationKind,
} from "@/lib/tickets";
import { loadOrganizationMembers, type OrgMember } from "@/lib/projects";
import { FALLBACK_AVATAR } from "@/lib/current-user";
import { MemberTrigger } from "@/components/member-profile";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";

// ── Constants ─────────────────────────────────────────────────────────────────

const MILESTONES = ["App Store Submission", "Beta Release", "Security Audit"];

// Attachments data lives inside AttachmentsSection state (see below)

// ── Shared style tokens ───────────────────────────────────────────────────────

const SECTION_LABEL =
  "text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600";

// ── Sidebar layout ────────────────────────────────────────────────────────────

function SidebarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3.5 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5">
        {label}
      </p>
      <div className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">{children}</div>
    </div>
  );
}

// ── Editable: Title ───────────────────────────────────────────────────────────

function EditableTitle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
          "w-full text-[22px] font-bold text-slate-900 dark:text-zinc-50 leading-snug tracking-tight " +
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
      <h1
        className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 leading-snug tracking-tight cursor-text"
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value}
      </h1>
      <button
        className={EDIT_BTN + " mt-1"}
        onClick={() => { setDraft(value); setEditing(true); }}
        aria-label="Edit title"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

// ── Editable: Description ─────────────────────────────────────────────────────

function EditableDescription({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [editing]);

  const save = () => { onChange(draft.trim() || value); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };
  const autoResize = () => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        className={
          "w-full text-[14px] text-slate-700 dark:text-zinc-300 leading-relaxed " +
          "bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 " +
          "rounded-lg px-3 py-2.5 outline-none resize-none overflow-hidden " +
          "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
        }
        value={draft}
        onChange={(e) => { setDraft(e.target.value); autoResize(); }}
        onBlur={save}
        onKeyDown={onKey}
      />
    );
  }

  return (
    <div
      className="group relative cursor-text"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      <p className="text-[14px] text-slate-700 dark:text-zinc-300 leading-relaxed">{value}</p>
      <button
        className={EDIT_BTN + " absolute -top-0.5 -right-5"}
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        aria-label="Edit description"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

// ── Editable: Sidebar Status ──────────────────────────────────────────────────

function EditableSidebarStatus({ value, onChange }: { value: TicketStatus; onChange: (v: TicketStatus) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  return (
    <SidebarField label="Status">
      {editing ? (
        <select
          ref={ref}
          className={INPUT_BASE + " py-0.5 text-[12px]"}
          value={value}
          onChange={(e) => { onChange(e.target.value as TicketStatus); setEditing(false); }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        >
          {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((k) => (
            <option key={k} value={k}>{STATUS_LABEL[k]}</option>
          ))}
        </select>
      ) : (
        <div className="group flex items-center gap-1.5 cursor-pointer" onClick={() => setEditing(true)}>
          <StatusBadge status={value} />
          <button className={EDIT_BTN} aria-label="Edit status"><PencilIcon /></button>
        </div>
      )}
    </SidebarField>
  );
}

// ── Editable: Sidebar Priority ────────────────────────────────────────────────

function EditableSidebarPriority({ value, onChange }: { value: TicketPriority; onChange: (v: TicketPriority) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  return (
    <SidebarField label="Priority">
      {editing ? (
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
      ) : (
        <div className="group flex items-center gap-1.5 cursor-pointer" onClick={() => setEditing(true)}>
          <PriorityBadge priority={value} />
          <button className={EDIT_BTN} aria-label="Edit priority"><PencilIcon /></button>
        </div>
      )}
    </SidebarField>
  );
}

function EditableSidebarType({ value, onChange }: { value: TicketType; onChange: (v: TicketType) => void }) {
  return (
    <SidebarField label="Type">
      <TicketTypeSelect
        value={value}
        onChange={onChange}
        buttonClassName="group inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-zinc-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
      />
    </SidebarField>
  );
}

// ── Editable: Sidebar Assignee ────────────────────────────────────────────────

function EditableSidebarAssignee({
  value,
  onChange,
  projectSlug,
  members,
}: {
  value: { name: string; avatar: string };
  onChange: (v: { name: string; avatar: string }) => void;
  projectSlug?: string;
  /** Real organization members only — no mock names. */
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

  return (
    <SidebarField label="Assignee">
      {editing ? (
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
      ) : (
        <div className="group flex items-center gap-1.5">
          <MemberTrigger
            name={value.name}
            avatar={value.avatar}
            projectSlug={projectSlug}
            className="flex items-center gap-1.5 min-w-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value.avatar} alt={value.name} className="w-5 h-5 rounded-full flex-shrink-0" />
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
      )}
    </SidebarField>
  );
}

// ── Editable: Sidebar Milestone ───────────────────────────────────────────────

function EditableSidebarMilestone({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  return (
    <SidebarField label="Milestone">
      {editing ? (
        <select
          ref={ref}
          className={INPUT_BASE + " py-0.5 text-[12px]"}
          value={value}
          onChange={(e) => { onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        >
          {MILESTONES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      ) : (
        <div className="group flex items-center gap-1.5 cursor-pointer" onClick={() => setEditing(true)}>
          <span className="truncate">{value}</span>
          <button className={EDIT_BTN} aria-label="Edit milestone"><PencilIcon /></button>
        </div>
      )}
    </SidebarField>
  );
}

// ── Editable: Sidebar Story Points ────────────────────────────────────────────

function EditableSidebarStoryPoints({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => {
    const n = parseInt(draft, 10);
    onChange(isNaN(n) ? undefined : Math.max(0, n));
    setEditing(false);
  };
  const cancel = () => { setDraft(value?.toString() ?? ""); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  return (
    <SidebarField label="Story points">
      {editing ? (
        <input
          ref={ref}
          type="number"
          min="0"
          className={INPUT_BASE + " w-24"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
        />
      ) : (
        <div
          className="group flex items-center gap-1.5 cursor-pointer"
          onClick={() => { setDraft(value?.toString() ?? ""); setEditing(true); }}
        >
          <span>{value !== undefined ? `${value} pts` : "—"}</span>
          <button className={EDIT_BTN} aria-label="Edit story points"><PencilIcon /></button>
        </div>
      )}
    </SidebarField>
  );
}

// ── Editable: Sidebar Hours ───────────────────────────────────────────────────

function EditableSidebarHours({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
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

  return (
    <SidebarField label="Estimated">
      {editing ? (
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
      ) : (
        <div
          className="group flex items-center gap-1.5 cursor-pointer"
          onClick={() => { setDraft(value?.toString() ?? ""); setEditing(true); }}
        >
          <span>{value !== undefined ? `${value} h` : "—"}</span>
          <button className={EDIT_BTN} aria-label="Edit hours"><PencilIcon /></button>
        </div>
      )}
    </SidebarField>
  );
}

// ── Editable: Sidebar Due Date ────────────────────────────────────────────────

function EditableSidebarDueDate({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? parseDisplayDate(value) : "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const save = () => {
    onChange(draft ? formatISODate(draft) : undefined);
    setEditing(false);
  };
  const cancel = () => { setDraft(value ? parseDisplayDate(value) : ""); setEditing(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") cancel();
  };

  const display = value ?? "—";

  return (
    <SidebarField label="Due date">
      {editing ? (
        <input
          ref={ref}
          type="date"
          className={INPUT_BASE}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
        />
      ) : (
        <div
          className="group flex items-center gap-1.5 cursor-pointer"
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
      )}
    </SidebarField>
  );
}

// ── Editable: Sidebar Labels ──────────────────────────────────────────────────

function EditableSidebarLabels({
  value,
  onChange,
  allLabels,
  onCreateLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  /** Static seed categories merged with the real, growing per-org catalog. */
  allLabels: string[];
  onCreateLabel: (name: string) => Promise<{ status: "success"; name: string } | { status: "error"; message: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = (label: string) => {
    setDraft((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const resetPicker = () => { setSearch(""); setCreateError(null); };
  const save = () => { onChange(draft); setEditing(false); resetPicker(); };
  const cancel = () => { setDraft(value); setEditing(false); resetPicker(); };

  // Close on outside click
  useEffect(() => {
    if (!editing) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        save();
      }
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
  const showCreateOption = trimmedSearch.length > 0 && trimmedSearch.length <= 40 && !exactMatch;

  const handleCreate = async () => {
    if (!showCreateOption || creating) return;
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
    <SidebarField label="Labels">
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
    </SidebarField>
  );
}

// ── Related Tickets ───────────────────────────────────────────────────────────

const RELATION_LABEL: Record<TicketRelationKind, string> = {
  "related-to":    "Related to",
  "blocks":        "Blocks",
  "blocked-by":    "Blocked by",
  "duplicates":    "Duplicates",
  "duplicated-by": "Duplicated by",
};

const RELATION_KIND_ORDER: TicketRelationKind[] = ["blocks", "blocked-by", "duplicates", "duplicated-by", "related-to"];

function RelatedTicketCard({
  ticket,
  onOpen,
  onRemove,
}: {
  ticket: Ticket;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className={
          "w-full text-left px-2.5 py-2 rounded-lg transition-colors " +
          "bg-slate-50 dark:bg-zinc-900/50 hover:bg-slate-100 dark:hover:bg-zinc-800/60 " +
          "border border-slate-100 dark:border-zinc-800"
        }
      >
        <div className="flex items-center gap-1 mb-1 pr-3">
          <TicketTypeIcon type={ticket.type} className="w-2.5 h-2.5" />
          <span className="font-mono text-[9px] font-semibold text-slate-400 dark:text-zinc-600 flex-shrink-0">
            {getTicketDisplayKey(ticket)}
          </span>
          <div className="flex-shrink-0">
            <StatusBadge status={ticket.status} />
          </div>
          {(ticket.priority === "highest" || ticket.priority === "high") && (
            <span
              className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-rose-400 dark:bg-rose-500"
              title="High priority"
            />
          )}
          <MemberTrigger
            name={ticket.assignee.name}
            avatar={ticket.assignee.avatar}
            projectSlug={ticket.projectSlug}
            nested
            className="ml-auto flex-shrink-0 rounded-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ticket.assignee.avatar}
              alt={ticket.assignee.name}
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
            />
          </MemberTrigger>
        </div>
        <p className="text-[11px] text-slate-700 dark:text-zinc-300 leading-snug line-clamp-2 pr-2">
          {ticket.title}
        </p>
      </button>
      <button
        onClick={onRemove}
        className={
          "absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 " +
          "w-3.5 h-3.5 flex items-center justify-center rounded " +
          "text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 " +
          "hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all"
        }
        aria-label="Remove link"
      >
        <svg className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function RelatedTicketsSection({
  ticketId,
  slug,
  onChanged,
  onError,
}: {
  ticketId: string;
  slug: string;
  /** Called after a successful add/remove — a database trigger already
   *  logged the real Activity Log rows as part of the same write; this just
   *  tells the parent to refetch it (same pattern as AttachmentsSection's
   *  onUploaded / TimeTrackingSection's onLogged). */
  onChanged: () => void;
  /** Called when removing a link fails — surfaced via the shared error toast.
   *  Adding a link has its own inline error (linkError) inside the picker, but
   *  a remove can happen while the picker is closed, so it needs this instead. */
  onError: (message: string) => void;
}) {
  const { organization, isDevFallback } = useCurrentUser();

  const [relations, setRelations]     = useState<RelatedTicket[]>([]);
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const [linking, setLinking]         = useState(false);
  const [linkKind, setLinkKind]       = useState<TicketRelationKind>("related-to");
  const [searchQuery, setSearchQuery] = useState("");
  // All of this project's tickets, loaded once when the link picker first
  // opens — the same loader Tickets' own list views use, reused here rather
  // than a separate search endpoint, and filtered client-side below.
  const [projectTickets, setProjectTickets] = useState<Ticket[] | null>(null);
  const [linkError, setLinkError]     = useState<string | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadRelations = () => {
    if (isDevFallback) return;
    loadTicketRelations(ticketId, slug).then((result) => {
      if (result.status === "ready") setRelations(result.relations);
    });
  };

  useEffect(() => {
    loadRelations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, isDevFallback]);

  useEffect(() => {
    if (!linking) return;
    const handle = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setLinking(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [linking]);

  useEffect(() => {
    if (linking) searchRef.current?.focus();
  }, [linking]);

  useEffect(() => {
    if (!linking || isDevFallback || !organization || projectTickets !== null) return;
    loadProjectTickets(organization.id, slug).then((result) => {
      if (result.status === "ready") setProjectTickets(result.tickets);
    });
  }, [linking, isDevFallback, organization, slug, projectTickets]);

  const linkedTicketIds = new Set(relations.map((r) => r.ticket.id));
  const query = searchQuery.trim().toLowerCase();
  const searchResults = (projectTickets ?? []).filter((t) => {
    if (t.id === ticketId || linkedTicketIds.has(t.id)) return false;
    if (!query) return true;
    return t.title.toLowerCase().includes(query) || getTicketDisplayKey(t).toLowerCase().includes(query);
  });

  const addLink = (otherTicketId: string) => {
    if (isDevFallback) return;
    setLinkError(null);
    createTicketRelation(ticketId, otherTicketId, linkKind).then((result) => {
      if (result.status === "error") {
        setLinkError(result.message);
        return;
      }
      setLinking(false);
      setSearchQuery("");
      loadRelations();
      onChanged();
    }).catch((err) => {
      setLinkError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    });
  };

  const removeLink = (linkId: string) => {
    if (isDevFallback) return;
    deleteTicketRelation(linkId).then((result) => {
      if (result.status === "error") {
        console.warn("[ticket-detail] failed to remove related ticket:", result.message);
        onError(result.message);
        return;
      }
      loadRelations();
      onChanged();
    }).catch((err) => {
      console.warn("[ticket-detail] failed to remove related ticket:", err);
      onError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    });
  };

  const grouped = RELATION_KIND_ORDER
    .map((kind) => ({ kind, items: relations.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="py-3.5 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
          Related Tickets
        </p>
        <button
          onClick={() => { setLinking((v) => !v); setLinkError(null); }}
          className="text-[10px] font-semibold text-brand-600 dark:text-brand-500 hover:text-brand-700 dark:hover:text-brand-400 transition-colors leading-none"
        >
          + Link
        </button>
      </div>

      {/* Link selector */}
      {linking && (
        <div
          ref={selectorRef}
          className="mb-3 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm"
        >
          <div className="flex items-stretch border-b border-slate-100 dark:border-zinc-800">
            <select
              value={linkKind}
              onChange={(e) => setLinkKind(e.target.value as TicketRelationKind)}
              className="text-[10px] font-medium bg-slate-50 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400 border-r border-slate-100 dark:border-zinc-800 px-1.5 outline-none flex-shrink-0 cursor-pointer"
            >
              {(Object.keys(RELATION_LABEL) as TicketRelationKind[]).map((k) => (
                <option key={k} value={k}>{RELATION_LABEL[k]}</option>
              ))}
            </select>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-0 text-[11px] px-2 py-1.5 outline-none bg-transparent text-slate-700 dark:text-zinc-300 placeholder:text-slate-300 dark:placeholder:text-zinc-700"
              onKeyDown={(e) => {
                if (e.key === "Escape") { setLinking(false); setSearchQuery(""); }
              }}
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {searchResults.length === 0 ? (
              <p className="px-2.5 py-2 text-[11px] text-slate-400 dark:text-zinc-600">
                {projectTickets === null ? "Loading…" : searchQuery ? "No results" : "No more tickets to link"}
              </p>
            ) : (
              searchResults.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => addLink(t.id)}
                  className="w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-slate-50 dark:border-zinc-800/30 last:border-0"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <TicketTypeIcon type={t.type} className="w-2.5 h-2.5" />
                    <span className="font-mono text-[9px] font-semibold text-slate-400 dark:text-zinc-600 flex-shrink-0">
                      {getTicketDisplayKey(t)}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-zinc-300 truncate leading-snug">
                    {t.title}
                  </p>
                </button>
              ))
            )}
          </div>
          {linkError && (
            <p className="px-2.5 py-1.5 text-[10px] text-red-600 dark:text-red-400 border-t border-slate-100 dark:border-zinc-800">
              {linkError}
            </p>
          )}
        </div>
      )}

      {/* Empty state */}
      {grouped.length === 0 && !linking && (
        <p className="text-[12px] font-medium text-slate-400 dark:text-zinc-600">None</p>
      )}

      {/* Grouped related tickets */}
      {grouped.length > 0 && (
        <div className="space-y-3">
          {grouped.map(({ kind, items }) => (
            <div key={kind}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300 dark:text-zinc-700 mb-1.5">
                {RELATION_LABEL[kind]}
              </p>
              <div className="space-y-1.5">
                {items.map(({ linkId, ticket: t }) => (
                  <RelatedTicketCard
                    key={linkId}
                    ticket={t}
                    onOpen={() => setPreviewTicket(t)}
                    onRemove={() => removeLink(linkId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Ticket Preview */}
      {previewTicket && (
        <TicketPreviewPanel
          ticket={previewTicket}
          slug={slug}
          onClose={() => setPreviewTicket(null)}
          onBeforeNavigate={() => setPreviewTicket(null)}
        />
      )}
    </div>
  );
}

// ── CollapsibleSection ────────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  badge,
  headerAction,
  defaultOpen = true,
  forceOpenSignal,
  children,
}: {
  title: string;
  badge?: string;
  headerAction?: ReactNode;
  defaultOpen?: boolean;
  // Bump this (e.g. an incrementing counter) to force the section open
  // without turning it into a fully controlled component — every other
  // caller that doesn't pass it keeps managing `open` internally, exactly
  // as before. Never fires on mount, only on a later change, so it can't
  // override defaultOpen on first render.
  forceOpenSignal?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (forceOpenSignal === undefined) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setOpen(true);
  }, [forceOpenSignal]);

  return (
    <div className="mt-10 pt-8 border-t border-slate-100 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 min-w-0 py-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50 rounded"
          aria-expanded={open}
        >
          <span className={SECTION_LABEL}>{title}</span>
          {badge && (
            <span className="text-[11px] font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
              {badge}
            </span>
          )}
          <svg
            className={
              "ml-auto w-3 h-3 text-slate-300 dark:text-zinc-700 transition-transform duration-200 flex-shrink-0 " +
              (open ? "rotate-0" : "-rotate-90")
            }
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
      </div>

      <div
        className={
          "grid transition-all duration-200 ease-in-out " +
          (open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
        }
      >
        <div className="overflow-hidden">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── Acceptance Criteria ───────────────────────────────────────────────────────

function AcceptanceCriteriaSection({
  criteria,
  doneFlags,
  onToggle,
}: {
  criteria: string[];
  /** Real, persisted checked/unchecked state, aligned by index with criteria. */
  doneFlags: boolean[];
  onToggle: (index: number) => void;
}) {
  const doneCount = criteria.filter((_, i) => doneFlags[i] ?? false).length;

  return (
    <CollapsibleSection title="Acceptance Criteria" badge={`· ${doneCount}/${criteria.length} done`} defaultOpen={true}>
      <ul className="space-y-2.5">
        {criteria.map((text, i) => {
          const done = doneFlags[i] ?? false;
          return (
            <li key={i} className="flex items-start gap-3">
              <button
                onClick={() => onToggle(i)}
                aria-label={done ? "Mark incomplete" : "Mark complete"}
                className={
                  "mt-0.5 w-4 h-4 rounded flex-shrink-0 border transition-colors flex items-center justify-center " +
                  (done
                    ? "bg-brand-500 border-brand-500 dark:bg-brand-600 dark:border-brand-600"
                    : "border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:border-brand-400 dark:hover:border-brand-500")
                }
              >
                {done && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span
                className={
                  "text-[14px] leading-snug select-none cursor-pointer " +
                  (done
                    ? "line-through text-slate-400 dark:text-zinc-600"
                    : "text-slate-700 dark:text-zinc-300")
                }
                onClick={() => onToggle(i)}
              >
                {text}
              </span>
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}

// ── Attachments ───────────────────────────────────────────────────────────────

type AttachmentItem = {
  id: string;
  name: string;
  ext: string;
  size: string;
  addedBy: string;
  avatar: string;
  uploadedAt: string;
  storagePath: string;
};

type UploadingItem = {
  id: string;
  name: string;
  ext: string;
  size: string;
  progress: number;
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
// tag. Anything else (Office docs, zips, video, etc.) gets no Preview
// action, per this feature's explicit scope.
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

function formatRemainingHours(hours: number): string {
  const clamped = Math.max(0, hours);
  return `${Number(clamped.toFixed(1))}`;
}

let attachmentIdCounter = 0;

// Date.now() + Math.random() alone can collide when several files are
// selected in the same synchronous batch (same millisecond) — the counter
// guarantees uniqueness regardless of timing, so a temp upload id can never
// match another temp id or a persisted attachment's id.
function newId(): string {
  attachmentIdCounter += 1;
  return `att-${Date.now()}-${attachmentIdCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── UploadingRow ──────────────────────────────────────────────────────────────

function UploadingRow({ item }: { item: UploadingItem }) {
  const extColor = EXT_COLOR[item.ext] ?? "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400";
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/60">
      <span className={"w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold uppercase tracking-wide opacity-50 " + extColor}>
        {item.ext}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-700 dark:text-zinc-300 truncate">{item.name}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-zinc-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 dark:bg-brand-600 transition-all duration-100 ease-linear"
              style={{ width: `${Math.round(item.progress)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-slate-400 dark:text-zinc-600 w-7 text-right flex-shrink-0">
            {Math.round(item.progress)}%
          </span>
        </div>
      </div>
    </li>
  );
}

// ── AttachmentRow ─────────────────────────────────────────────────────────────

function AttachmentRow({
  file,
  onDelete,
  onRename,
  onDownload,
}: {
  file: AttachmentItem;
  onDelete: () => void;
  /** Resolves to whether the rename actually persisted — the input only
   *  closes on success, so a failure leaves it open to retry instead of
   *  silently discarding the edit. */
  onRename: (name: string) => Promise<boolean>;
  onDownload: () => void;
}) {
  const [renaming, setRenaming]     = useState(false);
  const [renameDraft, setRenameDraft] = useState(file.name);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewKind = getPreviewKind(file.ext);
  // Screen-space position for the portaled menu panel below — computed from
  // the trigger button at the moment the menu opens (see toggleMenu) so it
  // tracks the button correctly even though it's no longer a DOM descendant
  // of it once rendered via the portal.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const renameRef    = useRef<HTMLInputElement>(null);
  const menuRef       = useRef<HTMLDivElement>(null);
  const menuPanelRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { if (renaming) renameRef.current?.focus(); }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = menuRef.current?.contains(target) ?? false;
      const insidePanel   = menuPanelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // Keeps the portaled menu tracking the trigger button's viewport position
  // while it's open (e.g. if the page scrolls) — the initial position is set
  // synchronously in toggleMenu below, this effect only keeps it in sync.
  useEffect(() => {
    if (!menuOpen) return;
    const updatePos = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [menuOpen]);

  // Rendered via a portal (see below) so the menu isn't clipped by the
  // Attachments section's overflow-hidden collapse wrapper (CollapsibleSection)
  // — position is computed in viewport coordinates from the trigger button
  // at the moment the menu opens.
  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      setMenuPos(null);
      return;
    }
    const rect = menuRef.current?.getBoundingClientRect();
    setMenuPos(rect ? { top: rect.bottom + 4, right: window.innerWidth - rect.right } : null);
    setMenuOpen(true);
  };

  const saveRename = async () => {
    const v = renameDraft.trim();
    if (v && v !== file.name) {
      const ok = await onRename(v);
      if (!ok) return; // keep the input open so the user can retry or cancel
    } else {
      setRenameDraft(file.name);
    }
    setRenaming(false);
  };

  const extColor = EXT_COLOR[file.ext] ?? "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400";

  if (confirming) {
    return (
      <li className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20">
        <span className="flex-1 min-w-0 text-[13px] text-slate-700 dark:text-zinc-300 truncate">
          Delete <strong className="font-semibold">{file.name}</strong>?
        </span>
        <button
          onClick={onDelete}
          className="flex-shrink-0 text-[12px] font-semibold text-red-600 dark:text-red-400 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="flex-shrink-0 text-[12px] text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:border-slate-200 dark:hover:border-zinc-700">
      {/* Extension badge */}
      <span className={"w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold uppercase tracking-wide " + extColor}>
        {file.ext}
      </span>

      {/* File info */}
      <div className="flex-1 min-w-0">
        {renaming ? (
          <input
            ref={renameRef}
            className={
              "text-[13px] font-medium text-slate-800 dark:text-zinc-200 w-full " +
              "bg-white dark:bg-zinc-900 border border-brand-500 dark:border-brand-500 " +
              "rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-brand-500/30"
            }
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") { e.preventDefault(); saveRename(); }
              if (e.key === "Escape") { setRenameDraft(file.name); setRenaming(false); }
            }}
          />
        ) : (
          <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">{file.name}</p>
        )}
        <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5 flex items-center gap-1.5">
          <span>{file.size}</span>
          <span>·</span>
          <MemberTrigger name={file.addedBy} avatar={file.avatar} className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.avatar} alt={file.addedBy} className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
            <span>{file.addedBy}</span>
          </MemberTrigger>
          <span>·</span>
          <span>{file.uploadedAt}</span>
        </p>
      </div>

      {/* Actions (hidden while renaming) */}
      {!renaming && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            aria-label={`Download ${file.name}`}
            onClick={onDownload}
            className="p-1.5 rounded-md text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div ref={menuRef} className="relative">
            <button
              aria-label="More options"
              onClick={toggleMenu}
              className="p-1.5 rounded-md text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="3"  cy="8" r="1.25" />
                <circle cx="8"  cy="8" r="1.25" />
                <circle cx="13" cy="8" r="1.25" />
              </svg>
            </button>

            {menuOpen && menuPos && createPortal(
              <div
                ref={menuPanelRef}
                style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
                className="w-36 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-slate-200/50 dark:shadow-black/40 z-20 py-1"
              >
                {previewKind && (
                  <button
                    className="w-full text-left px-3 py-1.5 text-[12px] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors"
                    onClick={() => { setMenuOpen(false); setPreviewOpen(true); }}
                  >
                    <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Preview
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors"
                  onClick={() => { setMenuOpen(false); setRenameDraft(file.name); setRenaming(true); }}
                >
                  <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-2.828 0L7 14l2-1z" />
                    <path d="M3 21h18" strokeLinecap="round" />
                  </svg>
                  Rename
                </button>
                <div className="my-1 h-px bg-slate-100 dark:bg-zinc-800" />
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors"
                  onClick={() => { setMenuOpen(false); setConfirming(true); }}
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Delete
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      )}

      {previewOpen && previewKind && createPortal(
        <AttachmentPreviewModal file={file} kind={previewKind} onClose={() => setPreviewOpen(false)} />,
        document.body
      )}
    </li>
  );
}

// ── AttachmentPreviewModal ───────────────────────────────────────────────────

function AttachmentPreviewModal({
  file,
  kind,
  onClose,
}: {
  file: AttachmentItem;
  kind: "image" | "pdf";
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTicketAttachmentPreviewUrl(file.storagePath).then((result) => {
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
        aria-labelledby="attachment-preview-title"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-zinc-800 flex-shrink-0">
          <h2 id="attachment-preview-title" className="text-[15px] font-bold text-slate-900 dark:text-zinc-50 truncate pr-4">
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

        <div className="flex-1 min-h-0 overflow-auto bg-slate-50 dark:bg-zinc-950/40">
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
            <div className="flex items-center justify-center min-h-[70vh] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file.name} className="max-w-full h-auto" />
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

// ── AttachmentsSection ────────────────────────────────────────────────────────

function toAttachmentItem(a: TicketAttachment): AttachmentItem {
  return {
    id: a.id,
    name: a.filename,
    ext: getExt(a.filename),
    size: formatBytes(a.sizeBytes),
    addedBy: a.uploadedByName,
    avatar: a.uploadedByAvatar,
    uploadedAt: a.uploadedAt,
    storagePath: a.storagePath,
  };
}

function AttachmentsSection({
  ticketId,
  isDevFallback,
  onUploaded,
  onError,
}: {
  ticketId: string;
  isDevFallback: boolean;
  /** Called after a successful upload, rename, or delete — a database trigger already logged the real activity row; this just tells the parent to refetch it. */
  onUploaded: () => void;
  /** Called with a message when an upload/rename/delete fails — surfaced via the shared error toast. */
  onError: (message: string) => void;
}) {
  const [attachments,   setAttachments]   = useState<AttachmentItem[]>([]);
  const [uploading,     setUploading]     = useState<UploadingItem[]>([]);
  const [dragActive,    setDragActive]    = useState(false);
  // Bumped once per successful upload — forces the section open if it was
  // closed, and is a no-op (stays open) if it already was. Never bumped on
  // failure, so a failed upload never opens the section.
  const [uploadSuccessSignal, setUploadSuccessSignal] = useState(0);

  const dragCounter    = useRef(0);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  // Real attachments for this ticket only, loaded from Supabase. Dev
  // fallback: no real ticket row exists to query against, so this simply
  // stays empty (matches Comments/Activity/Labels' own dev-fallback
  // behavior) rather than sending a request guaranteed to fail.
  useEffect(() => {
    if (isDevFallback) return;
    let cancelled = false;
    loadTicketAttachments(ticketId).then((result) => {
      if (cancelled) return;
      if (result.status === "ready") setAttachments(result.attachments.map(toAttachmentItem));
    });
    return () => {
      cancelled = true;
    };
  }, [ticketId, isDevFallback]);

  // Trickle each uploading item's progress bar toward 90% while its real
  // upload request is in flight — Supabase Storage's upload() has no
  // granular byte-progress callback, so this is a visual approximation
  // only (same UploadingRow/progress-bar UI as before); the item is
  // removed and swapped for the real attachment once the actual request
  // settles, in startUpload below, never by this timer.
  useEffect(() => {
    if (uploading.length === 0) return;
    const timer = setTimeout(() => {
      setUploading((prev) =>
        prev.map((item) =>
          item.progress < 90 ? { ...item, progress: Math.min(90, item.progress + Math.random() * 12 + 5) } : item
        )
      );
    }, 150);
    return () => clearTimeout(timer);
  }, [uploading]);

  const startUpload = (files: FileList | File[]) => {
    if (isDevFallback) return; // no real ticket to upload against
    const fileArray = Array.from(files);
    const items: UploadingItem[] = fileArray.map((f) => ({
      id:       newId(),
      name:     f.name,
      ext:      getExt(f.name),
      size:     formatBytes(f.size),
      progress: 0,
    }));
    setUploading((prev) => [...prev, ...items]);

    items.forEach((item, i) => {
      const file = fileArray[i];
      uploadTicketAttachment(ticketId, file).then((result) => {
        // Briefly show the bar at 100% (matches the previous "fills, then
        // swaps" visual) before removing the temp row.
        setUploading((prev) => prev.map((u) => (u.id === item.id ? { ...u, progress: 100 } : u)));
        setTimeout(() => {
          setUploading((prev) => prev.filter((u) => u.id !== item.id));
          if (result.status === "error") {
            console.warn("[ticket-detail] attachment upload failed:", result.message);
            onError(result.message);
            return;
          }
          setAttachments((prev) => {
            if (prev.some((a) => a.id === result.attachment.id)) return prev;
            return [toAttachmentItem(result.attachment), ...prev];
          });
          setUploadSuccessSignal((n) => n + 1);
          onUploaded();
        }, 200);
      }).catch((err) => {
        // Without this, a rejected (not just {status:"error"}) upload would
        // leave this item's progress bar stuck on screen forever.
        setUploading((prev) => prev.filter((u) => u.id !== item.id));
        console.warn("[ticket-detail] attachment upload failed:", err);
        onError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      });
    });
  };

  const totalCount = attachments.length + uploading.length;
  const isEmpty    = attachments.length === 0 && uploading.length === 0;

  return (
    <CollapsibleSection
      title="Attachments"
      badge={totalCount > 0 ? `· ${totalCount} ${totalCount === 1 ? "file" : "files"}` : undefined}
      defaultOpen={false}
      forceOpenSignal={uploadSuccessSignal}
      headerAction={
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v16m8-8H4" strokeLinecap="round" />
          </svg>
          Upload Files
        </button>
      }
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) { startUpload(e.target.files); e.target.value = ""; }
        }}
      />

      {/* Drag zone */}
      <div
        className={"relative" + (dragActive ? " rounded-lg" : "")}
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setDragActive(true); }}
        onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setDragActive(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragCounter.current = 0;
          setDragActive(false);
          if (e.dataTransfer.files.length > 0) startUpload(e.dataTransfer.files);
        }}
      >
        {/* Drag-over overlay */}
        {dragActive && (
          <div className="absolute inset-0 rounded-lg bg-white/90 dark:bg-zinc-950/90 border-2 border-dashed border-brand-500 dark:border-brand-600 flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-brand-500 dark:text-brand-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-[13px] font-semibold text-brand-600 dark:text-brand-500">Drop files to upload</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg border-2 border-dashed border-slate-200 dark:border-zinc-800 flex flex-col items-center justify-center py-8 gap-2 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
          >
            <svg className="w-7 h-7 text-slate-300 dark:text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[13px] text-slate-400 dark:text-zinc-600">No attachments yet</p>
            <p className="text-[11px] font-medium text-brand-500 dark:text-brand-600">Click to upload · drag &amp; drop files here</p>
          </button>
        )}

        {/* File list */}
        {!isEmpty && (
          <ul className="space-y-2">
            {uploading.map((u) => <UploadingRow key={u.id} item={u} />)}
            {attachments.map((a) => (
              <AttachmentRow
                key={a.id}
                file={a}
                onDelete={() => {
                  // Dev fallback: no real attachment row to delete.
                  if (isDevFallback) {
                    setAttachments((prev) => prev.filter((x) => x.id !== a.id));
                    return;
                  }
                  // Local state only updates after a successful delete, so a
                  // failed delete leaves the row (and its confirm prompt) in
                  // place instead of optimistically vanishing.
                  deleteTicketAttachment(a.id, a.storagePath).then((result) => {
                    if (result.status === "error") {
                      console.warn("[ticket-detail] attachment delete failed:", result.message);
                      onError(result.message);
                      return;
                    }
                    setAttachments((prev) => prev.filter((x) => x.id !== a.id));
                    // A database trigger already logged the real
                    // "attachment_deleted" activity row as part of the same
                    // delete — refetch instead of inventing a local entry.
                    onUploaded();
                  }).catch((err) => {
                    console.warn("[ticket-detail] attachment delete failed:", err);
                    onError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
                  });
                }}
                onRename={async (name) => {
                  // Dev fallback: no real attachment row to write to, keep
                  // the previous local-only behavior.
                  if (isDevFallback) {
                    setAttachments((prev) => prev.map((x) => x.id === a.id ? { ...x, name, ext: getExt(name) } : x));
                    return true;
                  }
                  // Local state only updates after a successful write, so a
                  // failed rename never shows a name that didn't persist.
                  try {
                    const result = await renameTicketAttachment(a.id, name);
                    if (result.status === "error") {
                      console.warn("[ticket-detail] attachment rename failed:", result.message);
                      onError(result.message);
                      return false;
                    }
                    setAttachments((prev) => prev.map((x) => x.id === a.id ? { ...x, name, ext: getExt(name) } : x));
                    // A database trigger already logged the real
                    // "attachment_renamed" activity row as part of the same
                    // update — refetch instead of inventing a local entry.
                    onUploaded();
                    return true;
                  } catch (err) {
                    console.warn("[ticket-detail] attachment rename failed:", err);
                    onError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
                    return false;
                  }
                }}
                onDownload={() => {
                  downloadTicketAttachment(a.storagePath, a.name).then((result) => {
                    if (result.status === "error") {
                      console.warn("[ticket-detail] attachment download failed:", result.message);
                    }
                  });
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}

// No real GitHub/Development integration exists (see "No implementar:
// GitHub integration") — the Development section (Pull Requests, Branches,
// Recent Commits) is removed entirely rather than shown empty, since there
// is no "connect a real integration" affordance to fall back to either.

// ── Time Tracking ─────────────────────────────────────────────────────────────

interface TimeEntry {
  id:           string;
  hours:        number;
  comment:      string;
  date:         string;
  authorName:   string;
  authorAvatar: string;
}


// The user's real local "today" — never a fixed/mock date. Built from local
// getters (not toISOString(), which is UTC and can show the wrong calendar
// day near midnight in the user's own timezone).
function formatDateDisplay(iso: string): string {
  const today = new Date(`${getTodayISO()}T00:00:00`);
  const d     = new Date(`${iso}T00:00:00`);
  const diff  = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toTimeEntry(record: TimeEntryRecord): TimeEntry {
  return {
    id: record.id,
    hours: Math.round((record.minutes / 60) * 10) / 10,
    comment: record.comment,
    date: formatDateDisplay(record.workDate),
    authorName: record.loggedByName,
    authorAvatar: record.loggedByAvatar,
  };
}

function LogTimeModal({
  onClose,
  onSubmit,
}: {
  onClose:  () => void;
  // Returns whether the entry actually persisted — the modal only closes
  // itself on success, matching every other real-data modal in this file.
  onSubmit: (input: LogTimeInput) => Promise<boolean>;
}) {
  const [hrsStr,  setHrsStr]  = useState("");
  const [minsStr, setMinsStr] = useState("");
  const [comment, setComment] = useState("");
  const [date,    setDate]    = useState(() => getTodayISO());
  const [submitting, setSubmitting] = useState(false);

  const hrsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hrsRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h          = Math.max(0, parseInt(hrsStr  || "0", 10) || 0);
  const m          = Math.max(0, Math.min(59, parseInt(minsStr || "0", 10) || 0));
  const totalMinutes = h * 60 + m;
  const canSubmit  = totalMinutes > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const ok = await onSubmit({
      minutes:  totalMinutes,
      comment:  comment.trim(),
      workDate: date,
    });
    setSubmitting(false);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={[
          "relative w-full max-w-sm rounded-2xl border shadow-2xl",
          "bg-white dark:bg-zinc-900",
          "border-slate-200 dark:border-zinc-700",
          "shadow-black/15 dark:shadow-black/50",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-time-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <h2 id="log-time-title" className="text-[15px] font-bold text-slate-900 dark:text-zinc-50">
            Log Time
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Time */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5">
              Worked Time
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <input
                  ref={hrsRef}
                  type="number"
                  min="0"
                  max="99"
                  placeholder="0"
                  value={hrsStr}
                  onChange={(e) => setHrsStr(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") handleSubmit(); }}
                  className="bg-white dark:bg-zinc-950 text-[13px] font-medium text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 w-16 text-center"
                />
                <span className="text-[13px] text-slate-500 dark:text-zinc-400 font-medium">h</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="0"
                  value={minsStr}
                  onChange={(e) => setMinsStr(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") handleSubmit(); }}
                  className="bg-white dark:bg-zinc-950 text-[13px] font-medium text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 w-16 text-center"
                />
                <span className="text-[13px] text-slate-500 dark:text-zinc-400 font-medium">min</span>
              </div>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={date}
              max={getTodayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={INPUT_BASE}
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5">
              Comment{" "}
              <span className="font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                (optional)
              </span>
            </label>
            <textarea
              rows={3}
              placeholder="What did you work on?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={
                "w-full resize-none text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
                "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-md px-2.5 py-2 outline-none " +
                "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 " +
                "placeholder:text-slate-300 dark:placeholder:text-zinc-700"
              }
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[13px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={[
              "px-3.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all",
              canSubmit
                ? "bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/30 cursor-pointer"
                : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed",
            ].join(" ")}
          >
            Log Time
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeHistoryModal({
  entries,
  estimatedHours,
  onClose,
}: {
  entries:        TimeEntry[];
  estimatedHours: number | undefined;
  onClose:        () => void;
}) {
  const totalLogged = entries.reduce((s, e) => s + e.hours, 0);
  const remaining   = estimatedHours !== undefined ? Math.max(0, estimatedHours - totalLogged) : undefined;

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
        className="relative w-full max-w-md rounded-2xl border shadow-2xl bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 shadow-black/15 dark:shadow-black/50 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hist-modal-title"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <h2 id="hist-modal-title" className="text-[15px] font-bold text-slate-900 dark:text-zinc-50">
            Time History
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-0.5">Logged</p>
              <p className="text-[18px] font-bold text-slate-800 dark:text-zinc-100 tabular-nums leading-none">{totalLogged}h</p>
            </div>
            {estimatedHours !== undefined && (
              <>
                <div className="w-px h-8 bg-slate-200 dark:bg-zinc-800 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-0.5">Estimated</p>
                  <p className="text-[18px] font-bold text-slate-500 dark:text-zinc-400 tabular-nums leading-none">{estimatedHours}h</p>
                </div>
                {remaining !== undefined && (
                  <>
                    <div className="w-px h-8 bg-slate-200 dark:bg-zinc-800 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-0.5">Remaining</p>
                      <p className={`text-[18px] font-bold tabular-nums leading-none ${remaining === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-zinc-100"}`}>
                        {formatRemainingHours(remaining)}h
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="overflow-y-auto max-h-72 px-5 py-3">
          {entries.length === 0 ? (
            <p className="text-[13px] text-slate-400 dark:text-zinc-600 text-center py-6">No entries yet.</p>
          ) : (
            <div>
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3.5 py-3 ${i < entries.length - 1 ? "border-b border-slate-100 dark:border-zinc-800/60" : ""}`}
                >
                  <div className="flex flex-col items-center flex-shrink-0 w-3.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 dark:bg-brand-500 ring-2 ring-white dark:ring-zinc-900" />
                    {i < entries.length - 1 && (
                      <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[20px]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-0.5">
                      <span className="text-[12px] font-semibold text-slate-500 dark:text-zinc-400">{entry.date}</span>
                      <span className="text-[14px] font-bold text-slate-800 dark:text-zinc-100 tabular-nums flex-shrink-0">{entry.hours}h</span>
                    </div>
                    {entry.comment && (
                      <p className="text-[13px] text-slate-600 dark:text-zinc-400 leading-snug">
                        &ldquo;{entry.comment}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-[13px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeTrackingSection({
  ticketId,
  entries,
  estimatedHours,
  onAddEntry,
  onError,
}: {
  ticketId:       string;
  entries:        TimeEntry[];
  estimatedHours: number | undefined;
  /** Called with the real, persisted entry — after a successful save only. */
  onAddEntry:     (entry: TimeEntry) => void;
  /** Called with a message when a save fails — surfaced via the shared error toast. */
  onError:        (message: string) => void;
}) {
  const [logModal,  setLogModal]  = useState(false);
  const [histModal, setHistModal] = useState(false);

  // Persists the entry to Supabase; only calls onAddEntry (which updates the
  // visible list/total/remaining/progress bar) once the write actually
  // succeeds — never from local state alone.
  async function handleLogTime(input: LogTimeInput): Promise<boolean> {
    try {
      const result = await logTicketTime(ticketId, input);
      if (result.status === "error") {
        console.warn("[ticket-detail] failed to log time:", result.message);
        onError(result.message);
        return false;
      }
      onAddEntry(toTimeEntry(result.entry));
      return true;
    } catch (err) {
      console.warn("[ticket-detail] failed to log time:", err);
      onError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      return false;
    }
  }

  const totalLogged = entries.reduce((s, e) => s + e.hours, 0);
  const pct         = estimatedHours ? Math.min(100, Math.round((totalLogged / estimatedHours) * 100)) : 0;
  const variance    = estimatedHours !== undefined ? totalLogged - estimatedHours : null;
  const isOver      = variance !== null && variance > 0;
  // When over: brand fills the estimated portion, amber fills the rest
  const brandPct    = isOver && estimatedHours
    ? Math.round((estimatedHours / totalLogged) * 100)
    : pct;

  return (
    <>
      <CollapsibleSection
        title="Time Tracking"
        defaultOpen={true}
        headerAction={
          <button
            type="button"
            onClick={() => setLogModal(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-brand-500 text-white hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            Log Time
          </button>
        }
      >
        {/* Single summary line: "11h logged / 8h estimated" */}
        <p className="text-[13px] mb-1.5">
          <span className="font-semibold text-slate-700 dark:text-zinc-200 tabular-nums">{totalLogged}h</span>
          <span className="text-slate-400 dark:text-zinc-600"> logged</span>
          {estimatedHours !== undefined && (
            <>
              <span className="text-slate-300 dark:text-zinc-700 mx-1.5">/</span>
              <span className="font-semibold text-slate-500 dark:text-zinc-400 tabular-nums">{estimatedHours}h</span>
              <span className="text-slate-400 dark:text-zinc-600"> estimated</span>
            </>
          )}
        </p>

        {/* Over-estimate label — only shown when over */}
        {isOver && variance !== null && (
          <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mb-2">
            +{variance}h over estimate
          </p>
        )}

        {/* Smart progress bar: brand up to estimate, amber for overage */}
        {estimatedHours !== undefined && (
          <div className="relative h-[4px] rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden mb-3">
            {isOver ? (
              <div className="absolute inset-0 flex">
                <div
                  className="h-full bg-brand-500 flex-shrink-0 transition-all duration-300"
                  style={{ width: `${brandPct}%` }}
                />
                <div className="h-full bg-amber-400 flex-1 transition-all duration-300" />
              </div>
            ) : (
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            )}
          </div>
        )}
        {estimatedHours === undefined && <div className="mb-2" />}

        {/* "View N entries →" link */}
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => setHistModal(true)}
            className="text-[12px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 transition-colors"
          >
            View {entries.length} {entries.length === 1 ? "entry" : "entries"}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ) : (
          <p className="text-[12px] text-slate-400 dark:text-zinc-600">No time logged yet.</p>
        )}
      </CollapsibleSection>

      {logModal && (
        <LogTimeModal
          onClose={() => setLogModal(false)}
          onSubmit={handleLogTime}
        />
      )}

      {histModal && (
        <TimeHistoryModal
          entries={entries}
          estimatedHours={estimatedHours}
          onClose={() => setHistModal(false)}
        />
      )}
    </>
  );
}

// ── Not-found state ───────────────────────────────────────────────────────────

function NotFound({ ticketId, slug }: { ticketId: string; slug: string }) {
  return (
    <div className="min-h-full bg-white dark:bg-zinc-950 flex items-center justify-center">
      <div className="text-center py-24">
        <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
          <svg
            className="w-5 h-5 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-slate-900 dark:text-zinc-50">Ticket not found</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          No ticket with ID &ldquo;{ticketId}&rdquo; exists.
        </p>
        <Link
          href={`/projects/${slug}/tickets`}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-500 hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to Tickets
        </Link>
      </div>
    </div>
  );
}

// Dev-only fallback lookup (no real organization) — the static mock array
// scoped to this project, plus anything just created this session via the
// New Ticket modal's dev-fallback path (see pending-tickets.ts). Never
// reached once a real organization exists.
function resolveDevTicket(slug: string, ticketCode: string): Ticket | undefined {
  return (
    ALL_TICKETS.find((t) => t.projectSlug === slug && getTicketDisplayKey(t) === ticketCode) ??
    getRegisteredTicketByCode(slug, ticketCode)
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
// Client component, same reasoning as ProjectSettingsBreadcrumb in
// project-settings-screen.tsx: real project/ticket data lives client-side
// (Supabase + the shared Projects context), so a server-rendered breadcrumb
// can't show it — this reads the real project name from the shared
// provider and the real ticket code/title from its own lookup.
export function TicketDetailBreadcrumb({ slug, ticketCode }: { slug: string; ticketCode: string }) {
  const { organization, isDevFallback } = useCurrentUser();
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;

  const [loadedTitle, setLoadedTitle] = useState<string | null>(null);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    loadTicketByCode(organization.id, slug, ticketCode).then((result) => {
      if (cancelled) return;
      setLoadedTitle(result.status === "ready" ? result.ticket.title : null);
    });
    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, slug, ticketCode]);

  const displayText = (isDevFallback ? resolveDevTicket(slug, ticketCode)?.title : loadedTitle) ?? ticketCode;

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
      <Link
        href={`/projects/${slug}/tickets`}
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        Tickets
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200 truncate">{displayText}</span>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TicketDetailScreen({
  slug,
  ticketCode,
}: {
  slug: string;
  ticketCode: string;
}) {
  const { organization, isDevFallback } = useCurrentUser();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "not-found" | "error">(
    isDevFallback ? (resolveDevTicket(slug, ticketCode) ? "ready" : "not-found") : "loading"
  );
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | undefined>(() =>
    isDevFallback ? resolveDevTicket(slug, ticketCode) : undefined
  );
  // Real Comments/Activity — start empty and stay empty unless real rows
  // exist, in every mode (including dev fallback — no mock people, ever).
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activityLog, setActivityLog] = useState<TicketActivityEvent[]>([]);
  const [addingComment, setAddingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [loggedEntries, setLoggedEntries] = useState<TimeEntry[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  // Real, per-organization label catalog — starts empty; merged with the
  // static ALL_LABELS seed list below. Dev fallback: no real catalog to
  // load, so only the static seed list is offered (no persistence anyway).
  const [orgLabels, setOrgLabels] = useState<string[]>([]);
  // Single shared surface for every write failure below (inline edits,
  // comments, time entries, attachments, related tickets) — previously most
  // of these only logged to the console with nothing shown to the user.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const showError = (message: string) => setErrorMessage(message);

  // Extracted (not just inlined in the effect below) so the load-error state
  // can offer a real Retry, the same way tickets-screen.tsx's ticket *list*
  // already does — this was previously the one load path in the module with
  // no way to recover without a full page reload.
  const detailRequestIdRef = useRef(0);
  const runFetchTicket = () => {
    if (!organization) return;
    const requestId = ++detailRequestIdRef.current;
    setLoadState("loading");
    loadTicketByCode(organization.id, slug, ticketCode).then((result) => {
      if (detailRequestIdRef.current !== requestId) return;
      if (result.status === "ready") {
        setTicket(result.ticket);
        setLoadState("ready");
        loadTicketComments(result.ticket.id).then((r) => {
          if (detailRequestIdRef.current === requestId) setComments(r.status === "ready" ? r.comments : []);
        });
        loadTicketActivity(result.ticket.id).then((r) => {
          if (detailRequestIdRef.current === requestId) setActivityLog(r.status === "ready" ? r.events : []);
        });
        loadTicketTimeEntries(result.ticket.id).then((r) => {
          if (detailRequestIdRef.current === requestId) setLoggedEntries(r.status === "ready" ? r.entries.map(toTimeEntry) : []);
        });
      } else if (result.status === "not-found") {
        setLoadState("not-found");
      } else {
        setLoadErrorMessage(result.message);
        setLoadState("error");
      }
    });
  };

  useEffect(() => {
    if (isDevFallback) return; // handled synchronously above
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: runFetchTicket also runs from the Retry button, and must show "Loading…" immediately either way
    runFetchTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevFallback, organization, slug, ticketCode]);

  useEffect(() => {
    if (isDevFallback || !organization) return; // dev fallback: no mock members either
    loadOrganizationMembers(organization.id).then((result) => {
      if (result.status === "ready") setMembers(result.members);
    });
  }, [isDevFallback, organization]);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    loadOrganizationLabels(organization.id).then((result) => {
      if (result.status === "ready") setOrgLabels(result.labels.map((l) => l.name));
    });
  }, [isDevFallback, organization]);

  useEffect(() => {
    if (addingComment) commentTextareaRef.current?.focus();
  }, [addingComment]);

  if (loadState === "loading") {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500">
        Loading ticket…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load ticket</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
          {loadErrorMessage ?? "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={runFetchTicket}
          className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!ticket) {
    return <NotFound ticketId={ticketCode} slug={slug} />;
  }

  const update = <K extends keyof Ticket>(key: K, value: Ticket[K]) => {
    setTicket((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const ticketId = ticket.id;

  // Refetches real Activity from Supabase — every field edit, acceptance
  // criteria toggle, attachment upload, and time entry is now logged by a
  // database trigger as part of its own real write (see
  // 20260727000000/20260728000000), so this never invents a local entry;
  // it only ever reflects what's already been committed.
  const refreshActivity = () => {
    loadTicketActivity(ticketId).then((r) => {
      if (r.status === "ready") setActivityLog(r.events);
    });
  };

  // Persists one inline edit to Supabase. Dev fallback (no real organization)
  // keeps today's local-only behavior — there is no real ticket row to write
  // to. Every call site pairs this with an optimistic update(key, value)
  // immediately before calling persist(patch) — `ticket` is closed over at
  // that same synchronous moment, so `previousTicket` below is exactly the
  // pre-optimistic snapshot, regardless of which field changed. On failure
  // that snapshot is restored (so a rejected edit never stays on screen) and
  // the error is shown via the shared toast, not just logged. On success the
  // ticket is synced to the server's own confirmed row rather than trusting
  // the optimistic value stayed in sync.
  const persist = (patch: UpdateTicketInput) => {
    if (isDevFallback) return;
    const previousTicket = ticket;
    updateTicket(ticketId, slug, patch).then((result) => {
      if (result.status === "error") {
        console.warn("[ticket-detail] failed to save change:", result.message);
        setTicket(previousTicket);
        showError(result.message);
        return;
      }
      // Success path intentionally unchanged from before this fix — only
      // the failure branch above (and the .catch() below) are new.
      refreshActivity();
    }).catch((err) => {
      console.warn("[ticket-detail] failed to save change:", err);
      setTicket(previousTicket);
      showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    });
  };

  // Acceptance Criteria checkbox — unlike persist() above, this updates
  // local state only AFTER a successful write, so a failed save never shows
  // a checked box that didn't actually persist. Dev fallback keeps the
  // pre-existing instant-toggle behavior (no real ticket to write to).
  const toggleAcceptanceCriterion = (index: number) => {
    const criteria = ticket.acceptanceCriteria;
    if (!criteria) return;
    const currentDone = ticket.acceptanceCriteriaDone ?? [];
    const nextDone = criteria.map((_, i) => (i === index ? !(currentDone[i] ?? false) : (currentDone[i] ?? false)));

    if (isDevFallback) {
      update("acceptanceCriteriaDone", nextDone);
      return;
    }

    updateTicket(ticketId, slug, { acceptanceCriteriaDone: nextDone }).then((result) => {
      if (result.status === "error") {
        console.warn("[ticket-detail] failed to save change:", result.message);
        showError(result.message);
        return;
      }
      update("acceptanceCriteriaDone", nextDone);
      refreshActivity();
    }).catch((err) => {
      console.warn("[ticket-detail] failed to save change:", err);
      showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    });
  };

  // Available to any ticket in the workspace, since orgLabels is loaded from
  // the shared `labels` table, not per-ticket.
  const allLabelOptions = buildLabelCatalog(orgLabels);

  const createLabel = async (name: string): Promise<{ status: "success"; name: string } | { status: "error"; message: string }> => {
    if (isDevFallback || !organization) {
      return { status: "error", message: "Not available in this mode." };
    }
    const result = await createOrganizationLabel(organization.id, name);
    if (result.status === "error") return result;
    setOrgLabels((prev) => [...prev, result.label.name]);
    return { status: "success", name: result.label.name };
  };

  const totalLogged = loggedEntries.reduce((s, e) => s + e.hours, 0);
  const remaining   = (ticket.hours ?? 0) - totalLogged;

  const addEntry = (entry: TimeEntry) => {
    setLoggedEntries((prev) => [entry, ...prev]);
    // A database trigger already logged the real "time_logged" activity
    // row as part of the same insert (see 20260728000000) — refetch
    // instead of inventing a local entry.
    refreshActivity();
  };

  function cancelComment() {
    setCommentDraft("");
    setAddingComment(false);
  }

  async function submitComment() {
    const trimmed = commentDraft.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    try {
      const result = await createTicketComment(ticketId, trimmed);
      if (result.status === "error") {
        console.warn("[ticket-detail] failed to post comment:", result.message);
        showError(result.message);
        return;
      }
      setComments((prev) => [result.comment, ...prev]);
      setCommentDraft("");
      setAddingComment(false);
      // A database trigger already created the matching "<name> added a
      // comment" ticket_activity row as part of the same insert.
      refreshActivity();
    } catch (err) {
      console.warn("[ticket-detail] failed to post comment:", err);
      showError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      // In a `finally` (not right after the await) so a thrown/rejected
      // request still always clears the spinner instead of leaving the
      // composer stuck disabled.
      setSubmittingComment(false);
    }
  }

  return (
    <div className="min-h-full bg-white dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-10">
        <div className="mb-8">
          <BackToTicketsButton />
        </div>

        <div className="flex gap-12 items-start">

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <article className="flex-1 min-w-0">

            {/* Title */}
            <header>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="flex items-center gap-1.5 font-mono text-[12px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                  <TicketTypeIcon type={ticket.type} className="w-3.5 h-3.5" />
                  {getTicketDisplayKey(ticket)}
                </span>
                <EditableStatusBadge
                  value={ticket.status}
                  onChange={(v) => { update("status", v); persist({ status: v }); }}
                />
              </div>

              <EditableTitle
                value={ticket.title}
                onChange={(v) => { update("title", v); persist({ title: v }); }}
              />

              <p className="text-[12px] text-slate-400 dark:text-zinc-600 mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span>{ticket.updatedAt}</span>
                {ticket.dueDate && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarIcon />
                      Due {ticket.dueDate}
                    </span>
                  </>
                )}
              </p>
              {ticket.hours !== undefined && (
                <div className="mt-2 flex items-center gap-3.5 flex-wrap">
                  <span className="text-[12px] text-slate-400 dark:text-zinc-600">
                    Estimated{" "}
                    <span className="font-semibold text-slate-600 dark:text-zinc-300">{ticket.hours}h</span>
                  </span>
                  <span className="text-slate-200 dark:text-zinc-800 select-none" aria-hidden="true">·</span>
                  <span className="text-[12px] text-slate-400 dark:text-zinc-600">
                    Logged{" "}
                    <span className="font-semibold text-slate-600 dark:text-zinc-300">{totalLogged}h</span>
                  </span>
                  <span className="text-slate-200 dark:text-zinc-800 select-none" aria-hidden="true">·</span>
                  <span className="text-[12px] text-slate-400 dark:text-zinc-600">
                    Remaining{" "}
                    <span className={`font-semibold ${remaining <= 0 && ticket.hours !== undefined ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-zinc-300"}`}>
                      {formatRemainingHours(remaining)}h
                    </span>
                  </span>
                </div>
              )}
            </header>

            <CollapsibleSection title="Description" defaultOpen={true}>
              <EditableDescription
                value={ticket.description}
                onChange={(v) => { update("description", v); persist({ description: v }); }}
              />
            </CollapsibleSection>

            {ticket.acceptanceCriteria !== undefined && ticket.acceptanceCriteria.length > 0 && (
              <AcceptanceCriteriaSection
                criteria={ticket.acceptanceCriteria}
                doneFlags={ticket.acceptanceCriteriaDone ?? []}
                onToggle={toggleAcceptanceCriterion}
              />
            )}

            <AttachmentsSection ticketId={ticket.id} isDevFallback={isDevFallback} onUploaded={refreshActivity} onError={showError} />

            <TimeTrackingSection
              ticketId={ticket.id}
              entries={loggedEntries}
              estimatedHours={ticket.hours}
              onAddEntry={addEntry}
              onError={showError}
            />

            <CollapsibleSection
              title="Comments"
              badge={ticket.commentCount !== undefined ? `· ${ticket.commentCount} total` : undefined}
              defaultOpen={true}
            >
              {comments.length === 0 ? (
                <p className="text-[13px] text-slate-400 dark:text-zinc-600">No comments yet.</p>
              ) : (
              <div className="space-y-6">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <MemberTrigger
                      name={c.name}
                      avatar={c.avatar}
                      projectSlug={ticket.projectSlug}
                      className="flex-shrink-0 mt-0.5 rounded-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="w-7 h-7 rounded-full flex-shrink-0 ring-1 ring-slate-200 dark:ring-zinc-700"
                      />
                    </MemberTrigger>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
                        <MemberTrigger name={c.name} avatar={c.avatar} projectSlug={ticket.projectSlug} className="hover:underline">
                          {c.name}
                        </MemberTrigger>
                        <span className="ml-2 font-normal text-slate-400 dark:text-zinc-600">
                          · {c.timeAgo}
                        </span>
                      </p>
                      <div className="mt-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/80">
                        <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                          {c.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}

              {/* Add comment */}
              <div className={comments.length === 0 ? "mt-4" : "mt-6"}>
                {addingComment ? (
                  <div>
                    <textarea
                      ref={commentTextareaRef}
                      rows={3}
                      placeholder="Write a comment…"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      className="w-full resize-none text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2.5 outline-none focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 placeholder:text-slate-300 dark:placeholder:text-zinc-700"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={cancelComment}
                        className="px-3.5 py-1.5 text-[13px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitComment}
                        disabled={commentDraft.trim().length === 0 || submittingComment}
                        className={[
                          "px-3.5 py-1.5 text-[13px] font-semibold rounded-lg transition-all",
                          commentDraft.trim().length === 0 || submittingComment
                            ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed"
                            : "bg-brand-500 hover:bg-brand-600 text-white shadow-sm shadow-brand-500/30 cursor-pointer",
                        ].join(" ")}
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingComment(true)}
                    className="text-[12px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
                  >
                    Add comment
                  </button>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Activity"
              badge={`· ${activityLog.length} updates`}
              defaultOpen={true}
            >
              {activityLog.length === 0 ? (
                <p className="text-[13px] text-slate-400 dark:text-zinc-600">No activity yet.</p>
              ) : (
              <div className="pb-2">
                {activityLog.map((a, i) => {
                  const isLast = i === activityLog.length - 1;
                  return (
                    <div key={i} className="flex gap-3.5">
                      <div className="flex flex-col items-center w-4 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ring-white dark:ring-zinc-950" />
                        {!isLast && (
                          <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[24px]" />
                        )}
                      </div>
                      <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                        <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-snug">
                          {a.label}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">
                          {a.timeAgo}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </CollapsibleSection>

          </article>

          {/* ── Metadata sidebar ─────────────────────────────────────────────── */}
          <aside className="w-56 flex-shrink-0 sticky top-8">

            <EditableSidebarStatus
              value={ticket.status}
              onChange={(v) => { update("status", v); persist({ status: v }); }}
            />

            <EditableSidebarAssignee
              value={ticket.assignee}
              onChange={(v) => {
                update("assignee", v);
                const member = members.find((m) => m.name === v.name);
                persist({ assigneeProfileId: member ? member.id : null });
              }}
              projectSlug={ticket.projectSlug}
              members={members}
            />

            <EditableSidebarType
              value={ticket.type}
              onChange={(v) => { update("type", v); persist({ type: v }); }}
            />

            <EditableSidebarPriority
              value={ticket.priority}
              onChange={(v) => { update("priority", v); persist({ priority: v }); }}
            />

            <EditableSidebarHours
              value={ticket.hours}
              onChange={(next) => {
                update("hours", next);
                persist({ hours: next ?? null });
              }}
            />

            <EditableSidebarDueDate
              value={ticket.dueDate}
              onChange={(v) => {
                update("dueDate", v);
                persist({ dueDate: v ? parseDisplayDate(v) : null });
              }}
            />

            <EditableSidebarLabels
              value={ticket.labels}
              onChange={(v) => { update("labels", v); persist({ labels: v }); }}
              allLabels={allLabelOptions}
              onCreateLabel={createLabel}
            />

            <RelatedTicketsSection ticketId={ticket.id} slug={slug} onChanged={refreshActivity} onError={showError} />

          </aside>

        </div>
      </div>

      {errorMessage && <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />}
    </div>
  );
}
