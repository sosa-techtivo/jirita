import type { Ticket, TicketPriority } from "@/lib/mock-tickets";

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
          <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
            {ticket.milestone}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {ticket.hours !== undefined && (
            <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">
              {ticket.hours}h
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.assignee.avatar}
            alt={ticket.assignee.name}
            title={ticket.assignee.name}
            className="w-5 h-5 rounded-full ring-1 ring-white dark:ring-zinc-900"
          />
        </div>
      </div>
    </button>
  );
}

// ── List row (horizontal, full-width) ───────────────────────────────────────

export function TicketListRow({
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
      className="group w-full text-left flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      {/* Title */}
      <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-zinc-100 truncate">
        {ticket.title}
      </span>

      {/* Right-side metadata */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {isBlocked && (
          <span className="hidden sm:block text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
            Blocked
          </span>
        )}

        <PriorityIndicator priority={ticket.priority} />

        <span className="hidden md:block text-xs text-slate-500 dark:text-zinc-400 truncate max-w-[120px]">
          {ticket.milestone}
        </span>

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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ticket.assignee.avatar}
          alt={ticket.assignee.name}
          title={ticket.assignee.name}
          className="w-6 h-6 rounded-full ring-1 ring-white dark:ring-zinc-900"
        />
      </div>
    </button>
  );
}
