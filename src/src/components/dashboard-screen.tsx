"use client";

import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { TicketStatus } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { getTodayISO, formatISODate } from "@/components/tickets/ticket-ui";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectLeadDashboard } from "@/components/project-lead-dashboard";
import { MemberDashboard } from "@/components/member-dashboard";
import { CreateProjectModal } from "@/components/create-project-modal";
import { InviteUserModal } from "@/components/invite-user-modal";
import type { AdminDashboardTicket } from "@/lib/tickets";
import { runAdminDashboardLoad } from "@/lib/admin-dashboard-load";
import { computeAdminDashboardKpis, selectMyActiveWork } from "@/lib/admin-dashboard-kpis";
import { KPI_INTERACTIVE_CLASS } from "@/components/reports-shared";
import { Card, ActiveTicketRow, SkeletonBlock } from "@/components/dashboard-shared";

// Every non-closed legacy status — the Assigned Tickets KPI's own `?alerts=`
// filter, so the Tickets page's OR-filter (tickets-screen.tsx) reproduces
// that same open set, whether it lands on one project's Tickets page or the
// org-wide one (app/tickets/page.tsx).
const ASSIGNED_TICKET_STATUSES: TicketStatus[] = ["backlog", "to-do", "in-progress", "review", "blocked"];

// Shared KPI navigation (same pattern every card used before): exactly one
// ticket links straight to its own Ticket Detail; two or more hand off to
// the current project's Tickets page (Dashboard scoped to one project) or
// the org-wide `/tickets` ("All Projects") with the card's own `?alerts=`
// filter applied, so the total there matches the card. A 0 count has no link.
function buildKpiHref(tickets: AdminDashboardTicket[], selectedProjectSlug: string | null, alerts: string): string | undefined {
  if (tickets.length === 0) return undefined;
  if (tickets.length === 1) {
    const only = tickets[0];
    return `/projects/${only.projectSlug}/tickets/${getTicketDisplayKey(only)}`;
  }
  if (selectedProjectSlug) return `/projects/${selectedProjectSlug}/tickets?alerts=${alerts}`;
  return `/tickets?alerts=${alerts}`;
}

function DashKpiCard({
  label,
  value,
  sub,
  danger,
  href,
}: {
  label:   string;
  value:   ReactNode;
  sub?:    string;
  danger?: boolean;
  // When present, the whole card becomes a real link to that exact ticket
  // set (same markup/classes either way, plus a cursor-pointer affordance).
  href?:   string;
}) {
  const className = [
    "h-full flex flex-col rounded-xl border shadow-sm shadow-slate-200/40 dark:shadow-black/20 px-3.5 pt-3 pb-3 sm:px-5 sm:pt-4 sm:pb-4",
    "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900",
    href ? KPI_INTERACTIVE_CLASS : "",
  ].join(" ");

  const content = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-slate-400 dark:text-zinc-600">{label}</p>
      <p className={`text-2xl font-bold leading-none ${danger ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-zinc-50"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const { user } = useCurrentUser();

  // The Project Lead gets a purpose-built operational dashboard instead of a
  // filtered version of this organization-wide one.
  if (user.role === "PROJECT_LEAD") {
    return <ProjectLeadDashboard />;
  }

  // Members (Engineer / QA / Designer) get a personal-productivity dashboard
  // instead of a filtered version of this organization-wide one.
  if (user.role === "MEMBER") {
    return <MemberDashboard />;
  }

  return <AdminDashboard />;
}

// Matches the header's original "Tuesday, June 30" style, built from the
// user's real local date instead of a fixed string — same helper shape as
// Member/Project Lead Dashboards' own formatFullDate.
function formatFullDate(todayISO: string): string {
  return new Date(`${todayISO}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Lightweight Admin landing screen (JIR-101): Assigned Tickets / Blocked /
// Due Today / Overdue plus My Active Work, all derived from one load
// (loadAdminDashboardTickets via runAdminDashboardLoad) — see
// lib/admin-dashboard-kpis.ts for the definitions.
function AdminDashboard() {
  const { user, userId, organization, isDevFallback } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  // A ticket click navigates straight to its own Ticket Detail page.
  function openTicket(ticket: AdminDashboardTicket) {
    router.push(`/projects/${ticket.projectSlug}/tickets/${getTicketDisplayKey(ticket)}`);
  }

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [tickets, setTickets] = useState<AdminDashboardTicket[]>([]);
  const [orgProjects, setOrgProjects] = useState<{ slug: string; name: string; status: string }[]>([]);
  const [requestId, setRequestId] = useState(0);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);

  const canManageOrg = canManage(user.role);
  const runFetch = () => setRequestId((id) => id + 1);

  // ── Project scope selector — the `?project=<slug>` query param is the
  // single source of truth (same real-URL-state precedent as Tickets'
  // `?alerts=` and Time Tracking's own filters), so refresh/back/forward all
  // just work with no extra state to keep in sync. A requested slug that
  // isn't a real, active, org-scoped project (stale link, another org, an
  // archived project) is silently ignored — falls back to "All Projects" —
  // rather than trusted as-is, respecting the same access boundary
  // `activeOrgProjects` itself is built from (RLS-scoped loadAdminDashboardTickets).
  const activeOrgProjects = useMemo(() => orgProjects.filter((p) => p.status === "active"), [orgProjects]);
  const requestedProjectSlug = searchParams.get("project");
  const selectedProjectSlug = useMemo(
    () => (requestedProjectSlug && activeOrgProjects.some((p) => p.slug === requestedProjectSlug) ? requestedProjectSlug : null),
    [requestedProjectSlug, activeOrgProjects]
  );

  function handleScopeChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("project", slug);
    else params.delete("project");
    const qs = params.toString();
    router.push(`/dashboard${qs ? `?${qs}` : ""}`);
  }

  // "All Projects" is a no-op filter; a selected project narrows every KPI
  // to just that project's own tickets, reusing the same calculations.
  const scopedTickets = useMemo(
    () => (selectedProjectSlug ? tickets.filter((t) => t.projectSlug === selectedProjectSlug) : tickets),
    [tickets, selectedProjectSlug]
  );

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern used elsewhere in this app (e.g. member-profile-modal.tsx)
    setLoadState("loading");

    // runAdminDashboardLoad always settles as ready/error (unexpected
    // rejections and a stuck request both become "error", bounded by
    // ADMIN_DASHBOARD_LOAD_TIMEOUT_MS) — so the skeleton can never outlive
    // the load. Aborting on cleanup cancels this load's in-flight requests
    // when it's superseded (Retry, org change) or unmounted.
    runAdminDashboardLoad(organization.id, { signal: controller.signal }).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(result.message);
        return;
      }
      setTickets(result.tickets);
      setOrgProjects(result.projects);
      setLoadState("ready");
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // organization?.id (not the whole `organization` object) — depending on
    // the object re-triggers this effect (and its full-page loading flash)
    // on every window-focus regain, since current-user-provider.tsx hands
    // back a new `organization` reference on its own session revalidation
    // even when the org itself hasn't changed. Keying off the real identity
    // means this only re-runs on a genuine org change, the initial mount,
    // or an explicit user-triggered runFetch() (Retry) — no background
    // auto-refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevFallback, organization?.id, requestId]);

  const todayISO = getTodayISO();
  // KPIs always read the complete (paged) scoped ticket set; only My Active
  // Work's rendered list is capped.
  const kpis = useMemo(() => computeAdminDashboardKpis(scopedTickets, todayISO), [scopedTickets, todayISO]);
  const myActiveWork = useMemo(() => selectMyActiveWork(scopedTickets, userId), [scopedTickets, userId]);

  if (loadState === "loading") {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-10 sm:pb-16">

        {/* ── Header (skeleton) ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6 mb-4 sm:mb-6">
          <div>
            <SkeletonBlock className="h-[22px] w-52 mb-1" />
            <SkeletonBlock className="h-[14px] w-32" />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-shrink-0">
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-8 w-28" />
          </div>
        </div>

        {/* ── KPI Cards (skeleton) ─────────────────────────────────────────── */}
        <SkeletonBlock className="h-[10px] w-36 mb-2" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700/70 shadow-sm shadow-slate-200/40 dark:shadow-black/20 px-3.5 pt-3 pb-3 sm:px-5 sm:pt-4 sm:pb-4">
              <SkeletonBlock className="h-[10px] w-24 mb-1" />
              <SkeletonBlock className="h-6 w-16 mb-1" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* ── My Active Work (skeleton) ────────────────────────────────────── */}
        <section className="mt-4 sm:mt-5 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
          <SkeletonBlock className="h-[10px] w-28 mb-4" />
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="h-4 w-full" />
            ))}
          </div>
        </section>

      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-10 sm:pb-16">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load dashboard</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {loadErrorMessage ?? "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={runFetch}
            className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-accent dark:text-brand-accent-foreground dark:hover:bg-brand-accent-strong dark:focus-visible:outline-2 dark:focus-visible:outline-offset-2 dark:focus-visible:outline-brand-accent dark:shadow-brand-accent/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const scopeLabel = selectedProjectSlug ? "in this project" : "across all projects";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-10 sm:pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6 mb-4 sm:mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-1">
            Hello, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-slate-400 dark:text-zinc-500">{formatFullDate(todayISO)}</p>
        </div>

        {/* Top actions: project scope selector + Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-shrink-0">
          <div className="relative inline-flex items-center">
            <select
              value={selectedProjectSlug ?? ""}
              onChange={(e) => handleScopeChange(e.target.value)}
              aria-label="Dashboard project scope"
              className="appearance-none text-[16px] sm:text-[13px] font-medium pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-brand-500/30 dark:focus:ring-brand-accent/30"
            >
              <option value="">All Projects</option>
              {activeOrgProjects.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2 w-3 h-3 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {canManageOrg && (
            <>
            <button
              type="button"
              onClick={() => setShowCreateProject(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7l4-4h6l4 4" />
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path strokeLinecap="round" d="M12 12v4M10 14h4" />
              </svg>
              New Project
            </button>
            <button
              type="button"
              onClick={() => setShowInviteMember(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" d="M15 20v-1.5a3.5 3.5 0 00-3.5-3.5h-4A3.5 3.5 0 004 18.5V20" />
                <circle cx="9" cy="7.5" r="3" />
                <path strokeLinecap="round" d="M19 20v-1.5a3.5 3.5 0 00-2.5-3.36M14 4.13a3 3 0 010 5.74" />
              </svg>
              Add Member
            </button>
            </>
          )}
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2">
        Organization Health
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <DashKpiCard
          label="Assigned Tickets"
          value={kpis.assigned.length}
          sub={`${kpis.activeCount} active · across all projects`}
          href={buildKpiHref(kpis.assigned, selectedProjectSlug, ASSIGNED_TICKET_STATUSES.join(","))}
        />
        <DashKpiCard
          label="Blocked"
          value={kpis.blocked.length}
          sub={scopeLabel}
          danger
          href={buildKpiHref(kpis.blocked, selectedProjectSlug, "blocked")}
        />
        <DashKpiCard
          label="Due Today"
          value={kpis.dueToday.length}
          sub={formatISODate(todayISO)}
          href={buildKpiHref(kpis.dueToday, selectedProjectSlug, "due-today")}
        />
        <DashKpiCard
          label="Overdue"
          value={kpis.overdue.length}
          sub="past due date"
          danger={kpis.overdue.length > 0}
          href={buildKpiHref(kpis.overdue, selectedProjectSlug, "overdue")}
        />
      </div>

      {/* ── My Active Work — open tickets assigned to you, first
          MY_ACTIVE_WORK_LIMIT in loaded order; count is the full total ─── */}
      <div className="mt-4 sm:mt-5">
        <Card
          title="My Active Work"
          count={myActiveWork.total}
          action={
            <Link href="/my-work" className="text-[11px] font-medium text-brand-600 dark:text-brand-accent hover:underline">
              View all →
            </Link>
          }
        >
          {myActiveWork.total === 0 ? (
            <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No active tickets assigned to you.</p>
          ) : (
            <div className="space-y-0.5">
              {myActiveWork.visible.map((t) => (
                <ActiveTicketRow key={t.id} ticket={t} onOpen={openTicket} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Quick Actions: same modals Projects/Users open, just triggered
          directly from here instead of navigating first ──────────────── */}
      {showCreateProject && <CreateProjectModal onClose={() => setShowCreateProject(false)} />}
      {showInviteMember && <InviteUserModal onClose={() => setShowInviteMember(false)} />}

    </div>
  );
}
