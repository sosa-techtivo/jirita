"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ProjectHealth, ProjectPriority, ProjectStatus, ProjectSummary } from "@/lib/mock-projects";
import { StatusBadge, PriorityBadge, HealthBadge, ProjectCategoryBadge, statusMeta, priorityMeta, healthMeta } from "@/components/status-badge";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { canManage } from "@/lib/current-user";
import { getTeamByProjectSlug } from "@/lib/mock-team";
import { LEAD_PROJECT_SLUGS, aggregateTeam } from "@/components/project-lead-dashboard";
import { MemberProjectsScreen } from "@/components/member-projects-screen";
import { CreateProjectModal } from "@/components/create-project-modal";
import { ArchiveProjectModal } from "@/components/archive-project-modal";

const STATUS_ORDER: ProjectStatus[] = ["planning", "active", "on-hold", "completed", "archived"];
const HEALTH_ORDER: ProjectHealth[] = ["healthy", "needs-attention", "critical"];
const PRIORITY_ORDER: ProjectPriority[] = ["critical", "high", "medium", "low"];
const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PRIORITY_GROUPS: DropdownGroup[] = [
  { options: PRIORITY_ORDER.map((priority) => ({ value: priority, label: priorityMeta[priority].label })) },
];

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
      { value: "priority", label: "Priority (High to Low)" },
      { value: "target-date", label: "Target Date (Soonest)" },
      { value: "progress", label: "Progress (Highest)" },
    ],
  },
];

function targetDateSortKey(targetDate: string): number {
  const [month, day] = targetDate.split(" ");
  const monthIndex = MONTH_ORDER.indexOf(month);
  return monthIndex * 100 + Number(day || 0);
}

export function ProjectsListScreen() {
  const { user } = useCurrentUser();
  const { status, errorMessage, retry } = useOrganizationProjects();

  if (status === "loading") return <ProjectsLoadingState />;
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

function ProjectsLoadingState() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-20 text-center text-sm text-slate-400 dark:text-zinc-500">
      Loading projects…
    </div>
  );
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

function ManagedProjectsScreen() {
  const { user } = useCurrentUser();
  const { projects: allProjects, restoreProject } = useOrganizationProjects();
  const isProjectLead = user.role === "PROJECT_LEAD";
  const canCreateProject = canManage(user.role);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [healthFilter, setHealthFilter] = useState<string[]>([]);
  const [leadFilter, setLeadFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [archivingProject, setArchivingProject] = useState<ProjectSummary | null>(null);
  const searchId = useId();

  // RLS on `projects` already scopes rows per role (Admin sees the whole
  // workspace; Project Lead/Member only see projects they're staffed on),
  // so the fetched list needs no further client-side filtering here.
  const baseProjects = allProjects;

  const statusGroups: DropdownGroup[] = useMemo(() => {
    const statuses = isProjectLead ? STATUS_ORDER.filter((s) => s !== "archived") : STATUS_ORDER;
    return [{ options: statuses.map((status) => ({ value: status, label: statusMeta[status].label })) }];
  }, [isProjectLead]);

  const leadGroups: DropdownGroup[] = useMemo(() => {
    const leads = Array.from(new Set(allProjects.map((project) => project.owner.name)));
    return [
      {
        options: leads.map((name) => {
          const project = allProjects.find((p) => p.owner.name === name)!;
          return { value: name, label: name, avatar: project.owner.avatar };
        }),
      },
    ];
  }, [allProjects]);

  const summaryCells: { label: string; value: number; className?: string }[] = useMemo(() => {
    if (isProjectLead) {
      const team = aggregateTeam(LEAD_PROJECT_SLUGS);
      const overCapacity = team.filter((m) => m.assignedHours > m.weeklyCapacity).length;
      return [
        { label: "My Projects", value: baseProjects.length },
        {
          label: "Blocked Tickets",
          value: baseProjects.reduce((sum, p) => sum + p.blockedTickets, 0),
          className: "text-red-600 dark:text-red-400",
        },
        {
          label: "Due This Week",
          value: baseProjects.reduce((sum, p) => sum + p.dueThisWeekTickets, 0),
          className: "text-amber-600 dark:text-amber-400",
        },
        {
          label: "Team Members Over Capacity",
          value: overCapacity,
          className: overCapacity > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-zinc-500",
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
        // Risk assessment lives on health now, not status — "at risk" means
        // critical health regardless of lifecycle phase.
        label: "At Risk",
        value: baseProjects.filter((p) => p.health === "critical").length,
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
  }, [isProjectLead, baseProjects]);

  // Small reinforcement line above the list — makes it obvious this is the
  // Lead's own scoped set of projects, not the whole workspace.
  const leadSummaryLine = useMemo(() => {
    if (!isProjectLead) return "";
    const total = baseProjects.length;
    const healthy = baseProjects.filter((p) => p.health === "healthy").length;
    const needsAttention = baseProjects.filter((p) => p.health === "needs-attention").length;
    const critical = baseProjects.filter((p) => p.health === "critical").length;
    const parts: string[] = [];
    if (healthy > 0) parts.push(`${healthy} Healthy`);
    if (needsAttention > 0) parts.push(`${needsAttention} Needs Attention`);
    if (critical > 0) parts.push(`${critical} Critical`);
    const base = `Showing your ${total} project${total === 1 ? "" : "s"}`;
    return parts.length > 0 ? `${base} • ${parts.join(" • ")}` : base;
  }, [isProjectLead, baseProjects]);

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
      // filters combine (e.g. Status=Active + Health=Critical).
      const matchesHealth = healthFilter.length === 0 || healthFilter.includes(project.health);
      const matchesLead = leadFilter.length === 0 || leadFilter.includes(project.owner.name);
      const matchesPriority = priorityFilter.length === 0 || priorityFilter.includes(project.priority);
      const matchesSearch =
        query === "" ||
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query) ||
        project.projectCode.toLowerCase().includes(query) ||
        (project.client ?? "").toLowerCase().includes(query) ||
        project.owner.name.toLowerCase().includes(query);
      return matchesStatus && matchesHealth && matchesLead && matchesPriority && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy[0]) {
        case "priority":
          return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        case "target-date":
          return targetDateSortKey(a.targetDate) - targetDateSortKey(b.targetDate);
        case "progress":
          return b.progress - a.progress;
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
        {canCreateProject && (
          <button
            type="button"
            onClick={isProjectLead ? undefined : () => setShowCreateModal(true)}
            className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3.5 py-2 transition-colors flex-shrink-0 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {isProjectLead ? "+ New Ticket" : "+ Create Project"}
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
          <FilterDropdown label="Priority" mode="multi" groups={PRIORITY_GROUPS} selected={priorityFilter} onChange={setPriorityFilter} />

          <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1 hidden sm:block" />

          <FilterDropdown label="Sort By" mode="single" groups={SORT_GROUPS} selected={sortBy} onChange={setSortBy} />
        </div>
      </div>

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
                <LeadProjectRow key={project.slug} project={project} />
              ) : (
                <ProjectRow
                  key={project.slug}
                  project={project}
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
  onEdit,
  onArchive,
  onRestore,
}: {
  project: ProjectSummary;
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
          <PriorityBadge priority={project.priority} />
          <ProjectCategoryBadge category={project.category} />
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400 truncate mt-0.5">{project.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="max-w-[160px] w-full h-1 rounded-full bg-slate-100 overflow-hidden dark:bg-zinc-800">
            <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${project.progress}%` }} />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 tabular-nums flex-shrink-0">
            {project.progress}%
          </span>
        </div>
      </div>

      <div className="hidden sm:flex items-center">
        <HealthBadge health={project.health} />
      </div>

      <div className="hidden sm:flex items-center gap-1.5 min-w-0 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={project.owner.avatar} alt={project.owner.name} className="w-5 h-5 rounded-full flex-shrink-0" />
        <span className="text-slate-600 dark:text-zinc-300 truncate">{project.owner.name}</span>
      </div>

      <div className="hidden sm:flex items-center gap-2 whitespace-nowrap text-xs">
        <span className="text-slate-500 dark:text-zinc-400">{project.openTickets} open</span>
        <span className={project.blockedTickets > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-400 dark:text-zinc-500"}>
          {project.blockedTickets} blocked
        </span>
        <span className={project.overdueTickets > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-400 dark:text-zinc-500"}>
          {project.overdueTickets} overdue
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

function LeadProjectRow({ project }: { project: ProjectSummary }) {
  const router = useRouter();
  const team = getTeamByProjectSlug(project.slug);
  const overCapacityCount = team.filter((m) => m.assignedHours > m.weeklyCapacity).length;

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
      {/* Identity block: name/status/priority + quick actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate" title={project.name}>
              {project.name}
            </h3>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} variant="badge" />
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
          <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${project.progress}%` }} />
        </div>
        <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 tabular-nums flex-shrink-0">
          {project.progress}%
        </span>
      </div>

      {/* Info chips block — health, team, tickets, target date grouped as tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <HealthBadge health={project.health} />
        <InfoChip>
          {team.length} member{team.length === 1 ? "" : "s"}
        </InfoChip>
        <InfoChip tone={overCapacityCount > 0 ? "danger" : "neutral"}>
          {overCapacityCount > 0 ? `${overCapacityCount} over capacity` : "Balanced"}
        </InfoChip>
        <InfoChip>{project.openTickets} open</InfoChip>
        <InfoChip tone={project.blockedTickets > 0 ? "danger" : "neutral"}>{project.blockedTickets} blocked</InfoChip>
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
