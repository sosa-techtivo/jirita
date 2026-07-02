import type { ReactNode } from "react";
import type { Ticket, TicketPriority } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";

function PriorityIndicator({ priority }: { priority: TicketPriority }) {
  if (priority === "high") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400 flex-shrink-0">
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 1L9.5 9H0.5L5 1Z" />
        </svg>
        High
      </span>
    );
  }
  if (priority === "low") {
    return (
      <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
        Low
      </span>
    );
  }
  return null;
}

// ── Board card (vertical, compact) ──────────────────────────────────────────

export function TicketBoardCard({
  ticket,
  onTicketClick,
}: {
  ticket: Ticket;
  onTicketClick: (ticket: Ticket) => void;
}) {
  const isBlocked = ticket.status === "blocked";

  return (
    <button
      type="button"
      data-ticket-id={ticket.id}
      data-ticket-status={ticket.status}
      onClick={() => onTicketClick(ticket)}
      className={[
        "group w-full text-left rounded-lg border bg-white px-3.5 py-2.5",
        "shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-150",
        isBlocked
          ? "border-red-200 dark:border-red-900/60"
          : "border-slate-200 dark:border-zinc-700/70",
        "dark:bg-zinc-900 dark:shadow-black/30",
      ].join(" ")}
    >
      {/* Blocked indicator */}
      {isBlocked && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-2">
          Blocked
        </p>
      )}

      {/* Ticket ID */}
      <p className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 mb-1 leading-none">
        <TicketTypeIcon type={ticket.type} />
        {getTicketDisplayKey(ticket)}
      </p>

      {/* Title */}
      <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-100 leading-snug line-clamp-2">
        {ticket.title}
      </p>

      {/* Due date */}
      {ticket.dueDate && (
        <p className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-400 dark:text-zinc-500">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {ticket.dueDate}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <PriorityIndicator priority={ticket.priority} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {ticket.hours !== undefined && (
            <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">
              {ticket.hours}h
            </span>
          )}
          <MemberTrigger
            name={ticket.assignee.name}
            avatar={ticket.assignee.avatar}
            projectSlug={ticket.projectSlug}
            nested
            className="rounded-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ticket.assignee.avatar}
              alt={ticket.assignee.name}
              title={ticket.assignee.name}
              className="w-5 h-5 rounded-full ring-1 ring-white dark:ring-zinc-900"
            />
          </MemberTrigger>
        </div>
      </div>
    </button>
  );
}

// ── List row (horizontal, full-width) ───────────────────────────────────────

export function TicketListRow({
  ticket,
  onTicketClick,
  projectBadge,
}: {
  ticket: Ticket;
  onTicketClick: (ticket: Ticket) => void;
  /** Optional badge rendered above the title — lets multi-project views
   *  (e.g. a Member's cross-project work queue) show which project a
   *  ticket belongs to without competing with the title for attention. */
  projectBadge?: ReactNode;
}) {
  const isBlocked = ticket.status === "blocked";

  return (
    <button
      type="button"
      data-ticket-id={ticket.id}
      data-ticket-status={ticket.status}
      onClick={() => onTicketClick(ticket)}
      className="group w-full text-left flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      {/* Project badge + ticket ID (+ title) */}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        {projectBadge}
        <span className="flex items-baseline gap-1.5 min-w-0">
          <TicketTypeIcon type={ticket.type} />
          <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
            {getTicketDisplayKey(ticket)}
          </span>
          <span className="text-sm font-medium text-slate-800 dark:text-zinc-100 truncate">
            {ticket.title}
          </span>
        </span>
      </span>

      {/* Right-side metadata */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {isBlocked && (
          <span className="hidden sm:block text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
            Blocked
          </span>
        )}

        <PriorityIndicator priority={ticket.priority} />

        {ticket.dueDate && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-slate-400 dark:text-zinc-500">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            {ticket.dueDate}
          </span>
        )}

        {ticket.hours !== undefined && (
          <span className="hidden sm:block text-xs font-medium text-slate-400 dark:text-zinc-500">
            {ticket.hours}h
          </span>
        )}

        <MemberTrigger
          name={ticket.assignee.name}
          avatar={ticket.assignee.avatar}
          projectSlug={ticket.projectSlug}
          nested
          className="rounded-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.assignee.avatar}
            alt={ticket.assignee.name}
            title={ticket.assignee.name}
            className="w-6 h-6 rounded-full ring-1 ring-white dark:ring-zinc-900"
          />
        </MemberTrigger>
      </div>
    </button>
  );
}
