"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Ticket, TicketStatus, TicketPriority, TicketType } from "@/lib/mock-tickets";
import { TICKET_TYPE_LABEL } from "@/lib/mock-tickets";

// ── Error toast ───────────────────────────────────────────────────────────────
// The Tickets module's write paths (inline edits, comments, time entries,
// attachments, related tickets) previously only logged a failed save to the
// console, with nothing shown to the user — this is the one surface all of
// them now report through. Same shape/position/timing as users-screen.tsx's
// own Toast (an already-shipped pattern in this codebase), just the error
// variant of it: red icon instead of green check, slightly longer dismiss
// delay since an error needs to actually be read.

export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 bg-slate-900 dark:bg-zinc-800 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-black/20 max-w-sm">
      <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
      </svg>
      <span className="leading-snug">{message}</span>
    </div>
  );
}

// ── Status metadata ──────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog:       "Backlog",
  "to-do":       "To Do",
  "in-progress": "In Progress",
  review:        "In Review",
  blocked:       "Blocked",
  done:          "Done",
};

export const STATUS_CLASS: Record<TicketStatus, string> = {
  backlog:       "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400",
  "to-do":       "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400",
  "in-progress": "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  review:        "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400",
  blocked:       "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  done:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  // Highest reuses High's exact red triangle treatment, one shade darker
  // and bolder, to read as more urgent than High without introducing a new
  // color family.
  if (priority === "highest") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-400">
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 1L9.5 9H0.5L5 1Z" />
        </svg>
        Highest
      </span>
    );
  }
  if (priority === "high") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 1L9.5 9H0.5L5 1Z" />
        </svg>
        High
      </span>
    );
  }
  if (priority === "low") {
    return <span className="text-[11px] text-slate-400 dark:text-zinc-500">Low</span>;
  }
  // Medium reuses the exact styling that "Normal" (the value it replaced) used.
  return <span className="text-[11px] text-slate-500 dark:text-zinc-400">Medium</span>;
}

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  highest: "Highest",
  high:    "High",
  medium:  "Medium",
  low:     "Low",
};

// Canonical order (most to least urgent) — the one place selects/dropdowns/
// legends should source their option order from, instead of each keeping
// its own independent list.
export const PRIORITY_VALUES: TicketPriority[] = ["highest", "high", "medium", "low"];

// ── Shared editing primitives ────────────────────────────────────────────────
// Shared by ticket-detail-screen.tsx and ticket-preview-panel.tsx so neither
// duplicates the other's inline-edit interaction/styling — lives here (not in
// either of those two files) since ticket-detail-screen.tsx already imports
// TicketPreviewPanel, and the reverse import would create a cycle.

export const EDIT_BTN =
  "opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 p-0.5 rounded " +
  "text-slate-300 hover:text-slate-500 dark:text-zinc-600 dark:hover:text-zinc-400 " +
  "hover:bg-slate-100 dark:hover:bg-zinc-800 flex-shrink-0 focus:outline-none focus:opacity-100";

export const INPUT_BASE =
  "bg-white dark:bg-zinc-950 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 w-full";

export function PencilIcon({ className }: { className?: string }) {
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

export function CalendarIcon() {
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

// ── Due date display ↔ ISO conversion ────────────────────────────────────────
// The app displays due dates as "Jul 16" (see formatDueDate in lib/tickets.ts)
// but persists/edits them as an ISO yyyy-mm-dd — these two convert between the
// two only where an editor needs to seed/read a native <input type="date">.

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

export function parseDisplayDate(display: string): string {
  const parts = display.trim().split(/\s+/);
  if (parts.length !== 2) return "";
  const month = MONTH_MAP[parts[0]];
  const day = parts[1].padStart(2, "0");
  return month ? `2026-${month}-${day}` : "";
}

export function formatISODate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The user's real local "today" (optionally offset by N days) — never a
// fixed/mock date. Built from local getters (not toISOString(), which is
// UTC and can show the wrong calendar day near midnight in the user's own
// timezone). offsetDays lets callers get e.g. "7 days from today" for a
// date-range filter without a separate helper.
export function getTodayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// ── Labels catalog ────────────────────────────────────────────────────────────

export const ALL_LABELS = [
  "Accessibility", "API", "Bug", "Compliance", "Dark Mode",
  "Design", "Enhancement", "Integration", "iOS", "Marketing",
  "Notifications", "Onboarding", "Performance", "Security",
];

// Merges the static seed categories with the real, growing per-org catalog
// (case-insensitive de-dup — a real label matching a seed name by spelling
// only shows once).
export function buildLabelCatalog(orgLabels: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const l of [...ALL_LABELS, ...orgLabels]) {
    const key = l.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(l);
    }
  }
  return merged;
}

// ── Editable: Status badge (used in Ticket Detail's header and the preview
// panel — same trigger + native <select> everywhere a Status badge appears) ──

export function EditableStatusBadge({ value, onChange }: { value: TicketStatus; onChange: (v: TicketStatus) => void }) {
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

// ── Ticket type icon ─────────────────────────────────────────────────────────
//
// The one place that renders a Task/Bug glyph — every screen that shows a
// ticket ID puts this immediately before it (never redraws its own icon)
// so the glyph and its color stay identical everywhere. Deliberately plain:
// Task uses the same neutral tone as the ID text next to it so it never
// competes with a Status or Priority badge; Bug borrows the same red already
// used for "High" priority and "Blocked" status, since a bug is inherently
// higher-signal than a task.

export function TicketTypeIcon({ type, className }: { type: TicketType; className?: string }) {
  const size = className ?? "w-3 h-3";
  const label = TICKET_TYPE_LABEL[type];

  if (type === "BUG") {
    return (
      <svg
        className={`${size} text-red-500 dark:text-red-400 flex-shrink-0`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label={label}
        role="img"
      >
        <title>{label}</title>
        <rect x="8" y="9" width="8" height="10" rx="4" />
        <path d="M12 9V6M9 6L7.5 4.5M15 6l1.5-1.5M8 13H4M20 13h-4M8 17l-2.5 2M18.5 19L16 17M10 6h4" />
      </svg>
    );
  }

  return (
    <svg
      className={`${size} text-slate-400 dark:text-zinc-500 flex-shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={label}
      role="img"
    >
      <title>{label}</title>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
    </svg>
  );
}

function TypeSelectChevron() {
  return (
    <svg className="w-3 h-3 flex-shrink-0 text-slate-400 dark:text-zinc-600 ml-auto" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// The one place that renders a Task/Bug *picker* — both the ticket creation
// form and the ticket detail sidebar use this instead of a native <select>,
// since a native <option> can't render the TicketTypeIcon glyph. Built on
// TicketTypeIcon rather than redrawing the icons, so the picker's trigger
// and menu always match every other Type indicator in the app.
export function TicketTypeSelect({
  value,
  onChange,
  buttonClassName,
}: {
  value: TicketType;
  onChange: (next: TicketType) => void;
  /** Overrides the trigger's classes so callers can match surrounding form
   *  chrome (e.g. a bordered input row) instead of the compact default. */
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const defaultTrigger =
    "group inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
    "hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer";

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={buttonClassName ?? defaultTrigger}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <TicketTypeIcon type={value} />
          <span className="truncate">{TICKET_TYPE_LABEL[value]}</span>
        </span>
        <TypeSelectChevron />
      </button>

      <div
        role="listbox"
        aria-label="Ticket type"
        className={[
          "absolute left-0 top-full mt-1.5 z-50 w-36",
          "rounded-lg border bg-white dark:bg-zinc-900",
          "shadow-lg shadow-black/10 dark:shadow-black/40",
          "border-slate-200 dark:border-zinc-700/60",
          "transition-all duration-150 origin-top-left py-1",
          isOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none",
        ].join(" ")}
      >
        {(Object.keys(TICKET_TYPE_LABEL) as TicketType[]).map((k) => (
          <button
            key={k}
            type="button"
            role="option"
            aria-selected={k === value}
            onClick={() => { onChange(k); setIsOpen(false); }}
            className={[
              "w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-left transition-colors",
              k === value
                ? "text-brand-700 dark:text-brand-400 bg-brand-50/60 dark:bg-brand-500/10 font-medium"
                : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60",
            ].join(" ")}
          >
            <TicketTypeIcon type={k} />
            {TICKET_TYPE_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Label tag ─────────────────────────────────────────────────────────────────

export function LabelTag({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-medium text-slate-600 dark:text-zinc-400">
      {label}
    </span>
  );
}

// ── Mock data ─────────────────────────────────────────────────────────────────

export interface MockComment {
  name: string;
  avatar: string;
  timeAgo: string;
  text: string;
}

export interface MockActivity {
  label: string;
  timeAgo: string;
  /** Optional self-contained icon badge (e.g. a small colored circle+glyph)
   *  shown in place of the plain timeline dot. Callers that don't need
   *  per-event icons (ticket activity) omit it and get the original dot. */
  icon?: ReactNode;
}

const MOCK_COMMENTERS = [
  { name: "Marcus Lee",  avatar: "https://i.pravatar.cc/64?img=12" },
  { name: "Elena Rossi", avatar: "https://i.pravatar.cc/64?img=5"  },
  { name: "Sarah Chen",  avatar: "https://i.pravatar.cc/64?img=47" },
  { name: "Alejo Cadavid", avatar: "https://i.pravatar.cc/64?img=33" },
  { name: "David Kim",   avatar: "https://i.pravatar.cc/64?img=22" },
];

const MOCK_COMMENT_TEXTS = [
  "Left a few notes in the PR — mostly minor. One thing worth double-checking on the error path.",
  "Can pick this up after wrapping the security items. Should be unblocked by end of week.",
  "Talked to the rest of the team. We're aligned on the approach.",
  "Are we handling the edge case where the session expires mid-flow?",
];

const MOCK_COMMENT_TIMES = ["3 days ago", "2 days ago", "yesterday", "5 hours ago"];

export function getMockComments(ticket: Ticket, limit = 2): MockComment[] {
  const others = MOCK_COMMENTERS.filter((c) => c.name !== ticket.assignee.name);
  return Array.from({ length: Math.min(limit, MOCK_COMMENT_TEXTS.length) }, (_, i) => ({
    ...others[i % others.length],
    timeAgo: MOCK_COMMENT_TIMES[i] ?? `${i + 1} days ago`,
    text: MOCK_COMMENT_TEXTS[i],
  }));
}

export function getMockActivity(ticket: Ticket): MockActivity[] {
  const events: MockActivity[] = [
    { label: "Ticket created",                       timeAgo: "9 days ago" },
    { label: `Assigned to ${ticket.assignee.name}`,  timeAgo: "8 days ago" },
  ];
  if (ticket.hours !== undefined) {
    events.push({ label: `Hours set to ${ticket.hours} h`,  timeAgo: "6 days ago" });
  }
  if (ticket.status !== "backlog" && ticket.status !== "to-do") {
    events.push({ label: `Status → ${STATUS_LABEL[ticket.status]}`, timeAgo: "3 days ago" });
  }
  return events.reverse();
}

// ── Activity timeline (shared visual component) ───────────────────────────────

export function ActivityTimeline({ events, ringClass }: { events: MockActivity[]; ringClass: string }) {
  return (
    <div>
      {events.map((a, i) => {
        const isLast = i === events.length - 1;
        return (
          <div key={i} className="flex gap-3.5">
            <div className="flex flex-col items-center w-4 flex-shrink-0">
              {a.icon ?? (
                <div className={`w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ${ringClass}`} />
              )}
              {!isLast && (
                <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[20px]" />
              )}
            </div>
            <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
              <p className="text-[12px] text-slate-700 dark:text-zinc-300 leading-snug">{a.label}</p>
              <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">{a.timeAgo}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
