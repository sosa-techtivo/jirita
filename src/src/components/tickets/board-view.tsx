"use client";

import { useState } from "react";
import type { Ticket, TicketStatus } from "@/lib/mock-tickets";
import { BoardColumn, type ColumnDefinition, type OnTicketClick } from "@/components/tickets/board-column";
import { TicketStatusChangeModal } from "@/components/tickets/ticket-status-change-modal";

const COLUMNS: ColumnDefinition[] = [
  {
    id: "backlog",
    label: "Backlog",
    statuses: ["backlog"],
    dotClass: "bg-slate-400 dark:bg-zinc-500",
    countClass: "bg-slate-200/80 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300",
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
    statuses: ["in-progress"],
    dotClass: "bg-amber-400 dark:bg-amber-500",
    countClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
  {
    id: "blocked",
    label: "Blocked",
    statuses: ["blocked"],
    dotClass: "bg-red-400 dark:bg-red-500",
    countClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
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

function columnForStatus(status: TicketStatus): ColumnDefinition | undefined {
  return COLUMNS.find((col) => (col.statuses as string[]).includes(status));
}

export interface BoardDragAndDropOptions {
  /** The real save — the exact same updateTicket() action Ticket
   *  Detail's/the List view's own status editors already go through (see
   *  ticket-preview-panel.tsx's persistPatch), so permissions/RLS and the
   *  Activity Log trigger it fires are identical, never a second path.
   *  Resolves to the {success, message?} shape this app's other
   *  confirm-then-save modals already use (see archive-project-modal.tsx). */
  onMoveTicket: (ticket: Ticket, nextStatus: TicketStatus) => Promise<{ success: boolean; message?: string }>;
}

export function BoardView({
  tickets,
  onTicketClick,
  dragAndDrop,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
  /** Enables dragging a card between columns to change its status —
   *  omitted entirely (the default) leaves the Board exactly as it was.
   *  Only the main Tickets screen's Board tab passes this; the other,
   *  read-only "preview" mounts of this same component (My Work, Project
   *  Overview) are unaffected. */
  dragAndDrop?: BoardDragAndDropOptions;
}) {
  const byColumn = groupByColumn(tickets);
  const dragAndDropEnabled = dragAndDrop !== undefined;

  // Which real ticket is currently mid-drag — drives both the dragged
  // card's own dimmed "in motion" look (BoardColumn) and resolving
  // fromColumn on drop. Never touches `tickets` itself: the card only
  // ever actually moves column once a confirmed save succeeds (below),
  // so a cancelled or failed drag needs no explicit "revert" — nothing
  // was changed to revert.
  const [draggingTicket, setDraggingTicket] = useState<Ticket | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    ticket: Ticket;
    fromColumn: ColumnDefinition;
    toColumn: ColumnDefinition;
  } | null>(null);

  function handleCardDragStart(ticket: Ticket) {
    setDraggingTicket(ticket);
  }

  function handleCardDragEnd() {
    setDraggingTicket(null);
  }

  function handleDropOnColumn(toColumn: ColumnDefinition) {
    const ticket = draggingTicket;
    setDraggingTicket(null);
    if (!ticket) return;
    const fromColumn = columnForStatus(ticket.status);
    // Dropped back on its own column (or a column that already covers this
    // ticket's current status) — a real no-op, never a confirmation.
    if (!fromColumn || fromColumn.id === toColumn.id) return;
    setPendingMove({ ticket, fromColumn, toColumn });
  }

  return (
    <div className="flex-1 min-h-0 overflow-x-auto">
      <div className="flex gap-4 h-full px-6 pt-4 pb-6">
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.id}
            column={col}
            tickets={byColumn[col.id]}
            onTicketClick={onTicketClick}
            dragAndDropEnabled={dragAndDropEnabled}
            draggingTicketId={draggingTicket?.id ?? null}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            onDropTicket={() => handleDropOnColumn(col)}
          />
        ))}
      </div>

      {pendingMove && dragAndDrop && (
        <TicketStatusChangeModal
          ticket={pendingMove.ticket}
          fromLabel={pendingMove.fromColumn.label}
          toLabel={pendingMove.toColumn.label}
          onCancel={() => setPendingMove(null)}
          onConfirm={async () => {
            const nextStatus = pendingMove.toColumn.statuses[0];
            const result = await dragAndDrop.onMoveTicket(pendingMove.ticket, nextStatus);
            if (result.success) setPendingMove(null);
            return result;
          }}
        />
      )}
    </div>
  );
}
