"use client";

import { useState } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import type { OnTicketClick } from "@/components/tickets/board-column";

// ── Date utilities ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDueDateKey(s: string): string | null {
  const [mon, dayStr] = s.trim().split(" ");
  const month = MONTH_MAP[mon];
  const day = parseInt(dayStr);
  if (month === undefined || isNaN(day)) return null;
  return `2026-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarCells(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay++), isCurrentMonth: false });
  }
  return cells;
}

function groupTicketsByDate(tickets: Ticket[]): Record<string, Ticket[]> {
  const map: Record<string, Ticket[]> = {};
  for (const t of tickets) {
    if (!t.dueDate) continue;
    const key = parseDueDateKey(t.dueDate);
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(t);
  }
  return map;
}

function statusDotClass(t: Ticket): string {
  if (t.status === "blocked") return "bg-red-500";
  if (t.priority === "high") return "bg-amber-500";
  if (t.status === "review") return "bg-violet-500";
  if (t.status === "done") return "bg-emerald-500";
  if (t.status === "in-progress") return "bg-amber-400";
  if (t.status === "to-do") return "bg-sky-400";
  return "bg-slate-400";
}

function statusLabel(t: Ticket): string {
  const labels: Record<string, string> = {
    backlog: "Inbox",
    "to-do": "To Do",
    "in-progress": "In Progress",
    review: "In Review",
    blocked: "Blocked",
    done: "Done",
  };
  return labels[t.status] ?? t.status;
}

// ── Ticket pill inside a calendar cell ─────────────────────────────────────

function TicketPill({
  ticket,
  onTicketClick,
}: {
  ticket: Ticket;
  onTicketClick: OnTicketClick;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTicketClick(ticket);
      }}
      className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(ticket)}`} />
      <span className="text-[11px] text-slate-700 dark:text-zinc-300 truncate leading-tight">
        {ticket.title}
      </span>
    </button>
  );
}

// ── Day side panel ──────────────────────────────────────────────────────────

function DayPanel({
  date,
  tickets,
  onTicketClick,
  onClose,
}: {
  date: Date;
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-zinc-800 flex-shrink-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
            {date.toLocaleDateString("en-US", { weekday: "long" })}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-tight">
            {date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
          <p className="text-xs text-slate-400 dark:text-zinc-600 mt-0.5">{date.getFullYear()}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-0.5 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-2">
              <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">No tickets due</p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">Nothing scheduled for this day</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => onTicketClick(ticket)}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-3.5 py-3 hover:border-slate-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-100 leading-snug flex-1">
                    {ticket.title}
                  </p>
                  <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${statusDotClass(ticket)}`} />
                </div>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">{statusLabel(ticket)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ticket.assignee.avatar} alt={ticket.assignee.name} className="w-4 h-4 rounded-full" />
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">{ticket.assignee.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CalendarView ────────────────────────────────────────────────────────────

export function CalendarView({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const byDate = groupTicketsByDate(tickets);
  const cells = buildCalendarCells(viewYear, viewMonth);
  const rows = Array.from({ length: 6 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  function navigate(offset: number) {
    let m = viewMonth + offset;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    else if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
    setSelectedDay(null);
  }

  function selectDay(date: Date) {
    setSelectedDay(date);
  }

  function closePanel() {
    setSelectedDay(null);
  }

  const selectedDayKey = selectedDay ? toDateKey(selectedDay) : null;
  const panelTickets = selectedDayKey ? (byDate[selectedDayKey] ?? []) : [];

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* ── Calendar area ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 px-6 pt-4 pb-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-50">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewYear(today.getFullYear());
                setViewMonth(today.getMonth());
                setSelectedDay(null);
              }}
              className="px-2.5 h-7 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 flex-shrink-0 mb-1">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-600 pb-1.5"
            >
              {d}
            </div>
          ))}
        </div>

        {/* 6-row calendar grid */}
        <div className="flex-1 min-h-0 flex flex-col gap-px rounded-xl overflow-hidden border border-slate-200/80 dark:border-zinc-700/40 bg-slate-200/60 dark:bg-zinc-700/40">
          {rows.map((row, ri) => (
            <div key={ri} className="flex-1 min-h-0 flex gap-px">
              {row.map(({ date, isCurrentMonth }) => {
                const key = toDateKey(date);
                const dayTickets = byDate[key] ?? [];
                const isToday = isSameDay(date, today);
                const isSelected = selectedDay !== null && isSameDay(date, selectedDay);
                const overflow = dayTickets.length - 3;

                return (
                  <div
                    key={key}
                    onClick={() => selectDay(date)}
                    className={[
                      "flex-1 min-w-0 flex flex-col p-1.5 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : isCurrentMonth
                        ? "bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800/70"
                        : "bg-slate-50/60 dark:bg-zinc-900/40 hover:bg-slate-100/70 dark:hover:bg-zinc-800/40",
                    ].join(" ")}
                  >
                    {/* Date number */}
                    <div className="flex justify-end flex-shrink-0 mb-0.5">
                      <span
                        className={[
                          "w-6 h-6 flex items-center justify-center text-[12px] font-medium rounded-full",
                          isToday
                            ? "bg-brand-600 text-white dark:bg-brand-500"
                            : isCurrentMonth
                            ? "text-slate-700 dark:text-zinc-300"
                            : "text-slate-300 dark:text-zinc-600",
                        ].join(" ")}
                      >
                        {date.getDate()}
                      </span>
                    </div>

                    {/* Ticket pills (max 3) */}
                    <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-px">
                      {dayTickets.slice(0, 3).map((ticket) => (
                        <TicketPill
                          key={ticket.id}
                          ticket={ticket}
                          onTicketClick={onTicketClick}
                        />
                      ))}
                      {overflow > 0 && (
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 px-1.5 leading-tight">
                          +{overflow} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Day panel ── */}
      {selectedDay && (
        <aside className="w-72 flex-shrink-0 border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col min-h-0 overflow-hidden">
          <DayPanel
            date={selectedDay}
            tickets={panelTickets}
            onTicketClick={onTicketClick}
            onClose={closePanel}
          />
        </aside>
      )}
    </div>
  );
}
