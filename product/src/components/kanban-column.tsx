import type { Ticket } from "@/lib/mock-tickets";
import { KanbanCard } from "@/components/kanban-card";

export interface ColumnDefinition {
  id: string;
  label: string;
  statuses: Ticket["status"][];
  dotClass: string;
  countClass: string;
}

export function KanbanColumn({
  column,
  tickets,
  slug,
}: {
  column: ColumnDefinition;
  tickets: Ticket[];
  slug: string;
}) {
  return (
    <div
      className="w-72 flex-shrink-0 flex flex-col min-h-0 rounded-xl bg-slate-100/70 dark:bg-zinc-800/50"
      data-column-id={column.id}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${column.dotClass}`} />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-zinc-300 truncate">
              {column.label}
            </h2>
          </div>
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[20px] text-center leading-none ${column.countClass}`}>
            {tickets.length}
          </span>
        </div>
      </div>

      {/* Card list — scrolls independently */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-2"
        data-droppable-id={column.id}
      >
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center py-10 px-3">
            <p className="text-xs text-center text-slate-400 dark:text-zinc-600">No tickets</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <KanbanCard key={ticket.id} ticket={ticket} slug={slug} />
          ))
        )}
      </div>
    </div>
  );
}
