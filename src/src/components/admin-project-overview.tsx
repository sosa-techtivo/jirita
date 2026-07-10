"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { tickets as ALL_MOCK_TICKETS, getTicketById, getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { MemberTrigger, useMemberProfile } from "@/components/member-profile";
import { getProjectBySlug } from "@/lib/mock-projects";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectCategoryBadge } from "@/components/status-badge";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { presetTicketsFilter } from "@/components/tickets-screen";

// The Admin Project Overview is an executive read of one project — health,
// risk, and overall progress — not a personal work queue. It intentionally
// carries no financial/billing figures (those live in Reports → Finance);
// "Progress" here is the project's stored progress % (mock-projects.ts),
// the same number Reports already shows for this project, not a new metric.

interface ActivityEntry {
  id: string;
  avatar: string;
  name: string;
  /** The action fragment only — the ticket title never appears here; when
   *  `ticket` is set it renders on its own clickable line instead. */
  message: ReactNode;
  time: string;
  ticket?: Ticket;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

const INITIAL_ACTIVITY: ActivityEntry[] = [
  {
    id: "activity-1",
    avatar: avatar(12),
    name: "Marcus Lee",
    message: <>moved to <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span></>,
    time: "12 minutes ago",
    ticket: getTicketById("biometric-login-crash"),
  },
  {
    id: "activity-2",
    avatar: avatar(47),
    name: "Sarah Chen",
    message: "commented on",
    time: "1 hour ago",
    ticket: getTicketById("transaction-history-pagination"),
  },
  {
    id: "activity-3",
    avatar: avatar(33),
    name: "Alejo Cadavid",
    message: <>moved to <span className="text-violet-600 dark:text-violet-400 font-medium">Review</span></>,
    time: "3 hours ago",
    ticket: getTicketById("api-rate-limiting"),
  },
  {
    id: "activity-4",
    avatar: avatar(22),
    name: "David Kim",
    message: <>logged <span className="font-medium">2h</span> on</>,
    time: "5 hours ago",
    ticket: getTicketById("push-notification-setup"),
  },
];

const team: TeamMember[] = [
  { id: "team-sarah", name: "Sarah Chen", role: "Project Lead", avatar: avatar(47) },
  { id: "team-marcus", name: "Marcus Lee", role: "Engineer", avatar: avatar(12) },
  { id: "team-priya", name: "Alejo Cadavid", role: "Admin", avatar: avatar(33) },
  { id: "team-david", name: "David Kim", role: "QA Engineer", avatar: avatar(22) },
  { id: "team-elena", name: "Elena Rossi", role: "Designer", avatar: avatar(5) },
];

// ── Project Health card ──────────────────────────────────────────────────────
// Reuses the app's existing dot + colored-label status vocabulary (see
// StatusBadge/HealthBadge in status-badge.tsx) rather than inventing a new
// one — "On Track" / "Needs Attention" / "At Risk" instead of a numeric score.

type HealthStatus = "on-track" | "needs-attention" | "at-risk";

const HEALTH_STATUS_META: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  "on-track": {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "On Track",
  },
  "needs-attention": {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    label: "Needs Attention",
  },
  "at-risk": {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    label: "At Risk",
  },
};

interface HealthRow {
  id: string;
  label: string;
  status: HealthStatus;
  note: string;
}

const PROJECT_HEALTH: HealthRow[] = [
  { id: "schedule", label: "Schedule", status: "at-risk",         note: "2 tickets blocked 4+ days" },
  { id: "capacity", label: "Capacity", status: "needs-attention", note: "Elena Rossi is over capacity" },
  { id: "scope",    label: "Scope",    status: "on-track",        note: "No major scope changes this month" },
  { id: "risks",    label: "Risks",    status: "at-risk",         note: "Vendor outage blocking Security Audit" },
];

const HEALTH_ROW_CLASS =
  "block w-full text-left py-2.5 -mx-2 px-2 rounded-lg border-b border-slate-100 dark:border-zinc-800/70 last:border-0 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50";

function HealthRowContent({ row }: { row: HealthRow }) {
  const meta = HEALTH_STATUS_META[row.status];
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">{row.label}</p>
      <p className={`inline-flex items-center gap-1.5 text-[13px] font-semibold mt-1 ${meta.text}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
        {meta.label}
      </p>
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{row.note}</p>
    </>
  );
}

// Each health row drills into the existing screen/modal that explains it,
// instead of just stating a status — Schedule and Scope are real navigations
// (so they render as a <Link>, matching the attention banner above), while
// Capacity and Risks open in place via the shared member-profile/ticket-
// preview mechanisms every other "click a person/ticket" affordance uses.
function ProjectHealthRow({
  row,
  slug,
  onOpenTicket,
  onOpenMember,
}: {
  row: HealthRow;
  slug: string;
  onOpenTicket: (ticket: Ticket) => void;
  onOpenMember: () => void;
}) {
  if (row.id === "schedule") {
    return (
      <Link
        href={`/projects/${slug}/tickets`}
        onClick={() => presetTicketsFilter(slug, ["Blocked"])}
        className={HEALTH_ROW_CLASS}
      >
        <HealthRowContent row={row} />
      </Link>
    );
  }

  if (row.id === "capacity") {
    return (
      <button type="button" onClick={onOpenMember} className={HEALTH_ROW_CLASS}>
        <HealthRowContent row={row} />
      </button>
    );
  }

  if (row.id === "risks") {
    return (
      <button
        type="button"
        onClick={() => {
          const ticket = getTicketById("kyc-vendor-outage");
          if (ticket) onOpenTicket(ticket);
        }}
        className={HEALTH_ROW_CLASS}
      >
        <HealthRowContent row={row} />
      </button>
    );
  }

  // Scope: no scope-change events exist yet, so fall back to the project's
  // Tickets page rather than inventing a dedicated Activity view.
  return (
    <Link href={`/projects/${slug}/tickets`} className={HEALTH_ROW_CLASS}>
      <HealthRowContent row={row} />
    </Link>
  );
}

// ── Active Work: grouped by status ───────────────────────────────────────────

function TicketRow({
  ticket,
  projectCode,
  slug,
  onOpen,
}: {
  ticket: Ticket;
  projectCode: string;
  slug: string;
  onOpen: (t: Ticket) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 -mx-2 px-2 rounded-lg transition-colors"
    >
      <span className="min-w-0 flex items-baseline gap-1.5">
        <TicketTypeIcon type={ticket.type} />
        <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
          {projectCode}-{ticket.ticketNumber}
        </span>
        <span className="text-sm text-slate-800 dark:text-zinc-200 truncate">{ticket.title}</span>
      </span>
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
          className="w-6 h-6 rounded-full flex-shrink-0"
        />
      </MemberTrigger>
    </button>
  );
}

function TicketGroup({
  label,
  labelClass,
  tickets,
  projectCode,
  slug,
  onOpen,
}: {
  label: string;
  labelClass: string;
  tickets: Ticket[];
  projectCode: string;
  slug: string;
  onOpen: (t: Ticket) => void;
}) {
  if (tickets.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className={`text-xs font-medium mb-1.5 ${labelClass}`}>{label} ({tickets.length})</p>
      <div className="divide-y divide-slate-100 dark:divide-zinc-800">
        {tickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} projectCode={projectCode} slug={slug} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export function AdminProjectOverview({ slug = "mobile-banking-app" }: { slug?: string }) {
  const { user } = useCurrentUser();
  const canManageProject = canManage(user.role);
  const { openMemberProfile } = useMemberProfile();
  const project = getProjectBySlug(slug);
  const projectCode = project?.projectCode ?? "TKT";

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>(() =>
    ALL_MOCK_TICKETS.filter((t) => t.projectSlug === slug)
  );
  const [activity, setActivity] = useState<ActivityEntry[]>(INITIAL_ACTIVITY);
  const [preview, setPreview] = useState<Ticket | null>(null);

  const openTickets = tickets.filter((t) => t.status !== "done");
  const blocked = tickets.filter((t) => t.status === "blocked");
  const inProgress = tickets.filter((t) => t.status === "in-progress");
  const inReview = tickets.filter((t) => t.status === "review");
  // No close-date field exists on Ticket in this MVP, so "this month" is
  // approximated as every ticket currently marked Done in this project.
  const closedThisMonth = tickets.filter((t) => t.status === "done").length;
  const progressPct = project?.progress ?? 0;

  function handleTicketCreated(ticket: Ticket) {
    setShowNewTicket(false);
    setTickets((prev) => [ticket, ...prev]);
    setActivity((prev) => [
      {
        id: `activity-new-${ticket.id}`,
        avatar: "https://i.pravatar.cc/64?img=1",
        name: "You",
        message: "created ticket",
        ticket,
        time: "Just now",
      },
      ...prev,
    ]);
  }

  function handlePreviewDuplicate(_ticket: Ticket) {
    setShowNewTicket(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* ===== Project Header ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            MB
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Mobile Banking App</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
              </span>
              <ProjectCategoryBadge category="client" />
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-xl dark:text-zinc-400">
              iOS and Android banking experience for Meridian Bank — redesign of onboarding, transfers, and
              biometric authentication.
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-zinc-500">
              <span>
                Owned by <span className="text-slate-600 font-medium dark:text-zinc-300">Sarah Chen</span>
              </span>
              <span className="text-slate-300 dark:text-zinc-700">·</span>
              <span>Started Mar 3, 2026</span>
            </div>
          </div>
        </div>
        {canManageProject && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowNewTicket(true)}
              className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
            >
              + New Ticket
            </button>
          </div>
        )}
      </div>

      {/* ===== Slim attention line (not a hero) ===== */}
      <Link
        href={`/projects/${slug}/tickets`}
        onClick={() => presetTicketsFilter(slug, ["Blocked"])}
        className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 hover:bg-amber-100/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
        <p className="flex-1">2 tickets blocked 4+ days</p>
        <span className="text-xs font-medium text-amber-700 flex-shrink-0 dark:text-amber-400">
          Review →
        </span>
      </Link>

      {/* ===== KPI strip ===== */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Open Tickets</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{openTickets.length}</p>
        </div>
        <div className="flex-1 px-5 py-4 bg-brand-50/30 dark:bg-brand-950/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">Progress</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300 mt-1 leading-none">
            {progressPct}
            <span className="text-base font-medium text-brand-400 dark:text-brand-500 ml-0.5">%</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-brand-100/60 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Blocked</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1 leading-none">{blocked.length}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Closed This Month</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 leading-none">
            {closedThisMonth}
          </p>
        </div>
      </div>

      {/* ===== Active Work + Team, Recent Activity + Project Health ===== */}
      <div className="mt-10 grid grid-cols-3 gap-8 items-start">
        {/* Left column: primary content */}
        <div className="col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Active Work</h2>
              <Link
                href={`/projects/${slug}/tickets`}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                View all {openTickets.length} tickets →
              </Link>
            </div>

            <TicketGroup
              label="Blocked"
              labelClass="text-red-500 dark:text-red-400"
              tickets={blocked}
              projectCode={projectCode}
              slug={slug}
              onOpen={setPreview}
            />
            <TicketGroup
              label="In Progress"
              labelClass="text-amber-500 dark:text-amber-400"
              tickets={inProgress}
              projectCode={projectCode}
              slug={slug}
              onOpen={setPreview}
            />
            <TicketGroup
              label="In Review"
              labelClass="text-violet-500 dark:text-violet-400"
              tickets={inReview}
              projectCode={projectCode}
              slug={slug}
              onOpen={setPreview}
            />

            {blocked.length === 0 && inProgress.length === 0 && inReview.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing blocked, in progress, or in review right now.</p>
            )}

            <p className="text-xs text-slate-400 mt-4 dark:text-zinc-500">{openTickets.length} open · {closedThisMonth} closed this month</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 dark:text-zinc-400">Project Activity</h2>
            <ul className="space-y-4">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3">
                  <MemberTrigger name={entry.name} avatar={entry.avatar} projectSlug={slug} className="flex-shrink-0 mt-0.5 rounded-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.avatar} alt={entry.name} className="w-6 h-6 rounded-full" />
                  </MemberTrigger>
                  <div className="text-sm leading-snug min-w-0 flex-1">
                    <p className="text-slate-700 dark:text-zinc-300">
                      <MemberTrigger name={entry.name} avatar={entry.avatar} projectSlug={slug} className="font-medium text-slate-900 dark:text-zinc-100 hover:underline">
                        {entry.name}
                      </MemberTrigger> {entry.message}
                    </p>
                    {entry.ticket && (
                      <button
                        type="button"
                        onClick={() => setPreview(entry.ticket!)}
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
                    <p className="text-xs text-slate-400 mt-0.5 dark:text-zinc-500">{entry.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right column: secondary content, kept above the fold */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Team</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{team.length} active members</p>
              </div>
              {canManageProject && (
                <Link
                  href={`/projects/${slug}/team`}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 flex-shrink-0"
                >
                  View all →
                </Link>
              )}
            </div>
            <ul className="space-y-3">
              {team.map((member) => (
                <li key={member.id}>
                  <MemberTrigger
                    name={member.name}
                    avatar={member.avatar}
                    role={member.role}
                    projectSlug={slug}
                    className="flex items-center gap-2.5 w-full text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={member.avatar} alt={member.name} className="w-7 h-7 rounded-full" />
                    <div className="text-sm leading-tight flex-1">
                      <p className="font-medium text-slate-800 dark:text-zinc-200">{member.name}</p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500">{member.role}</p>
                    </div>
                  </MemberTrigger>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-zinc-400">Project Health</h2>
            <div>
              {PROJECT_HEALTH.map((row) => (
                <ProjectHealthRow
                  key={row.id}
                  row={row}
                  slug={slug}
                  onOpenTicket={setPreview}
                  onOpenMember={() =>
                    openMemberProfile({ name: "Elena Rossi", avatar: avatar(5), role: "Designer", projectSlug: slug })
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {showNewTicket && (
        <NewTicketModal
          slug={slug}
          tickets={tickets}
          members={[]}
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
          onPreviewDuplicate={handlePreviewDuplicate}
        />
      )}

      {/* ── Ticket preview panel ─────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={slug}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
