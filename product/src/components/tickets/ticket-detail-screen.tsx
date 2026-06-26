"use client";

import { useState, useRef, useEffect, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import type { Ticket, TicketStatus, TicketPriority } from "@/lib/mock-tickets";
import { tickets as ALL_TICKETS } from "@/lib/mock-tickets";
import {
  StatusBadge,
  PriorityBadge,
  LabelTag,
  getMockComments,
  getMockActivity,
  STATUS_LABEL,
} from "@/components/tickets/ticket-ui";
import { BackToTicketsButton } from "@/components/tickets/back-to-tickets-button";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { getRegisteredTicket } from "@/lib/pending-tickets";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: "Marcus Lee",  avatar: "https://i.pravatar.cc/64?img=12" },
  { name: "Elena Rossi", avatar: "https://i.pravatar.cc/64?img=5"  },
  { name: "Sarah Chen",  avatar: "https://i.pravatar.cc/64?img=47" },
  { name: "Priya Patel", avatar: "https://i.pravatar.cc/64?img=33" },
  { name: "David Kim",   avatar: "https://i.pravatar.cc/64?img=22" },
];

const MILESTONES = ["App Store Submission", "Beta Release", "Security Audit"];

const ALL_LABELS = [
  "Accessibility", "API", "Bug", "Compliance", "Dark Mode",
  "Design", "Enhancement", "Integration", "iOS", "Marketing",
  "Notifications", "Onboarding", "Performance", "Security",
];

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  high:   "High",
  normal: "Normal",
  low:    "Low",
};

const MOCK_ACCEPTANCE_CRITERIA = [
  { id: 1, text: "User receives a confirmation email within 2 minutes of submission", done: true },
  { id: 2, text: "Inline validation highlights missing required fields before submit", done: true },
  { id: 3, text: "Success state persists after page refresh (no duplicate submissions)", done: false },
  { id: 4, text: "Works correctly on iOS Safari and Android Chrome", done: false },
  { id: 5, text: "Accessible via keyboard navigation (WCAG 2.1 AA)", done: false },
];

// Attachments data lives inside AttachmentsSection state (see below)

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDisplayDate(display: string): string {
  const parts = display.trim().split(/\s+/);
  if (parts.length !== 2) return "";
  const month = MONTH_MAP[parts[0]];
  const day = parts[1].padStart(2, "0");
  return month ? `2026-${month}-${day}` : "";
}

function formatISODate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-3 h-3"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-2.828 0L7 14l2-1z" />
      <path d="M3 21h18" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="w-3 h-3 text-slate-400 dark:text-zinc-500 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

// ── Shared style tokens ───────────────────────────────────────────────────────

const SECTION_LABEL =
  "text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600";

const EDIT_BTN =
  "opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 p-0.5 rounded " +
  "text-slate-300 hover:text-slate-500 dark:text-zinc-600 dark:hover:text-zinc-400 " +
  "hover:bg-slate-100 dark:hover:bg-zinc-800 flex-shrink-0 focus:outline-none focus:opacity-100";

const INPUT_BASE =
  "bg-white dark:bg-zinc-950 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 w-full";

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

// ── Editable: Status (used in header and sidebar) ─────────────────────────────

function EditableStatusBadge({ value, onChange }: { value: TicketStatus; onChange: (v: TicketStatus) => void }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (editing) selectRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <select
        ref={selectRef}
        className={
          `text-[11px] font-semibold rounded-md px-2 py-0.5 outline-none cursor-pointer ` +
          `border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 ` +
          `text-slate-800 dark:text-zinc-200`
        }
        value={value}
        onChange={(e) => { onChange(e.target.value as TicketStatus); setEditing(false); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      >
        {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((k) => (
          <option key={k} value={k}>{STATUS_LABEL[k]}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="group flex items-center gap-1 cursor-pointer" onClick={() => setEditing(true)}>
      <StatusBadge status={value} />
      <span className={EDIT_BTN.replace("ml-1.5", "")}>
        <PencilIcon className="w-2.5 h-2.5" />
      </span>
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

// ── Editable: Sidebar Assignee ────────────────────────────────────────────────

function EditableSidebarAssignee({
  value,
  onChange,
}: {
  value: { name: string; avatar: string };
  onChange: (v: { name: string; avatar: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const handleChange = (name: string) => {
    const member = TEAM_MEMBERS.find((m) => m.name === name);
    if (member) { onChange(member); setEditing(false); }
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
          {TEAM_MEMBERS.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
      ) : (
        <div className="group flex items-center gap-1.5 cursor-pointer" onClick={() => setEditing(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.avatar} alt={value.name} className="w-5 h-5 rounded-full flex-shrink-0" />
          <span className="truncate">{value.name}</span>
          <button className={EDIT_BTN} aria-label="Edit assignee"><PencilIcon /></button>
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
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = (label: string) => {
    setDraft((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const save = () => { onChange(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter") save();
  };

  return (
    <SidebarField label="Labels">
      <div ref={containerRef}>
        {editing ? (
          <div onKeyDown={onKeyDown} tabIndex={-1} className="outline-none">
            <div className="flex flex-wrap gap-1 mb-2">
              {ALL_LABELS.map((label) => {
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
            </div>
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

type RelationKind = "blocks" | "blocked-by" | "related-to";

const RELATION_LABEL: Record<RelationKind, string> = {
  "blocks":     "Blocks",
  "blocked-by": "Blocked by",
  "related-to": "Related to",
};

type RelatedLink = { id: string; ticketId: string; kind: RelationKind };

const MOCK_RELATED_LINKS: RelatedLink[] = [
  { id: "r1", ticketId: "pci-compliance-gap",              kind: "blocks"     },
  { id: "r2", ticketId: "kyc-vendor-outage",               kind: "blocked-by" },
  { id: "r3", ticketId: "push-notification-setup",         kind: "related-to" },
  { id: "r4", ticketId: "accessibility-audit",             kind: "related-to" },
];

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
          <span className="font-mono text-[9px] font-semibold text-slate-400 dark:text-zinc-600 flex-shrink-0">
            {ticket.issueKey}
          </span>
          <div className="flex-shrink-0">
            <StatusBadge status={ticket.status} />
          </div>
          {ticket.priority === "high" && (
            <span
              className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-rose-400 dark:bg-rose-500"
              title="High priority"
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.assignee.avatar}
            alt={ticket.assignee.name}
            className="w-3.5 h-3.5 rounded-full ml-auto flex-shrink-0"
          />
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
  slug,
  currentTicketId,
}: {
  slug: string;
  currentTicketId: string;
}) {
  const [links, setLinks] = useState<RelatedLink[]>(MOCK_RELATED_LINKS);
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkKind, setLinkKind] = useState<RelationKind>("related-to");
  const [searchQuery, setSearchQuery] = useState("");
  const selectorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const linkedIds = new Set(links.map((l) => l.ticketId));

  const q = searchQuery.toLowerCase();
  const searchResults = ALL_TICKETS.filter(
    (t) =>
      t.id !== currentTicketId &&
      !linkedIds.has(t.id) &&
      (t.title.toLowerCase().includes(q) || t.issueKey.toLowerCase().includes(q))
  );

  const addLink = (ticketId: string) => {
    setLinks((prev) => [...prev, { id: newId(), ticketId, kind: linkKind }]);
    setLinking(false);
    setSearchQuery("");
  };

  const grouped = (["blocks", "blocked-by", "related-to"] as RelationKind[])
    .map((kind) => ({
      kind,
      items: links
        .filter((l) => l.kind === kind)
        .map((l) => ({ link: l, ticket: ALL_TICKETS.find((t) => t.id === l.ticketId) }))
        .filter((x): x is { link: RelatedLink; ticket: Ticket } => x.ticket !== undefined),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="py-3.5 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
          Related Tickets
        </p>
        <button
          onClick={() => setLinking((v) => !v)}
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
              onChange={(e) => setLinkKind(e.target.value as RelationKind)}
              className="text-[10px] font-medium bg-slate-50 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400 border-r border-slate-100 dark:border-zinc-800 px-1.5 outline-none flex-shrink-0 cursor-pointer"
            >
              {(Object.keys(RELATION_LABEL) as RelationKind[]).map((k) => (
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
                {searchQuery ? "No results" : "No more tickets to link"}
              </p>
            ) : (
              searchResults.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => addLink(t.id)}
                  className="w-full text-left px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors border-b border-slate-50 dark:border-zinc-800/30 last:border-0"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="font-mono text-[9px] font-semibold text-slate-400 dark:text-zinc-600 flex-shrink-0">
                      {t.issueKey}
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
                {items.map(({ link, ticket: t }) => (
                  <RelatedTicketCard
                    key={link.id}
                    ticket={t}
                    onOpen={() => setPreviewTicket(t)}
                    onRemove={() => setLinks((prev) => prev.filter((l) => l.id !== link.id))}
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
  children,
}: {
  title: string;
  badge?: string;
  headerAction?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

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

function AcceptanceCriteriaSection() {
  const [items, setItems] = useState(MOCK_ACCEPTANCE_CRITERIA);

  const toggle = (id: number) =>
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, done: !item.done } : item));

  const doneCount = items.filter((i) => i.done).length;

  return (
    <CollapsibleSection title="Acceptance Criteria" badge={`· ${doneCount}/${items.length} done`} defaultOpen={true}>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <button
              onClick={() => toggle(item.id)}
              aria-label={item.done ? "Mark incomplete" : "Mark complete"}
              className={
                "mt-0.5 w-4 h-4 rounded flex-shrink-0 border transition-colors flex items-center justify-center " +
                (item.done
                  ? "bg-brand-500 border-brand-500 dark:bg-brand-600 dark:border-brand-600"
                  : "border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:border-brand-400 dark:hover:border-brand-500")
              }
            >
              {item.done && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <span
              className={
                "text-[14px] leading-snug select-none cursor-pointer " +
                (item.done
                  ? "line-through text-slate-400 dark:text-zinc-600"
                  : "text-slate-700 dark:text-zinc-300")
              }
              onClick={() => toggle(item.id)}
            >
              {item.text}
            </span>
          </li>
        ))}
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
};

type UploadingItem = {
  id: string;
  name: string;
  ext: string;
  size: string;
  progress: number;
};

const INITIAL_ATTACHMENTS: AttachmentItem[] = [
  { id: "att-1", name: "design-mockup-v3.fig",   ext: "fig", size: "2.4 MB",  addedBy: "Elena Rossi", avatar: "https://i.pravatar.cc/64?img=5",  uploadedAt: "3 days ago" },
  { id: "att-2", name: "requirements-spec.pdf",   ext: "pdf", size: "348 KB",  addedBy: "Marcus Lee",  avatar: "https://i.pravatar.cc/64?img=12", uploadedAt: "1 week ago" },
  { id: "att-3", name: "screen-recording.mp4",    ext: "mp4", size: "18.2 MB", addedBy: "Sarah Chen",  avatar: "https://i.pravatar.cc/64?img=47", uploadedAt: "5 days ago" },
];

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

function newId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  replacing,
  onDelete,
  onRename,
  onReplace,
}: {
  file: AttachmentItem;
  replacing: boolean;
  onDelete: () => void;
  onRename: (name: string) => void;
  onReplace: () => void;
}) {
  const [renaming, setRenaming]     = useState(false);
  const [renameDraft, setRenameDraft] = useState(file.name);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [confirming, setConfirming] = useState(false);

  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { if (renaming) renameRef.current?.focus(); }, [renaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const saveRename = () => {
    const v = renameDraft.trim();
    if (v && v !== file.name) onRename(v);
    else setRenameDraft(file.name);
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
    <li className={
      "group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors " +
      (replacing
        ? "border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/60"
        : "border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:border-slate-200 dark:hover:border-zinc-700")
    }>
      {/* Extension badge */}
      <span className={"w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-[9px] font-bold uppercase tracking-wide " + extColor}>
        {replacing ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : file.ext}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.avatar} alt={file.addedBy} className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
          <span>{file.addedBy}</span>
          <span>·</span>
          <span>{replacing ? "Updating…" : file.uploadedAt}</span>
        </p>
      </div>

      {/* Actions (hidden while renaming) */}
      {!renaming && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            aria-label={`Download ${file.name}`}
            className="p-1.5 rounded-md text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div ref={menuRef} className="relative">
            <button
              aria-label="More options"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-md text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="3"  cy="8" r="1.25" />
                <circle cx="8"  cy="8" r="1.25" />
                <circle cx="13" cy="8" r="1.25" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-slate-200/50 dark:shadow-black/40 z-20 py-1">
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
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors"
                  onClick={() => { setMenuOpen(false); onReplace(); }}
                >
                  <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12m-5-5l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Replace File
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
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ── AttachmentsSection ────────────────────────────────────────────────────────

function AttachmentsSection() {
  const [attachments,   setAttachments]   = useState<AttachmentItem[]>(INITIAL_ATTACHMENTS);
  const [uploading,     setUploading]     = useState<UploadingItem[]>([]);
  const [dragActive,    setDragActive]    = useState(false);
  const [replacingIds,  setReplacingIds]  = useState<Set<string>>(new Set());
  const [pendingReplId, setPendingReplId] = useState<string | null>(null);

  const dragCounter    = useRef(0);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Drive upload progress forward in 100 ms ticks
  useEffect(() => {
    if (uploading.length === 0) return;
    const timer = setTimeout(() => {
      setUploading((prev) => {
        const stillGoing: UploadingItem[] = [];
        const finished:   UploadingItem[] = [];
        for (const item of prev) {
          const next = Math.min(100, item.progress + Math.random() * 18 + 7);
          if (next >= 100) finished.push({ ...item, progress: 100 });
          else             stillGoing.push({ ...item, progress: next });
        }
        if (finished.length > 0) {
          setAttachments((a) => [
            ...finished.map((f) => ({
              id: f.id,
              name: f.name,
              ext: f.ext,
              size: f.size,
              addedBy: "You",
              avatar: "https://i.pravatar.cc/64?img=33",
              uploadedAt: "Just now",
            })),
            ...a,
          ]);
        }
        return stillGoing;
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [uploading]);

  const startUpload = (files: FileList | File[]) => {
    const items: UploadingItem[] = Array.from(files).map((f) => ({
      id:       newId(),
      name:     f.name,
      ext:      getExt(f.name),
      size:     formatBytes(f.size),
      progress: 0,
    }));
    setUploading((prev) => [...prev, ...items]);
  };

  const totalCount = attachments.length + uploading.length;
  const isEmpty    = attachments.length === 0 && uploading.length === 0;

  return (
    <CollapsibleSection
      title="Attachments"
      badge={totalCount > 0 ? `· ${totalCount} ${totalCount === 1 ? "file" : "files"}` : undefined}
      defaultOpen={false}
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
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) { startUpload(e.target.files); e.target.value = ""; }
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const id   = pendingReplId;
          const file = e.target.files?.[0];
          if (!id || !file) return;
          setPendingReplId(null);
          e.target.value = "";
          const patch = { name: file.name, ext: getExt(file.name), size: formatBytes(file.size), uploadedAt: "Just now" };
          setReplacingIds((prev) => new Set([...prev, id]));
          setTimeout(() => {
            setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
            setReplacingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
          }, 1200);
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
                replacing={replacingIds.has(a.id)}
                onDelete={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                onRename={(name) => setAttachments((prev) => prev.map((x) => x.id === a.id ? { ...x, name, ext: getExt(name) } : x))}
                onReplace={() => { setPendingReplId(a.id); replaceInputRef.current?.click(); }}
              />
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );
}

// ── Development ───────────────────────────────────────────────────────────────

type PRStatus = "open" | "review" | "merged" | "draft" | "closed";

type MockPR = {
  number: number; title: string; status: PRStatus;
  branch: string; author: string; authorAvatar: string; updatedAt: string;
};
type MockBranch = { name: string };
type MockCommit = { sha: string; message: string; author: string; authorAvatar: string; time: string };

type MockPRGroup     = { kind: "prs";      label: string; items: MockPR[]     };
type MockBranchGroup = { kind: "branches"; label: string; items: MockBranch[] };
type MockCommitGroup = { kind: "commits";  label: string; items: MockCommit[] };
type MockDevGroup    = MockPRGroup | MockBranchGroup | MockCommitGroup;
type MockDevProvider = { id: string; name: string; groups: MockDevGroup[] };

const PR_STATUS: Record<PRStatus, { label: string; cls: string }> = {
  open:   { label: "Open",             cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  review: { label: "Ready for Review", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  merged: { label: "Merged",           cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  draft:  { label: "Draft",            cls: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400" },
  closed: { label: "Closed",           cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

const MOCK_DEV: MockDevProvider[] = [
  {
    id: "github",
    name: "GitHub",
    groups: [
      {
        kind: "prs",
        label: "Pull Requests",
        items: [
          { number: 142, title: "Add KYC retry logic with exponential backoff", status: "review", branch: "feature/MBA-8-kyc-retry", author: "Elena Rossi", authorAvatar: "https://i.pravatar.cc/64?img=5",  updatedAt: "2h ago"    },
          { number: 138, title: "Fix: handle null response from KYC provider",  status: "merged", branch: "fix/kyc-null-response",   author: "Marcus Lee",  authorAvatar: "https://i.pravatar.cc/64?img=12", updatedAt: "3 days ago" },
        ],
      },
      {
        kind: "branches",
        label: "Branches",
        items: [
          { name: "feature/MBA-8-kyc-retry" },
          { name: "fix/login-timeout"       },
        ],
      },
      {
        kind: "commits",
        label: "Recent Commits",
        items: [
          { sha: "a3f9c12", message: "Fix retry timeout logic",    author: "Elena Rossi", authorAvatar: "https://i.pravatar.cc/64?img=5",  time: "2h ago"    },
          { sha: "e7b2d04", message: "Improve API error handling", author: "Marcus Lee",  authorAvatar: "https://i.pravatar.cc/64?img=12", time: "5h ago"    },
          { sha: "c1a8f39", message: "Update unit tests",          author: "Sarah Chen",  authorAvatar: "https://i.pravatar.cc/64?img=47", time: "1 day ago" },
        ],
      },
    ],
  },
];

function GitBranchIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3.5 h-3.5"} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4"  cy="3.5"  r="1.5" />
      <circle cx="4"  cy="12.5" r="1.5" />
      <circle cx="12" cy="3.5"  r="1.5" />
      <path d="M4 5v5.5M4 5a4 4 0 008 0" strokeLinecap="round" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const DEV_GROUP_LABEL = "text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-zinc-700";

function renderDevGroup(group: MockDevGroup): ReactNode {
  switch (group.kind) {

    case "prs":
      return (
        <div className="space-y-2">
          {group.items.map((pr, i) => {
            const s = PR_STATUS[pr.status];
            return (
              <div key={i} className="px-3 py-2.5 rounded-lg border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 hover:border-slate-200 dark:hover:border-zinc-700 transition-colors">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="font-mono text-[11px] font-semibold text-slate-400 dark:text-zinc-600 mt-px flex-shrink-0">
                    #{pr.number}
                  </span>
                  <p className="flex-1 min-w-0 text-[13px] font-medium text-slate-800 dark:text-zinc-200 leading-snug truncate">
                    {pr.title}
                  </p>
                  <span className={"ml-1 flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded " + s.cls}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <GitBranchIcon className="w-3 h-3 text-slate-400 dark:text-zinc-600 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-500 max-w-[160px] truncate">
                    {pr.branch}
                  </span>
                  <span className="text-slate-300 dark:text-zinc-700">·</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pr.authorAvatar} alt={pr.author} className="w-3.5 h-3.5 rounded-full flex-shrink-0" />
                  <span className="text-[11px] text-slate-400 dark:text-zinc-600">{pr.author}</span>
                  <span className="text-slate-300 dark:text-zinc-700">·</span>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-600">{pr.updatedAt}</span>
                </div>
              </div>
            );
          })}
        </div>
      );

    case "branches":
      return (
        <div className="space-y-1">
          {group.items.map((b, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <GitBranchIcon className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-600 flex-shrink-0" />
              <code className="text-[12px] font-mono text-slate-700 dark:text-zinc-300">{b.name}</code>
            </div>
          ))}
        </div>
      );

    case "commits":
      return (
        <div>
          {group.items.map((c, i) => (
            <div
              key={i}
              className={
                "flex items-center gap-2.5 py-1.5 " +
                (i < group.items.length - 1 ? "border-b border-slate-100 dark:border-zinc-800/70" : "")
              }
            >
              <code className="text-[10px] font-mono font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 px-1.5 py-0.5 rounded flex-shrink-0">
                {c.sha}
              </code>
              <span className="flex-1 min-w-0 text-[13px] text-slate-700 dark:text-zinc-300 truncate">
                {c.message}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.authorAvatar} alt={c.author} className="w-3.5 h-3.5 rounded-full" />
                <span className="text-[11px] text-slate-400 dark:text-zinc-600">{c.author}</span>
                <span className="text-slate-300 dark:text-zinc-700">·</span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-600">{c.time}</span>
              </div>
            </div>
          ))}
        </div>
      );
  }
}

function DevelopmentSection() {
  return (
    <CollapsibleSection title="Development" defaultOpen={false}>
      <div className="space-y-6">
        {MOCK_DEV.map((provider) => (
          <div key={provider.id}>
            {/* Provider header */}
            <div className="flex items-center gap-1.5 mb-4 pb-3 border-b border-slate-100 dark:border-zinc-800/60">
              {provider.id === "github" && (
                <GitHubIcon className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-500" />
              )}
              <span className="text-[12px] font-semibold text-slate-600 dark:text-zinc-400">
                {provider.name}
              </span>
            </div>

            {/* Resource groups */}
            <div className="space-y-5">
              {provider.groups.map((group) => (
                <div key={group.label}>
                  <p className={`${DEV_GROUP_LABEL} mb-2.5`}>{group.label}</p>
                  {renderDevGroup(group)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
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

// ── Main export ───────────────────────────────────────────────────────────────

export function TicketDetailScreen({
  ticket: initialTicket,
  ticketId,
  slug,
}: {
  ticket: Ticket | undefined;
  ticketId: string;
  slug: string;
}) {
  const [ticket, setTicket] = useState<Ticket | undefined>(
    () => initialTicket ?? getRegisteredTicket(ticketId)
  );

  if (!ticket) {
    return <NotFound ticketId={ticketId} slug={slug} />;
  }

  const update = <K extends keyof Ticket>(key: K, value: Ticket[K]) => {
    setTicket((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const comments = getMockComments(ticket, 3);
  const activity = getMockActivity(ticket);

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
                <span className="font-mono text-[12px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                  {ticket.issueKey}
                </span>
                <EditableStatusBadge
                  value={ticket.status}
                  onChange={(v) => update("status", v)}
                />
              </div>

              <EditableTitle
                value={ticket.title}
                onChange={(v) => update("title", v)}
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
            </header>

            <CollapsibleSection title="Description" defaultOpen={true}>
              <EditableDescription
                value={ticket.description}
                onChange={(v) => update("description", v)}
              />
            </CollapsibleSection>

            <AcceptanceCriteriaSection />

            <AttachmentsSection />

            <DevelopmentSection />

            <CollapsibleSection
              title="Comments"
              badge={ticket.commentCount !== undefined ? `· ${ticket.commentCount} total` : undefined}
              defaultOpen={true}
            >
              <div className="space-y-6">
                {comments.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 ring-1 ring-slate-200 dark:ring-zinc-700"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
                        {c.name}
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
            </CollapsibleSection>

            <CollapsibleSection
              title="Activity"
              badge={`· ${activity.length} updates`}
              defaultOpen={true}
            >
              <div className="pb-2">
                {activity.map((a, i) => {
                  const isLast = i === activity.length - 1;
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
            </CollapsibleSection>

          </article>

          {/* ── Metadata sidebar ─────────────────────────────────────────────── */}
          <aside className="w-56 flex-shrink-0 sticky top-8">

            <EditableSidebarStatus
              value={ticket.status}
              onChange={(v) => update("status", v)}
            />

            <EditableSidebarPriority
              value={ticket.priority}
              onChange={(v) => update("priority", v)}
            />

            <EditableSidebarAssignee
              value={ticket.assignee}
              onChange={(v) => update("assignee", v)}
            />

            <EditableSidebarMilestone
              value={ticket.milestone}
              onChange={(v) => update("milestone", v)}
            />

            <EditableSidebarStoryPoints
              value={ticket.storyPoints}
              onChange={(v) => update("storyPoints", v)}
            />

            <EditableSidebarDueDate
              value={ticket.dueDate}
              onChange={(v) => update("dueDate", v)}
            />

            <EditableSidebarLabels
              value={ticket.labels}
              onChange={(v) => update("labels", v)}
            />

            <RelatedTicketsSection slug={slug} currentTicketId={ticket.id} />

          </aside>

        </div>
      </div>
    </div>
  );
}
