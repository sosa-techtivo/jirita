import type { ProjectHealth, ProjectPriority, ProjectStatus } from "@/lib/mock-projects";

export const statusMeta: Record<ProjectStatus, { label: string; dot: string; text: string }> = {
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  "on-track": {
    label: "On Track",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  "at-risk": {
    label: "At Risk",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
  "on-hold": {
    label: "On Hold",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
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

// Tertiary to StatusBadge and HealthBadge — plain, muted grayscale label, no color coding, no background.
export const priorityMeta: Record<ProjectPriority, { label: string; text: string }> = {
  critical: { label: "Critical", text: "text-slate-500 dark:text-zinc-400 font-medium" },
  high: { label: "High", text: "text-slate-500 dark:text-zinc-400 font-medium" },
  medium: { label: "Medium", text: "text-slate-400 dark:text-zinc-500 font-normal" },
  low: { label: "Low", text: "text-slate-400 dark:text-zinc-500 font-normal" },
};

// Badge styling uses the brand hue (not the red/amber/green vocabulary already
// spoken for by StatusBadge/HealthBadge) so priority never reads as a health signal.
export const priorityBadgeMeta: Record<ProjectPriority, string> = {
  critical: "bg-brand-50 text-brand-700 font-semibold dark:bg-brand-500/15 dark:text-brand-300",
  high: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400",
  medium: "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400",
  low: "bg-slate-50 text-slate-400 dark:bg-zinc-900/60 dark:text-zinc-500",
};

export function PriorityBadge({
  priority,
  variant = "text",
}: {
  priority: ProjectPriority;
  /** "text" = plain muted label (default, used by the Admin table). "badge" = colored pill matching the app's badge language. */
  variant?: "text" | "badge";
}) {
  if (variant === "badge") {
    return (
      <span
        className={`inline-flex items-center flex-shrink-0 whitespace-nowrap text-[11px] px-1.5 py-0.5 rounded ${priorityBadgeMeta[priority]}`}
      >
        {priorityMeta[priority].label}
      </span>
    );
  }
  const meta = priorityMeta[priority];
  return <span className={`text-[10px] flex-shrink-0 whitespace-nowrap ${meta.text}`}>{meta.label}</span>;
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
