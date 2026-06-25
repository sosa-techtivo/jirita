import type { Ticket } from "@/lib/mock-tickets";
import { KanbanColumn, type ColumnDefinition } from "@/components/kanban-column";

const COLUMNS: ColumnDefinition[] = [
  {
    id: "backlog",
    label: "Backlog",
    statuses: ["backlog"],
    dotClass: "bg-slate-400 dark:bg-zinc-500",
    countClass: "bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300",
  },
  {
    id: "todo",
    label: "To Do",
    statuses: ["to-do"],
    dotClass: "bg-sky-400 dark:bg-sky-500",
    countClass: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400",
  },
  {
    id: "in-progress",
    label: "In Progress",
    statuses: ["in-progress", "blocked"],
    dotClass: "bg-amber-400 dark:bg-amber-500",
    countClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
  {
    id: "in-review",
    label: "In Review",
    statuses: ["review"],
    dotClass: "bg-violet-400 dark:bg-violet-500",
    countClass: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400",
  },
  {
    id: "done",
    label: "Done",
    statuses: ["done"],
    dotClass: "bg-emerald-400 dark:bg-emerald-500",
    countClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
];

function groupByColumn(tickets: Ticket[]): Record<string, Ticket[]> {
  const groups: Record<string, Ticket[]> = {};
  for (const col of COLUMNS) {
    groups[col.id] = tickets.filter((t) => (col.statuses as string[]).includes(t.status));
  }
  return groups;
}

export function KanbanBoard({ tickets, slug }: { tickets: Ticket[]; slug: string }) {
  const byColumn = groupByColumn(tickets);

  return (
    <div className="flex-1 min-h-0 overflow-x-auto">
      <div className="flex gap-3 h-full px-4 sm:px-8 pt-5 pb-6 min-w-fit">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            tickets={byColumn[col.id]}
            slug={slug}
          />
        ))}
      </div>
    </div>
  );
}
