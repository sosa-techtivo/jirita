"use client";

import type { ReactNode } from "react";
import { StatusBadge } from "@/components/tickets/ticket-ui";
import type { Ticket } from "@/lib/mock-tickets";

// Pieces shared between the Admin dashboard (dashboard-screen.tsx) and the
// Project Lead dashboard (project-lead-dashboard.tsx). Lives in its own module
// so neither dashboard has to import the other (avoids a circular import).

export const av = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

// Marcus's 5 most urgent active tickets — the "My Active Work" list is the
// same underlying data for every role that has assigned work.
export const MY_ACTIVE: Ticket[] = [
  {
    id: "d-pci",  issueKey: "MBA-1",
    title: "Resolve PCI compliance gap in card storage",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked", priority: "high",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Security Audit", labels: ["Security", "Compliance"],
    hours: 24, dueDate: "Jun 28", updatedAt: "Updated 2h ago",
  },
  {
    id: "d-kyc",  issueKey: "MBA-8",
    title: "KYC vendor API outage response plan",
    description: "Vendor integration has been failing intermittently.",
    status: "blocked", priority: "high",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Security Audit", labels: ["Integration"],
    hours: 16, dueDate: "Jul 1", updatedAt: "Updated 1 day ago",
  },
  {
    id: "d-api",  issueKey: "MBA-7",
    title: "API rate limiting implementation",
    description: "Add per-client rate limits to protect the transfers API.",
    status: "review", priority: "high",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Security Audit", labels: ["Security", "API"],
    hours: 4, dueDate: "Jul 3", updatedAt: "Updated 3h ago",
  },
  {
    id: "d-page", issueKey: "MBA-4",
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress", priority: "normal",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Beta Release", labels: ["Performance"],
    hours: 8, dueDate: "Jul 2", updatedAt: "Updated yesterday",
  },
  {
    id: "d-push", issueKey: "MBA-3",
    title: "Push notification setup for transaction alerts",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "in-progress", priority: "normal",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Beta Release", labels: ["Notifications"],
    hours: 8, dueDate: "Jul 5", updatedAt: "Updated 3h ago",
  },
];

// Recent activity — meaningful cross-project events (from My Work + Reports data)
export type ActivityType = "blocked" | "completed" | "hours" | "note" | "assigned" | "priority";

export const ACTIVITY_META: Record<ActivityType, { label: string; dot: string }> = {
  blocked:   { label: "Blocked",   dot: "bg-red-400" },
  completed: { label: "Completed", dot: "bg-emerald-400" },
  hours:     { label: "Estimate",  dot: "bg-brand-400" },
  note:      { label: "Note",      dot: "bg-violet-400" },
  assigned:  { label: "Assigned",  dot: "bg-sky-400" },
  priority:  { label: "Priority",  dot: "bg-amber-400" },
};

export const RECENT_ACTIVITY: Array<{
  id: string; type: ActivityType; avatar: string; name: string; action: ReactNode; project: string; time: string;
}> = [
  {
    id: "a1", type: "blocked", avatar: av(22), name: "David Kim",
    action: <>marked <span className="font-medium">&ldquo;Third-party KYC vendor outage&rdquo;</span> as blocked</>,
    project: "Mobile Banking App", time: "2h ago",
  },
  {
    id: "a7", type: "note", avatar: av(47), name: "Sarah Chen",
    action: <>added a note — <span className="font-medium">&ldquo;Onboarding flow — final decision&rdquo;</span></>,
    project: "Mobile Banking App", time: "3h ago",
  },
  {
    id: "a2", type: "completed", avatar: av(12), name: "Marcus Lee",
    action: <>completed <span className="font-medium">&ldquo;Fix biometric login crash&rdquo;</span></>,
    project: "Mobile Banking App", time: "4h ago",
  },
  {
    id: "a8", type: "assigned", avatar: av(22), name: "David Kim",
    action: <>reassigned <span className="font-medium">&ldquo;Push notification setup for transaction alerts&rdquo;</span> to <span className="font-medium">Priya Patel</span></>,
    project: "Mobile Banking App", time: "5h ago",
  },
  {
    id: "a3", type: "hours", avatar: av(33), name: "Priya Patel",
    action: <>updated the estimate on <span className="font-medium">&ldquo;Accessibility audit&rdquo;</span> — <span className="font-medium">8h → 12h</span></>,
    project: "Mobile Banking App", time: "6h ago",
  },
  {
    id: "a4", type: "note", avatar: av(5), name: "Elena Rossi",
    action: <>added a note — <span className="font-medium">&ldquo;Homepage timeline pushed to Q3&rdquo;</span></>,
    project: "Client Website Redesign", time: "Yesterday",
  },
  {
    id: "a5", type: "assigned", avatar: av(47), name: "Sarah Chen",
    action: <>assigned <span className="font-medium">Elena Rossi</span> to the project</>,
    project: "Marketing Site Relaunch", time: "Yesterday",
  },
  {
    id: "a6", type: "priority", avatar: av(22), name: "David Kim",
    action: <>raised priority on <span className="font-medium">&ldquo;API rate limiting implementation&rdquo;</span> — Normal → High</>,
    project: "Mobile Banking App", time: "2 days ago",
  },
  {
    id: "a9", type: "completed", avatar: av(15), name: "Jordan Wu",
    action: <>completed <span className="font-medium">&ldquo;Route admin panels to new platform&rdquo;</span></>,
    project: "Internal Platform Migration", time: "1 day ago",
  },
  {
    id: "a10", type: "priority", avatar: av(12), name: "Marcus Lee",
    action: <>raised priority on <span className="font-medium">&ldquo;Migration cutover plan&rdquo;</span> — Normal → High</>,
    project: "Internal Platform Migration", time: "2 days ago",
  },
];

export function Card({
  title,
  count,
  action,
  children,
}: {
  title:    string;
  count?:   number;
  action?:  ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
            {title}
          </h2>
          {count !== undefined && (
            <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ActiveTicketRow({ ticket, onOpen }: { ticket: Ticket; onOpen: (t: Ticket) => void }) {
  const isOverdue =
    ticket.status !== "done" &&
    (ticket.dueDate === "Jun 28" || ticket.dueDate === "Jun 29" || ticket.dueDate === "Jun 30");

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full flex items-center gap-3 py-2 px-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
    >
      <StatusBadge status={ticket.status} />
      <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">
        {ticket.title}
      </span>
      {ticket.dueDate && (
        <span className={`text-[11px] font-medium flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-400 dark:text-zinc-500"}`}>
          {ticket.dueDate}
        </span>
      )}
    </button>
  );
}

export function RecentActivityList({ items }: { items: typeof RECENT_ACTIVITY }) {
  return (
    <ul className="space-y-4">
      {items.map((entry) => {
        const meta = ACTIVITY_META[entry.type];
        return (
          <li key={entry.id} className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.avatar}
              alt={entry.name}
              className="w-6 h-6 rounded-full mt-0.5 flex-shrink-0"
            />
            <div className="text-[13px] leading-snug min-w-0 flex-1">
              <p className="text-slate-700 dark:text-zinc-300">
                <span className="font-medium text-slate-900 dark:text-zinc-100">{entry.name}</span>{" "}
                {entry.action}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} aria-hidden="true" />
                {meta.label}
                <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
                {entry.project}
                <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
                {entry.time}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
