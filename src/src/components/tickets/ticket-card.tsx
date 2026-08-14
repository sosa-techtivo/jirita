import type { ReactNode } from "react";
import { CornerDownRight } from "lucide-react";
import type { Ticket, TicketPriority } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { formatHours } from "@/components/time-tracking-screen";
import { MemberTrigger } from "@/components/member-profile";
import { Avatar } from "@/components/ui/avatar";

function PriorityIndicator({ priority }: { priority: TicketPriority }) {
  // Highest reuses High's exact treatment, one shade darker and bolder —
  // same convention as ticket-ui.tsx's PriorityBadge.
  if (priority === "highest") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-400 flex-shrink-0">
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 1L9.5 9H0.5L5 1Z" />
        </svg>
        Highest
      </span>
    );
  }
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
  // Medium (like Normal before it) shows no indicator — Board/List cards
  // stay uncluttered for the default/unremarkable priority.
  return null;
}

// ── Board card (vertical, compact) ──────────────────────────────────────────

export function TicketBoardCard({
  ticket,
  onTicketClick,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  childrenCount = 0,
  parentCode,
}: {
  ticket: Ticket;
  onTicketClick: (ticket: Ticket) => void;
  /** Board's own drag-and-drop between status columns — false (the
   *  default) everywhere this card is used outside the main Board view,
   *  which renders and behaves exactly as before. A genuine drag never
   *  fires this button's own onClick below — the browser itself never
   *  dispatches click after a real dragstart on a draggable element, so
   *  no separate "was this a drag, not a click" guard is needed. */
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** This ticket's own direct child count (Parent/Children hierarchy) —
   *  0 (the default) renders no indicator at all, same as before this
   *  feature. Resolved by board-column.tsx from the full, unfiltered
   *  project ticket list, never re-queried per card. */
  childrenCount?: number;
  /** This ticket's own parent's display key (e.g. "JIR-43"), when it has
   *  one — undefined renders no indicator. Same brand/icon language as
   *  Ticket Detail's own Parent reference and Children rows. */
  parentCode?: string;
}) {
  const isBlocked = ticket.status === "blocked";

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              onDragStart?.();
            }
          : undefined
      }
      onDragEnd={draggable ? () => onDragEnd?.() : undefined}
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
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
    >
      {/* Blocked indicator */}
      {isBlocked && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-2">
          Blocked
        </p>
      )}

      {/* Ticket ID — Parent/Child hierarchy indicators reuse the exact same
          icon (CornerDownRight) and brand color as Ticket Detail's own
          Parent reference/Children rows, just without a title, per this
          feature's own scope (a hover title is enough on a compact card). */}
      <p className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 mb-1 leading-none">
        {parentCode ? (
          // Sky, not the brand lilac — distinguishes "this ticket IS a
          // child" from "this ticket IS a parent" (brand) at a glance on
          // the Board. Not orange/amber/red: those already carry Bug/
          // Priority/warning meaning elsewhere on this exact card.
          // TicketTypeIcon keeps its own explicit color (BUG's red, etc. —
          // set on its own <svg>, never `currentColor`), so it doesn't pick
          // up the wrapper's sky despite sitting inside it.
          <span title={`Child of ${parentCode}`} className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
            <CornerDownRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <TicketTypeIcon type={ticket.type} />
            {getTicketDisplayKey(ticket)}
          </span>
        ) : childrenCount > 0 ? (
          // Brand lilac — the key itself, not just the trailing `↳ N`
          // badge below, so the whole hierarchy indicator (key included)
          // reads as one lilac unit for a parent card.
          <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
            <TicketTypeIcon type={ticket.type} />
            {getTicketDisplayKey(ticket)}
          </span>
        ) : (
          <>
            <TicketTypeIcon type={ticket.type} />
            {getTicketDisplayKey(ticket)}
          </>
        )}
        {childrenCount > 0 && (
          <span
            title={`${childrenCount} child ticket${childrenCount === 1 ? "" : "s"}`}
            className="inline-flex items-center gap-0.5 text-brand-600 dark:text-brand-400"
          >
            <CornerDownRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            {childrenCount}
          </span>
        )}
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
              {formatHours(ticket.hours)}
            </span>
          )}
          <MemberTrigger
            name={ticket.assignee.name}
            avatar={ticket.assignee.avatar}
            profileId={ticket.assigneeProfileId ?? undefined}
            projectSlug={ticket.projectSlug}
            nested
            className="rounded-full"
          >
            <Avatar
              src={ticket.assignee.avatar}
              name={ticket.assignee.name}
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
            {formatHours(ticket.hours)}
          </span>
        )}

        <MemberTrigger
          name={ticket.assignee.name}
          avatar={ticket.assignee.avatar}
          projectSlug={ticket.projectSlug}
          profileId={ticket.assigneeProfileId ?? undefined}
          nested
          className="rounded-full"
        >
          <Avatar
            src={ticket.assignee.avatar}
            name={ticket.assignee.name}
            title={ticket.assignee.name}
            className="w-6 h-6 rounded-full ring-1 ring-white dark:ring-zinc-900"
          />
        </MemberTrigger>
      </div>
    </button>
  );
}
