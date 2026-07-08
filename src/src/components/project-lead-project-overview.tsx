"use client";

import Link from "next/link";
import { useState } from "react";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { tickets as ALL_MOCK_TICKETS, getTicketById } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { getProjectBySlug } from "@/lib/mock-projects";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectCategoryBadge } from "@/components/status-badge";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { presetTicketsFilter } from "@/components/tickets-screen";
import { MemberTrigger, useMemberProfile } from "@/components/member-profile";

// The Project Lead Project Overview answers one question — "what needs my
// attention in this project today?" — so unlike the Admin executive view it
// skips history (Recent Activity) and generic health labels in favor of
// concrete reasons and a prioritized action list. No financial or
// org-wide figures here (that's Admin/Reports territory).

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  available: boolean;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

const team: TeamMember[] = [
  { id: "team-sarah", name: "Sarah Chen", role: "Project Lead", avatar: avatar(47), available: true },
  { id: "team-marcus", name: "Marcus Lee", role: "Engineer", avatar: avatar(12), available: true },
  { id: "team-priya", name: "Alejo Cadavid", role: "Admin", avatar: avatar(33), available: true },
  { id: "team-david", name: "David Kim", role: "QA Engineer", avatar: avatar(22), available: true },
  { id: "team-elena", name: "Elena Rossi", role: "Designer", avatar: avatar(5), available: true },
];

// ── Active Work: grouped by status (identical to Admin's — unchanged) ───────

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

// ── Project Health: reasons, not labels ──────────────────────────────────────

interface HealthRow {
  id: string;
  label: string;
  note: string;
}

const PROJECT_HEALTH: HealthRow[] = [
  { id: "schedule", label: "Schedule", note: "2 blocked tickets older than 4 days" },
  { id: "capacity", label: "Capacity", note: "Elena Rossi is over capacity" },
  { id: "scope",    label: "Scope",    note: "No scope changes this month" },
  { id: "risks",    label: "Risks",    note: "Vendor API outage affecting Security Audit" },
];

const HEALTH_ROW_CLASS =
  "block w-full text-left py-2.5 -mx-2 px-2 rounded-lg border-b border-slate-100 dark:border-zinc-800/70 last:border-0 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50";

function HealthRowContent({ row }: { row: HealthRow }) {
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">{row.label}</p>
      <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">{row.note}</p>
    </>
  );
}

// Same drill-down mapping as the Admin overview: Schedule/Scope are real
// navigations to the Tickets page (Link, matching the attention banner
// above), Capacity/Risks open in place via the shared member-profile/
// ticket-preview mechanisms every other "click a person/ticket" affordance
// already uses in this app.
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

// ── Needs Your Attention: prioritized, actionable, derived from real tickets ─

const TODAY = new Date(2026, 5, 30); // Jun 30, 2026 — same "today" ticket-detail-screen.tsx uses

function parseDue(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}, 2026`);
  return isNaN(d.getTime()) ? null : d;
}

interface AttentionEntry {
  ticket: Ticket;
  reason: string;
  rank: number;
}

// Lower rank = more urgent. Blocked tickets always come first, then overdue
// review, then any other overdue, then review/due-today, then due-today.
function buildAttentionEntry(t: Ticket): AttentionEntry | null {
  if (t.status === "done") return null;
  const due = parseDue(t.dueDate);
  const isOverdue = due !== null && due < TODAY;
  const isDueToday = due !== null && due.getTime() === TODAY.getTime();

  if (t.status === "blocked") {
    return { ticket: t, reason: "Blocked — needs unblocking", rank: 0 };
  }
  if (t.status === "review" && isOverdue) {
    return { ticket: t, reason: "Waiting for review — overdue", rank: 1 };
  }
  if (isOverdue) {
    return { ticket: t, reason: "Overdue", rank: 2 };
  }
  if (t.status === "review" && isDueToday) {
    return { ticket: t, reason: "Waiting for review — due today", rank: 3 };
  }
  if (isDueToday) {
    return { ticket: t, reason: "Due today", rank: 4 };
  }
  if (t.status === "review") {
    return { ticket: t, reason: "Waiting for review", rank: 5 };
  }
  return null;
}

function AttentionRow({
  entry,
  projectCode,
  slug,
  onOpen,
}: {
  entry: AttentionEntry;
  projectCode: string;
  slug: string;
  onOpen: (t: Ticket) => void;
}) {
  const { ticket, reason } = entry;
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full py-2.5 flex items-start justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="min-w-0">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <TicketTypeIcon type={ticket.type} />
          <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
            {projectCode}-{ticket.ticketNumber}
          </span>
          <span className="text-sm text-slate-800 dark:text-zinc-200 truncate">{ticket.title}</span>
        </span>
        <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{reason}</p>
      </div>
      <MemberTrigger
        name={ticket.assignee.name}
        avatar={ticket.assignee.avatar}
        projectSlug={slug}
        nested
        className="flex-shrink-0 mt-0.5 rounded-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ticket.assignee.avatar}
          alt={ticket.assignee.name}
          className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
        />
      </MemberTrigger>
    </button>
  );
}

export function ProjectLeadProjectOverview({ slug = "mobile-banking-app" }: { slug?: string }) {
  const { user } = useCurrentUser();
  const canManageProject = canManage(user.role);
  const { openMemberProfile } = useMemberProfile();
  const project = getProjectBySlug(slug);
  const projectCode = project?.projectCode ?? "TKT";

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>(() =>
    ALL_MOCK_TICKETS.filter((t) => t.projectSlug === slug)
  );
  const [preview, setPreview] = useState<Ticket | null>(null);

  const openTickets = tickets.filter((t) => t.status !== "done");
  const blocked = tickets.filter((t) => t.status === "blocked");
  const inProgress = tickets.filter((t) => t.status === "in-progress");
  const inReview = tickets.filter((t) => t.status === "review");
  // No close-date field exists on Ticket in this MVP, so "this month" is
  // approximated as every ticket currently marked Done in this project.
  const closedThisMonth = tickets.filter((t) => t.status === "done").length;
  const progressPct = project?.progress ?? 0;

  const dueTodayCount = tickets.filter((t) => {
    if (t.status === "done") return false;
    const due = parseDue(t.dueDate);
    return due !== null && due.getTime() === TODAY.getTime();
  }).length;

  const attentionItems = tickets
    .map(buildAttentionEntry)
    .filter((e): e is AttentionEntry => e !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6);

  const unavailableCount = team.filter((m) => !m.available).length;

  function handleTicketCreated(ticket: Ticket) {
    setShowNewTicket(false);
    setTickets((prev) => [ticket, ...prev]);
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

      {/* ===== Attention banner — the most important alerts, not just Blocked ===== */}
      <Link
        href={`/projects/${slug}/tickets`}
        onClick={() => presetTicketsFilter(slug, ["Blocked"])}
        className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 hover:bg-amber-100/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
        <p className="flex-1">
          {blocked.length} tickets blocked 4+ days
          <span className="mx-1.5 text-amber-400 dark:text-amber-600">·</span>
          {dueTodayCount} tickets due today
          <span className="mx-1.5 text-amber-400 dark:text-amber-600">·</span>
          {inReview.length} tickets waiting for review
        </p>
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

      {/* ===== Active Work + Needs Your Attention, Team + Project Health ===== */}
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
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-zinc-400">Needs Your Attention</h2>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mb-2">Highest-priority items across the project</p>
            {attentionItems.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing needs your attention right now.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {attentionItems.map((entry) => (
                  <AttentionRow key={entry.ticket.id} entry={entry} projectCode={projectCode} slug={slug} onOpen={setPreview} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: secondary content, kept above the fold */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Team</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                  {team.length} active members
                  {unavailableCount > 0 && <> · {unavailableCount} unavailable</>}
                </p>
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
