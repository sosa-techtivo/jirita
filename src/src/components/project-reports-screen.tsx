"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TeamMember } from "@/lib/mock-team";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { loadProjectDetail, loadProjectTeam } from "@/lib/projects";
import type { ProjectDetail, ProjectTeamMember } from "@/lib/projects";
import { loadProjectTickets, loadOrganizationLoggedTimeForRange, loadTicketsCompletedInRange } from "@/lib/tickets";
import type { OrganizationTimeEntry } from "@/lib/tickets";
import { getTodayISO, formatISODate } from "@/components/tickets/ticket-ui";
import { HealthBadge } from "@/components/status-badge";
import { buildProjectHealthRows } from "@/components/reports-screen";
import {
  StatusBadge as MemberStatusBadge,
  CapacityBar,
  capacityTextColor,
  utilizationOf,
} from "@/components/member-profile-modal";
import { useMemberProfile } from "@/components/member-profile";

// Real replacement for this screen's previous org-wide mock ticket list and
// mock-team.ts roster — every KPI below is scoped to this one project via
// the real loaders already used elsewhere in the app (loadProjectTickets/
// loadProjectTeam/loadOrganizationLoggedTimeForRange/loadProjectDetail —
// Tickets, Team, and Project Overview's own data sources), and Project
// Health specifically reuses Delivery Reports' own buildProjectHealthRows
// rather than a second calculation. Round hasn't changed: 0%/0h/"—" are
// real zero states computed from real (empty) data, never a fabricated
// fallback.

// Total Tickets always opens the plain, unfiltered Tickets page — the other
// three Delivery Progress cards (Completed/In Progress/Blocked) each get
// their own contextual navigation below (goToTicketsForStatus), never a
// parallel status value of their own.
const DELIVERY_STATUS_FILTER: Record<"total", null> = { total: null };

// Local calendar "this month" — first day of the month through today, same
// local-date (not UTC) reasoning getTodayISO/reports-screen.tsx's own
// getCurrentWeekBounds already documents. `end` is the exclusive upper
// bound for the status-activity range query (tomorrow, so today's own
// events are included); the time-entry query's own bounds are inclusive,
// so it's given `getTodayISO()` directly instead.
function getCurrentMonthBounds(): { start: string; end: string } {
  const todayISO = getTodayISO();
  const today = new Date(`${todayISO}T00:00:00`);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const toISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: toISODate(firstOfMonth), end: toISODate(tomorrow) };
}

// ── Shared shells (mirrors the visual language of the global Reports page) ──

function Section({
  title,
  icon,
  children,
}: {
  title: string;
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
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-slate-900 dark:text-zinc-50",
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">{label}</p>
      <p className={`text-xl font-bold mt-1 leading-none tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function ClickableStat({
  label,
  value,
  valueClass,
  onClick,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border border-slate-200 dark:border-zinc-700/70 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors"
    >
      <Stat label={label} value={value} valueClass={valueClass} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

// Same "server page, client breadcrumb" split as ProjectSettingsBreadcrumb/
// ProjectOverviewBreadcrumb — the real project name comes from the org's
// already-loaded project list (OrganizationProjectsProvider), not a new
// fetch, replacing the page's previous mock-projects.ts lookup.
export function ProjectReportsBreadcrumb({ slug }: { slug: string }) {
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;
  return (
    <>
      <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
        Projects
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <Link
        href={`/projects/${slug}`}
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        {projectName}
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200">Reports</span>
    </>
  );
}

export function ProjectReportsScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const { organization, isDevFallback } = useCurrentUser();
  const { openMemberProfile } = useMemberProfile();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [allTimeEntries, setAllTimeEntries] = useState<OrganizationTimeEntry[]>([]);
  const [completedThisMonthTicketIds, setCompletedThisMonthTicketIds] = useState<string[]>([]);
  const [completedThisMonthMinutes, setCompletedThisMonthMinutes] = useState(0);
  const [requestId, setRequestId] = useState(0);

  const runFetch = useCallback(() => setRequestId((id) => id + 1), []);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;

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
      const monthBounds = getCurrentMonthBounds();
      const todayISO = getTodayISO();

      const [teamResult, allTimeResult, completedResult] = await Promise.all([
        loadProjectTeam(organization.id, slug),
        // All-time logged minutes, per ticket — feeds both "Logged Hours"
        // below and buildProjectHealthRows' own real health verdict, one
        // real fetch for both instead of two overlapping queries.
        loadOrganizationLoggedTimeForRange(ticketIds, projectResult.project.createdAtISO.slice(0, 10), todayISO),
        // Real status_changed→done rows this calendar month — the actual
        // "moved to Done during the reporting period" signal, never
        // ticket.updatedAtISO.
        loadTicketsCompletedInRange(ticketIds, monthBounds.start, monthBounds.end),
      ]);
      if (cancelled) return;

      if (teamResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(teamResult.message);
        return;
      }
      if (allTimeResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(allTimeResult.message);
        return;
      }
      if (completedResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(completedResult.message);
        return;
      }

      // Logged time within the reporting period, for only the tickets that
      // were actually completed within that same period — a second,
      // narrower call to the same real function above (different bounds),
      // never a client-side re-slice of the all-time fetch (which doesn't
      // carry its own per-entry date back to the client).
      const completedMinutesResult =
        completedResult.ticketIds.length > 0
          ? await loadOrganizationLoggedTimeForRange(completedResult.ticketIds, monthBounds.start, todayISO)
          : { status: "ready" as const, entries: [] as OrganizationTimeEntry[] };
      if (cancelled) return;
      if (completedMinutesResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(completedMinutesResult.message);
        return;
      }

      setProject(projectResult.project);
      setTickets(projectTickets);
      setTeamMembers(teamResult.members);
      setAllTimeEntries(allTimeResult.entries);
      setCompletedThisMonthTicketIds(completedResult.ticketIds);
      setCompletedThisMonthMinutes(completedMinutesResult.entries.reduce((sum, e) => sum + e.minutes, 0));
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [organization, isDevFallback, slug, requestId]);

  if (loadState === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading reports…
        </div>
      </div>
    );
  }

  if (loadState === "error" || !project) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load reports</h3>
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

  const todayISO = getTodayISO();

  // Team capacity — same real per-member construction/formula team-
  // screen.tsx already uses (assignedHours = estimated hours of this
  // member's own currently-open tickets).
  const members: TeamMember[] = teamMembers.map((m) => {
    const ownTickets = tickets.filter((t) => t.assigneeProfileId === m.id);
    const activeTickets = ownTickets.filter((t) => t.status !== "done");
    const assignedHours = activeTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0);
    return {
      id: m.id,
      projectSlug: slug,
      name: m.name,
      role: m.title,
      email: m.email,
      avatar: m.avatar,
      status: "Available",
      weeklyCapacity: m.weeklyCapacity,
      assignedHours,
      activeTicketIds: activeTickets.map((t) => t.id),
      projectRole: m.projectRole,
    };
  });
  const totalWeeklyCapacity = members.reduce((sum, m) => sum + m.weeklyCapacity, 0);
  const totalAssignedHours = members.reduce((sum, m) => sum + m.assignedHours, 0);
  const teamUtilization = totalWeeklyCapacity === 0 ? 0 : Math.round((totalAssignedHours / totalWeeklyCapacity) * 100);

  // Project Health — reuses Delivery Reports' own real per-project risk
  // verdict, scoped to this one project, never a second calculation.
  const healthRows = buildProjectHealthRows(
    [{ slug: project.slug, name: project.name, projectCode: project.projectCode }],
    tickets,
    allTimeEntries,
    todayISO
  );
  const risk = healthRows[0]?.risk ?? "on-track";
  const projectHealth = risk === "blocked" ? "critical" : risk === "at-risk" ? "needs-attention" : "healthy";

  // Hours
  const estimatedHours = tickets.reduce((sum, t) => sum + (t.hours ?? 0), 0);
  const loggedHours = Math.round(allTimeEntries.reduce((sum, e) => sum + e.minutes, 0) / 60);
  const remainingHours = Math.max(estimatedHours - loggedHours, 0);
  const loggedPct = estimatedHours === 0 ? 0 : Math.round((loggedHours / estimatedHours) * 100);

  // Delivery
  const totalTickets = tickets.length;
  const completedTickets = tickets.filter((t) => t.status === "done");
  const inProgressTickets = tickets.filter((t) => t.status === "in-progress");
  const blockedTickets = tickets.filter((t) => t.status === "blocked");
  const inProgressCount = inProgressTickets.length;
  const blockedCount = blockedTickets.length;
  const completionPct = totalTickets === 0 ? 0 : Math.round((completedTickets.length / totalTickets) * 100);

  // Delivery Snapshot — real current-month reporting period.
  const monthBounds = getCurrentMonthBounds();
  const reportingPeriodLabel = `${formatISODate(monthBounds.start)} – ${formatISODate(todayISO)}`;
  const completedThisMonthCount = completedThisMonthTicketIds.length;
  const completedThisMonthHours = Math.round(completedThisMonthMinutes / 60);

  function goToTickets(status: string | null) {
    router.push(status ? `/projects/${slug}/tickets?status=${status}` : `/projects/${slug}/tickets`);
  }

  // Completed/In Progress/Blocked cards: never pick an arbitrary ticket
  // when more than one matches. Exactly one real match opens that ticket
  // directly; more than one hands off to the Tickets page via the same
  // real `?alerts=` query-state infrastructure Project Overview's own
  // Health Alert action already uses (tickets-screen.tsx ORs across
  // whatever canonical statuses are listed there — a single type here
  // behaves as a plain status filter). Zero matches never navigates.
  function goToTicketsForStatus(status: "done" | "in-progress" | "blocked", matchingTickets: Ticket[]) {
    if (matchingTickets.length === 0) return;
    if (matchingTickets.length === 1) {
      router.push(`/projects/${slug}/tickets/${getTicketDisplayKey(matchingTickets[0])}`);
      return;
    }
    router.push(`/projects/${slug}/tickets?alerts=${status}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Reports</h1>
        <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
          Monitor project health, capacity and delivery progress.
        </p>
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Project Health</p>
          <div className="mt-2">
            <HealthBadge health={projectHealth} />
          </div>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">
            {totalWeeklyCapacity}
            <span className="text-base font-medium text-slate-400 dark:text-zinc-600 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4 bg-brand-50/30 dark:bg-brand-950/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">Assigned Hours</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300 mt-1 leading-none">
            {totalAssignedHours}
            <span className="text-base font-medium text-brand-400 dark:text-brand-500 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Team Utilization</p>
          <p className={`text-2xl font-bold mt-1 leading-none tabular-nums ${capacityTextColor(teamUtilization)}`}>
            {teamUtilization}%
          </p>
        </div>
      </div>

      {/* ── Sections ─────────────────────────────────────────────────────── */}
      <div className="mt-6 space-y-5">

        {/* Estimated vs Logged Hours */}
        <Section
          title="Estimated vs Logged Hours"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          }
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Stat label="Estimated Hours" value={`${estimatedHours}h`} />
            <Stat label="Logged Hours" value={`${loggedHours}h`} valueClass="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Remaining Hours" value={`${remainingHours}h`} valueClass="text-slate-500 dark:text-zinc-400" />
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${loggedPct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-zinc-600 tabular-nums">{loggedPct}% logged</p>
        </Section>

        {/* Team Workload */}
        <Section
          title="Team Workload"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          }
        >
          {members.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No team members assigned to this project yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {members.map((member) => {
                const pct = utilizationOf(member);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => openMemberProfile({ name: member.name, avatar: member.avatar, role: member.role, projectSlug: member.projectSlug })}
                    className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-zinc-200 truncate">{member.name}</p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">{member.role}</p>
                    </div>
                    <MemberStatusBadge status={member.status} />
                    <div className="w-36 flex-shrink-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-600 dark:text-zinc-300 tabular-nums">
                          {member.assignedHours}h <span className="font-normal text-slate-400 dark:text-zinc-600">/ {member.weeklyCapacity}h</span>
                        </span>
                        <span className={`font-semibold tabular-nums ${capacityTextColor(pct)}`}>{pct}%</span>
                      </div>
                      <CapacityBar pct={pct} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* Delivery Progress */}
        <Section
          title="Delivery Progress"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <ClickableStat label="Total Tickets" value={totalTickets} onClick={() => goToTickets(DELIVERY_STATUS_FILTER.total)} />
            <ClickableStat
              label="Completed"
              value={completedTickets.length}
              valueClass="text-emerald-600 dark:text-emerald-400"
              onClick={() => goToTicketsForStatus("done", completedTickets)}
            />
            <ClickableStat
              label="In Progress"
              value={inProgressCount}
              valueClass="text-amber-600 dark:text-amber-400"
              onClick={() => goToTicketsForStatus("in-progress", inProgressTickets)}
            />
            <ClickableStat
              label="Blocked"
              value={blockedCount}
              valueClass="text-red-600 dark:text-red-400"
              onClick={() => goToTicketsForStatus("blocked", blockedTickets)}
            />
          </div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-500 dark:text-zinc-400">Completion</span>
            <span className="font-semibold text-slate-700 dark:text-zinc-200 tabular-nums">{completionPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completionPct}%` }} />
          </div>
        </Section>

        {/* Delivery Snapshot */}
        <Section
          title="Delivery Snapshot"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Reporting Period" value={<span className="text-sm">{reportingPeriodLabel}</span>} />
            <Stat label="Completed Tickets" value={completedThisMonthCount} />
            <Stat label="Completed Hours" value={`${completedThisMonthHours}h`} />
            <Stat label="Remaining Hours" value={`${remainingHours}h`} />
          </div>
        </Section>
      </div>

    </div>
  );
}
