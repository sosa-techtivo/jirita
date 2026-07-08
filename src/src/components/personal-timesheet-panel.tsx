"use client";

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { formatHours } from "@/components/time-tracking-screen";

// A member's own timesheet — today/this week/this month plus the entries
// behind those totals, each opening its ticket. Deliberately the mirror
// image of the Admin/Project Lead Time Tracking pages: no team roster, no
// billing, no other member ever appears here. Time is still only ever
// logged from the ticket itself (Log Time) — this is a read-only summary.

export interface PersonalTimesheetEntry {
  id: string;
  ticket: Ticket;
  hours: number;
  /** Display label — "Today", "Yesterday", or a short date like "Jun 27". */
  date: string;
  comment: string;
}

const FIELD_LABEL = "text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1";

export function PersonalTimesheetPanel({
  today,
  week,
  month,
  entries,
  onOpenTicket,
  onClose,
}: {
  today: number;
  week: number;
  month: number;
  entries: PersonalTimesheetEntry[];
  onOpenTicket: (ticket: Ticket) => void;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  const totalLogged = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={[
          "fixed inset-0 z-40 bg-black/20 dark:bg-black/40",
          "transition-opacity duration-[250ms]",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="My Timesheet"
        className={[
          "fixed inset-y-0 right-0 z-50",
          "w-[440px] max-w-[calc(100vw-3rem)]",
          "flex flex-col",
          "bg-white dark:bg-zinc-950",
          "border-l border-slate-200 dark:border-zinc-800",
          "shadow-2xl shadow-black/10 dark:shadow-black/50",
          "transition-transform duration-[250ms] ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pt-4 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-zinc-50 leading-snug">
              My Timesheet
            </h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close timesheet"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Today / This Week / This Month */}
          <div className="px-5 pt-4 pb-5 grid grid-cols-3 gap-3 border-b border-slate-100 dark:border-zinc-800">
            <div>
              <p className={FIELD_LABEL}>Today</p>
              <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums">{formatHours(today)}</p>
            </div>
            <div>
              <p className={FIELD_LABEL}>This Week</p>
              <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums">{formatHours(week)}</p>
            </div>
            <div>
              <p className={FIELD_LABEL}>This Month</p>
              <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums">{formatHours(month)}</p>
            </div>
          </div>

          {/* Logged entries */}
          <div className="px-5 pt-4 pb-6">
            <p className={`${FIELD_LABEL} mb-3`}>
              Logged Entries
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                · {formatHours(totalLogged)} total
              </span>
            </p>

            {entries.length === 0 ? (
              <p className="text-[13px] text-slate-400 dark:text-zinc-600">No time logged yet this week.</p>
            ) : (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onOpenTicket(entry.ticket)}
                    className="group/entry w-full text-left rounded-lg px-2.5 py-2.5 -mx-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-baseline gap-1.5 min-w-0">
                        <TicketTypeIcon type={entry.ticket.type} />
                        <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 group-hover/entry:text-brand-600 dark:group-hover/entry:text-brand-400 flex-shrink-0">
                          {getTicketDisplayKey(entry.ticket)}
                        </span>
                        <span className="text-[13px] font-medium text-slate-700 dark:text-zinc-300 group-hover/entry:text-brand-600 dark:group-hover/entry:text-brand-400 group-hover/entry:underline truncate">
                          {entry.ticket.title}
                        </span>
                      </span>
                      <span className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 tabular-nums flex-shrink-0">
                        {formatHours(entry.hours)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                      {entry.date} · {entry.comment}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
