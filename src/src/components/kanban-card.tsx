import Link from "next/link";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";

const LABEL_COLORS: Record<string, string> = {
  Security:      "bg-red-50    text-red-600    dark:bg-red-500/10    dark:text-red-400",
  Compliance:    "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  Bug:           "bg-red-50    text-red-600    dark:bg-red-500/10    dark:text-red-400",
  Performance:   "bg-amber-50  text-amber-600  dark:bg-amber-500/10  dark:text-amber-400",
  Design:        "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  Enhancement:   "bg-blue-50   text-blue-600   dark:bg-blue-500/10   dark:text-blue-400",
  API:           "bg-sky-50    text-sky-600    dark:bg-sky-500/10    dark:text-sky-400",
  Integration:   "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400",
  Notifications: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  Marketing:     "bg-pink-50   text-pink-600   dark:bg-pink-500/10   dark:text-pink-400",
  Accessibility: "bg-teal-50   text-teal-600   dark:bg-teal-500/10   dark:text-teal-400",
  Onboarding:    "bg-cyan-50   text-cyan-600   dark:bg-cyan-500/10   dark:text-cyan-400",
  iOS:           "bg-slate-100 text-slate-600  dark:bg-zinc-700      dark:text-zinc-300",
  "Dark Mode":   "bg-slate-100 text-slate-600  dark:bg-zinc-700      dark:text-zinc-300",
};

function labelClass(label: string): string {
  return LABEL_COLORS[label] ?? "bg-slate-100 text-slate-600 dark:bg-zinc-700/80 dark:text-zinc-300";
}

function PriorityIcon({ priority }: { priority: Ticket["priority"] }) {
  if (priority === "high") {
    return (
      <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-label="High priority">
        <title>High priority</title>
        <path d="M6 1.5L11 10H1L6 1.5Z" />
      </svg>
    );
  }
  if (priority === "low") {
    return (
      <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-label="Low priority">
        <title>Low priority</title>
        <path d="M6 10.5L1 2H11L6 10.5Z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor" aria-label="Normal priority">
      <title>Normal priority</title>
      <rect x="1" y="5.5" width="10" height="2" rx="1" />
      <rect x="3" y="2.5" width="6" height="2" rx="1" />
      <rect x="3" y="7.5" width="6" height="2" rx="1" />
    </svg>
  );
}

export function KanbanCard({ ticket, slug }: { ticket: Ticket; slug: string }) {
  const isBlocked = ticket.status === "blocked";

  return (
    <Link
      href={`/projects/${slug}/tickets/${ticket.id}`}
      data-ticket-id={ticket.id}
      data-ticket-status={ticket.status}
      className={[
        "group block rounded-lg border bg-white px-3 py-2.5",
        "shadow-sm hover:shadow-md hover:-translate-y-px",
        "transition-all duration-150 cursor-pointer",
        isBlocked
          ? "border-red-200 dark:border-red-800/60"
          : "border-slate-200 dark:border-zinc-700/70",
        "dark:bg-zinc-900 dark:shadow-black/30",
      ].join(" ")}
    >
      {/* Blocked badge */}
      {isBlocked && (
        <div className="flex items-center gap-1 mb-1.5">
          <svg className="w-2.5 h-2.5 text-red-500 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1a5 5 0 100 10A5 5 0 006 1zM5.25 3.75h1.5v3.5h-1.5v-3.5zm0 4.5h1.5v1.5h-1.5v-1.5z" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Blocked
          </span>
        </div>
      )}

      {/* Issue key */}
      <p className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 mb-1 leading-none">
        <TicketTypeIcon type={ticket.type} />
        {getTicketDisplayKey(ticket)}
      </p>

      {/* Title */}
      <p className="text-sm font-medium text-slate-800 dark:text-zinc-100 leading-snug line-clamp-2">
        {ticket.title}
      </p>

      {/* Labels */}
      {ticket.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {ticket.labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-sm ${labelClass(label)}`}
            >
              {label}
            </span>
          ))}
          {ticket.labels.length > 2 && (
            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              +{ticket.labels.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Due date */}
      {ticket.dueDate && (
        <p className="flex items-center gap-1 mt-2 text-[11px] text-slate-400 dark:text-zinc-500">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          {ticket.dueDate}
        </p>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-2.5 gap-2">
        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={ticket.priority} />

          {ticket.storyPoints !== undefined && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded min-w-[20px] text-center leading-none">
              {ticket.storyPoints}
            </span>
          )}

          {!!ticket.commentCount && (
            <span className="flex items-center gap-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              {ticket.commentCount}
            </span>
          )}

          {!!ticket.attachmentCount && (
            <span className="flex items-center gap-0.5 text-[11px] text-slate-400 dark:text-zinc-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              {ticket.attachmentCount}
            </span>
          )}
        </div>

        <MemberTrigger
          name={ticket.assignee.name}
          avatar={ticket.assignee.avatar}
          projectSlug={slug}
          nested
          className="flex-shrink-0 rounded-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ticket.assignee.avatar}
            alt={ticket.assignee.name}
            title={ticket.assignee.name}
            className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-white dark:ring-zinc-900"
          />
        </MemberTrigger>
      </div>
    </Link>
  );
}
