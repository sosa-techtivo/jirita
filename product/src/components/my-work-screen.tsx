"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { Ticket, TicketStatus } from "@/lib/mock-tickets";
import { TicketListRow } from "@/components/tickets/ticket-card";
import { BoardView } from "@/components/tickets/board-view";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { StatusBadge } from "@/components/tickets/ticket-ui";

// ── Mock current user ─────────────────────────────────────────────────────────

const CURRENT_USER = {
  name: "Marcus Lee",
  avatar: "https://i.pravatar.cc/64?img=12",
};

// ── Mock tickets assigned to current user ─────────────────────────────────────

const MY_TICKETS: Ticket[] = [
  {
    id: "mw-pci",
    issueKey: "MBA-1",
    title: "Resolve PCI compliance gap in card storage",
    description: "Card storage flow needs to meet updated PCI-DSS encryption requirements.",
    status: "blocked",
    priority: "high",
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
    issueKey: "MBA-8",
    title: "Third-party KYC vendor API outage response plan",
    description: "Vendor integration has been failing intermittently. Need contingency plan and escalation.",
    status: "blocked",
    priority: "high",
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
    issueKey: "MBA-4",
    title: "Implement transaction history pagination",
    description: "Paginate the transaction list to keep load times fast for high-volume accounts.",
    status: "in-progress",
    priority: "normal",
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
    issueKey: "MBA-3",
    title: "Push notification setup for transaction alerts",
    description: "Wire up push notification delivery for transaction and security alerts.",
    status: "in-progress",
    priority: "normal",
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
    issueKey: "MBA-15",
    title: "Offline mode for balance viewing",
    description: "Allow users to view their last cached balance and recent transactions without a network connection.",
    status: "in-progress",
    priority: "normal",
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
    issueKey: "MBA-13",
    title: "Configurable session timeout settings",
    description: "Let users choose how long before the app locks after inactivity.",
    status: "to-do",
    priority: "low",
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
    issueKey: "MBA-14",
    title: "Dark mode for spend analytics charts",
    description: "Update chart color palette so graphs look polished in dark mode.",
    status: "to-do",
    priority: "low",
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
    issueKey: "MBA-7",
    title: "API rate limiting implementation",
    description: "Add per-client rate limits to protect the transfers API from abuse.",
    status: "review",
    priority: "normal",
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
    issueKey: "MBA-12",
    title: "Accessibility audit and WCAG 2.1 fixes",
    description: "Ensure VoiceOver and TalkBack compatibility for WCAG 2.1 AA compliance.",
    status: "review",
    priority: "high",
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
    issueKey: "MBA-6",
    title: "Fix biometric login crash on iOS 18",
    description: "Face ID login intermittently crashes the app on iOS 18 devices.",
    status: "done",
    priority: "high",
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
    issueKey: "MBA-5",
    title: "Add MFA onboarding step",
    description: "Guide new users through enabling multi-factor authentication on first login.",
    status: "done",
    priority: "normal",
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

// ── Recent activity ───────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  name: string;
  avatar: string;
  action: ReactNode;
  time: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

const RECENT_ACTIVITY: ActivityEntry[] = [
  {
    id: "ra-1",
    name: "Sarah Chen",
    avatar: avatar(47),
    action: (
      <>
        commented on{" "}
        <span className="font-medium">&ldquo;Transaction history pagination&rdquo;</span>
      </>
    ),
    time: "2 hours ago",
  },
  {
    id: "ra-2",
    name: "Priya Patel",
    avatar: avatar(33),
    action: (
      <>
        changed Hours on{" "}
        <span className="font-medium">&ldquo;Accessibility audit&rdquo;</span>
        {" — "}
        <span className="font-medium">8h → 12h</span>
      </>
    ),
    time: "5 hours ago",
  },
  {
    id: "ra-3",
    name: "Elena Rossi",
    avatar: avatar(5),
    action: (
      <>
        linked a PR to{" "}
        <span className="font-medium">&ldquo;Dark mode charts&rdquo;</span>
      </>
    ),
    time: "Yesterday",
  },
  {
    id: "ra-4",
    name: "Marcus Lee",
    avatar: avatar(12),
    action: (
      <>
        moved <span className="font-medium">&ldquo;Fix biometric login crash&rdquo;</span> to{" "}
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span>
      </>
    ),
    time: "Yesterday",
  },
  {
    id: "ra-5",
    name: "David Kim",
    avatar: avatar(22),
    action: (
      <>
        commented on{" "}
        <span className="font-medium">&ldquo;PCI compliance gap&rdquo;</span>
      </>
    ),
    time: "2 days ago",
  },
];

// ── Filter group data ─────────────────────────────────────────────────────────

const STATUS_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "backlog", label: "Inbox" },
      { value: "to-do", label: "To Do" },
      { value: "in-progress", label: "In Progress" },
      { value: "blocked", label: "Blocked" },
      { value: "review", label: "In Review" },
      { value: "done", label: "Done" },
    ],
  },
];

const PRIORITY_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "high", label: "High" },
      { value: "normal", label: "Normal" },
      { value: "low", label: "Low" },
    ],
  },
];

const PROJECT_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "mobile-banking", label: "Mobile Banking App" },
      { value: "design-system", label: "Design System" },
      { value: "api-gateway", label: "API Gateway" },
    ],
  },
];

const LABEL_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "Security", label: "Security" },
      { value: "Bug", label: "Bug" },
      { value: "Performance", label: "Performance" },
      { value: "Design", label: "Design" },
      { value: "API", label: "API" },
      { value: "Compliance", label: "Compliance" },
      { value: "Notifications", label: "Notifications" },
    ],
  },
];

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

const WEEK_CUTOFF = new Date(2026, 6, 7); // Jul 7 — 7 days out from Jun 30

function isDueSoon(ticket: Ticket): boolean {
  if (ticket.status === "done") return false;
  const d = parseDueDate(ticket.dueDate);
  return d !== null && d <= WEEK_CUTOFF;
}

// ── Precomputed KPIs ──────────────────────────────────────────────────────────

const TOTAL_HOURS = MY_TICKETS.reduce((s, t) => s + (t.hours ?? 0), 0);
const BLOCKED_TICKETS = MY_TICKETS.filter((t) => t.status === "blocked");
const DUE_SOON_TICKETS = MY_TICKETS.filter(isDueSoon).sort((a, b) => {
  const da = parseDueDate(a.dueDate)?.getTime() ?? Infinity;
  const db = parseDueDate(b.dueDate)?.getTime() ?? Infinity;
  return da - db;
});

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border px-5 py-4",
        accent
          ? "border-brand-100 dark:border-brand-900/40 bg-brand-50/40 dark:bg-brand-950/15"
          : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900",
        "shadow-sm shadow-slate-200/40 dark:shadow-black/20",
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
          accent ? "text-brand-700 dark:text-brand-300" : "text-slate-900 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>}
    </div>
  );
}

// ── Focus ticket row (compact, for Blocked + Due Soon) ────────────────────────

function FocusTicketRow({
  ticket,
  onOpen,
}: {
  ticket: Ticket;
  onOpen: (t: Ticket) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full flex items-center gap-3 py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
    >
      <StatusBadge status={ticket.status} />
      <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">
        {ticket.title}
      </span>
      {ticket.hours !== undefined && (
        <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
          {ticket.hours}h
        </span>
      )}
      {ticket.dueDate && (
        <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex-shrink-0">
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

// ── View toggle (list / board only) ──────────────────────────────────────────

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
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const [view, setView] = useState<WorkView>("list");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);

  const openPreview = (ticket: Ticket) => setPreviewTicket(ticket);

  const activeCount = MY_TICKETS.filter((t) => t.status !== "done").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-16">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3.5 mb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CURRENT_USER.avatar}
          alt={CURRENT_USER.name}
          className="w-10 h-10 rounded-full ring-2 ring-white dark:ring-zinc-900 shadow-sm"
        />
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
            Good morning, Marcus.
          </h1>
          <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1 leading-none">
            June 30, 2026
          </p>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Assigned Tickets"
          value={MY_TICKETS.length}
          sub={`${activeCount} active`}
        />
        <KpiCard
          label="Estimated Hours"
          value={<>{TOTAL_HOURS}<span className="text-base font-medium ml-0.5">h</span></>}
          sub="this sprint"
          accent
        />
        <KpiCard
          label="Blocked"
          value={<span className={BLOCKED_TICKETS.length > 0 ? "text-red-600 dark:text-red-400" : ""}>{BLOCKED_TICKETS.length}</span>}
          sub={BLOCKED_TICKETS.length > 0 ? "needs attention" : "you're clear"}
        />
        <KpiCard
          label="Due This Week"
          value={DUE_SOON_TICKETS.length}
          sub="by Jul 7"
        />
      </div>

      {/* ── My Tickets ─────────────────────────────────────────────────────── */}
      <div className="mt-10">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              My Tickets
            </h2>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
              {MY_TICKETS.length}
            </span>
            <span className="hidden sm:block text-xs text-slate-300 dark:text-zinc-700 ml-1">
              · {TOTAL_HOURS}h estimated
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterDropdown
              label="Status"
              mode="multi"
              groups={STATUS_GROUPS}
              selected={statusFilter}
              onChange={setStatusFilter}
            />
            <FilterDropdown
              label="Priority"
              mode="multi"
              groups={PRIORITY_GROUPS}
              selected={priorityFilter}
              onChange={setPriorityFilter}
            />
            <FilterDropdown
              label="Project"
              mode="single"
              groups={PROJECT_GROUPS}
              selected={projectFilter}
              onChange={setProjectFilter}
            />
            <FilterDropdown
              label="Labels"
              mode="multi"
              groups={LABEL_GROUPS}
              selected={labelFilter}
              onChange={setLabelFilter}
            />

            <div className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1" />

            {/* View toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
              {(["list", "board"] as WorkView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={[
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-xs font-medium transition-all duration-150 capitalize",
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

        {/* Board view — bounded height with horizontal scroll */}
        {view === "board" ? (
          <div className="flex flex-col h-[440px]">
            <BoardView tickets={MY_TICKETS} onTicketClick={openPreview} />
          </div>
        ) : (
          /* List view — grouped by status, blocked first */
          <div>
            {LIST_GROUPS.map((group) => {
              const groupTickets = MY_TICKETS.filter((t) =>
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

      {/* ── Focus sections ─────────────────────────────────────────────────── */}
      <div className="mt-10 grid md:grid-cols-2 gap-5">

        {/* Blocked */}
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

        {/* Due Soon */}
        <Section
          title="Due Soon"
          count={DUE_SOON_TICKETS.length}
          icon={
            <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18M12 14v4M12 14h2" />
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
      </div>

      {/* ── Recently Updated ────────────────────────────────────────────────── */}
      <div className="mt-5">
        <Section title="Recently Updated">
          <ul className="space-y-4">
            {RECENT_ACTIVITY.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.avatar}
                  alt={entry.name}
                  className="w-6 h-6 rounded-full mt-0.5 flex-shrink-0"
                />
                <div className="text-sm leading-snug min-w-0">
                  <p className="text-slate-700 dark:text-zinc-300">
                    <span className="font-medium text-slate-900 dark:text-zinc-100">{entry.name}</span>{" "}
                    {entry.action}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{entry.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* ── Ticket preview panel ────────────────────────────────────────────── */}
      {previewTicket !== null && (
        <TicketPreviewPanel
          ticket={previewTicket}
          slug="mobile-banking-app"
          onClose={() => setPreviewTicket(null)}
        />
      )}
    </div>
  );
}
