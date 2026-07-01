import type { Ticket, TicketStatus, TicketPriority } from "@/lib/mock-tickets";

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
