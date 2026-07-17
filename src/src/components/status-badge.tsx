import type { ProjectCategory, ProjectHealth, ProjectStatus } from "@/lib/mock-projects";

export const statusMeta: Record<ProjectStatus, { label: string; dot: string; text: string }> = {
  planning: {
    label: "Planning",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-400",
  },
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  "on-hold": {
    label: "On Hold",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  completed: {
    label: "Completed",
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
  },
  archived: {
    label: "Archived",
    dot: "bg-slate-400 dark:bg-zinc-600",
    text: "text-slate-500 dark:text-zinc-500",
  },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const meta = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export const healthMeta: Record<ProjectHealth, { label: string; className: string }> = {
  healthy: {
    label: "Healthy",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  "needs-attention": {
    label: "Needs Attention",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  critical: {
    label: "Critical",
    className: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
};

// Set in Project Settings → Billing. Determines whether a project requires a
// client/rate and whether its time entries default to Billable, and whether
// it's included in Billing/Finance reports (see mock-projects.ts).
export const projectCategoryMeta: Record<ProjectCategory, { label: string; className: string }> = {
  client: {
    label: "Client Project",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  internal: {
    label: "Internal Project",
    className: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
};

export function ProjectCategoryBadge({ category }: { category: ProjectCategory }) {
  const meta = projectCategoryMeta[category];
  return (
    <span
      className={`inline-flex items-center flex-shrink-0 whitespace-nowrap text-[11px] font-medium px-1.5 py-0.5 rounded ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

// Distinct from StatusBadge (plain dot + text) on purpose — a pulse icon inside a
// filled pill so "health" never reads as just another status at a glance.
export function HealthBadge({ health }: { health: ProjectHealth }) {
  const meta = healthMeta[health];
  return (
    <span
      className={`inline-flex items-center gap-1 flex-shrink-0 whitespace-nowrap text-[11px] font-medium px-1.5 py-0.5 rounded-full ${meta.className}`}
    >
      <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-5 4 10 2-5h6" />
      </svg>
      {meta.label}
    </span>
  );
}
