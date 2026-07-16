"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { TicketTypeIcon, getTodayISO, parseDisplayDate } from "@/components/tickets/ticket-ui";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectCategoryBadge, StatusBadge } from "@/components/status-badge";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { MemberTrigger, useMemberProfile } from "@/components/member-profile";
import { loadProjectDetail, loadProjectTeam } from "@/lib/projects";
import type { ProjectDetail, ProjectTeamMember } from "@/lib/projects";
import { loadProjectTickets, loadOrganizationLoggedTimeForRange } from "@/lib/tickets";
import type { OrganizationTimeEntry } from "@/lib/tickets";
import {
  buildHoursByPersonRows,
  buildProjectHealthRows,
  buildDeliveryKpiSummary,
  buildDeliveryStatusItems,
} from "@/components/reports-screen";
import type { PersonRow, ProjectRow as DeliveryProjectRow } from "@/components/reports-screen";
import { ExpandableDescription, TicketGroup, ProjectHealthRow } from "@/components/admin-project-overview";
import type { TeamMember, HealthRow, HealthStatus } from "@/components/admin-project-overview";

// The Project Lead Project Overview is the same real project-health read as
// the Admin's (same data loading, KPI/alert/health calculations, and
// components — all reused directly from admin-project-overview.tsx and
// reports-screen.tsx, never a second implementation), with two deliberate,
// role-specific differences: a "Needs Your Attention" ticket list in place
// of Admin's Recent Activity history (built from the exact same real
// blocked/due-today/awaiting-review signals the Project Lead Dashboard's own
// Attention Required widget already uses, deduped, no invented priority
// scheme), and no Scope row in Project Health (this MVP has no real
// scope-tracking source of truth for either role, but only this view drops
// the row outright instead of keeping Admin's honest "not tracked" note).
// Recent Activity itself isn't loaded here at all (unlike Admin) since this
// role's view never renders it — no dead data fetch for an unused widget.

interface AttentionEntry {
  ticket: Ticket;
  reason: string;
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
  const { user, organization, isDevFallback } = useCurrentUser();
  const canManageProject = canManage(user.role);
  const { openMemberProfile } = useMemberProfile();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [timeEntries, setTimeEntries] = useState<OrganizationTimeEntry[]>([]);
  const [requestId, setRequestId] = useState(0);

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [preview, setPreview] = useState<Ticket | null>(null);

  const runFetch = useCallback(() => setRequestId((id) => id + 1), []);

  // Same data-loading shape as AdminProjectOverview's own effect (same
  // loaders, same real sources) — kept as this page's own wiring rather than
  // a shared hook, matching how every other project-scoped screen in this
  // app (Reports, Team, Notes, Tickets) already loads its own project data
  // locally on top of shared lib/ functions.
  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    // Back to "loading" on every slug change too, not just the first mount
    // — without this, navigating from one project straight to another (the
    // component stays mounted, only the `slug` prop changes) would keep
    // rendering the previous project's real data until the new fetch
    // resolves, since `loadState` would otherwise still read "ready".
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern used elsewhere in this app (e.g. member-profile-modal.tsx)
    setLoadState("loading");

    (async () => {
      const projectResult = await loadProjectDetail(organization.id, slug);
      if (cancelled) return;
      if (projectResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(projectResult.message);
        return;
      }
      if (projectResult.status === "not-found") {
        setLoadState("error");
        setLoadErrorMessage("Project not found.");
        return;
      }

      const ticketsResult = await loadProjectTickets(organization.id, slug);
      if (cancelled) return;
      if (ticketsResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(ticketsResult.message);
        return;
      }
      const projectTickets = ticketsResult.status === "ready" ? ticketsResult.tickets : [];
      const ticketIds = projectTickets.map((t) => t.id);

      const [teamResult, timeResult] = await Promise.all([
        loadProjectTeam(organization.id, slug),
        loadOrganizationLoggedTimeForRange(ticketIds, projectResult.project.createdAtISO.slice(0, 10), getTodayISO()),
      ]);
      if (cancelled) return;

      if (teamResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(teamResult.message);
        return;
      }
      if (timeResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(timeResult.message);
        return;
      }

      setProject(projectResult.project);
      setTickets(projectTickets);
      setTeamMembers(teamResult.members);
      setTimeEntries(timeResult.entries);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [organization, isDevFallback, slug, requestId]);

  function handleTicketCreated() {
    setShowNewTicket(false);
    runFetch();
  }

  function handlePreviewDuplicate(_ticket: Ticket) {
    setShowNewTicket(false);
  }

  if (loadState === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading project…
        </div>
      </div>
    );
  }

  if (loadState === "error" || !project) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load project</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {loadErrorMessage ?? "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={runFetch}
            className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const projectCode = project.projectCode;
  const todayISO = getTodayISO();
  const monthPrefix = todayISO.slice(0, 7);

  // ── KPIs — identical definitions to AdminProjectOverview ──────────────────
  const openTickets = tickets.filter((t) => t.status !== "done");
  const blocked = tickets.filter((t) => t.status === "blocked");
  const inProgress = tickets.filter((t) => t.status === "in-progress");
  const inReview = tickets.filter((t) => t.status === "review");
  const doneTickets = tickets.filter((t) => t.status === "done");
  const closedThisMonth = doneTickets.filter((t) => t.updatedAtISO?.slice(0, 7) === monthPrefix).length;
  const progressPct = tickets.length > 0 ? Math.round((doneTickets.length / tickets.length) * 100) : 0;

  const overdueTickets = tickets.filter(
    (t) => t.status !== "done" && t.dueDate && parseDisplayDate(t.dueDate) < todayISO
  );
  const overdueOpenCount = overdueTickets.length;

  const team: TeamMember[] = teamMembers.map((m) => ({ id: m.id, name: m.name, role: m.title, avatar: m.avatar }));

  // ── Alert Banner + Project Health: reuse Delivery Reports' own real
  //    functions, scoped to this one project — identical to Admin, never a
  //    second/parallel health calculation.
  const capacities = teamMembers.map((m) => ({ profileId: m.id, weeklyCapacity: m.weeklyCapacity }));
  const membersForRows = teamMembers.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
  const personRows: PersonRow[] = buildHoursByPersonRows(tickets, membersForRows, capacities, timeEntries);
  const kpiSummary = buildDeliveryKpiSummary(tickets, [{ status: project.status }], timeEntries, todayISO);
  const statusItems = buildDeliveryStatusItems(personRows, kpiSummary);
  const alertItems = statusItems.filter((item) => item.level !== "ok");

  const actionableAlertTypes = alertItems
    .map((item) => item.id)
    .filter((id): id is "overdue" | "blocked" => id === "overdue" || id === "blocked");
  const ticketsByAlertType: Record<"overdue" | "blocked", Ticket[]> = { overdue: overdueTickets, blocked };

  const actionableTicketsById = new Map<string, Ticket>();
  for (const type of actionableAlertTypes) {
    for (const t of ticketsByAlertType[type]) actionableTicketsById.set(t.id, t);
  }
  const actionableTickets = Array.from(actionableTicketsById.values());

  let alertActionHref: string | null = null;
  if (actionableAlertTypes.length === 1 && actionableTickets.length === 1) {
    alertActionHref = `/projects/${slug}/tickets/${getTicketDisplayKey(actionableTickets[0])}`;
  } else if (actionableTickets.length > 0) {
    alertActionHref = `/projects/${slug}/tickets?alerts=${actionableAlertTypes.join(",")}`;
  }

  const healthRows: DeliveryProjectRow[] = buildProjectHealthRows(
    [{ slug: project.slug, name: project.name, projectCode: project.projectCode }],
    tickets,
    timeEntries,
    todayISO
  );
  const healthRow = healthRows[0];

  const overCapacityMember = [...personRows].sort((a, b) => b.capacity - a.capacity).find((p) => p.capacity > 100);
  const overCapacityTeamMember = overCapacityMember
    ? teamMembers.find((m) => m.id === overCapacityMember.id)
    : undefined;

  const scheduleStatus: HealthStatus =
    healthRow?.risk === "blocked" ? "at-risk" : healthRow?.risk === "at-risk" ? "needs-attention" : "on-track";
  const scheduleNote =
    blocked.length > 0
      ? `${blocked.length} ticket${blocked.length === 1 ? "" : "s"} blocked`
      : overdueOpenCount > 0
      ? `${overdueOpenCount} ticket${overdueOpenCount === 1 ? "" : "s"} overdue`
      : "No blocked or overdue tickets";

  // Same Schedule/Capacity/Risks rows as Admin — Scope is omitted outright
  // for this role, not just relabeled, since the MVP has no real
  // scope-tracking source of truth (per this task's own explicit scope).
  const projectHealth: HealthRow[] = [
    { id: "schedule", label: "Schedule", status: scheduleStatus, note: scheduleNote },
    {
      id: "capacity",
      label: "Capacity",
      status: overCapacityTeamMember ? "needs-attention" : "on-track",
      note: overCapacityTeamMember ? `${overCapacityTeamMember.name} is over capacity` : "No capacity issues",
    },
    {
      id: "risks",
      label: "Risks",
      status: overdueOpenCount > 0 ? "at-risk" : "on-track",
      note: overdueOpenCount > 0 ? `${overdueOpenCount} overdue ticket${overdueOpenCount === 1 ? "" : "s"}` : "No overdue tickets",
    },
  ];

  // ── Needs Your Attention — the same real, project-scoped signals the
  // Project Lead Dashboard's own Attention Required widget already uses
  // (Blocked/Due Today/Awaiting Review — all three already computed above as
  // `blocked`/`inReview`, plus `dueToday` below), rendered as a ticket list
  // instead of that widget's KPI cards to match this section's existing
  // layout. "Over Capacity" has no single ticket to point at, so it isn't
  // representable in this per-ticket list and is left out, same as it would
  // be from any other ticket-shaped view. Deduped (a ticket can be both
  // blocked and due today) and ordered by the same real severity Attention
  // Required already implies (Blocked, then Due Today, then Awaiting
  // Review) — no invented ranking scheme, no fabricated reason text.
  const dueToday = openTickets.filter((t) => t.dueDate && parseDisplayDate(t.dueDate) === todayISO);

  const attentionEntriesById = new Map<string, AttentionEntry>();
  for (const t of blocked) attentionEntriesById.set(t.id, { ticket: t, reason: "Blocked — needs unblocking" });
  for (const t of dueToday) if (!attentionEntriesById.has(t.id)) attentionEntriesById.set(t.id, { ticket: t, reason: "Due today" });
  for (const t of inReview) if (!attentionEntriesById.has(t.id)) attentionEntriesById.set(t.id, { ticket: t, reason: "Waiting for review" });
  const attentionItems = Array.from(attentionEntriesById.values());

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* ===== Project Header ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {project.shortName}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">{project.name}</h1>
              <StatusBadge status={project.status} />
              <ProjectCategoryBadge category={project.category} />
            </div>
            <ExpandableDescription text={project.description} />
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-zinc-500">
              <span>Started {project.createdAt}</span>
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

      {/* ===== Attention banner — real Health Alerts, same source of truth
          as Delivery Reports/Admin Project Overview; hidden when there's
          nothing real to flag ===== */}
      {alertItems.length > 0 && (alertActionHref ? (
        <Link
          href={alertActionHref}
          className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 hover:bg-amber-100/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <p className="flex-1">
            {alertItems.map((item, i) => (
              <span key={item.id}>
                {i > 0 && <span className="mx-1.5 text-amber-400 dark:text-amber-600" aria-hidden="true">·</span>}
                {item.text}
              </span>
            ))}
          </p>
          <span className="text-xs font-medium text-amber-700 flex-shrink-0 dark:text-amber-400">
            Review →
          </span>
        </Link>
      ) : (
        <div className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <p className="flex-1">
            {alertItems.map((item, i) => (
              <span key={item.id}>
                {i > 0 && <span className="mx-1.5 text-amber-400 dark:text-amber-600" aria-hidden="true">·</span>}
                {item.text}
              </span>
            ))}
          </p>
        </div>
      ))}

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
            {team.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No team members on this project yet.</p>
            ) : (
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
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-zinc-400">Project Health</h2>
            <div>
              {projectHealth.map((row) => (
                <ProjectHealthRow
                  key={row.id}
                  row={row}
                  slug={slug}
                  canOpenMember={Boolean(overCapacityTeamMember)}
                  onOpenMember={() =>
                    overCapacityTeamMember &&
                    openMemberProfile({
                      name: overCapacityTeamMember.name,
                      avatar: overCapacityTeamMember.avatar,
                      role: overCapacityTeamMember.title,
                      projectSlug: slug,
                    })
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
