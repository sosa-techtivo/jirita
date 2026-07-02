"use client";

import { useEffect, useRef } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { OnTicketClick } from "@/components/tickets/board-column";

// ── Date utilities ──────────────────────────────────────────────────────────

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDate(s: string): Date | null {
  const [mon, dayStr] = s.trim().split(" ");
  const month = MONTH_MAP[mon];
  const day = parseInt(dayStr);
  if (month === undefined || isNaN(day)) return null;
  return new Date(2026, month, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function barStart(ticket: Ticket): Date | null {
  if (!ticket.dueDate) return null;
  const due = parseDate(ticket.dueDate);
  if (!due) return null;
  return addDays(due, -Math.max(3, Math.round((ticket.storyPoints ?? 5) * 1.5)));
}

// ── Bar colours by status ───────────────────────────────────────────────────

function bgClass(t: Ticket): string {
  if (t.status === "blocked") return "bg-red-400 dark:bg-red-500";
  if (t.status === "done") return "bg-emerald-400 dark:bg-emerald-500";
  if (t.status === "review") return "bg-violet-400 dark:bg-violet-500";
  if (t.status === "in-progress") return "bg-amber-400 dark:bg-amber-500";
  if (t.status === "to-do") return "bg-sky-400 dark:bg-sky-500";
  return "bg-slate-300 dark:bg-zinc-600";
}

function textClass(t: Ticket): string {
  if (t.status === "blocked") return "text-red-950 dark:text-red-100";
  if (t.status === "done") return "text-emerald-950 dark:text-emerald-100";
  if (t.status === "review") return "text-violet-950 dark:text-violet-100";
  if (t.status === "in-progress") return "text-amber-950 dark:text-amber-100";
  if (t.status === "to-do") return "text-sky-950 dark:text-sky-100";
  return "text-slate-700 dark:text-zinc-300";
}

// ── Data structures ─────────────────────────────────────────────────────────

interface Row {
  ticket: Ticket;
  start: Date;
  end: Date;
}

function buildRows(tickets: Ticket[]): Row[] {
  const rows: Row[] = [];
  for (const ticket of tickets) {
    const end = ticket.dueDate ? parseDate(ticket.dueDate) : null;
    const start = barStart(ticket);
    if (!start || !end) continue;
    rows.push({ ticket, start, end });
  }
  return rows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function buildRange(rows: Row[]): { rangeStart: Date; totalDays: number } {
  const all = rows.flatMap((r) => [r.start.getTime(), r.end.getTime()]);
  const earliest = new Date(Math.min(...all));
  const latest = new Date(Math.max(...all));
  const padded = addDays(earliest, -14);
  const rangeStart = addDays(padded, -padded.getDay()); // snap to Sunday
  const rangeEnd = addDays(latest, 16);
  return { rangeStart, totalDays: daysBetween(rangeStart, rangeEnd) };
}

function monthSegments(rangeStart: Date, totalDays: number) {
  const rangeEnd = addDays(rangeStart, totalDays);
  const segs: { label: string; leftPct: number; widthPct: number }[] = [];
  let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cur < rangeEnd) {
    const s = Math.max(0, daysBetween(rangeStart, cur));
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const e = Math.min(totalDays, daysBetween(rangeStart, next));
    segs.push({
      label: `${MONTH_ABBR[cur.getMonth()]} ${cur.getFullYear()}`,
      leftPct: (s / totalDays) * 100,
      widthPct: ((e - s) / totalDays) * 100,
    });
    cur = next;
  }
  return segs;
}

function weekPcts(rangeStart: Date, totalDays: number): number[] {
  const pcts: number[] = [];
  let cur = addDays(rangeStart, (7 - rangeStart.getDay()) % 7);
  while (daysBetween(rangeStart, cur) < totalDays) {
    pcts.push((daysBetween(rangeStart, cur) / totalDays) * 100);
    cur = addDays(cur, 7);
  }
  return pcts;
}

// ── Layout constants ────────────────────────────────────────────────────────

const LABEL_W = 192;  // px, matches w-48
const ROW_H   = 36;   // px per ticket row (reduced for density)
const HDR_H   = 50;   // px time-scale header
const BAR_H   = 22;   // px bar height (reduced)
const PX_PER_DAY = 9;

// ── Shared grid-line overlay ────────────────────────────────────────────────

function GridLines({ weeks, months }: { weeks: number[]; months: { leftPct: number }[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {weeks.map((p, i) => (
        <div key={i} className="absolute inset-y-0 w-px bg-slate-100 dark:bg-zinc-800" style={{ left: `${p}%` }} />
      ))}
      {months.slice(1).map((m, i) => (
        <div key={i} className="absolute inset-y-0 w-px bg-slate-200 dark:bg-zinc-700/70" style={{ left: `${m.leftPct}%` }} />
      ))}
    </div>
  );
}

// Prominent Today line — reused in every row and header
function TodayLine({ pct }: { pct: number }) {
  if (pct < 0 || pct > 100) return null;
  return (
    <div
      className="absolute inset-y-0 w-0.5 bg-brand-600/80 dark:bg-brand-500/80 pointer-events-none z-10"
      style={{ left: `${pct}%` }}
    />
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function TimelineView({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
}) {
  const today = new Date();
  const containerRef = useRef<HTMLDivElement>(null);

  const rows = buildRows(tickets);

  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-zinc-500">No tickets with due dates to display.</p>
      </div>
    );
  }

  const { rangeStart, totalDays } = buildRange(rows);
  const months = monthSegments(rangeStart, totalDays);
  const weeks = weekPcts(rangeStart, totalDays);
  const todayPct = (daysBetween(rangeStart, today) / totalDays) * 100;

  function toPct(d: Date) {
    return (daysBetween(rangeStart, d) / totalDays) * 100;
  }

  // Smooth scroll so Today lands ~1/3 from the left on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const gridW = el.scrollWidth - LABEL_W;
    const todayX = LABEL_W + (todayPct / 100) * gridW;
    el.scrollTo({ left: Math.max(0, todayX - el.clientWidth * 0.33), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minInnerW = LABEL_W + totalDays * PX_PER_DAY;

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div ref={containerRef} className="h-full overflow-auto overscroll-x-contain">
        <div style={{ minWidth: minInnerW }}>

          {/* ── Time-scale header (sticky top) ──────────────────────────── */}
          <div
            className="sticky top-0 z-30 flex border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
            style={{ height: HDR_H }}
          >
            {/* Corner */}
            <div
              className="flex-shrink-0 sticky left-0 z-40 bg-white dark:bg-zinc-950 border-r border-slate-200 dark:border-zinc-800 flex items-end pb-2.5 px-4"
              style={{ width: LABEL_W }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                Ticket
              </span>
            </div>

            {/* Month + week scale */}
            <div className="flex-1 relative overflow-hidden">
              {months.map((seg, i) => (
                <div
                  key={i}
                  className="absolute top-0 pt-2.5 pl-2 overflow-hidden"
                  style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%` }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                    {seg.label}
                  </span>
                </div>
              ))}
              {months.slice(1).map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-slate-200 dark:bg-zinc-700/60"
                  style={{ left: `${m.leftPct}%` }}
                />
              ))}
              {weeks.map((p, i) => (
                <div
                  key={i}
                  className="absolute bottom-0 w-px bg-slate-200 dark:bg-zinc-800"
                  style={{ left: `${p}%`, height: 16 }}
                />
              ))}

              {/* Today: prominent pill + line in header */}
              {todayPct >= 0 && todayPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 z-20 flex flex-col items-center"
                  style={{ left: `${todayPct}%` }}
                >
                  <div className="mt-2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-brand-600 dark:bg-brand-500 text-[9px] font-bold text-white whitespace-nowrap shadow-sm shadow-brand-600/30">
                    Today
                  </div>
                  <div className="flex-1 w-0.5 bg-brand-600/80 dark:bg-brand-500/80" />
                </div>
              )}
            </div>
          </div>

          {/* ── Ticket rows ───────────────────────────────────────────────── */}
          {rows.map(({ ticket, start, end }) => {
            const leftPct = toPct(start);
            const widthPct = toPct(end) - leftPct;
            const clampedLeft = Math.max(0, leftPct);
            const clampedWidth = Math.min(widthPct, 100 - clampedLeft);

            return (
              <div
                key={ticket.id}
                className="flex border-b border-slate-100 dark:border-zinc-800/40 hover:bg-slate-50/50 dark:hover:bg-zinc-800/20 transition-colors group/row"
                style={{ height: ROW_H }}
              >
                <div
                  className="flex-shrink-0 sticky left-0 z-10 bg-white dark:bg-zinc-950 group-hover/row:bg-slate-50/50 dark:group-hover/row:bg-zinc-800/20 border-r border-slate-200 dark:border-zinc-800 flex items-center px-4 transition-colors"
                  style={{ width: LABEL_W }}
                >
                  <span className="text-xs text-slate-600 dark:text-zinc-400 truncate">
                    {ticket.title}
                  </span>
                </div>

                {/* Grid + bar */}
                <div className="flex-1 relative overflow-hidden" style={{ height: ROW_H }}>
                  <GridLines weeks={weeks} months={months} />
                  <TodayLine pct={todayPct} />

                  {clampedWidth > 0 && (
                    <button
                      type="button"
                      title={`${getTicketDisplayKey(ticket)} · ${ticket.title}`}
                      onClick={() => onTicketClick(ticket)}
                      className={[
                        "absolute z-20 rounded-md flex items-center gap-1.5 px-2 overflow-hidden",
                        "hover:brightness-110 hover:shadow-md transition-all duration-150",
                        bgClass(ticket),
                      ].join(" ")}
                      style={{
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: BAR_H,
                        left: `${clampedLeft}%`,
                        width: `${clampedWidth}%`,
                        minWidth: 24,
                      }}
                    >
                      <span className={`text-[10px] font-semibold flex-shrink-0 opacity-70 leading-none ${textClass(ticket)}`}>
                        {getTicketDisplayKey(ticket)}
                      </span>
                      <span className={`text-[10px] opacity-40 flex-shrink-0 leading-none ${textClass(ticket)}`}>·</span>
                      <span className={`text-[11px] font-medium truncate leading-none ${textClass(ticket)}`}>
                        {ticket.title}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Bottom padding */}
          <div className="flex border-t border-slate-100 dark:border-zinc-800/40" style={{ height: 24 }}>
            <div
              className="flex-shrink-0 sticky left-0 bg-white dark:bg-zinc-950"
              style={{ width: LABEL_W }}
            />
            <div className="flex-1 relative overflow-hidden">
              <GridLines weeks={weeks} months={months} />
              <TodayLine pct={todayPct} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
