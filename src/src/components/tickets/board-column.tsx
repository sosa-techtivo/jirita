import { useRef, useState } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import { TicketBoardCard } from "@/components/tickets/ticket-card";

export interface ColumnDefinition {
  /** The status's real name (Fase 2.5) — also used as the React key and
   *  the drop zone's own data-column-id. Name, not a per-project
   *  ticket_statuses.id, is the one thing that can validly represent the
   *  same conceptual status across two different projects' own status
   *  lists (enforced unique per project by a DB constraint) — needed so
   *  the org-wide "all projects" Board can merge tickets from projects
   *  with different (or identical) status configurations into the same
   *  columns without assuming they share literal ids. */
  id: string;
  /** Real ticket_statuses.name — the project's own configured label for
   *  this status, not a hardcoded string. Identical to `id` above. */
  label: string;
  /** The legacy `ticket_status` enum value this column corresponds to,
   *  when it has one — null for a custom status with no legacy
   *  equivalent (not creatable yet, but no longer assumed impossible).
   *  Used only for this phase's still-hardcoded color palette and for
   *  matching a mock/dev-fallback ticket (which has no real statusName). */
  legacyValue: string | null;
  dotClass: string;
  countClass: string;
}

export type OnTicketClick = (ticket: Ticket) => void;

function getLastActivity(tickets: Ticket[]): string | null {
  if (tickets.length === 0) return null;
  // ticket.updatedAt is now an absolute date/time string ("Updated Jul 30,
  // 2026 at 7:42 AM"), so the most-recent ticket can no longer be found by
  // sniffing relative-time keywords — compare the real ISO timestamps
  // instead (updatedAtISO is always populated for real, non-mock tickets).
  const mostRecent = tickets.reduce((latest, t) =>
    (t.updatedAtISO ?? "") > (latest.updatedAtISO ?? "") ? t : latest
  );
  return mostRecent.updatedAt.replace("Updated ", "");
}

export function BoardColumn({
  column,
  tickets,
  onTicketClick,
  dragAndDropEnabled = false,
  draggingTicketId = null,
  onCardDragStart,
  onCardDragEnd,
  onDropTicket,
}: {
  column: ColumnDefinition;
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
  /** Board's own drag-and-drop between status columns — see
   *  board-view.tsx's own `dragAndDrop` prop; false (the default) renders
   *  this column exactly as before, with no drag affordance at all. */
  dragAndDropEnabled?: boolean;
  /** Real ticket.id currently mid-drag (from anywhere on the board, not
   *  just this column) — lets this column's own card dim itself if it's
   *  the one being dragged. */
  draggingTicketId?: string | null;
  onCardDragStart?: (ticket: Ticket) => void;
  onCardDragEnd?: () => void;
  /** Fired on a real drop inside this column — board-view.tsx decides
   *  whether that's a genuine cross-column move (confirmation) or a
   *  same-column no-op. */
  onDropTicket?: () => void;
}) {
  const lastActivity = getLastActivity(tickets);

  // Same dragCounter-based enter/leave tracking every other real drop zone
  // in this app already uses (see ticket-detail-screen.tsx's
  // AttachmentsSection/CommentDropZone) — dragenter/dragleave otherwise
  // flicker as the pointer crosses child card elements within the column.
  const [dropActive, setDropActive] = useState(false);
  const dragCounter = useRef(0);

  return (
    <div
      className={
        "flex-1 min-w-[170px] flex flex-col min-h-0 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border transition-colors " +
        (dropActive
          ? "border-brand-400 dark:border-brand-500 ring-2 ring-brand-400/40 dark:ring-brand-500/30"
          : "border-slate-200/80 dark:border-zinc-700/30")
      }
      data-column-id={column.id}
    >
      {/* Column header — lives outside the scroll container, so it stays put */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${column.dotClass}`} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-zinc-400 line-clamp-2">
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
        onDragEnter={
          dragAndDropEnabled
            ? (e) => {
                e.preventDefault();
                dragCounter.current++;
                setDropActive(true);
              }
            : undefined
        }
        onDragOver={dragAndDropEnabled ? (e) => e.preventDefault() : undefined}
        onDragLeave={
          dragAndDropEnabled
            ? () => {
                dragCounter.current--;
                if (dragCounter.current <= 0) {
                  dragCounter.current = 0;
                  setDropActive(false);
                }
              }
            : undefined
        }
        onDrop={
          dragAndDropEnabled
            ? (e) => {
                e.preventDefault();
                dragCounter.current = 0;
                setDropActive(false);
                onDropTicket?.();
              }
            : undefined
        }
      >
        {tickets.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-xs text-slate-400 dark:text-zinc-600">No tickets</p>
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketBoardCard
              key={ticket.id}
              ticket={ticket}
              onTicketClick={onTicketClick}
              draggable={dragAndDropEnabled}
              isDragging={draggingTicketId === ticket.id}
              onDragStart={() => onCardDragStart?.(ticket)}
              onDragEnd={() => onCardDragEnd?.()}
            />
          ))
        )}
      </div>
    </div>
  );
}
