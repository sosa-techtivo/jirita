"use client";

import { useEffect, useRef, useState } from "react";
import type { Ticket, TicketStatus, TicketPriority, TicketType } from "@/lib/mock-tickets";
import { TICKET_TYPE_LABEL } from "@/lib/mock-tickets";

// ── Status metadata ──────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog:       "Inbox",
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
  return <span className="text-[11px] text-slate-500 dark:text-zinc-400">Normal</span>;
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
}

const MOCK_COMMENTERS = [
  { name: "Marcus Lee",  avatar: "https://i.pravatar.cc/64?img=12" },
  { name: "Elena Rossi", avatar: "https://i.pravatar.cc/64?img=5"  },
  { name: "Sarah Chen",  avatar: "https://i.pravatar.cc/64?img=47" },
  { name: "Priya Patel", avatar: "https://i.pravatar.cc/64?img=33" },
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
              <div className={`w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ${ringClass}`} />
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
