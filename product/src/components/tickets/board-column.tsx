import type { Ticket } from "@/lib/mock-tickets";
import { TicketBoardCard } from "@/components/tickets/ticket-card";

export interface ColumnDefinition {
  id: string;
  label: string;
  statuses: Ticket["status"][];
  dotClass: string;
  countClass: string;
}

function getLastActivity(tickets: Ticket[]): string | null {
  if (tickets.length === 0) return null;
  // Prefer the most recently sounding update, in order of recency
  for (const keyword of ["minutes", "hours", "today", "ago"]) {
    const match = tickets.find((t) => t.updatedAt.toLowerCase().includes(keyword));
    if (match) return match.updatedAt.replace("Updated ", "");
  }
  return tickets[0].updatedAt.replace("Updated ", "");
}

export function BoardColumn({
  column,
  tickets,
  slug,
}: {
  column: ColumnDefinition;
  tickets: Ticket[];
  slug: string;
}) {
  const lastActivity = getLastActivity(tickets);

  return (
    <div
      className="flex-1 min-w-[170px] flex flex-col min-h-0 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-700/30"
      data-column-id={column.id}
    >
      {/* Column header — lives outside the scroll container, so it stays put */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${column.dotClass}`} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-zinc-400 truncate">
              {column.label}
            </h2>
          </div>
          <span
            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[20px] text-center leading-none ${column.countClass}`}
          >
            {tickets.length}
          </span>
        </div>
        {lastActivity && (
          <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-1 pl-4 truncate">
            {lastActivity}
          </p>
        )}
      </div>

      {/* Scrollable card list */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-1.5"
        data-droppable-id={column.id}
      >
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-xs text-slate-400 dark:text-zinc-600">No tickets</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketBoardCard key={ticket.id} ticket={ticket} slug={slug} />
          ))
        )}
      </div>
    </div>
  );
}
