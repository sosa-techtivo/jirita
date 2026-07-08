import type { Ticket } from "@/lib/mock-tickets";
import { TicketListRow } from "@/components/tickets/ticket-card";
import type { OnTicketClick } from "@/components/tickets/board-column";

const GROUPS: { id: string; label: string; statuses: Ticket["status"][] }[] = [
  { id: "backlog", label: "Inbox", statuses: ["backlog"] },
  { id: "todo", label: "To Do", statuses: ["to-do"] },
  { id: "in-progress", label: "In Progress", statuses: ["in-progress", "blocked"] },
  { id: "in-review", label: "In Review", statuses: ["review"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

export function ListView({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 pt-4 pb-10">
        {GROUPS.map((group) => {
          const groupTickets = tickets.filter((t) =>
            (group.statuses as string[]).includes(t.status)
          );
          if (groupTickets.length === 0) return null;

          return (
            <section key={group.id} className="mb-8">
              {/* Section header */}
              <div className="flex items-center gap-3 py-2 mb-1">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                  {group.label}
                </h2>
                <span className="text-xs text-slate-400 dark:text-zinc-500">{groupTickets.length}</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
              </div>

              {/* Ticket rows */}
              <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                {groupTickets.map((ticket) => (
                  <TicketListRow key={ticket.id} ticket={ticket} onTicketClick={onTicketClick} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
