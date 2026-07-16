"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketTypeIcon, parseDisplayDate, getTodayISO, formatISODate } from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectLeadDashboard } from "@/components/project-lead-dashboard";
import { MemberDashboard } from "@/components/member-dashboard";
import { CreateProjectModal } from "@/components/create-project-modal";
import { InviteUserModal } from "@/components/invite-user-modal";
import {
  loadOrganizationTickets,
  loadOrganizationLoggedMinutes,
  loadOrganizationActivity,
} from "@/lib/tickets";
import type { OrganizationActivityEvent } from "@/lib/tickets";
import { loadOrganizationWorkloadMembers } from "@/lib/projects";
import type { OrgWorkloadMember } from "@/lib/projects";
import { utilizationOf } from "@/components/member-profile-modal";
import {
  Card,
  ActiveTicketRow,
  RecentActivityList,
  HERO_LABEL_CLASS,
  HERO_ACCENT_TEXT_CLASS,
} from "@/components/dashboard-shared";
import type { DashboardActivityEntry } from "@/components/dashboard-shared";

// Same cap + "fetch one extra to detect more" convention as Project
// Overview's own Project Activity widget (PROJECT_ACTIVITY_PREVIEW_LIMIT in
// admin-project-overview.tsx) — kept as its own constant here since this
// widget is org-wide, not project-scoped, and has no route to reuse that
// component's own state/props from.
const RECENT_ACTIVITY_LIMIT = 10;

// ── Sub-components ────────────────────────────────────────────────────────────

export interface OrgHealthInsight {
  id: string;
  level: "ok" | "warning" | "critical";
  text: string;
}

function InsightIcon({ level }: { level: OrgHealthInsight["level"] }) {
  if (level === "ok") {
    return (
      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" d="M5 12l5 5L20 7" />
      </svg>
    );
  }
  if (level === "critical") {
    return (
      <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
}

function InsightsBand({ items }: { items: OrgHealthInsight[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      {items.map((item, i) => (
        <Fragment key={item.id}>
          <span className="flex items-center gap-2">
            <InsightIcon level={item.level} />
            <span className={`text-[12px] ${item.level === "critical" ? "font-medium text-slate-800 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-400"}`}>
              {item.text}
            </span>
          </span>
          {i < items.length - 1 && (
            <span className="hidden sm:block text-slate-200 dark:text-zinc-800 select-none" aria-hidden="true">·</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function DashKpiCard({
  label,
  value,
  sub,
  accent,
  danger,
  progress,
}: {
  label:     string;
  value:     ReactNode;
  sub?:      string;
  accent?:   boolean;
  danger?:   boolean;
  progress?: number;
}) {
  return (
    <div
      className={[
        "h-full flex flex-col rounded-xl border shadow-sm shadow-slate-200/40 dark:shadow-black/20 px-5 pt-4 pb-4",
        // Every KPI card shares the same dark card background/border — an
        // Admin overview shouldn't let one metric visually outweigh the
        // others. Accent cards keep their light-mode tint but, in dark
        // mode, only add a faint violet ring as emphasis instead of a
        // brighter background (brand-300/400/900/950 aren't defined in the
        // theme, so the old `dark:bg-brand-950/15` etc. silently fell back
        // to the *light* class, which is why this card looked washed out).
        accent
          ? "border-brand-100 bg-brand-50/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:ring-1 dark:ring-inset dark:ring-violet-500/15"
          : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900",
      ].join(" ")}
    >
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${accent ? HERO_LABEL_CLASS : "text-slate-400 dark:text-zinc-600"}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold leading-none ${danger ? "text-red-600 dark:text-red-400" : accent ? HERO_ACCENT_TEXT_CLASS : "text-slate-900 dark:text-zinc-50"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>}
      <div className="mt-auto pt-3">
        {progress !== undefined && (
          <div className="h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: "on-track" | "at-risk" | "blocked" }) {
  const styles = {
    "on-track": "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10",
    "at-risk":  "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10",
    "blocked":  "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10",
  };
  const labels = { "on-track": "On Track", "at-risk": "At Risk", "blocked": "Blocked" };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${styles[risk]}`}>
      {labels[risk]}
    </span>
  );
}

function WorkloadRow({
  name,
  avatar,
  hours,
  capacity,
}: {
  name:     string;
  avatar:   string;
  hours:    number;
  capacity: number;
}) {
  // capacity can be real 0 (no weekly capacity set) — guarded here exactly
  // like utilizationOf (member-profile-modal.tsx, Team's own definition):
  // 0 capacity has nothing to divide by, so 0%, never NaN/Infinity. hours >
  // capacity below is a plain comparison and was already safe at capacity
  // 0 — an over-capacity member can still show the amber "over" text color
  // with a 0%-width bar, same decoupling CapacityBar's own comment
  // describes for Team.
  const pct    = capacity > 0 ? Math.min(100, Math.round((hours / capacity) * 100)) : 0;
  const isOver = hours > capacity;
  const isHigh = !isOver && pct > 85;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <MemberTrigger name={name} avatar={avatar} className="flex items-center gap-2.5 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt={name} className="w-5 h-5 rounded-full flex-shrink-0" />
        <span className="text-[12px] text-slate-600 dark:text-zinc-400 w-14 flex-shrink-0 truncate text-left">
          {name.split(" ")[0]}
        </span>
      </MemberTrigger>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isOver ? "bg-amber-400" : isHigh ? "bg-amber-300" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums flex-shrink-0 w-8 text-right ${isOver ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-zinc-400"}`}>
        {hours}h
      </span>
    </div>
  );
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

// Real data for Assigned Tickets / Hours Burn / Blocked / Due Today / My
// Active Work / Recent Activity / My Upcoming Deadlines / Team Workload /
// Projects at Risk — see loadOrganizationTickets/loadOrganizationLoggedMinutes/
// loadOrganizationActivity in lib/tickets.ts and
// loadOrganizationWorkloadMembers in lib/projects.ts. The Insights band
// below stays on INSIGHTS (still mock) — out of scope for this pass, same
// as the Project Lead/Member dashboards.
function AdminDashboard() {
  const { user, userId, organization, isDevFallback } = useCurrentUser();
  const [preview, setPreview] = useState<Ticket | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [projectNameBySlug, setProjectNameBySlug] = useState<Map<string, string>>(new Map());
  const [orgProjects, setOrgProjects] = useState<{ slug: string; name: string; status: string }[]>([]);
  const [loggedMinutes, setLoggedMinutes] = useState(0);
  const [activityEvents, setActivityEvents] = useState<OrganizationActivityEvent[]>([]);
  const [workloadMembers, setWorkloadMembers] = useState<OrgWorkloadMember[]>([]);
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
  // `activeOrgProjects` itself is built from (RLS-scoped loadOrganizationTickets).
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

  // Every section below reads from this instead of `tickets` directly —
  // "All Projects" is a no-op filter (same reference-shaped result), a
  // selected project narrows every KPI/list/insight to just that project's
  // own tickets, reusing the exact same downstream calculations.
  const scopedTickets = useMemo(
    () => (selectedProjectSlug ? tickets.filter((t) => t.projectSlug === selectedProjectSlug) : tickets),
    [tickets, selectedProjectSlug]
  );
  const scopedActiveProjects = useMemo(
    () => (selectedProjectSlug ? activeOrgProjects.filter((p) => p.slug === selectedProjectSlug) : activeOrgProjects),
    [activeOrgProjects, selectedProjectSlug]
  );

  // Logged minutes and the curated Recent Activity feed are each backed by
  // their own real query scoped by a ticket-id list (loadOrganizationLoggedMinutes/
  // loadOrganizationActivity, same functions the org-wide load above already
  // uses) — the org-wide top-11 activity probe can't just be filtered
  // client-side to one project, since that project's own most recent events
  // may not be within the org's global top 11. Reset to the zero state the
  // instant the scope changes (before the fetch resolves) so a fast switch
  // can never render the previous project's numbers even for a moment.
  const [scopedLoggedMinutes, setScopedLoggedMinutes] = useState(0);
  const [scopedActivityEvents, setScopedActivityEvents] = useState<OrganizationActivityEvent[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clears the previous project's numbers the moment the scope changes, before the async fetch below resolves
    setScopedLoggedMinutes(0);
    setScopedActivityEvents([]);
    if (!selectedProjectSlug || loadState !== "ready") return;
    let cancelled = false;

    const projectTicketIds = tickets.filter((t) => t.projectSlug === selectedProjectSlug).map((t) => t.id);
    (async () => {
      const [minutesResult, activityResult] = await Promise.all([
        loadOrganizationLoggedMinutes(projectTicketIds),
        loadOrganizationActivity(projectTicketIds, RECENT_ACTIVITY_LIMIT + 1),
      ]);
      if (cancelled) return;
      if (minutesResult.status === "ready") setScopedLoggedMinutes(minutesResult.totalMinutes);
      if (activityResult.status === "ready") setScopedActivityEvents(activityResult.events);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectSlug, tickets, loadState]);

  const effectiveLoggedMinutes = selectedProjectSlug ? scopedLoggedMinutes : loggedMinutes;
  const effectiveActivityEvents = selectedProjectSlug ? scopedActivityEvents : activityEvents;

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;

    (async () => {
      const ticketsResult = await loadOrganizationTickets(organization.id);
      if (cancelled) return;
      if (ticketsResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(ticketsResult.message);
        return;
      }

      const ticketIds = ticketsResult.tickets.map((t) => t.id);
      const [minutesResult, activityResult, workloadResult] = await Promise.all([
        loadOrganizationLoggedMinutes(ticketIds),
        // Fetch one extra (11) past the 10 actually shown — same probe
        // Project Overview's own Project Activity widget uses to know
        // whether a "View all activity →" link is warranted, without a
        // second/paginated query just to check.
        loadOrganizationActivity(ticketIds, RECENT_ACTIVITY_LIMIT + 1),
        loadOrganizationWorkloadMembers(organization.id),
      ]);
      if (cancelled) return;

      if (minutesResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(minutesResult.message);
        return;
      }
      if (activityResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(activityResult.message);
        return;
      }
      if (workloadResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(workloadResult.message);
        return;
      }

      setTickets(ticketsResult.tickets);
      setProjectNameBySlug(new Map(ticketsResult.projects.map((p) => [p.slug, p.name])));
      setOrgProjects(ticketsResult.projects);
      setLoggedMinutes(minutesResult.totalMinutes);
      setActivityEvents(activityResult.events);
      setWorkloadMembers(workloadResult.members);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, requestId]);

  const todayISO = getTodayISO();

  const ticketsById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);

  const openTicketsCount = useMemo(() => scopedTickets.filter((t) => t.status !== "done").length, [scopedTickets]);
  const activeTicketsCount = useMemo(
    () => scopedTickets.filter((t) => t.status === "in-progress" || t.status === "review").length,
    [scopedTickets]
  );
  const blockedTicketsCount = useMemo(() => scopedTickets.filter((t) => t.status === "blocked").length, [scopedTickets]);
  const dueTodayCount = useMemo(
    () => scopedTickets.filter((t) => t.dueDate && parseDisplayDate(t.dueDate) === todayISO).length,
    [scopedTickets, todayISO]
  );

  const estimatedHoursTotal = useMemo(() => scopedTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0), [scopedTickets]);
  const loggedHoursTotal = effectiveLoggedMinutes / 60;
  const hoursBurnPct = estimatedHoursTotal > 0 ? Math.round((loggedHoursTotal / estimatedHoursTotal) * 100) : 0;

  const myActiveWork = useMemo(
    () => (userId ? scopedTickets.filter((t) => t.assigneeProfileId === userId && t.status !== "done") : []),
    [scopedTickets, userId]
  );

  const deadlines = useMemo(
    () =>
      [...myActiveWork]
        .filter((t) => t.dueDate)
        .sort((a, b) => parseDisplayDate(a.dueDate as string).localeCompare(parseDisplayDate(b.dueDate as string))),
    [myActiveWork]
  );

  // Team Workload — same "active (non-done) tickets" definition team-screen.tsx
  // already uses for assignedHours, and the exact same utilizationOf (from
  // member-profile-modal.tsx) Team itself uses for the load percentage, just
  // applied org-wide instead of per-project. Sorted by that utilization —
  // the widget's own "load" metric — highest first, capped at 5 rows to
  // match the existing design.
  const workload = useMemo(() => {
    return workloadMembers
      .map((member) => {
        const assignedHours = scopedTickets
          .filter((t) => t.assigneeProfileId === member.id && t.status !== "done")
          .reduce((sum, t) => sum + (t.hours ?? 0), 0);
        const pct = utilizationOf({
          id: member.id,
          projectSlug: "",
          name: member.name,
          role: "",
          email: "",
          avatar: member.avatar,
          status: "Available",
          weeklyCapacity: member.weeklyCapacity,
          assignedHours,
          activeTicketIds: [],
        });
        return { id: member.id, name: member.name, avatar: member.avatar, hours: assignedHours, capacity: member.weeklyCapacity, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [workloadMembers, scopedTickets]);

  // Projects at Risk — BLOCKED (>=1 active ticket in status "blocked") takes
  // priority over AT RISK (no blocked tickets, but >=1 active ticket whose
  // due date has already passed); a project meeting neither is left out
  // entirely. "Active" ticket = status !== "done", same definition used
  // everywhere else on this dashboard. Progress is completed/total over
  // EVERY ticket in the project (not just active ones), guarded against 0
  // total. Scoped to the org's active projects only — tickets can't be
  // deleted in this schema, so no separate "not deleted" filter is needed.
  const projectsAtRisk = useMemo(() => {
    type RiskEntry = { slug: string; name: string; risk: "blocked" | "at-risk"; affected: number; progressPct: number };
    const activeProjects = scopedActiveProjects;

    const entries: RiskEntry[] = [];
    for (const project of activeProjects) {
      const projectTickets = tickets.filter((t) => t.projectSlug === project.slug);
      if (projectTickets.length === 0) continue;

      const totalCount = projectTickets.length;
      const completedCount = projectTickets.filter((t) => t.status === "done").length;
      const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      const blockedCount = projectTickets.filter((t) => t.status === "blocked").length;
      if (blockedCount > 0) {
        entries.push({ slug: project.slug, name: project.name, risk: "blocked", affected: blockedCount, progressPct });
        continue;
      }

      const overdueCount = projectTickets.filter(
        (t) => t.status !== "done" && t.dueDate && parseDisplayDate(t.dueDate) < todayISO
      ).length;
      if (overdueCount > 0) {
        entries.push({ slug: project.slug, name: project.name, risk: "at-risk", affected: overdueCount, progressPct });
      }
    }

    entries.sort((a, b) => {
      if (a.risk !== b.risk) return a.risk === "blocked" ? -1 : 1;
      if (a.affected !== b.affected) return b.affected - a.affected;
      return a.progressPct - b.progressPct;
    });

    return entries.slice(0, 3);
  }, [scopedActiveProjects, tickets, todayISO]);

  // Organization Health (the insights band) — each indicator below reuses
  // the same real definitions as the widget it's named after, but computed
  // uncapped (Projects at Risk and Team Workload cap their own lists at
  // 3/5 rows for display; this band needs the true full count/names, so
  // these are separate small computations rather than reading the capped
  // `projectsAtRisk`/`workload` arrays).

  // Same "active project + >=1 blocked ticket" criterion as Projects at
  // Risk above, uncapped and blocked-only (no AT RISK projects here).
  const blockedProjects = useMemo(() => {
    const activeProjects = scopedActiveProjects;
    const result: { name: string; count: number }[] = [];
    for (const project of activeProjects) {
      const blockedCount = tickets.filter((t) => t.projectSlug === project.slug && t.status === "blocked").length;
      if (blockedCount > 0) result.push({ name: project.name, count: blockedCount });
    }
    return result;
  }, [scopedActiveProjects, tickets]);

  // Same assignedHours + utilizationOf calculation Team Workload uses
  // above, uncapped and filtered to >100%, most over-capacity first.
  const membersOverCapacity = useMemo(() => {
    return workloadMembers
      .map((member) => {
        const assignedHours = scopedTickets
          .filter((t) => t.assigneeProfileId === member.id && t.status !== "done")
          .reduce((sum, t) => sum + (t.hours ?? 0), 0);
        const pct = utilizationOf({
          id: member.id,
          projectSlug: "",
          name: member.name,
          role: "",
          email: "",
          avatar: member.avatar,
          status: "Available",
          weeklyCapacity: member.weeklyCapacity,
          assignedHours,
          activeTicketIds: [],
        });
        return { name: member.name, pct };
      })
      .filter((m) => m.pct > 100)
      .sort((a, b) => b.pct - a.pct);
  }, [workloadMembers, scopedTickets]);

  // No dedicated "completed_at" column exists — updated_at on a ticket
  // that's currently "done" is the real, closest available signal for when
  // it was completed (same approximation this schema uses elsewhere; a
  // later unrelated edit could in principle nudge a ticket into/out of
  // "this month", but there's no fabricated data involved).
  const completedThisMonthCount = useMemo(() => {
    const monthPrefix = todayISO.slice(0, 7); // "YYYY-MM"
    return scopedTickets.filter((t) => t.status === "done" && t.updatedAtISO?.slice(0, 7) === monthPrefix).length;
  }, [scopedTickets, todayISO]);

  // Same estimatedHoursTotal/loggedHoursTotal/hoursBurnPct the Hours Burn
  // KPI card above already computes — omitted entirely (not just 0%) when
  // there isn't a real estimated-hours basis to divide by, and remaining
  // hours is clamped so an over-budget org never shows a negative number.
  const hoursBurnInsight = useMemo(() => {
    if (estimatedHoursTotal <= 0) return null;
    const remaining = Math.max(0, Math.round(estimatedHoursTotal - loggedHoursTotal));
    return { pct: hoursBurnPct, remaining };
  }, [estimatedHoursTotal, loggedHoursTotal, hoursBurnPct]);

  const orgHealthInsights = useMemo<OrgHealthInsight[]>(() => {
    const items: OrgHealthInsight[] = [];

    if (blockedProjects.length === 1) {
      const [b] = blockedProjects;
      items.push({
        id: "blocked",
        level: "critical",
        text: `${b.name} blocked — ${b.count} ticket${b.count !== 1 ? "s" : ""}`,
      });
    } else if (blockedProjects.length > 1) {
      items.push({ id: "blocked", level: "critical", text: `${blockedProjects.length} projects currently blocked` });
    }

    if (membersOverCapacity.length === 1) {
      items.push({ id: "capacity", level: "warning", text: `${membersOverCapacity[0].name} above capacity` });
    } else if (membersOverCapacity.length === 2) {
      items.push({
        id: "capacity",
        level: "warning",
        text: `${membersOverCapacity[0].name} and ${membersOverCapacity[1].name} above capacity`,
      });
    } else if (membersOverCapacity.length > 2) {
      items.push({ id: "capacity", level: "warning", text: `${membersOverCapacity.length} members above capacity` });
    }

    items.push({ id: "completed", level: "ok", text: `${completedThisMonthCount} tickets completed this month` });

    if (hoursBurnInsight) {
      items.push({
        id: "hours",
        level: "warning",
        text: `Hours burn at ${hoursBurnInsight.pct}% · ${hoursBurnInsight.remaining}h remaining`,
      });
    }

    return items.length > 0 ? items : [{ id: "none", level: "ok", text: "No health alerts right now." }];
  }, [blockedProjects, membersOverCapacity, completedThisMonthCount, hoursBurnInsight]);

  // Only ever an 11th probe event past RECENT_ACTIVITY_LIMIT — never
  // rendered, just used to decide whether "View all activity →" appears
  // (same pattern as Project Overview's hasMoreActivity).
  const hasMoreActivity = effectiveActivityEvents.length > RECENT_ACTIVITY_LIMIT;

  const recentActivityEntries = useMemo<DashboardActivityEntry[]>(
    () =>
      effectiveActivityEvents.slice(0, RECENT_ACTIVITY_LIMIT).map((event) => {
        const ticket = ticketsById.get(event.ticketId);
        const project = ticket ? projectNameBySlug.get(ticket.projectSlug) ?? ticket.projectSlug : "";
        const base = {
          id: event.id,
          avatar: event.actorAvatar,
          name: event.actorName ?? "Someone",
          ticket,
          project,
          time: event.time,
        };

        if (event.type === "blocked") return { ...base, type: "blocked" as const, verb: "marked" };
        if (event.type === "completed") return { ...base, type: "completed" as const, verb: "completed" };
        if (event.type === "hours") {
          return {
            ...base,
            type: "hours" as const,
            verb: "updated the estimate on",
            detail: <span className="font-medium">{event.oldHours}h → {event.newHours}h</span>,
          };
        }
        if (event.type === "assigned") {
          return {
            ...base,
            type: "assigned" as const,
            verb: "reassigned",
            detail: <>to <span className="font-medium">{event.newAssigneeName}</span></>,
          };
        }
        return {
          ...base,
          type: "priority" as const,
          verb: event.priorityRaised ? "raised priority on" : "lowered priority on",
          detail: <span className="font-medium">{event.oldPriorityLabel} → {event.newPriorityLabel}</span>,
        };
      }),
    [effectiveActivityEvents, ticketsById, projectNameBySlug]
  );

  if (loadState === "loading") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 pb-16">
        <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading dashboard…
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 pb-16">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load dashboard</h3>
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-1">
            Good morning, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-slate-400 dark:text-zinc-500">Tuesday, June 30</p>
        </div>

        {/* Top actions: project scope selector + Quick Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="relative inline-flex items-center">
            <select
              value={selectedProjectSlug ?? ""}
              onChange={(e) => handleScopeChange(e.target.value)}
              aria-label="Dashboard project scope"
              className="appearance-none text-[13px] font-medium pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-brand-500/30"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <DashKpiCard
          label="Assigned Tickets"
          value={openTicketsCount}
          sub={`${activeTicketsCount} active`}
        />
        <DashKpiCard
          label="Hours Burn"
          value={
            <>
              {Math.round(loggedHoursTotal)}
              <span className="text-base font-normal opacity-40 ml-0.5">/ {Math.round(estimatedHoursTotal)}h</span>
            </>
          }
          sub={`${hoursBurnPct}% complete`}
          accent
          progress={hoursBurnPct}
        />
        <DashKpiCard
          label="Blocked"
          value={blockedTicketsCount}
          sub="across all projects"
          danger
        />
        <DashKpiCard
          label="Due Today"
          value={dueTodayCount}
          sub={formatISODate(todayISO)}
        />
      </div>

      {/* ── Insights band ──────────────────────────────────────────────────── */}
      <InsightsBand items={orgHealthInsights} />

      {/* ── Two-column main content ─────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

        {/* Left: My Active Work + Recent Activity */}
        <div className="space-y-5 min-w-0">

          <Card
            title="My Active Work"
            count={myActiveWork.length}
            action={
              <Link href="/my-work" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                View all →
              </Link>
            }
          >
            {myActiveWork.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No active tickets assigned to you.</p>
            ) : (
              <div className="space-y-0.5">
                {myActiveWork.map((t) => (
                  <ActiveTicketRow key={t.id} ticket={t} onOpen={setPreview} />
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Recent Activity"
            action={
              hasMoreActivity ? (
                <Link href="/activity" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                  View all activity →
                </Link>
              ) : undefined
            }
          >
            {recentActivityEntries.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No recent activity yet.</p>
            ) : (
              <RecentActivityList items={recentActivityEntries} onOpenTicket={setPreview} />
            )}
          </Card>

        </div>

        {/* Right: Projects at Risk + Team Workload + Upcoming Deadlines */}
        <div className="space-y-5">

          <Card
            title="Projects at Risk"
            count={projectsAtRisk.length}
            action={
              <Link href="/reports" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                Full report →
              </Link>
            }
          >
            {projectsAtRisk.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No projects at risk right now.</p>
            ) : (
              <div className="space-y-4">
                {projectsAtRisk.map((p) => (
                  <div key={p.slug}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">
                        {p.name}
                      </span>
                      <RiskBadge risk={p.risk} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${p.risk === "blocked" ? "bg-red-400" : "bg-amber-400"}`}
                          style={{ width: `${p.progressPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex-shrink-0 tabular-nums w-8 text-right">
                        {p.progressPct}%
                      </span>
                    </div>
                    <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">
                      {p.risk === "blocked"
                        ? `${p.affected} blocked ticket${p.affected !== 1 ? "s" : ""}`
                        : `${p.affected} overdue ticket${p.affected !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Team Workload"
            action={
              <Link href="/reports" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                Details →
              </Link>
            }
          >
            {workload.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No team workload data yet.</p>
            ) : (
              <div>
                {workload.map((w) => (
                  <WorkloadRow key={w.id} name={w.name} avatar={w.avatar} hours={w.hours} capacity={w.capacity} />
                ))}
              </div>
            )}
          </Card>

          <Card title="My Upcoming Deadlines">
            {deadlines.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No upcoming deadlines.</p>
            ) : (
            <div className="space-y-1">
              {deadlines.map((t) => {
                const isOverdue = parseDisplayDate(t.dueDate as string) < todayISO;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPreview(t)}
                    className="w-full flex items-center gap-2.5 py-1.5 px-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-400" : "bg-slate-300 dark:bg-zinc-600"}`} />
                    <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      <TicketTypeIcon type={t.type} />
                      <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
                        {getTicketDisplayKey(t)}
                      </span>
                      <span className="min-w-0 text-[12px] text-slate-700 dark:text-zinc-300 truncate">
                        {t.title}
                      </span>
                    </span>
                    <span className={`text-[11px] font-semibold flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-zinc-400"}`}>
                      {t.dueDate}
                    </span>
                  </button>
                );
              })}
            </div>
            )}
          </Card>

        </div>
      </div>

      {/* ── Ticket preview panel ────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={preview.projectSlug}
          onClose={() => setPreview(null)}
        />
      )}

      {/* ── Quick Actions: same modals Projects/Users open, just triggered
          directly from here instead of navigating first ──────────────── */}
      {showCreateProject && <CreateProjectModal onClose={() => setShowCreateProject(false)} />}
      {showInviteMember && <InviteUserModal onClose={() => setShowInviteMember(false)} />}

    </div>
  );
}
