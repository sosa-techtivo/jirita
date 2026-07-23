"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import type { Ticket, TicketStatus } from "@/lib/mock-tickets";
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
import { buildProjectHealthRows } from "@/components/reports-screen";
import {
  Card,
  ActiveTicketRow,
  RecentActivityList,
  HERO_LABEL_CLASS,
  HERO_ACCENT_TEXT_CLASS,
  SkeletonBlock,
} from "@/components/dashboard-shared";
import type { DashboardActivityEntry } from "@/components/dashboard-shared";

// Same cap + "fetch one extra to detect more" convention as Project
// Overview's own Project Activity widget (PROJECT_ACTIVITY_PREVIEW_LIMIT in
// admin-project-overview.tsx) — kept as its own constant here since this
// widget is org-wide, not project-scoped, and has no route to reuse that
// component's own state/props from.
const RECENT_ACTIVITY_LIMIT = 10;

// Every non-"done" status — the "Assigned Tickets" KPI's own definition
// (see assignedTickets below). Used to build its `?alerts=` link so the
// Tickets page's own OR-filter (tickets-screen.tsx) reproduces exactly
// that same set, whether it lands on one project's Tickets page or the
// org-wide one (app/tickets/page.tsx).
const ASSIGNED_TICKET_STATUSES: TicketStatus[] = ["backlog", "to-do", "in-progress", "review", "blocked"];

// Precondition: `tickets` is non-empty (only called when assignedTicketsCount
// > 0) — always returns a real, navigable href, so a >0 KPI never ends up
// without a place to land, regardless of how many different projects those
// tickets span.
function buildAssignedTicketsHref(tickets: Ticket[], selectedProjectSlug: string | null): string {
  if (tickets.length === 1) {
    const only = tickets[0];
    return `/projects/${only.projectSlug}/tickets/${getTicketDisplayKey(only)}`;
  }
  // Dashboard scoped to one project — that project's own Tickets page shows
  // exactly this set (scopedTickets, and therefore this list, is already
  // narrowed to it).
  if (selectedProjectSlug) {
    return `/projects/${selectedProjectSlug}/tickets?alerts=${ASSIGNED_TICKET_STATUSES.join(",")}`;
  }
  // "All Projects" — the org-wide Tickets view (app/tickets/page.tsx) shows
  // every accessible project's tickets, so the same `?alerts=` filter there
  // reproduces this exact set even when it spans multiple projects.
  return `/tickets?alerts=${ASSIGNED_TICKET_STATUSES.join(",")}`;
}

// Hours Burn sums logged time with no date restriction at all
// (loadOrganizationLoggedMinutes has no from/to bound) — unlike every one
// of Time Tracking's own periods (Today/This Week/This Month/Custom
// Range), which are all real date windows. Time Tracking has no "All Time"
// period of its own; rather than add one (a new, visible period option),
// this reuses its existing Custom Range params (`?period=custom&from=&to=`)
// with a deliberately early lower bound, so the resulting Billable +
// Non-Billable Hours there sum to the exact same all-time total Hours
// Burn itself reads from the same ticket_time_entries rows.
const ALL_TIME_FROM_DATE = "2000-01-01";

function buildHoursBurnHref(selectedProjectSlug: string | null, todayISO: string): string {
  const params = new URLSearchParams();
  params.set("period", "custom");
  params.set("from", ALL_TIME_FROM_DATE);
  params.set("to", todayISO);
  // Dashboard scoped to one project — Time Tracking's own Project filter
  // narrows to the exact same ticket scope Hours Burn itself is reading
  // from (scopedTickets). Left unset for "All Projects," same as every
  // other Time Tracking filter Hours Burn doesn't itself apply (Member/
  // Client/Billing all stay "All").
  if (selectedProjectSlug) params.set("projects", selectedProjectSlug);
  return `/time-tracking?${params.toString()}`;
}

// "Blocked" KPI navigation — same single-ticket / project-scoped-vs-org-wide
// `?alerts=` pattern Assigned Tickets already established
// (buildAssignedTicketsHref above), kept as its own small function rather
// than sharing one with that card's helper, so neither card's navigation
// can be affected by a change meant for the other. Applies to just the one
// "blocked" status this card itself counts.
function buildBlockedTicketsHref(tickets: Ticket[], selectedProjectSlug: string | null): string {
  if (tickets.length === 1) {
    const only = tickets[0];
    return `/projects/${only.projectSlug}/tickets/${getTicketDisplayKey(only)}`;
  }
  if (selectedProjectSlug) {
    return `/projects/${selectedProjectSlug}/tickets?alerts=blocked`;
  }
  return `/tickets?alerts=blocked`;
}

// "Due Today" KPI navigation — same single-ticket / project-scoped-vs-
// org-wide `?alerts=` pattern as Assigned Tickets/Blocked above, kept as
// its own small function for the same reason (so no other card's
// navigation can be affected by a change meant for this one). "due-today"
// is a new pseudo-type in tickets-screen.tsx's own `?alerts=` OR-filter —
// same real precedent as its existing "overdue" pseudo-type, matched there
// with the exact same `getTodayISO()`/`parseDisplayDate()` definition of
// "today" this card's own dueTodayTickets below already uses, never a
// second/different one.
function buildDueTodayHref(tickets: Ticket[], selectedProjectSlug: string | null): string {
  if (tickets.length === 1) {
    const only = tickets[0];
    return `/projects/${only.projectSlug}/tickets/${getTicketDisplayKey(only)}`;
  }
  if (selectedProjectSlug) {
    return `/projects/${selectedProjectSlug}/tickets?alerts=due-today`;
  }
  return `/tickets?alerts=due-today`;
}

// "Projects currently blocked" health-insight navigation — a project's own
// `blockedTickets` field isn't populated for real data (derived-from-tickets
// columns that nothing re-aggregates yet), so this can't reuse the Projects
// list's own Status/Health/Priority filters; the real, already-computed
// slugs (from blockedProjects below, the same list the insight's own text
// is built from) are carried in the URL instead — same query-state handoff
// precedent as Tickets' `?alerts=`, applied to the one place (Projects)
// that doesn't already have an equivalent filter.
function buildBlockedProjectsHref(projects: { slug: string }[]): string {
  if (projects.length === 1) return `/projects/${projects[0].slug}`;
  return `/projects?blocked=${projects.map((p) => p.slug).join(",")}`;
}

// "Tickets completed this month" health-insight navigation — same
// single-ticket / project-scoped-vs-org-wide `?alerts=` pattern as the KPI
// cards above. "completed-this-month" is a new pseudo-type in
// tickets-screen.tsx's own `?alerts=` OR-filter, matched there with the
// exact same status-done + current-month-updatedAtISO definition this
// insight's own completedThisMonthTickets below already uses.
function buildCompletedThisMonthHref(tickets: Ticket[], selectedProjectSlug: string | null): string {
  if (tickets.length === 1) {
    const only = tickets[0];
    return `/projects/${only.projectSlug}/tickets/${getTicketDisplayKey(only)}`;
  }
  if (selectedProjectSlug) {
    return `/projects/${selectedProjectSlug}/tickets?alerts=completed-this-month`;
  }
  return `/tickets?alerts=completed-this-month`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

export interface OrgHealthInsight {
  id: string;
  level: "ok" | "warning" | "critical";
  text: string;
  // Optional — only the "blocked"/"completed"/"hours" insights pass this
  // (see orgHealthInsights below). When present, just that one item becomes
  // its own independent link; the "·" separators between items are never
  // clickable, and the band itself is never one single link.
  href?: string;
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
      {items.map((item, i) => {
        const content = (
          <>
            <InsightIcon level={item.level} />
            <span className={`text-[12px] ${item.level === "critical" ? "font-medium text-slate-800 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-400"}`}>
              {item.text}
            </span>
          </>
        );
        return (
          <Fragment key={item.id}>
            {/* Each item is its own independent click target when it has a
                real href — never the whole band, and never nesting the "·"
                separator below inside it. */}
            {item.href ? (
              <Link href={item.href} className="flex items-center gap-2 cursor-pointer">
                {content}
              </Link>
            ) : (
              <span className="flex items-center gap-2">{content}</span>
            )}
            {i < items.length - 1 && (
              <span className="hidden sm:block text-slate-200 dark:text-zinc-800 select-none" aria-hidden="true">·</span>
            )}
          </Fragment>
        );
      })}
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
  href,
}: {
  label:     string;
  value:     ReactNode;
  sub?:      string;
  accent?:   boolean;
  danger?:   boolean;
  progress?: number;
  // Optional — only "Assigned Tickets" passes this today. When present, the
  // whole card becomes a real link (same markup/classes either way, plus a
  // cursor-pointer affordance) to that exact ticket set; `sub` stays plain
  // text, never a separate/nested link of its own.
  href?: string;
}) {
  const className = [
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
    href ? "cursor-pointer" : "",
  ].join(" ");

  const content = (
    <>
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
  profileId,
  projectSlug,
}: {
  name:     string;
  avatar:   string;
  hours:    number;
  capacity: number;
  // This member's real profiles.id — the Member Profile Modal now fetches
  // its own real Assigned Hours/Active Tickets/Utilization/Current Workload
  // straight from Supabase given just this id (+ projectSlug below), so
  // this row no longer needs to precompute/pass that data itself. Without
  // a real id, resolveTeamMember (no profileId, no match in the mock
  // roster) used to synthesize an `unknown-<name>` id, which is what made
  // "View Work History" build an invalid route.
  profileId: string;
  // The Admin Dashboard's own current project scope — real slug when one
  // project is selected, omitted entirely under "All Projects" (never a
  // guessed/first/arbitrary project), so the modal aggregates org-wide
  // (matching this row's own "All Projects" hours) instead of guessing one.
  projectSlug?: string;
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
      <MemberTrigger
        name={name}
        avatar={avatar}
        profileId={profileId}
        projectSlug={projectSlug}
        className="flex items-center gap-2.5 min-w-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt={name} className="w-5 h-5 rounded-full flex-shrink-0" />
        <span className="text-[12px] text-slate-600 dark:text-zinc-400 w-14 flex-shrink-0 truncate text-left">
          {name.split(" ")[0]}
        </span>
      </MemberTrigger>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isOver ? "bg-red-500" : isHigh ? "bg-amber-300" : "bg-brand-500"}`}
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
    // Back to "loading" on every re-run too, not just the first mount —
    // same real-data-refresh pattern Member's and Project Lead's own main
    // effects already use (e.g. project-lead-dashboard.tsx), so this effect
    // re-running (organization gets a new reference on every
    // window-focus-regain revalidation in current-user-provider.tsx) shows
    // the existing skeleton again instead of silently swapping data in the
    // background with no visible refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern used elsewhere in this app (e.g. member-profile-modal.tsx)
    setLoadState("loading");

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

  // "Assigned Tickets" KPI — deliberately organization-wide (Organization
  // Health section, not personal): every open (non-"done") ticket in the
  // current Dashboard scope, assigned or not, across every member. This is
  // NOT the signed-in Admin's own assignments — that's "My Active Work"
  // below (filtered by assigneeProfileId === userId). The card's sub text
  // ("across all projects") exists precisely so this scope reads
  // unambiguously next to that personal widget. Single source of truth for
  // the card: the number shown, the ticket a single-ticket click resolves
  // to, and the `?alerts=` filter applied on the destination Tickets page
  // all derive from this same list — never a second, independently
  // -filtered copy of it.
  const assignedTickets = useMemo(() => scopedTickets.filter((t) => t.status !== "done"), [scopedTickets]);
  const assignedTicketsCount = assignedTickets.length;

  // "Assigned Tickets" card navigation — same single-ticket `?alerts=`
  // query-state pattern Health Alerts already established
  // (admin-project-overview.tsx's alertActionHref): exactly one ticket links
  // straight to its own detail page. Two or more hand off to a Tickets page
  // with every open (non-done) status carried in the URL, so the total shown
  // there matches this KPI exactly — that page is the current project's own
  // `/projects/<slug>/tickets` when the Dashboard is scoped to one project,
  // or the org-wide `/tickets` (app/tickets/page.tsx) under "All Projects,"
  // which is always resolvable regardless of how many different projects
  // those tickets actually belong to. The card is interactive precisely when
  // `assignedTicketsCount > 0` — this never leaves a >0 count without a real
  // href to land on.
  const assignedTicketsHref =
    assignedTicketsCount === 0 ? undefined : buildAssignedTicketsHref(assignedTickets, selectedProjectSlug);
  // Real subset of assignedTickets itself (never a second, independently
  // -filtered read of scopedTickets) — "actively being worked on" (in
  // progress/in review) vs. merely open (backlog/to-do/blocked too, which
  // assignedTickets also counts).
  const activeTicketsCount = useMemo(
    () => assignedTickets.filter((t) => t.status === "in-progress" || t.status === "review").length,
    [assignedTickets]
  );
  // "Blocked" KPI — single source of truth for the card: the number shown,
  // the ticket a single-ticket click resolves to, and the `?alerts=blocked`
  // filter applied on the destination Tickets page all derive from this
  // same list.
  const blockedTickets = useMemo(() => scopedTickets.filter((t) => t.status === "blocked"), [scopedTickets]);
  const blockedTicketsCount = blockedTickets.length;
  // Card is interactive precisely when blockedTicketsCount > 0 — a single
  // blocked ticket goes straight to its own detail; two or more hand off to
  // the current project's own Tickets page (or the org-wide one under "All
  // Projects") with `?alerts=blocked` already applied and visible.
  const blockedTicketsHref =
    blockedTicketsCount === 0 ? undefined : buildBlockedTicketsHref(blockedTickets, selectedProjectSlug);
  // "Due Today" KPI — single source of truth for the card: the number
  // shown, the ticket a single-ticket click resolves to, and the
  // `?alerts=due-today` filter applied on the destination Tickets page all
  // derive from this same list. Same real `todayISO`/`parseDisplayDate`
  // "today" — no status exclusion, exactly matching the KPI's own existing
  // definition, never a second/different one.
  const dueTodayTickets = useMemo(
    () => scopedTickets.filter((t) => t.dueDate && parseDisplayDate(t.dueDate) === todayISO),
    [scopedTickets, todayISO]
  );
  const dueTodayCount = dueTodayTickets.length;
  const dueTodayHref =
    dueTodayCount === 0 ? undefined : buildDueTodayHref(dueTodayTickets, selectedProjectSlug);

  const estimatedHoursTotal = useMemo(() => scopedTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0), [scopedTickets]);
  const loggedHoursTotal = effectiveLoggedMinutes / 60;
  const hoursBurnPct = estimatedHoursTotal > 0 ? Math.round((loggedHoursTotal / estimatedHoursTotal) * 100) : 0;

  // "Hours Burn" card navigation — real logged minutes, not the rounded
  // display value, decide whether there's anything to land on (a sub-hour
  // total that still rounds to "0h" on the card is still real logged time).
  const hoursBurnHref = effectiveLoggedMinutes > 0 ? buildHoursBurnHref(selectedProjectSlug, todayISO) : undefined;

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
        // This widget's own `hours` figure — the Member Profile Modal now
        // computes the exact same real number itself (real assigneeProfileId
        // match, org-wide since this widget passes no projectSlug for "All
        // Projects") when this row is opened, from the same real tickets,
        // never a second/different calculation.
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
        return {
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          hours: assignedHours,
          capacity: member.weeklyCapacity,
          pct,
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [workloadMembers, scopedTickets]);

  // Real per-project health/risk — single source of truth reused below by
  // both Projects at Risk and the blocked-projects insight, rather than each
  // re-deriving its own blocked/overdue classification. Same
  // buildProjectHealthRows (reports-screen.tsx) the Projects module's own
  // Health badge/filter/"At Risk" KPI now reuse, so "at risk" never means
  // two different things across the app. `timeEntries` passed empty since
  // only `risk`/`blocked` are read here (hours/completion are unused).
  const healthRowsBySlug = useMemo(() => {
    const projectRefs = scopedActiveProjects.map((p) => ({ slug: p.slug, name: p.name, projectCode: p.slug }));
    const rows = buildProjectHealthRows(projectRefs, tickets, [], todayISO);
    return new Map(rows.map((row) => [row.id, row]));
  }, [scopedActiveProjects, tickets, todayISO]);

  // Projects at Risk — BLOCKED (>=1 active ticket in status "blocked") takes
  // priority over AT RISK (no blocked tickets, but >=1 active ticket whose
  // due date has already passed); a project meeting neither is left out
  // entirely, per the shared `risk` above. Progress is completed/total over
  // EVERY ticket in the project (not just active ones), guarded against 0
  // total — kept as its own local calculation since it's a display-only
  // stat buildProjectHealthRows doesn't compute this way (its own
  // `completion` is logged/estimated hours, a different metric).
  const projectsAtRisk = useMemo(() => {
    type RiskEntry = { slug: string; name: string; risk: "blocked" | "at-risk"; affected: number; progressPct: number };
    const activeProjects = scopedActiveProjects;

    const entries: RiskEntry[] = [];
    for (const project of activeProjects) {
      const row = healthRowsBySlug.get(project.slug);
      if (!row || row.risk === "on-track") continue;

      const projectTickets = tickets.filter((t) => t.projectSlug === project.slug);
      const totalCount = projectTickets.length;
      const completedCount = projectTickets.filter((t) => t.status === "done").length;
      const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      if (row.risk === "blocked") {
        entries.push({ slug: project.slug, name: project.name, risk: "blocked", affected: row.blocked, progressPct });
        continue;
      }

      const overdueCount = projectTickets.filter(
        (t) => t.status !== "done" && t.dueDate && parseDisplayDate(t.dueDate) < todayISO
      ).length;
      entries.push({ slug: project.slug, name: project.name, risk: "at-risk", affected: overdueCount, progressPct });
    }

    entries.sort((a, b) => {
      if (a.risk !== b.risk) return a.risk === "blocked" ? -1 : 1;
      if (a.affected !== b.affected) return b.affected - a.affected;
      return a.progressPct - b.progressPct;
    });

    return entries.slice(0, 3);
  }, [scopedActiveProjects, tickets, todayISO, healthRowsBySlug]);

  // Organization Health (the insights band) — each indicator below reuses
  // the same real definitions as the widget it's named after, but computed
  // uncapped (Projects at Risk and Team Workload cap their own lists at
  // 3/5 rows for display; this band needs the true full count/names, so
  // these are separate small computations rather than reading the capped
  // `projectsAtRisk`/`workload` arrays).

  // Same "active project + >=1 blocked ticket" criterion as Projects at
  // Risk above, uncapped and blocked-only (no AT RISK projects here) — reuses
  // the same shared `healthRowsBySlug` rather than re-filtering tickets.
  const blockedProjects = useMemo(() => {
    const activeProjects = scopedActiveProjects;
    const result: { slug: string; name: string; count: number }[] = [];
    for (const project of activeProjects) {
      const row = healthRowsBySlug.get(project.slug);
      if (row && row.blocked > 0) result.push({ slug: project.slug, name: project.name, count: row.blocked });
    }
    return result;
  }, [scopedActiveProjects, healthRowsBySlug]);
  // "0 proyectos" naturally means no "blocked" insight item ever gets
  // pushed below, so there's nothing to gate here beyond having a real
  // href whenever the item does exist.
  const blockedProjectsHref = blockedProjects.length === 0 ? undefined : buildBlockedProjectsHref(blockedProjects);

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
  const completedThisMonthTickets = useMemo(() => {
    const monthPrefix = todayISO.slice(0, 7); // "YYYY-MM"
    return scopedTickets.filter((t) => t.status === "done" && t.updatedAtISO?.slice(0, 7) === monthPrefix);
  }, [scopedTickets, todayISO]);
  const completedThisMonthCount = completedThisMonthTickets.length;
  const completedThisMonthHref =
    completedThisMonthCount === 0 ? undefined : buildCompletedThisMonthHref(completedThisMonthTickets, selectedProjectSlug);

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
        href: blockedProjectsHref,
      });
    } else if (blockedProjects.length > 1) {
      items.push({
        id: "blocked",
        level: "critical",
        text: `${blockedProjects.length} projects currently blocked`,
        href: blockedProjectsHref,
      });
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

    items.push({
      id: "completed",
      level: "ok",
      text: `${completedThisMonthCount} tickets completed this month`,
      href: completedThisMonthHref,
    });

    if (hoursBurnInsight) {
      items.push({
        id: "hours",
        level: "warning",
        text: `Hours burn at ${hoursBurnInsight.pct}% · ${hoursBurnInsight.remaining}h remaining`,
        // Reuses the exact same href the Hours Burn KPI card itself
        // computes (effectiveLoggedMinutes > 0 gate included) — never a
        // second/duplicated navigation decision for the same data.
        href: hoursBurnHref,
      });
    }

    return items.length > 0 ? items : [{ id: "none", level: "ok", text: "No health alerts right now." }];
  }, [
    blockedProjects, blockedProjectsHref, membersOverCapacity, completedThisMonthCount, completedThisMonthHref,
    hoursBurnInsight, hoursBurnHref,
  ]);

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
          actorProfileId: event.actorProfileId,
          // Same scope this whole widget is already reading from
          // (effectiveActivityEvents) — a selected project, or org-wide
          // aggregation under "All Projects."
          projectSlug: selectedProjectSlug ?? undefined,
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
    [effectiveActivityEvents, ticketsById, projectNameBySlug, selectedProjectSlug]
  );

  if (loadState === "loading") {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 pb-16">

        {/* ── Header (skeleton) ────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <SkeletonBlock className="h-[22px] w-52 mb-1" />
            <SkeletonBlock className="h-[14px] w-32" />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SkeletonBlock className="h-8 w-32" />
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-8 w-28" />
          </div>
        </div>

        {/* ── KPI Cards (skeleton) ─────────────────────────────────────────── */}
        <SkeletonBlock className="h-[10px] w-36 mb-2" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-full flex flex-col rounded-xl border border-slate-200 dark:border-zinc-700/70 shadow-sm shadow-slate-200/40 dark:shadow-black/20 px-5 pt-4 pb-4">
              <SkeletonBlock className="h-[10px] w-24 mb-1" />
              <SkeletonBlock className="h-6 w-16 mb-1" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* ── Insights band (skeleton) ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-3 w-40" />
          ))}
        </div>

        {/* ── Two-column main content (skeleton) ───────────────────────────── */}
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

          <div className="space-y-5 min-w-0">
            <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
              <SkeletonBlock className="h-[10px] w-28 mb-4" />
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <SkeletonBlock key={i} className="h-4 w-full" />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
              <SkeletonBlock className="h-[10px] w-28 mb-4" />
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonBlock className="h-7 w-7 rounded-full flex-shrink-0" />
                    <SkeletonBlock className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
              <SkeletonBlock className="h-[10px] w-24 mb-4" />
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i}>
                    <SkeletonBlock className="h-4 w-3/4 mb-1.5" />
                    <SkeletonBlock className="h-1 w-full" />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
              <SkeletonBlock className="h-[10px] w-28 mb-4" />
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonBlock className="h-6 w-6 rounded-full flex-shrink-0" />
                    <SkeletonBlock className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
              <SkeletonBlock className="h-[10px] w-32 mb-4" />
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <SkeletonBlock key={i} className="h-4 w-full" />
                ))}
              </div>
            </section>
          </div>
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
          <p className="text-sm text-slate-400 dark:text-zinc-500">{formatFullDate(todayISO)}</p>
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
          value={assignedTicketsCount}
          sub={`${activeTicketsCount} active · across all projects`}
          href={assignedTicketsHref}
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
          href={hoursBurnHref}
        />
        <DashKpiCard
          label="Blocked"
          value={blockedTicketsCount}
          sub="across all projects"
          danger
          href={blockedTicketsHref}
        />
        <DashKpiCard
          label="Due Today"
          value={dueTodayCount}
          sub={formatISODate(todayISO)}
          href={dueTodayHref}
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
                  // The whole row is one click target (real slug, straight to
                  // that project's Overview) — every element inside (name,
                  // badge, progress bar, percentage, info text) stays exactly
                  // as it was, just now inside a single <Link> instead of a
                  // plain <div>, with `block` so it keeps the same stacked
                  // layout an <a> wouldn't have by default.
                  <Link key={p.slug} href={`/projects/${p.slug}`} className="block cursor-pointer">
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
                  </Link>
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
                  <WorkloadRow
                    key={w.id}
                    name={w.name}
                    avatar={w.avatar}
                    hours={w.hours}
                    capacity={w.capacity}
                    profileId={w.id}
                    projectSlug={selectedProjectSlug ?? undefined}
                  />
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
