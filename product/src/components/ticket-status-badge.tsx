import type { TicketStatus } from "@/lib/mock-tickets";

export const ticketStatusMeta: Record<TicketStatus, { label: string; dot: string; text: string }> = {
  "to-do": {
    label: "To Do",
    dot: "bg-slate-400 dark:bg-zinc-600",
    text: "text-slate-500 dark:text-zinc-500",
  },
  "in-progress": {
    label: "In Progress",
    dot: "bg-brand-500",
    text: "text-brand-600 dark:text-brand-400",
  },
  review: {
    label: "Review",
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
  },
  blocked: {
    label: "Blocked",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
  done: {
    label: "Done",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const meta = ticketStatusMeta[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
