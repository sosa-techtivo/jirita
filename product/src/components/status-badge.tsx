import type { ProjectStatus } from "@/lib/mock-projects";

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
