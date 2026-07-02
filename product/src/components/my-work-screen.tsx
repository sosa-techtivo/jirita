"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { Ticket, TicketStatus } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketListRow } from "@/components/tickets/ticket-card";
import { BoardView } from "@/components/tickets/board-view";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { StatusBadge, TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";
import { useCurrentUser } from "@/components/current-user-provider";
import { timesheetRows, weeklyCapacityPct } from "@/lib/mock-time-tracking";
import { CapacityCell, formatHours } from "@/components/time-tracking-screen";
import { PersonalTimesheetPanel } from "@/components/personal-timesheet-panel";
import type { PersonalTimesheetEntry } from "@/components/personal-timesheet-panel";

// ── Mock current user ─────────────────────────────────────────────────────────

const CURRENT_USER = {
  name: "Marcus Lee",
  avatar: "https://i.pravatar.cc/64?img=12",
};

// ── Mock tickets assigned to current user ─────────────────────────────────────

const MY_TICKETS: Ticket[] = [
  {
    id: "mw-pci",
    projectSlug: "mobile-banking-app",
    ticketNumber: 1,
    title: "Resolve PCI compliance gap in card storage",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked",
    priority: "high",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Security Audit",
    labels: ["Security", "Compliance"],
    storyPoints: 13,
    hours: 24,
    dueDate: "Jun 28",
    commentCount: 7,
    updatedAt: "Updated 2h ago",
  },
  {
    id: "mw-kyc",
    projectSlug: "mobile-banking-app",
    ticketNumber: 8,
    title: "Third-party KYC vendor API outage response plan",
    description: "Vendor integration has been failing intermittently. Need contingency plan and escalation.",
    status: "blocked",
    priority: "high",
    type: "BUG",
    assignee: CURRENT_USER,
    milestone: "Security Audit",
    labels: ["Integration"],
    storyPoints: 8,
    hours: 16,
    dueDate: "Jul 1",
    commentCount: 5,
    updatedAt: "Updated 1 day ago",
  },
  {
    id: "mw-pagination",
    projectSlug: "mobile-banking-app",
    ticketNumber: 4,
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress",
    priority: "normal",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Beta Release",
    labels: ["Performance"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jul 2",
    commentCount: 3,
    updatedAt: "Updated yesterday",
  },
  {
    id: "mw-push",
    projectSlug: "mobile-banking-app",
    ticketNumber: 3,
    title: "Push notification setup for transaction alerts",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "in-progress",
    priority: "normal",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Beta Release",
    labels: ["Notifications"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jul 5",
    commentCount: 2,
    updatedAt: "Updated 3h ago",
  },
  {
    id: "mw-offline",
    projectSlug: "mobile-banking-app",
    ticketNumber: 15,
    title: "Offline mode for balance viewing",
    description: "Allow users to view their last cached balance and recent transactions without a network connection.",
    status: "in-progress",
    priority: "normal",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "App Store Submission",
    labels: ["Enhancement"],
    storyPoints: 8,
    hours: 16,
    dueDate: "Jul 20",
    commentCount: 3,
    updatedAt: "Updated 3 days ago",
  },
  {
    id: "mw-session",
    projectSlug: "mobile-banking-app",
    ticketNumber: 13,
    title: "Configurable session timeout settings",
    description: "Let users choose how long before the app locks after inactivity.",
    status: "to-do",
    priority: "low",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Security Audit",
    labels: ["Security"],
    storyPoints: 5,
    hours: 8,
    dueDate: "Jul 15",
    commentCount: 1,
    updatedAt: "Updated 5 days ago",
  },
  {
    id: "mw-dark",
    projectSlug: "mobile-banking-app",
    ticketNumber: 14,
    title: "Dark mode for spend analytics charts",
    description: "Update chart color palette so graphs look polished in dark mode.",
    status: "to-do",
    priority: "low",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "App Store Submission",
    labels: ["Design", "Dark Mode"],
    storyPoints: 3,
    hours: 6,
    dueDate: "Aug 3",
    updatedAt: "Updated 4 days ago",
  },
  {
    id: "mw-api",
    projectSlug: "mobile-banking-app",
    ticketNumber: 7,
    title: "API rate limiting implementation",
    description: "Add per-client rate limits to protect the transfers API from abuse.",
    status: "review",
    priority: "normal",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Security Audit",
    labels: ["Security", "API"],
    storyPoints: 3,
    hours: 4,
    dueDate: "Jul 3",
    updatedAt: "Updated 3h ago",
  },
  {
    id: "mw-a11y",
    projectSlug: "mobile-banking-app",
    ticketNumber: 12,
    title: "Accessibility audit and WCAG 2.1 fixes",
    description: "Ensure VoiceOver and TalkBack compatibility for WCAG 2.1 AA compliance.",
    status: "review",
    priority: "high",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Beta Release",
    labels: ["Accessibility", "Compliance"],
    storyPoints: 8,
    hours: 12,
    dueDate: "Jul 10",
    commentCount: 4,
    updatedAt: "Updated 1 day ago",
  },
  {
    id: "mw-biometric",
    projectSlug: "mobile-banking-app",
    ticketNumber: 6,
    title: "Fix biometric login crash on iOS 18",
    description: "Face ID login intermittently crashes the app on iOS 18 devices.",
    status: "done",
    priority: "high",
    type: "BUG",
    assignee: CURRENT_USER,
    milestone: "Beta Release",
    labels: ["Bug", "iOS"],
    storyPoints: 3,
    hours: 4,
    dueDate: "Jun 18",
    commentCount: 6,
    updatedAt: "Updated 12 minutes ago",
  },
  {
    id: "mw-mfa",
    projectSlug: "mobile-banking-app",
    ticketNumber: 5,
    title: "Add MFA onboarding step",
    description: "Guide new users through enabling multi-factor authentication on first login.",
    status: "done",
    priority: "normal",
    type: "TASK",
    assignee: CURRENT_USER,
    milestone: "Beta Release",
    labels: ["Security", "Onboarding"],
    storyPoints: 5,
    hours: 6,
    dueDate: "Jun 20",
    commentCount: 4,
    updatedAt: "Updated yesterday",
  },
];

// ── Recent activity (with time groups) ───────────────────────────────────────

interface ActivityEntry {
  id: string;
  name: string;
  avatar: string;
  /** The action fragment only — the ticket title never appears here; when
   *  `ticket` is set it renders on its own clickable line instead. */
  action: ReactNode;
  time: string;
  group: "today" | "yesterday" | "earlier";
  ticket?: Ticket;
}

const av = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

const MY_TICKETS_BY_ID = new Map(MY_TICKETS.map((t) => [t.id, t]));

const RECENT_ACTIVITY: ActivityEntry[] = [
  {
    id: "ra-1",
    name: "Sarah Chen",
    avatar: av(47),
    action: "commented on",
    time: "2 hours ago",
    group: "today",
    ticket: MY_TICKETS_BY_ID.get("mw-pagination"),
  },
  {
    id: "ra-2",
    name: "Priya Patel",
    avatar: av(33),
    action: <>changed Hours — <span className="font-medium">8h → 12h</span></>,
    time: "5 hours ago",
    group: "today",
    ticket: MY_TICKETS_BY_ID.get("mw-a11y"),
  },
  {
    id: "ra-3",
    name: "Elena Rossi",
    avatar: av(5),
    action: "linked a PR to",
    time: "Yesterday",
    group: "yesterday",
    ticket: MY_TICKETS_BY_ID.get("mw-dark"),
  },
  {
    id: "ra-4",
    name: "Marcus Lee",
    avatar: av(12),
    action: <>moved to <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span></>,
    time: "Yesterday",
    group: "yesterday",
    ticket: MY_TICKETS_BY_ID.get("mw-biometric"),
  },
  {
    id: "ra-5",
    name: "David Kim",
    avatar: av(22),
    action: "commented on",
    time: "2 days ago",
    group: "earlier",
    ticket: MY_TICKETS_BY_ID.get("mw-pci"),
  },
];

const ACTIVITY_GROUPS: { id: string; label: string; key: ActivityEntry["group"] }[] = [
  { id: "today",     label: "Today",              key: "today" },
  { id: "yesterday", label: "Yesterday",           key: "yesterday" },
  { id: "earlier",   label: "Earlier This Week",   key: "earlier" },
];

// ── Filter group data ─────────────────────────────────────────────────────────

const STATUS_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "backlog",      label: "Inbox" },
    { value: "to-do",        label: "To Do" },
    { value: "in-progress",  label: "In Progress" },
    { value: "blocked",      label: "Blocked" },
    { value: "review",       label: "In Review" },
    { value: "done",         label: "Done" },
  ],
}];

const PRIORITY_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "high",   label: "High" },
    { value: "normal", label: "Normal" },
    { value: "low",    label: "Low" },
  ],
}];

const PROJECT_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "mobile-banking",  label: "Mobile Banking App" },
    { value: "design-system",   label: "Design System" },
    { value: "api-gateway",     label: "API Gateway" },
  ],
}];

const LABEL_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "Security",      label: "Security" },
    { value: "Bug",           label: "Bug" },
    { value: "Performance",   label: "Performance" },
    { value: "Design",        label: "Design" },
    { value: "API",           label: "API" },
    { value: "Compliance",    label: "Compliance" },
    { value: "Notifications", label: "Notifications" },
  ],
}];

// ── List groups (blocked first — most urgent) ─────────────────────────────────

const LIST_GROUPS: { id: string; label: string; statuses: TicketStatus[] }[] = [
  { id: "blocked",     label: "Blocked",     statuses: ["blocked"] },
  { id: "in-progress", label: "In Progress", statuses: ["in-progress"] },
  { id: "review",      label: "In Review",   statuses: ["review"] },
  { id: "todo",        label: "To Do",       statuses: ["to-do"] },
  { id: "backlog",     label: "Inbox",       statuses: ["backlog"] },
  { id: "done",        label: "Done",        statuses: ["done"] },
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDueDate(str: string | undefined): Date | null {
  if (!str) return null;
  const d = new Date(`${str}, 2026`);
  return isNaN(d.getTime()) ? null : d;
}

const TODAY      = new Date(2026, 5, 30); // Jun 30
const WEEK_CUTOFF = new Date(2026, 6, 7); // Jul 7

function isDueSoon(ticket: Ticket): boolean {
  if (ticket.status === "done") return false;
  const d = parseDueDate(ticket.dueDate);
  return d !== null && d <= WEEK_CUTOFF;
}

// ── Precomputed KPIs ──────────────────────────────────────────────────────────

const TOTAL_HOURS    = MY_TICKETS.reduce((s, t) => s + (t.hours ?? 0), 0);
const BLOCKED_TICKETS = MY_TICKETS.filter((t) => t.status === "blocked");
const DUE_SOON_TICKETS = MY_TICKETS.filter(isDueSoon).sort((a, b) => {
  const da = parseDueDate(a.dueDate)?.getTime() ?? Infinity;
  const db = parseDueDate(b.dueDate)?.getTime() ?? Infinity;
  return da - db;
});

const HOURS_BY_STATUS = {
  assigned:   TOTAL_HOURS,
  blocked:    MY_TICKETS.filter(t => t.status === "blocked").reduce((s, t) => s + (t.hours ?? 0), 0),
  inProgress: MY_TICKETS.filter(t => t.status === "in-progress").reduce((s, t) => s + (t.hours ?? 0), 0),
  review:     MY_TICKETS.filter(t => t.status === "review").reduce((s, t) => s + (t.hours ?? 0), 0),
  done:       MY_TICKETS.filter(t => t.status === "done").reduce((s, t) => s + (t.hours ?? 0), 0),
};

const REMAINING_ESTIMATED_HOURS = TOTAL_HOURS - HOURS_BY_STATUS.done;

// ── My Time (Member role only) ──────────────────────────────────────────────
// Time tracking isn't a separate module for Members — it's a compact summary
// of what "Log Time" on their own tickets has already produced, plus a
// read-only view of those entries. Sized to sum to the Member persona's
// hoursWeek in mock-time-tracking.ts so the summary row and the timesheet
// panel agree with each other and with what Admin/Project Lead see for this
// same person in Time Tracking.
const MY_TIME_ENTRIES: PersonalTimesheetEntry[] = [
  { id: "mte-1", ticket: MY_TICKETS.find((t) => t.id === "mw-pci")!,        hours: 7, date: "Yesterday", comment: "Reviewed encryption requirements with security" },
  { id: "mte-2", ticket: MY_TICKETS.find((t) => t.id === "mw-kyc")!,        hours: 6, date: "Jun 28",     comment: "Investigated vendor timeout errors" },
  { id: "mte-3", ticket: MY_TICKETS.find((t) => t.id === "mw-a11y")!,       hours: 5, date: "Jun 27",     comment: "VoiceOver pass on settings screens" },
  { id: "mte-4", ticket: MY_TICKETS.find((t) => t.id === "mw-pagination")!, hours: 4, date: "Jun 26",     comment: "Pagination edge cases for large accounts" },
];

// ── Focus mode config ─────────────────────────────────────────────────────────

// Sections hidden in focus mode. Add entries here to extend without rewriting the page.
const FOCUS_MODE_HIDDEN: ReadonlySet<string> = new Set([
  "kpis", "my-hours", "my-time", "blocked", "due-soon", "activity",
]);

// ── KPI filter mode ───────────────────────────────────────────────────────────

type KpiMode = "all" | "blocked" | "due-soon" | "hours";

const KPI_MODE_LABELS: Record<KpiMode, string> = {
  all:      "All tickets",
  blocked:  "Blocked only",
  "due-soon": "Due this week",
  hours:    "By hours",
};

// ── KPI card (clickable) ──────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  danger,
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-5 py-4 w-full text-left transition-all duration-150",
        "shadow-sm shadow-slate-200/40 dark:shadow-black/20",
        accent
          ? "border-brand-100 dark:border-brand-900/40 bg-brand-50/40 dark:bg-brand-950/15 hover:border-brand-200 dark:hover:border-brand-800"
          : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-600",
        active
          ? "ring-2 ring-brand-500/40 dark:ring-brand-500/30 !border-brand-300 dark:!border-brand-700"
          : "hover:shadow-md",
      ].join(" ")}
    >
      <p
        className={[
          "text-[10px] font-bold uppercase tracking-widest mb-1",
          accent ? "text-brand-500 dark:text-brand-400" : "text-slate-400 dark:text-zinc-600",
        ].join(" ")}
      >
        {label}
      </p>
      <p
        className={[
          "text-2xl font-bold leading-none",
          danger ? "text-red-600 dark:text-red-400" :
          accent ? "text-brand-700 dark:text-brand-300" :
          "text-slate-900 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>
      )}
    </button>
  );
}

// ── Focus ticket row (compact, scannable) ─────────────────────────────────────

function FocusTicketRow({ ticket, onOpen }: { ticket: Ticket; onOpen: (t: Ticket) => void }) {
  const dueDate   = parseDueDate(ticket.dueDate);
  const isOverdue = dueDate !== null && dueDate < TODAY && ticket.status !== "done";
  const isUrgent  = !isOverdue && dueDate !== null && dueDate <= new Date(2026, 6, 3);

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
    >
      <StatusBadge status={ticket.status} />

      <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
        <TicketTypeIcon type={ticket.type} />
        <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
          {getTicketDisplayKey(ticket)}
        </span>
        <span className="min-w-0 text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">
          {ticket.title}
        </span>
      </span>

      {ticket.hours !== undefined && (
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex-shrink-0">
          <svg className="w-2.5 h-2.5 opacity-50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          {ticket.hours}h
        </span>
      )}

      {ticket.dueDate && (
        <span
          className={[
            "text-[11px] font-medium flex-shrink-0",
            isOverdue ? "text-red-600 dark:text-red-400" :
            isUrgent  ? "text-amber-600 dark:text-amber-400" :
            "text-slate-400 dark:text-zinc-500",
          ].join(" ")}
        >
          {ticket.dueDate}
        </span>
      )}
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// ── View toggle ───────────────────────────────────────────────────────────────

type WorkView = "list" | "board";

const VIEW_ICONS: Record<WorkView, ReactNode> = {
  list: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M9 6H5v3h4V6zM9 15H5v3h4v-3zM21 8H13M21 12H13M21 17H13" />
    </svg>
  ),
  board: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="11" rx="1.5" />
    </svg>
  ),
};

// ── Main component ────────────────────────────────────────────────────────────

export function MyWorkScreen() {
  const { user } = useCurrentUser();
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const [view, setView]                   = useState<WorkView>("list");
  const [statusFilter, setStatusFilter]   = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter]     = useState<string[]>([]);
  const [kpiMode, setKpiMode]             = useState<KpiMode | null>(null);
  const [focusMode, setFocusMode]         = useState(false);
  const [showTimesheet, setShowTimesheet] = useState(false);

  const openPreview = (ticket: Ticket) => setPreviewTicket(ticket);
  const show        = (section: string) => !focusMode || !FOCUS_MODE_HIDDEN.has(section);

  // Only Members get personal time tracking folded into My Work — Admin and
  // Project Lead keep their dedicated Time Tracking page for this data.
  const myTimesheetRow = user.role === "MEMBER"
    ? timesheetRows.find((r) => r.name === user.name)
    : undefined;

  const activeCount = MY_TICKETS.filter((t) => t.status !== "done").length;

  // KPI cards toggle their own filter; clicking the active one clears it
  function handleKpiClick(mode: KpiMode) {
    setKpiMode((prev) => (prev === mode ? null : mode));
  }

  // Displayed tickets: apply kpiMode filter/sort
  const displayedTickets = (() => {
    if (kpiMode === "blocked")   return MY_TICKETS.filter((t) => t.status === "blocked");
    if (kpiMode === "due-soon")  return DUE_SOON_TICKETS;
    if (kpiMode === "hours")     return [...MY_TICKETS].sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0));
    return MY_TICKETS;
  })();

  // Flat list when kpiMode imposes its own order; grouped otherwise
  const useFlatList = kpiMode === "due-soon" || kpiMode === "hours";

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-16">

      {/* ── Compact page header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
              My Work
            </h1>
            <span className="text-slate-300 dark:text-zinc-600">·</span>
            <span className="text-sm font-medium text-slate-600 dark:text-zinc-400">
              Good morning, Marcus 👋
            </span>
          </div>
          <p className="text-xs text-slate-400 dark:text-zinc-500">Tuesday, June 30</p>
        </div>

        {/* Focus Mode toggle */}
        <button
          type="button"
          onClick={() => setFocusMode((v) => !v)}
          className={[
            "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border flex-shrink-0",
            focusMode
              ? "bg-brand-600 text-white border-brand-600 dark:bg-brand-500 dark:border-brand-500 shadow-sm shadow-brand-600/20"
              : "text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-800",
          ].join(" ")}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          {focusMode ? "Exit Focus" : "Focus Mode"}
        </button>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      {show("kpis") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Assigned Tickets"
            value={MY_TICKETS.length}
            sub={`${activeCount} active`}
            active={kpiMode === "all"}
            onClick={() => handleKpiClick("all")}
          />
          <KpiCard
            label="Estimated Hours"
            value={<>{TOTAL_HOURS}<span className="text-base font-medium ml-0.5">h</span></>}
            sub="assigned"
            accent
            active={kpiMode === "hours"}
            onClick={() => handleKpiClick("hours")}
          />
          <KpiCard
            label="Blocked"
            value={BLOCKED_TICKETS.length}
            sub={BLOCKED_TICKETS.length > 0 ? "needs attention" : "you're clear"}
            danger={BLOCKED_TICKETS.length > 0}
            active={kpiMode === "blocked"}
            onClick={() => handleKpiClick("blocked")}
          />
          <KpiCard
            label="Due This Week"
            value={DUE_SOON_TICKETS.length}
            sub="by Jul 7"
            active={kpiMode === "due-soon"}
            onClick={() => handleKpiClick("due-soon")}
          />
        </div>
      )}

      {/* ── My Hours breakdown ──────────────────────────────────────────────── */}
      {show("my-hours") && (
        <div className="mt-3 flex items-center gap-5 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-5 py-3.5 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-x-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 flex-shrink-0">
            My Hours
          </p>
          <div className="flex items-center gap-6 flex-1 min-w-0">
            {([
              { label: "Assigned",    value: HOURS_BY_STATUS.assigned,   cls: "text-slate-900 dark:text-zinc-50" },
              { label: "Blocked",     value: HOURS_BY_STATUS.blocked,    cls: "text-red-600 dark:text-red-400" },
              { label: "In Progress", value: HOURS_BY_STATUS.inProgress, cls: "text-amber-600 dark:text-amber-400" },
              { label: "In Review",   value: HOURS_BY_STATUS.review,     cls: "text-violet-600 dark:text-violet-400" },
              { label: "Done",        value: HOURS_BY_STATUS.done,       cls: "text-emerald-600 dark:text-emerald-400" },
            ] as const).map(({ label, value, cls }) => (
              <div key={label} className="flex-shrink-0">
                <p className="text-[10px] text-slate-400 dark:text-zinc-600">{label}</p>
                <p className={`text-sm font-bold ${cls}`}>{value}h</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── My Time (Member only) ───────────────────────────────────────────── */}
      {/* Time tracking isn't a separate module for a Member — it's folded in
          here as a compact summary, with the ticket's own Log Time button
          remaining the only way to actually log time. */}
      {myTimesheetRow && show("my-time") && (
        <div className="mt-3 flex items-center gap-5 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-5 py-3.5 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-x-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 flex-shrink-0">
            My Time
          </p>
          <div className="flex items-center gap-6 flex-1 min-w-0">
            <div className="flex-shrink-0">
              <p className="text-[10px] text-slate-400 dark:text-zinc-600">Logged Today</p>
              <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">{formatHours(myTimesheetRow.hoursToday)}</p>
            </div>
            <div className="flex-shrink-0">
              <p className="text-[10px] text-slate-400 dark:text-zinc-600">Logged This Week</p>
              <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">{formatHours(myTimesheetRow.hoursWeek)}</p>
            </div>
            <div className="flex-shrink-0">
              <p className="text-[10px] text-slate-400 dark:text-zinc-600">Remaining Estimated</p>
              <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">{REMAINING_ESTIMATED_HOURS}h</p>
            </div>
            <div className="flex-shrink-0">
              <p className="text-[10px] text-slate-400 dark:text-zinc-600 mb-0.5">Personal Capacity</p>
              <CapacityCell pct={weeklyCapacityPct(myTimesheetRow)} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowTimesheet(true)}
            className="flex-shrink-0 text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline whitespace-nowrap"
          >
            View Timesheet →
          </button>
        </div>
      )}

      {/* ── My Tickets ─────────────────────────────────────────────────────── */}
      <div className={show("kpis") || show("my-hours") ? "mt-8" : "mt-0"}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              My Tickets
            </h2>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
              {displayedTickets.length}
            </span>
            <span className="hidden sm:block text-xs text-slate-300 dark:text-zinc-700">
              · {TOTAL_HOURS}h estimated
            </span>

            {/* Active KPI filter chip */}
            {kpiMode && kpiMode !== "all" && (
              <button
                type="button"
                onClick={() => setKpiMode(null)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-2 py-0.5 rounded-full hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors"
              >
                {KPI_MODE_LABELS[kpiMode]}
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterDropdown label="Status"   mode="multi"  groups={STATUS_GROUPS}   selected={statusFilter}   onChange={setStatusFilter} />
            <FilterDropdown label="Priority" mode="multi"  groups={PRIORITY_GROUPS} selected={priorityFilter} onChange={setPriorityFilter} />
            <FilterDropdown label="Project"  mode="single" groups={PROJECT_GROUPS}  selected={projectFilter}  onChange={setProjectFilter} />
            <FilterDropdown label="Labels"   mode="multi"  groups={LABEL_GROUPS}    selected={labelFilter}    onChange={setLabelFilter} />

            <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />

            {/* View toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
              {(["list", "board"] as WorkView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={[
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-xs font-medium transition-all duration-150",
                    view === v
                      ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm shadow-slate-200/80 dark:shadow-black/40"
                      : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
                  ].join(" ")}
                >
                  {VIEW_ICONS[v]}
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Board view */}
        {view === "board" ? (
          <div className="flex flex-col h-[440px]">
            <BoardView tickets={displayedTickets} onTicketClick={openPreview} />
          </div>
        ) : useFlatList ? (
          /* Flat list (for due-soon / hours kpiMode) */
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
            {displayedTickets.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400 dark:text-zinc-500">No tickets match this filter.</p>
            ) : (
              displayedTickets.map((ticket) => (
                <TicketListRow key={ticket.id} ticket={ticket} onTicketClick={openPreview} />
              ))
            )}
          </div>
        ) : (
          /* Grouped list */
          <div>
            {LIST_GROUPS.map((group) => {
              const groupTickets = displayedTickets.filter((t) =>
                (group.statuses as string[]).includes(t.status)
              );
              if (groupTickets.length === 0) return null;
              return (
                <section key={group.id} className="mb-6">
                  <div className="flex items-center gap-3 py-1.5 mb-1">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                      {group.label}
                    </h3>
                    <span className="text-xs text-slate-400 dark:text-zinc-500">{groupTickets.length}</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                    {groupTickets.map((ticket) => (
                      <TicketListRow key={ticket.id} ticket={ticket} onTicketClick={openPreview} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Focus sections (hidden in Focus Mode) ──────────────────────────── */}
      {(show("blocked") || show("due-soon")) && (
        <div className="mt-8 grid md:grid-cols-2 gap-5">

          {/* Blocked */}
          {show("blocked") && (
            <Section
              title="Blocked"
              count={BLOCKED_TICKETS.length}
              icon={
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              }
            >
              {BLOCKED_TICKETS.length === 0 ? (
                <div className="flex items-center gap-2 py-2 text-sm text-slate-400 dark:text-zinc-500">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  You&apos;re all clear.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {BLOCKED_TICKETS.map((t) => (
                    <FocusTicketRow key={t.id} ticket={t} onOpen={openPreview} />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Due Soon */}
          {show("due-soon") && (
            <Section
              title="Due Soon"
              count={DUE_SOON_TICKETS.length}
              icon={
                <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
              }
            >
              {DUE_SOON_TICKETS.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing due this week.</p>
              ) : (
                <div className="space-y-0.5">
                  {DUE_SOON_TICKETS.map((t) => (
                    <FocusTicketRow key={t.id} ticket={t} onOpen={openPreview} />
                  ))}
                </div>
              )}
            </Section>
          )}
        </div>
      )}

      {/* ── Recently Updated (with time groups) ────────────────────────────── */}
      {show("activity") && (
        <div className="mt-5">
          <Section title="Recently Updated">
            <div className="space-y-5">
              {ACTIVITY_GROUPS.map((ag) => {
                const entries = RECENT_ACTIVITY.filter((e) => e.group === ag.key);
                if (entries.length === 0) return null;
                return (
                  <div key={ag.id}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-zinc-700 mb-2.5">
                      {ag.label}
                    </p>
                    <ul className="space-y-3.5">
                      {entries.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-3">
                          <MemberTrigger name={entry.name} avatar={entry.avatar} className="flex-shrink-0 mt-0.5 rounded-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={entry.avatar}
                              alt={entry.name}
                              className="w-6 h-6 rounded-full"
                            />
                          </MemberTrigger>
                          <div className="text-sm leading-snug min-w-0 flex-1">
                            <p className="text-slate-700 dark:text-zinc-300">
                              <MemberTrigger name={entry.name} avatar={entry.avatar} className="font-medium text-slate-900 dark:text-zinc-100 hover:underline">
                                {entry.name}
                              </MemberTrigger>{" "}
                              {entry.action}
                            </p>
                            {entry.ticket && (
                              <button
                                type="button"
                                onClick={() => openPreview(entry.ticket!)}
                                className="group/ref mt-1 flex items-baseline gap-1.5 min-w-0 max-w-full text-left"
                              >
                                <TicketTypeIcon type={entry.ticket.type} />
                                <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 flex-shrink-0">
                                  {getTicketDisplayKey(entry.ticket)}
                                </span>
                                <span className="text-sm font-medium text-slate-700 dark:text-zinc-300 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 group-hover/ref:underline truncate">
                                  {entry.ticket.title}
                                </span>
                              </button>
                            )}
                            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                              {entry.time}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      )}

      {/* ── Ticket preview panel ────────────────────────────────────────────── */}
      {previewTicket !== null && (
        <TicketPreviewPanel
          ticket={previewTicket}
          slug={previewTicket.projectSlug}
          onClose={() => setPreviewTicket(null)}
        />
      )}

      {/* ── My Timesheet panel ──────────────────────────────────────────────── */}
      {showTimesheet && myTimesheetRow && (
        <PersonalTimesheetPanel
          today={myTimesheetRow.hoursToday}
          week={myTimesheetRow.hoursWeek}
          month={myTimesheetRow.hoursMonth}
          entries={MY_TIME_ENTRIES}
          onOpenTicket={(ticket) => {
            setShowTimesheet(false);
            openPreview(ticket);
          }}
          onClose={() => setShowTimesheet(false)}
        />
      )}
    </div>
  );
}
