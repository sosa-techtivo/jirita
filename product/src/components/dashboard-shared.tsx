"use client";

import type { ReactNode } from "react";
import { StatusBadge, TicketTypeIcon } from "@/components/tickets/ticket-ui";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey, getTicketById } from "@/lib/mock-tickets";
import { MemberTrigger } from "@/components/member-profile";

// Pieces shared between the Admin dashboard (dashboard-screen.tsx) and the
// Project Lead dashboard (project-lead-dashboard.tsx). Lives in its own module
// so neither dashboard has to import the other (avoids a circular import).

export const av = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

// ── Shared "hero" gradient card treatment ────────────────────────────────────
//
// Used by the Project Lead's "Current Delivery" card and the Member's
// "Recommended Next" card — the two purple gradient heroes in the app.
//
// The theme only defines brand-50/100/500/600/700 (see globals.css); shades
// like brand-300/400/900/950 don't exist, so any `dark:` class referencing
// them is silently dropped and the *light* class stays in effect — that's
// why these cards looked washed out in dark mode (a light lavender-to-white
// gradient was still rendering against a dark page). Tailwind's built-in
// violet scale is used for the dark accent instead, since it's always
// available and reads as the same purple family as brand.
export const HERO_CARD_CLASS =
  "rounded-2xl border border-brand-100 dark:border-violet-900/50 bg-gradient-to-br from-brand-50 to-white dark:from-violet-950/40 dark:to-zinc-900 shadow-sm shadow-brand-100/50 dark:shadow-black/40";

export const HERO_LABEL_CLASS = "text-brand-500 dark:text-violet-300";

export const HERO_ACCENT_TEXT_CLASS = "text-brand-700 dark:text-violet-300";

export const HERO_BORDER_CLASS = "border-brand-100 dark:border-violet-800/40";

// Marcus's 5 most urgent active tickets — the "My Active Work" list is the
// same underlying data for every role that has assigned work.
export const MY_ACTIVE: Ticket[] = [
  {
    id: "d-pci",  projectSlug: "mobile-banking-app", ticketNumber: 1,
    title: "Resolve PCI compliance gap in card storage",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked", priority: "high", type: "TASK",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Security Audit", labels: ["Security", "Compliance"],
    hours: 24, dueDate: "Jun 28", updatedAt: "Updated 2h ago",
  },
  {
    id: "d-kyc",  projectSlug: "mobile-banking-app", ticketNumber: 8,
    title: "KYC vendor API outage response plan",
    description: "Vendor integration has been failing intermittently.",
    status: "blocked", priority: "high", type: "BUG",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Security Audit", labels: ["Integration"],
    hours: 16, dueDate: "Jul 1", updatedAt: "Updated 1 day ago",
  },
  {
    id: "d-api",  projectSlug: "mobile-banking-app", ticketNumber: 7,
    title: "API rate limiting implementation",
    description: "Add per-client rate limits to protect the transfers API.",
    status: "review", priority: "high", type: "TASK",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Security Audit", labels: ["Security", "API"],
    hours: 4, dueDate: "Jul 3", updatedAt: "Updated 3h ago",
  },
  {
    id: "d-page", projectSlug: "mobile-banking-app", ticketNumber: 4,
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress", priority: "normal", type: "TASK",
    assignee: { name: "Marcus Lee", avatar: av(12) },
    milestone: "Beta Release", labels: ["Performance"],
    hours: 8, dueDate: "Jul 2", updatedAt: "Updated yesterday",
  },
  {
    id: "d-push", projectSlug: "mobile-banking-app", ticketNumber: 3,
    title: "Push notification setup for transaction alerts",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "in-progress", priority: "normal", type: "TASK",
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
  id: string;
  type: ActivityType;
  avatar: string;
  name: string;
  /** The action fragment only — e.g. "marked", "completed". Never embeds the
   *  ticket title; when `ticketId` is set, the title renders on its own
   *  clickable line via getTicketDisplayKey instead. */
  verb: ReactNode;
  /** References Ticket.id in mock-tickets.ts. Omit for activity that isn't
   *  about a specific ticket (e.g. project-level events) — those render as a
   *  plain sentence with no ticket-reference line. */
  ticketId?: string;
  /** Extra context shown in the meta line, e.g. "8h → 12h" or "to Priya Patel". */
  detail?: ReactNode;
  project: string;
  time: string;
}> = [
  {
    id: "a1", type: "blocked", avatar: av(22), name: "David Kim",
    verb: "marked", ticketId: "kyc-vendor-outage",
    project: "Mobile Banking App", time: "2h ago",
  },
  {
    id: "a7", type: "note", avatar: av(47), name: "Sarah Chen",
    verb: <>added a note — <span className="font-medium">&ldquo;Onboarding flow — final decision&rdquo;</span></>,
    project: "Mobile Banking App", time: "3h ago",
  },
  {
    id: "a2", type: "completed", avatar: av(12), name: "Marcus Lee",
    verb: "completed", ticketId: "biometric-login-crash",
    project: "Mobile Banking App", time: "4h ago",
  },
  {
    id: "a8", type: "assigned", avatar: av(22), name: "David Kim",
    verb: "reassigned", ticketId: "push-notification-setup",
    detail: <>to <span className="font-medium">Priya Patel</span></>,
    project: "Mobile Banking App", time: "5h ago",
  },
  {
    id: "a3", type: "hours", avatar: av(33), name: "Priya Patel",
    verb: "updated the estimate on", ticketId: "accessibility-audit",
    detail: <span className="font-medium">8h → 12h</span>,
    project: "Mobile Banking App", time: "6h ago",
  },
  {
    id: "a4", type: "note", avatar: av(5), name: "Elena Rossi",
    verb: <>added a note — <span className="font-medium">&ldquo;Homepage timeline pushed to Q3&rdquo;</span></>,
    project: "Client Website Redesign", time: "Yesterday",
  },
  {
    id: "a5", type: "assigned", avatar: av(47), name: "Sarah Chen",
    verb: <>assigned <span className="font-medium">Elena Rossi</span> to the project</>,
    project: "Marketing Site Relaunch", time: "Yesterday",
  },
  {
    id: "a6", type: "priority", avatar: av(22), name: "David Kim",
    verb: "raised priority on", ticketId: "api-rate-limiting",
    detail: <span className="font-medium">Normal → High</span>,
    project: "Mobile Banking App", time: "2 days ago",
  },
  {
    id: "a9", type: "completed", avatar: av(15), name: "Jordan Wu",
    verb: "completed", ticketId: "admin-panel-routing",
    project: "Internal Platform Migration", time: "1 day ago",
  },
  {
    id: "a10", type: "priority", avatar: av(12), name: "Marcus Lee",
    verb: "raised priority on", ticketId: "cutover-plan",
    detail: <span className="font-medium">Normal → High</span>,
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

export function ActiveTicketRow({
  ticket,
  onOpen,
  projectBadge,
}: {
  ticket: Ticket;
  onOpen: (t: Ticket) => void;
  /** Optional badge rendered above the title — lets multi-project views
   *  (e.g. a Member's cross-project work queue) show which project a
   *  ticket belongs to without competing with the title for attention. */
  projectBadge?: ReactNode;
}) {
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
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        {projectBadge}
        <span className="flex items-baseline gap-1.5 min-w-0">
          <TicketTypeIcon type={ticket.type} />
          <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
            {getTicketDisplayKey(ticket)}
          </span>
          <span className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">
            {ticket.title}
          </span>
        </span>
      </span>
      {ticket.dueDate && (
        <span className={`text-[11px] font-medium flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-400 dark:text-zinc-500"}`}>
          {ticket.dueDate}
        </span>
      )}
    </button>
  );
}

export function RecentActivityList({
  items,
  onOpenTicket,
}: {
  items: typeof RECENT_ACTIVITY;
  /** Opens the existing Ticket Detail preview/page — every clickable ticket
   *  reference in this list calls into it rather than inventing new navigation. */
  onOpenTicket: (ticket: Ticket) => void;
}) {
  return (
    <ul className="space-y-4">
      {items.map((entry) => {
        const meta = ACTIVITY_META[entry.type];
        const ticket = entry.ticketId ? getTicketById(entry.ticketId) : undefined;
        return (
          <li key={entry.id} className="flex items-start gap-3">
            <MemberTrigger name={entry.name} avatar={entry.avatar} className="flex-shrink-0 mt-0.5 rounded-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.avatar}
                alt={entry.name}
                className="w-6 h-6 rounded-full"
              />
            </MemberTrigger>
            <div className="text-[13px] leading-snug min-w-0 flex-1">
              <p className="text-slate-700 dark:text-zinc-300">
                <MemberTrigger name={entry.name} avatar={entry.avatar} className="font-medium text-slate-900 dark:text-zinc-100 hover:underline">
                  {entry.name}
                </MemberTrigger>{" "}
                {entry.verb}
              </p>
              {ticket && (
                <button
                  type="button"
                  onClick={() => onOpenTicket(ticket)}
                  className="group/ref mt-1 flex items-baseline gap-1.5 min-w-0 max-w-full text-left"
                >
                  <TicketTypeIcon type={ticket.type} />
                  <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 flex-shrink-0">
                    {getTicketDisplayKey(ticket)}
                  </span>
                  <span className="text-[13px] font-medium text-slate-700 dark:text-zinc-300 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 group-hover/ref:underline truncate">
                    {ticket.title}
                  </span>
                </button>
              )}
              <p className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} aria-hidden="true" />
                {meta.label}
                {entry.detail && (
                  <>
                    <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
                    {entry.detail}
                  </>
                )}
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
