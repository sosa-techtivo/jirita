"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectHealth, ProjectStatus, ProjectSummary } from "@/lib/mock-projects";
import { StatusBadge, HealthBadge, ProjectCategoryBadge, statusMeta, healthMeta } from "@/components/status-badge";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup, DropdownOption } from "@/components/tickets/filter-dropdown";
import { FilterChip } from "@/components/tickets/filter-chip";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { MemberTrigger } from "@/components/member-profile";
import { loadOrganizationTickets } from "@/lib/tickets";
import { loadProjectTeam } from "@/lib/projects";
import { SkeletonBlock } from "@/components/dashboard-shared";
import { buildProjectHealthRows, computeProjectProgressPct } from "@/components/reports-screen";
import type { Risk } from "@/components/reports-screen";
import { getTodayISO, parseDisplayDate } from "@/components/tickets/ticket-ui";
import { canManage } from "@/lib/current-user";
import { MemberProjectsScreen } from "@/components/member-projects-screen";
import { CreateProjectModal } from "@/components/create-project-modal";
import { ArchiveProjectModal } from "@/components/archive-project-modal";

const STATUS_ORDER: ProjectStatus[] = ["planning", "active", "on-hold", "completed", "archived"];
const HEALTH_ORDER: ProjectHealth[] = ["healthy", "needs-attention", "critical"];
const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Independent from the Status filter — Health (Healthy / Needs Attention /
// Critical) is its own real column, not a lifecycle status, so it gets its
// own dropdown rather than being folded into Status. Combines with Status
// via a plain AND (e.g. Status=Active + Health=Critical), same as every
// other filter here.
const HEALTH_GROUPS: DropdownGroup[] = [
  { options: HEALTH_ORDER.map((health) => ({ value: health, label: healthMeta[health].label })) },
];

const SORT_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "name", label: "Name (A–Z)" },
      { value: "target-date", label: "Target Date (Soonest)" },
      { value: "progress", label: "Progress (Highest)" },
    ],
  },
];

// Sentinel value for the "Project Lead" filter's "Unassigned" option — a
// real profiles.id is a uuid, so this plain string can never collide with
// one. Lets matchesLead below tell "no lead selected as a filter" (empty
// leadFilter) apart from "Unassigned selected" (leadFilter contains this).
const UNASSIGNED_LEAD_VALUE = "unassigned";

// Single source of truth for project Health, everywhere it's shown in this
// screen (badge, Health filter, "At Risk" KPI, the Lead's own summary line):
// buildProjectHealthRows' real `risk` (reports-screen.tsx — same rule the
// Admin Dashboard's "Projects at Risk" reuses), never the persisted,
// UI-stale `project.health` column. A project absent from the computed rows
// (buildProjectHealthRows skips projects with zero real tickets) has no
// blocked/overdue ticket to be at risk from, so it defaults to "healthy".
const RISK_TO_HEALTH: Record<Risk, ProjectHealth> = {
  "on-track": "healthy",
  "at-risk": "needs-attention",
  blocked: "critical",
};

function resolveHealth(healthBySlug: Map<string, ProjectHealth>, slug: string): ProjectHealth {
  return healthBySlug.get(slug) ?? "healthy";
}

// Same "no real tickets yet" default (0%) computeProjectProgressPct itself
// returns for an empty ticket list — a project not yet in the map (data
// still loading, or dev fallback) gets that same real "nothing to show"
// value rather than a fabricated one.
function resolveProgress(progressBySlug: Map<string, number>, slug: string): number {
  return progressBySlug.get(slug) ?? 0;
}

interface TicketCounts {
  open: number;
  blocked: number;
  overdue: number;
}

const ZERO_TICKET_COUNTS: TicketCounts = { open: 0, blocked: 0, overdue: 0 };

// Same "no real tickets yet" default the other computed values above use —
// a project absent from the map (buildProjectHealthRows skips projects with
// zero real tickets) has nothing to count, so 0/0/0 rather than a
// fabricated value.
function resolveTicketCounts(countsBySlug: Map<string, TicketCounts>, slug: string): TicketCounts {
  return countsBySlug.get(slug) ?? ZERO_TICKET_COUNTS;
}

interface RowTeamStats {
  /** Real project_memberships roster size for this one project — never mock/derived. */
  memberCount: number;
  /** Count of that same real roster whose own assignedHours (this project's
   *  own active tickets only) exceed their own weeklyCapacity — this
   *  project's own state only, never mixed with any other project's load. */
  overCapacityCount: number;
}

const ZERO_ROW_TEAM_STATS: RowTeamStats = { memberCount: 0, overCapacityCount: 0 };

// Same "not loaded (yet)" default every other per-row map above uses — real
// projects always populate a real entry here (see the effect below), so this
// only ever surfaces before that fetch resolves, never in place of a real
// empty roster.
function resolveTeamStats(statsBySlug: Map<string, RowTeamStats>, slug: string): RowTeamStats {
  return statsBySlug.get(slug) ?? ZERO_ROW_TEAM_STATS;
}

// Monday–Sunday containing todayISO — same "This Week" convention already
// used by My Work/Member Dashboard/Member's own "My Projects" screen,
// duplicated here as page-local glue (same precedent as those screens,
// never a second/different definition of "this week").
function getWeekRangeISO(todayISO: string): { start: string; end: string } {
  const today = new Date(`${todayISO}T00:00:00`);
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: toISO(monday), end: toISO(sunday) };
}

function targetDateSortKey(targetDate: string): number {
  const [month, day] = targetDate.split(" ");
  const monthIndex = MONTH_ORDER.indexOf(month);
  return monthIndex * 100 + Number(day || 0);
}

export function ProjectsListScreen() {
  const { user } = useCurrentUser();
  const { status, errorMessage, retry } = useOrganizationProjects();

  if (status === "loading") return <ProjectsLoadingSkeleton isProjectLead={user.role === "PROJECT_LEAD"} />;
  if (status === "error") return <ProjectsErrorState message={errorMessage} onRetry={retry} />;

  // Members don't manage projects — they work inside them. They get a
  // purpose-built "what am I on / what's mine to do" view instead of a
  // filtered-down version of the Admin/Lead workspace view below. This has to
  // be its own component (not just an early return with more hooks below) so
  // switching roles never changes how many hooks render on this component.
  if (user.role === "MEMBER") {
    return <MemberProjectsScreen />;
  }

  return <ManagedProjectsScreen />;
}

function ProjectsErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-20 flex flex-col items-center text-center">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load projects</h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">{message ?? "Something went wrong."}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
      >
        Retry
      </button>
    </div>
  );
}

// Full-page skeleton — mirrors this screen's own real layout (header/Create
// Project, KPI strip, search/filters, row list) using the same SkeletonBlock
// primitive the Admin/Project Lead/Member Dashboards already build their own
// skeletons out of (dashboard-shared.tsx), rather than a second skeleton
// pattern. Shown both on the very first load (before the base project list
// and its real tickets-derived metrics have resolved once) and again on
// every tab-regain refresh (see ManagedProjectsScreen's own effect) — same
// dimensions each time, so swapping it for the real content never shifts
// the page.
function ProjectsLoadingSkeleton({ isProjectLead }: { isProjectLead: boolean }) {
  const kpiCount = isProjectLead ? 4 : 5;
  const rowCount = isProjectLead ? 3 : 5;
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-center justify-between gap-4">
        <SkeletonBlock className="h-[22px] w-28" />
        <SkeletonBlock className="h-8 w-36" />
      </div>
      <SkeletonBlock className="h-[14px] w-64 mt-2" />

      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <div key={i} className="flex-1 px-4 py-3">
            <SkeletonBlock className="h-[10px] w-16 mb-1.5" />
            <SkeletonBlock className="h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <SkeletonBlock className="h-8 w-full sm:w-56 flex-shrink-0" />
        <div className="flex flex-wrap items-center gap-1.5">
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-7 w-16" />
          {!isProjectLead && <SkeletonBlock className="h-7 w-28" />}
          <SkeletonBlock className="h-7 w-20" />
        </div>
      </div>

      <div className={isProjectLead ? "mt-3" : "mt-6"}>
        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          {Array.from({ length: rowCount }).map((_, i) =>
            isProjectLead ? <LeadProjectRowSkeleton key={i} /> : <ProjectRowSkeleton key={i} />
          )}
        </div>
      </div>
    </div>
  );
}

// Mirrors ProjectRow's own grid (name+metadata / progress bar / Health /
// Project Lead / open-blocked-overdue counters / Target Date / action menu).
function ProjectRowSkeleton() {
  return (
    <div className={`flex flex-col gap-2 sm:grid ${ROW_GRID_COLS} sm:gap-3 sm:items-center py-4 px-3 -mx-3`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-4 w-14 rounded-full" />
        </div>
        <SkeletonBlock className="h-3.5 w-56 mt-1.5" />
        <div className="mt-2 flex items-center gap-2">
          <SkeletonBlock className="h-1 w-full max-w-[160px] rounded-full" />
          <SkeletonBlock className="h-2.5 w-6" />
        </div>
      </div>

      <div className="hidden sm:flex items-center">
        <SkeletonBlock className="h-5 w-20 rounded-full" />
      </div>

      <div className="hidden sm:flex items-center gap-1.5">
        <SkeletonBlock className="h-5 w-5 rounded-full flex-shrink-0" />
        <SkeletonBlock className="h-3.5 w-20" />
      </div>

      <div className="hidden sm:flex items-center gap-2">
        <SkeletonBlock className="h-3 w-10" />
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="h-3 w-12" />
      </div>

      <SkeletonBlock className="hidden sm:block h-3 w-14" />

      <div className="flex items-center justify-end">
        <SkeletonBlock className="h-6 w-6 rounded-lg" />
      </div>
    </div>
  );
}

// Mirrors LeadProjectRow's own stacked blocks (identity+actions / progress
// / info chips including Health/open/blocked/Target Date).
function LeadProjectRowSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-4 px-3 -mx-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-4 w-14 rounded-full" />
          </div>
          <SkeletonBlock className="h-3.5 w-60 mt-1.5" />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <SkeletonBlock className="h-7 w-16 rounded-lg" />
          <SkeletonBlock className="h-7 w-7 rounded-lg" />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <SkeletonBlock className="h-1.5 flex-1 max-w-[220px] rounded-full" />
        <SkeletonBlock className="h-3.5 w-8" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <SkeletonBlock className="h-5 w-20 rounded-full" />
        <SkeletonBlock className="h-5 w-16 rounded-md" />
        <SkeletonBlock className="h-5 w-20 rounded-md" />
        <SkeletonBlock className="h-5 w-14 rounded-md" />
        <SkeletonBlock className="h-5 w-16 rounded-md" />
        <SkeletonBlock className="h-5 w-16 rounded-md" />
        <SkeletonBlock className="h-5 w-16 rounded-md" />
      </div>
    </div>
  );
}

function ManagedProjectsScreen() {
  const { user, organization, isDevFallback } = useCurrentUser();
  const { projects: allProjects, restoreProject } = useOrganizationProjects();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isProjectLead = user.role === "PROJECT_LEAD";
  const canCreateProject = canManage(user.role);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // Real URL query-state handoff from the Project Lead Reports' own
  // "Project Health" alert (2+ real projects in one Health tier) — seeded
  // once on mount into this same Health filter dropdown below, same
  // `?param=` URL-as-source-of-truth precedent as `?blocked=` just below.
  const [healthFilter, setHealthFilter] = useState<string[]>(() => {
    const health = searchParams.get("health");
    return health && HEALTH_ORDER.includes(health as ProjectHealth) ? [health] : [];
  });
  const [leadFilter, setLeadFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [archivingProject, setArchivingProject] = useState<ProjectSummary | null>(null);
  const searchId = useId();

  // Real URL query-state handoff from the Admin Dashboard's "projects
  // currently blocked" health insight — carries the exact real project
  // slugs it already counted (blockedTickets on `projects` rows isn't
  // populated for real data, so this can't be recomputed client-side from
  // that field; the Dashboard hands off the precise set it computed from
  // real tickets instead). Same `?param=` URL-as-source-of-truth precedent
  // as Tickets' own `?alerts=`.
  const blockedParam = searchParams.get("blocked");
  const blockedSlugs = useMemo(
    () => (blockedParam ? new Set(blockedParam.split(",").filter(Boolean)) : null),
    [blockedParam]
  );
  const clearBlockedFilter = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("blocked");
    const qs = params.toString();
    router.replace(`/projects${qs ? `?${qs}` : ""}`);
  };

  // RLS on `projects` already scopes rows per role (Admin sees the whole
  // workspace; Project Lead/Member only see projects they're staffed on),
  // so the fetched list needs no further client-side filtering here.
  const baseProjects = allProjects;

  // Health/"At Risk" — single real computation reused by the badge, the
  // Health filter, and the "At Risk" KPI below (never separate/parallel
  // evaluations of the same thing). Reuses buildProjectHealthRows
  // (reports-screen.tsx), the exact same blocked-takes-priority-over-overdue
  // rule the Admin Dashboard's own "Projects at Risk" widget already
  // established (see that function's own comment) and per-project
  // Reports/Project Overview already reuse, rather than a second/different
  // definition. `timeEntries` is passed empty since only `risk`/`blocked`
  // are read here (hours/completion on each row are unused). Computed over
  // every project (not just active) so every row gets a real badge value;
  // the "At Risk" KPI below still counts active projects only, matching the
  // Dashboard's own real, active-projects-only scope.
  const [healthBySlug, setHealthBySlug] = useState<Map<string, ProjectHealth>>(new Map());
  const [atRiskCount, setAtRiskCount] = useState(0);
  // Real per-project progress — reuses computeProjectProgressPct
  // (reports-screen.tsx), the exact same ticket-count completion formula
  // Project Overview's own progress bar already uses, off the same real
  // tickets fetch above (never a second query or a re-derived formula), so
  // this row's bar/percentage can never disagree with that project's own
  // Project Overview.
  const [progressBySlug, setProgressBySlug] = useState<Map<string, number>>(new Map());
  // Real per-project open/blocked/overdue counts — read straight off the
  // same buildProjectHealthRows rows computed for Health/At Risk just above
  // (row.open/row.blocked/row.overdueOpen), never a second pass over
  // `tickets` or a persisted ProjectSummary field.
  const [ticketCountsBySlug, setTicketCountsBySlug] = useState<Map<string, TicketCounts>>(new Map());
  // Project Lead summary KPIs only ("Due This Week"/"Over Capacity" below) —
  // computed off the exact same real tickets fetch as everything else in
  // this effect, never a second/parallel query.
  const [dueThisWeekCount, setDueThisWeekCount] = useState(0);
  // Global "Over Capacity" KPI — unique real profileIds over capacity in at
  // least one of the Lead's own visible projects (never a per-project count
  // summed across projects, so a person over capacity on two projects still
  // counts once here).
  const [overCapacityCount, setOverCapacityCount] = useState(0);
  // Real per-row team stats — the same real `loadProjectTeam` roster/
  // capacity Team itself reads, fetched once per project alongside the
  // "Over Capacity" KPI above and reused for every row (never resolved by
  // name/avatar, never `mock-team.ts`, never a second per-row fetch).
  const [teamStatsBySlug, setTeamStatsBySlug] = useState<Map<string, RowTeamStats>>(new Map());
  // Real refresh-on-tab-regain — same mechanism the Admin/Project Lead/Member
  // Dashboards already rely on (see dashboard-screen.tsx's own comment on its
  // main effect): current-user-provider.tsx's window "focus" listener
  // revalidates the session on every window-focus-regain (i.e. switching
  // back to this browser tab) and hands back a new `organization` object
  // reference each time, even when nothing changed. This effect already
  // depends on `organization`, so it re-runs on that same signal — no
  // second/duplicate focus or visibilitychange listener added here, and
  // nothing runs while the tab stays hidden (the dashboards' own mechanism
  // is itself a one-shot, event-driven check, never a timer/poll). Resetting
  // `metricsStatus` to "loading" synchronously on every re-run (not just the
  // first) is the same "show the skeleton again" pattern dashboard-screen.tsx's
  // own main effect already uses.
  const [metricsStatus, setMetricsStatus] = useState<"loading" | "ready">("loading");
  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern dashboard-screen.tsx's own main effect already uses
    setMetricsStatus("loading");
    (async () => {
      const result = await loadOrganizationTickets(organization.id);
      if (cancelled) return;
      if (result.status !== "ready") {
        setMetricsStatus("ready");
        return;
      }
      const allProjects = result.projects.map((p) => ({ slug: p.slug, name: p.name, projectCode: p.slug }));
      const rows = buildProjectHealthRows(allProjects, result.tickets, [], getTodayISO());
      setHealthBySlug(new Map(rows.map((row) => [row.id, RISK_TO_HEALTH[row.risk]])));
      const activeSlugs = new Set(result.projects.filter((p) => p.status === "active").map((p) => p.slug));
      setAtRiskCount(rows.filter((row) => activeSlugs.has(row.id) && row.risk !== "on-track").length);
      setTicketCountsBySlug(
        new Map(rows.map((row) => [row.id, { open: row.open, blocked: row.blocked, overdue: row.overdueOpen }]))
      );

      const ticketsByProjectSlug = new Map<string, typeof result.tickets>();
      for (const ticket of result.tickets) {
        const list = ticketsByProjectSlug.get(ticket.projectSlug) ?? [];
        list.push(ticket);
        ticketsByProjectSlug.set(ticket.projectSlug, list);
      }
      setProgressBySlug(
        new Map(
          result.projects.map((p) => [p.slug, computeProjectProgressPct(ticketsByProjectSlug.get(p.slug) ?? [])])
        )
      );

      // "Due This Week" (Project Lead summary KPI) — open tickets (not
      // "done") whose due date falls within the current Monday–Sunday week,
      // off the same real tickets already fetched above.
      const { start: weekStart, end: weekEnd } = getWeekRangeISO(getTodayISO());
      setDueThisWeekCount(
        result.tickets.filter((t) => {
          if (t.status === "done" || !t.dueDate) return false;
          const iso = parseDisplayDate(t.dueDate);
          return Boolean(iso) && iso >= weekStart && iso <= weekEnd;
        }).length
      );

      // Real per-project team roster/capacity (Project Lead only — Admin's
      // rows/KPI strip have no team-member concept). One `loadProjectTeam`
      // call per visible project — the same real function/roster Team
      // itself reads, never `mock-team.ts`, never resolved by name/avatar —
      // reused for both each row's own "N members"/"Balanced · N over
      // capacity" chip (this project's own roster and this project's own
      // ticket-derived assignedHours only, never mixed with any other
      // project) and the global "Over Capacity" KPI (unique real profileIds
      // over capacity in at least one visible project — a person over
      // capacity on two projects still counts once, never summed/double
      // counted across projects).
      if (isProjectLead) {
        const teamResults = await Promise.all(
          result.projects.map((p) => loadProjectTeam(organization.id, p.slug))
        );
        if (cancelled) return;

        const teamStats = new Map<string, RowTeamStats>();
        const overCapacityProfileIds = new Set<string>();

        result.projects.forEach((p, i) => {
          const teamResult = teamResults[i];
          const members = teamResult.status === "ready" ? teamResult.members : [];

          const assignedHoursByProfileId = new Map<string, number>();
          for (const ticket of ticketsByProjectSlug.get(p.slug) ?? []) {
            if (ticket.status === "done" || !ticket.assigneeProfileId) continue;
            assignedHoursByProfileId.set(
              ticket.assigneeProfileId,
              (assignedHoursByProfileId.get(ticket.assigneeProfileId) ?? 0) + (ticket.hours ?? 0)
            );
          }

          let rowOverCapacity = 0;
          for (const member of members) {
            if ((assignedHoursByProfileId.get(member.id) ?? 0) > member.weeklyCapacity) {
              rowOverCapacity++;
              overCapacityProfileIds.add(member.id);
            }
          }

          teamStats.set(p.slug, { memberCount: members.length, overCapacityCount: rowOverCapacity });
        });

        setTeamStatsBySlug(teamStats);
        setOverCapacityCount(overCapacityProfileIds.size);
      }

      setMetricsStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, isProjectLead]);

  const statusGroups: DropdownGroup[] = useMemo(() => {
    const statuses = isProjectLead ? STATUS_ORDER.filter((s) => s !== "archived") : STATUS_ORDER;
    return [{ options: statuses.map((status) => ({ value: status, label: statusMeta[status].label })) }];
  }, [isProjectLead]);

  // Built from the same `project.lead` (real profiles.id + name/avatar,
  // sourced from project_memberships.project_role = 'lead') the row itself
  // already renders — never a second/different resolution of "lead".
  // Deduped by profileId so a person leading several projects appears once;
  // "Unassigned" is only added when at least one project actually has no
  // lead.
  const leadGroups: DropdownGroup[] = useMemo(() => {
    const leadsById = new Map<string, { name: string; avatar: string }>();
    let hasUnassigned = false;
    for (const project of allProjects) {
      if (project.lead) {
        if (!leadsById.has(project.lead.id)) {
          leadsById.set(project.lead.id, { name: project.lead.name, avatar: project.lead.avatar });
        }
      } else {
        hasUnassigned = true;
      }
    }
    const options: DropdownOption[] = Array.from(leadsById, ([id, lead]) => ({
      value: id,
      label: lead.name,
      avatar: lead.avatar,
    }));
    if (hasUnassigned) options.push({ value: UNASSIGNED_LEAD_VALUE, label: "Unassigned" });
    return [{ options }];
  }, [allProjects]);

  const summaryCells: { label: string; value: number; className?: string }[] = useMemo(() => {
    if (isProjectLead) {
      return [
        { label: "My Projects", value: baseProjects.length },
        {
          label: "Blocked Tickets",
          value: baseProjects.reduce((sum, p) => sum + resolveTicketCounts(ticketCountsBySlug, p.slug).blocked, 0),
          className: "text-red-600 dark:text-red-400",
        },
        {
          label: "Due This Week",
          value: dueThisWeekCount,
          className: "text-amber-600 dark:text-amber-400",
        },
        {
          label: "Over Capacity",
          value: overCapacityCount,
          className: overCapacityCount > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-zinc-500",
        },
      ];
    }
    return [
      { label: "Total Projects", value: baseProjects.length },
      {
        label: "Active",
        value: baseProjects.filter((p) => p.status === "active").length,
        className: "text-emerald-600 dark:text-emerald-400",
      },
      {
        label: "At Risk",
        value: atRiskCount,
        className: "text-red-600 dark:text-red-400",
      },
      {
        label: "On Hold",
        value: baseProjects.filter((p) => p.status === "on-hold").length,
        className: "text-amber-600 dark:text-amber-400",
      },
      {
        label: "Archived",
        value: baseProjects.filter((p) => p.status === "archived").length,
        className: "text-slate-500 dark:text-zinc-500",
      },
    ];
  }, [isProjectLead, baseProjects, atRiskCount, ticketCountsBySlug, dueThisWeekCount, overCapacityCount]);

  // Small reinforcement line above the list — makes it obvious this is the
  // Lead's own scoped set of projects, not the whole workspace.
  const leadSummaryLine = useMemo(() => {
    if (!isProjectLead) return "";
    const total = baseProjects.length;
    const healthy = baseProjects.filter((p) => resolveHealth(healthBySlug, p.slug) === "healthy").length;
    const needsAttention = baseProjects.filter((p) => resolveHealth(healthBySlug, p.slug) === "needs-attention").length;
    const critical = baseProjects.filter((p) => resolveHealth(healthBySlug, p.slug) === "critical").length;
    const parts: string[] = [];
    if (healthy > 0) parts.push(`${healthy} Healthy`);
    if (needsAttention > 0) parts.push(`${needsAttention} Needs Attention`);
    if (critical > 0) parts.push(`${critical} Critical`);
    const base = `Showing your ${total} project${total === 1 ? "" : "s"}`;
    return parts.length > 0 ? `${base} • ${parts.join(" • ")}` : base;
  }, [isProjectLead, baseProjects, healthBySlug]);

  // Same full-page skeleton swap dashboard-screen.tsx's own loadState
  // gate uses — every metric this screen shows (Health/Progress/Open/
  // Blocked/Overdue/At Risk KPI) comes from the effect above, so nothing
  // real is ready to render until it resolves at least once, including on
  // a tab-regain re-run. All hooks above have already run unconditionally,
  // so this early return can't change hook order between renders.
  if (metricsStatus === "loading") return <ProjectsLoadingSkeleton isProjectLead={isProjectLead} />;

  const query = search.trim().toLowerCase();
  const filtered = baseProjects
    .filter((project) => {
      // Archived projects are hidden from the main list by default — same
      // as the "archived" status never being a selectable filter chip for
      // Project Lead — but Admin can still bring them back into view via
      // the Status filter dropdown.
      const matchesStatus =
        statusFilter.length === 0 ? project.status !== "archived" : statusFilter.includes(project.status);
      // Independent from Status — Health is its own real column
      // (healthy / needs-attention / critical), so this is a separate AND
      // condition rather than folded into matchesStatus, letting the two
      // filters combine (e.g. Status=Active + Health=Critical). Filters on
      // the same computed health (buildProjectHealthRows) the badge below
      // renders — never project.health directly.
      const matchesHealth =
        healthFilter.length === 0 || healthFilter.includes(resolveHealth(healthBySlug, project.slug));
      const matchesLead =
        leadFilter.length === 0 ||
        (project.lead ? leadFilter.includes(project.lead.id) : leadFilter.includes(UNASSIGNED_LEAD_VALUE));
      const matchesSearch =
        query === "" ||
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query) ||
        project.projectCode.toLowerCase().includes(query) ||
        (project.client ?? "").toLowerCase().includes(query) ||
        project.owner.name.toLowerCase().includes(query);
      const matchesBlocked = !blockedSlugs || blockedSlugs.has(project.slug);
      return matchesStatus && matchesHealth && matchesLead && matchesSearch && matchesBlocked;
    })
    .sort((a, b) => {
      switch (sortBy[0]) {
        case "target-date":
          return targetDateSortKey(a.targetDate) - targetDateSortKey(b.targetDate);
        case "progress":
          return resolveProgress(progressBySlug, b.slug) - resolveProgress(progressBySlug, a.slug);
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Projects</h1>
        {canCreateProject && !isProjectLead && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3.5 py-2 transition-colors flex-shrink-0 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            + Create Project
          </button>
        )}
      </div>
      <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
        {isProjectLead ? "Your projects, at a glance." : "Every project across your workspace, at a glance."}
      </p>

      <SummaryRow cells={summaryCells} />

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor={searchId} className="relative w-full sm:w-56 flex-shrink-0">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id={searchId}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects, leads or keywords..."
            className="w-full text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          <FilterDropdown label="Status" mode="multi" groups={statusGroups} selected={statusFilter} onChange={setStatusFilter} />
          <FilterDropdown label="Health" mode="multi" groups={HEALTH_GROUPS} selected={healthFilter} onChange={setHealthFilter} />
          {!isProjectLead && (
            <FilterDropdown label="Project Lead" mode="multi" groups={leadGroups} selected={leadFilter} onChange={setLeadFilter} searchable />
          )}

          <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1 hidden sm:block" />

          <FilterDropdown label="Sort By" mode="single" groups={SORT_GROUPS} selected={sortBy} onChange={setSortBy} />
        </div>
      </div>

      {/* Real URL-applied filter handed off from the Admin Dashboard's
          "projects currently blocked" health insight — same FilterChip
          style/remove interaction Tickets' own `?alerts=` chips already
          use, never a second chip design. */}
      {blockedSlugs && (
        <div className="mt-3 flex items-center gap-1.5">
          <FilterChip label="Blocked" active onToggle={clearBlockedFilter} />
        </div>
      )}

      {isProjectLead && (
        <p className="mt-6 text-xs font-medium text-slate-500 dark:text-zinc-400">{leadSummaryLine}</p>
      )}

      <div className={isProjectLead ? "mt-3" : "mt-6"}>
        {filtered.length === 0 ? (
          <EmptyState hasAnyProjects={baseProjects.length > 0} onCreate={() => setShowCreateModal(true)} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {filtered.map((project) =>
              isProjectLead ? (
                <LeadProjectRow
                  key={project.slug}
                  project={project}
                  health={resolveHealth(healthBySlug, project.slug)}
                  progress={resolveProgress(progressBySlug, project.slug)}
                  ticketCounts={resolveTicketCounts(ticketCountsBySlug, project.slug)}
                  teamStats={resolveTeamStats(teamStatsBySlug, project.slug)}
                />
              ) : (
                <ProjectRow
                  key={project.slug}
                  project={project}
                  health={resolveHealth(healthBySlug, project.slug)}
                  progress={resolveProgress(progressBySlug, project.slug)}
                  ticketCounts={resolveTicketCounts(ticketCountsBySlug, project.slug)}
                  onEdit={setEditingProject}
                  onArchive={setArchivingProject}
                  onRestore={(p) => restoreProject(p.slug)}
                />
              )
            )}
          </div>
        )}
      </div>

      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
      {editingProject && (
        <CreateProjectModal editingProject={editingProject} onClose={() => setEditingProject(null)} />
      )}
      {archivingProject && (
        <ArchiveProjectModal project={archivingProject} onClose={() => setArchivingProject(null)} />
      )}
    </div>
  );
}

function SummaryRow({ cells }: { cells: { label: string; value: number; className?: string }[] }) {
  return (
    <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
      {cells.map((cell) => (
        <div key={cell.label} className="flex-1 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">{cell.label}</p>
          <p className={`text-xl font-bold mt-0.5 leading-none tabular-nums ${cell.className ?? "text-slate-900 dark:text-zinc-50"}`}>
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}

const ROW_GRID_COLS = "sm:grid-cols-[minmax(0,1fr)_96px_116px_172px_60px_32px]";

function ProjectRow({
  project,
  health,
  progress,
  ticketCounts,
  onEdit,
  onArchive,
  onRestore,
}: {
  project: ProjectSummary;
  health: ProjectHealth;
  progress: number;
  ticketCounts: TicketCounts;
  onEdit: (project: ProjectSummary) => void;
  onArchive: (project: ProjectSummary) => void;
  onRestore: (project: ProjectSummary) => void;
}) {
  const router = useRouter();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/projects/${project.slug}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/projects/${project.slug}`);
        }
      }}
      className={`group flex flex-col gap-2 sm:grid ${ROW_GRID_COLS} sm:gap-3 sm:items-center py-4 px-3 -mx-3 rounded-lg cursor-pointer outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:bg-zinc-900/60 transition-colors`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate min-w-0" title={project.name}>
            {project.name}
          </h3>
          <StatusBadge status={project.status} />
          <ProjectCategoryBadge category={project.category} />
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400 truncate mt-0.5">{project.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="max-w-[160px] w-full h-1 rounded-full bg-slate-100 overflow-hidden dark:bg-zinc-800">
            <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums flex-shrink-0">
            {progress}%
          </span>
        </div>
      </div>

      <div className="hidden sm:flex items-center">
        <HealthBadge health={health} />
      </div>

      <div className="hidden sm:flex items-center gap-1.5 min-w-0 text-xs">
        {project.lead ? (
          <MemberTrigger
            name={project.lead.name}
            avatar={project.lead.avatar}
            profileId={project.lead.id}
            projectSlug={project.slug}
            nested
            className="flex items-center gap-1.5 min-w-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={project.lead.avatar} alt={project.lead.name} className="w-5 h-5 rounded-full flex-shrink-0" />
            <span className="text-slate-600 dark:text-zinc-300 truncate">{project.lead.name}</span>
          </MemberTrigger>
        ) : (
          <span className="text-slate-600 dark:text-zinc-300 truncate">Unassigned</span>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-2 whitespace-nowrap text-xs">
        <span className="text-slate-500 dark:text-zinc-400">{ticketCounts.open} open</span>
        <span className={ticketCounts.blocked > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-400 dark:text-zinc-500"}>
          {ticketCounts.blocked} blocked
        </span>
        <span className={ticketCounts.overdue > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-400 dark:text-zinc-500"}>
          {ticketCounts.overdue} overdue
        </span>
      </div>

      <span className="hidden sm:inline text-xs text-slate-400 dark:text-zinc-500">{project.targetDate}</span>

      <div className="flex items-center justify-end">
        <ProjectMenu project={project} isProjectLead={false} onEdit={onEdit} onArchive={onArchive} onRestore={onRestore} />
      </div>
    </div>
  );
}

// ── Project Lead row ─────────────────────────────────────────────────────────
// Reorganized into stacked blocks (identity → progress → info chips) instead of
// one wide horizontal line, since the Lead's view has fewer rows and benefits
// more from scannable grouping than from spreadsheet-style column alignment.

function InfoChip({ tone = "neutral", children }: { tone?: "neutral" | "danger" | "warn"; children: ReactNode }) {
  const toneClass: Record<"neutral" | "danger" | "warn", string> = {
    neutral: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700/60",
    danger: "bg-red-50 text-red-700 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-900/40",
    warn: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-900/40",
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-1 rounded-md border whitespace-nowrap ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

function LeadProjectRow({
  project,
  health,
  progress,
  ticketCounts,
  teamStats,
}: {
  project: ProjectSummary;
  health: ProjectHealth;
  progress: number;
  ticketCounts: TicketCounts;
  teamStats: RowTeamStats;
}) {
  const router = useRouter();

  function goToBoard(e: ReactMouseEvent) {
    e.stopPropagation();
    router.push(`/projects/${project.slug}/tickets`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/projects/${project.slug}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/projects/${project.slug}`);
        }
      }}
      className="group flex flex-col gap-3 py-4 px-3 -mx-3 rounded-lg cursor-pointer outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:hover:bg-zinc-900/60 transition-colors"
    >
      {/* Identity block: name/status + quick actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate" title={project.name}>
              {project.name}
            </h3>
            <StatusBadge status={project.status} />
            <ProjectCategoryBadge category={project.category} />
          </div>
          <p className="text-sm text-slate-500 dark:text-zinc-400 truncate mt-0.5">{project.description}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={goToBoard}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="7" height="18" rx="1.5" />
              <rect x="14" y="3" width="7" height="11" rx="1.5" />
            </svg>
            Board
          </button>
          <ProjectMenu project={project} isProjectLead />
        </div>
      </div>

      {/* Progress block — bar + percentage together on one visible line */}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 max-w-[220px] h-1.5 rounded-full bg-slate-100 overflow-hidden dark:bg-zinc-800">
          <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 tabular-nums flex-shrink-0">
          {progress}%
        </span>
      </div>

      {/* Info chips block — health, team, tickets, target date grouped as tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <HealthBadge health={health} />
        <InfoChip>
          {teamStats.memberCount} member{teamStats.memberCount === 1 ? "" : "s"}
        </InfoChip>
        <InfoChip tone={teamStats.overCapacityCount > 0 ? "danger" : "neutral"}>
          {teamStats.overCapacityCount > 0 ? `${teamStats.overCapacityCount} over capacity` : "Balanced"}
        </InfoChip>
        <InfoChip>{ticketCounts.open} open</InfoChip>
        <InfoChip tone={ticketCounts.blocked > 0 ? "danger" : "neutral"}>{ticketCounts.blocked} blocked</InfoChip>
        <InfoChip tone={project.awaitingReviewTickets > 0 ? "warn" : "neutral"}>
          {project.awaitingReviewTickets} in review
        </InfoChip>
        <InfoChip>{project.targetDate}</InfoChip>
      </div>
    </div>
  );
}

function ProjectMenu({
  project,
  isProjectLead,
  onEdit,
  onArchive,
  onRestore,
}: {
  project: ProjectSummary;
  isProjectLead: boolean;
  onEdit?: (project: ProjectSummary) => void;
  onArchive?: (project: ProjectSummary) => void;
  onRestore?: (project: ProjectSummary) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // "Board" is promoted to its own quick-access button on the Lead's row, so
  // the menu only holds secondary actions here.
  const items: { label: string; onClick: () => void; danger?: boolean }[] = isProjectLead
    ? [
        { label: "Open", onClick: () => router.push(`/projects/${project.slug}`) },
        { label: "Team", onClick: () => router.push(`/projects/${project.slug}/team`) },
        { label: "Reports", onClick: () => router.push(`/projects/${project.slug}/reports`) },
      ]
    : [
        { label: "Open", onClick: () => router.push(`/projects/${project.slug}`) },
        {
          label: "Edit",
          onClick: () => {
            setOpen(false);
            onEdit?.(project);
          },
        },
        project.status === "archived"
          ? {
              label: "Restore",
              onClick: () => {
                setOpen(false);
                onRestore?.(project);
              },
            }
          : {
              label: "Archive",
              onClick: () => {
                setOpen(false);
                onArchive?.(project);
              },
              danger: true,
            },
      ];

  return (
    <div ref={ref} className="relative" onClick={(e: ReactMouseEvent) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Project actions"
        className={
          "p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800" : "")
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      <div
        className={
          "absolute right-0 top-full mt-1.5 z-10 w-40 rounded-lg border bg-white dark:bg-zinc-900 " +
          "shadow-lg shadow-black/10 dark:shadow-black/40 border-slate-200 dark:border-zinc-700/60 " +
          "transition-all duration-150 origin-top-right " +
          (open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none")
        }
      >
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={
                "w-full px-3 py-1.5 text-[13px] text-left transition-colors duration-150 " +
                (item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasAnyProjects, onCreate }: { hasAnyProjects: boolean; onCreate: () => void }) {
  const { user } = useCurrentUser();
  // Mirrors the header button's role gate exactly (isProjectLead ? "+ New
  // Ticket" (no-op) : "+ Create Project") — previously this button always
  // opened the create modal regardless of role, so a Project Lead landing
  // on an empty filtered view could create a project from here even though
  // the header's equivalent action for their role is a ticket, not a
  // project.
  const isProjectLead = user.role === "PROJECT_LEAD";
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 7l4-4h6l4 4" />
          <rect x="3" y="7" width="18" height="13" rx="2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
        {hasAnyProjects ? "No matching projects" : "No projects yet"}
      </h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
        {hasAnyProjects ? "Try adjusting your search or filters." : "Get started by creating your first project."}
      </p>
      {canManage(user.role) && !isProjectLead && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          + Create Project
        </button>
      )}
    </div>
  );
}
