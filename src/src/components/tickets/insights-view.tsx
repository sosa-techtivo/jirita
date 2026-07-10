import type { ReactNode } from "react";
import type { Ticket, TicketStatus, TicketPriority } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { OnTicketClick } from "@/components/tickets/board-column";
import { TicketTypeIcon, PRIORITY_VALUES } from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";

// ── Colours ─────────────────────────────────────────────────────────────────

const STATUS_HEX: Record<TicketStatus, string> = {
  backlog:       "#94a3b8",
  "to-do":       "#38bdf8",
  "in-progress": "#fbbf24",
  review:        "#a78bfa",
  blocked:       "#f87171",
  done:          "#34d399",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog:       "Backlog",
  "to-do":       "To Do",
  "in-progress": "In Progress",
  review:        "In Review",
  blocked:       "Blocked",
  done:          "Done",
};

const PRIORITY_META: Record<TicketPriority, { label: string; hex: string; barClass: string }> = {
  // One shade darker/more saturated than High, same red family — signals
  // more urgent than High without introducing a new color.
  highest: { label: "Highest", hex: "#dc2626", barClass: "bg-red-600 dark:bg-red-600" },
  high:    { label: "High",    hex: "#f87171", barClass: "bg-red-400 dark:bg-red-500" },
  // Medium reuses the exact hex/barClass that "Normal" (the value it replaced) used.
  medium:  { label: "Medium",  hex: "#94a3b8", barClass: "bg-slate-400 dark:bg-zinc-500" },
  low:     { label: "Low",     hex: "#cbd5e1", barClass: "bg-slate-300 dark:bg-zinc-600" },
};

// ── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDue(s: string): Date | null {
  const [mon, dayStr] = s.trim().split(" ");
  const month = MONTH_MAP[mon];
  const day = parseInt(dayStr);
  if (month === undefined || isNaN(day)) return null;
  return new Date(2026, month, day);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function isOverdue(ticket: Ticket, today: Date): boolean {
  if (ticket.status === "done" || !ticket.dueDate) return false;
  const due = parseDue(ticket.dueDate);
  return due !== null && due < today;
}

// ── Shared card shell ────────────────────────────────────────────────────────

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700/60 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-zinc-100 mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, subtitle, icon, accent = false, muted = false,
}: {
  label: string; value: number; subtitle: string; icon: ReactNode;
  accent?: boolean; muted?: boolean;
}) {
  const numColor = accent
    ? "text-red-600 dark:text-red-400"
    : muted
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-slate-900 dark:text-zinc-50";

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700/60 px-5 py-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-500 dark:text-zinc-400 flex-shrink-0">
          {icon}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
          {label}
        </span>
      </div>
      <p className={`text-3xl font-bold leading-none mb-1.5 ${numColor}`}>{value}</p>
      <p className="text-xs text-slate-400 dark:text-zinc-600">{subtitle}</p>
    </div>
  );
}

// ── Status donut chart ───────────────────────────────────────────────────────

function StatusDonut({ tickets }: { tickets: Ticket[] }) {
  const STATUS_ORDER: TicketStatus[] = ["backlog", "to-do", "in-progress", "review", "blocked", "done"];
  const total = tickets.length;

  const segments = STATUS_ORDER.map((s) => ({
    label: STATUS_LABEL[s],
    color: STATUS_HEX[s],
    value: tickets.filter((t) => t.status === s).length,
  }));

  const r = 36;
  const C = 2 * Math.PI * r;
  let cumLen = 0;
  const computed = segments.map((seg) => {
    const len = total > 0 ? (seg.value / total) * C : 0;
    const offset = cumLen;
    cumLen += len;
    return { ...seg, len, offset };
  });

  return (
    <Card title="Tickets by Status">
      <div className="flex items-center gap-6">
        {/* Donut SVG */}
        <div className="relative flex-shrink-0 w-[96px] h-[96px]">
          <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }} className="w-full h-full">
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="20" className="stroke-slate-100 dark:stroke-zinc-800" />
            {total > 0 && computed.map((seg, i) =>
              seg.value > 0 ? (
                <circle
                  key={i}
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="20"
                  strokeDasharray={`${seg.len} ${C - seg.len}`}
                  strokeDashoffset={-seg.offset}
                />
              ) : null
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold text-slate-900 dark:text-zinc-50 leading-none">{total}</span>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-zinc-600 mt-0.5">Total</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-2">
          {computed.map((seg) => (
            <div key={seg.label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                <span className="text-[12px] text-slate-600 dark:text-zinc-400 truncate">{seg.label}</span>
              </div>
              <span className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 tabular-nums flex-shrink-0">
                {seg.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Workload by assignee ─────────────────────────────────────────────────────

function AssigneeWorkload({ tickets }: { tickets: Ticket[] }) {
  const map = new Map<string, { avatar: string; projectSlug: string; count: number }>();
  for (const t of tickets) {
    const e = map.get(t.assignee.name);
    if (e) e.count++;
    else map.set(t.assignee.name, { avatar: t.assignee.avatar, projectSlug: t.projectSlug, count: 1 });
  }
  const rows = Array.from(map.entries())
    .map(([name, { avatar, projectSlug, count }]) => ({ name, avatar, projectSlug, count }))
    .sort((a, b) => b.count - a.count);
  const max = rows[0]?.count ?? 1;

  return (
    <Card title="Workload by Assignee">
      <div className="space-y-4">
        {rows.map(({ name, avatar, projectSlug, count }) => (
          <div key={name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <MemberTrigger name={name} avatar={avatar} projectSlug={projectSlug} className="flex items-center gap-2 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatar} alt={name} className="w-5 h-5 rounded-full flex-shrink-0" />
                <span className="text-[12px] text-slate-700 dark:text-zinc-300 truncate">{name}</span>
              </MemberTrigger>
              <span className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 tabular-nums flex-shrink-0">
                {count}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 dark:bg-brand-500 transition-all duration-500"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Priority distribution ────────────────────────────────────────────────────

function PriorityDistribution({ tickets }: { tickets: Ticket[] }) {
  const total = tickets.length;
  const rows = PRIORITY_VALUES.map((p) => {
    const count = tickets.filter((t) => t.priority === p).length;
    return { ...PRIORITY_META[p], count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });

  return (
    <Card title="Priority Distribution">
      <div className="space-y-4">
        {rows.map(({ label, barClass, count, pct }) => (
          <div key={label} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-slate-700 dark:text-zinc-300">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 dark:text-zinc-600 tabular-nums">{pct}%</span>
                <span className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 tabular-nums w-4 text-right">
                  {count}
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Milestone progress ───────────────────────────────────────────────────────

function MilestoneProgress({ tickets }: { tickets: Ticket[] }) {
  const map = new Map<string, { done: number; total: number }>();
  for (const t of tickets) {
    const m = map.get(t.milestone) ?? { done: 0, total: 0 };
    m.total++;
    if (t.status === "done") m.done++;
    map.set(t.milestone, m);
  }
  const milestones = Array.from(map.entries()).map(([name, { done, total }]) => ({
    name, done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0,
  }));

  return (
    <Card title="Milestone Progress">
      <div className="space-y-5">
        {milestones.map(({ name, done, total, pct }) => {
          const barColor = pct === 100 ? "bg-emerald-400 dark:bg-emerald-500"
            : pct >= 50 ? "bg-amber-400 dark:bg-amber-500"
            : "bg-brand-500 dark:bg-brand-500";
          return (
            <div key={name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300 truncate">{name}</span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-600 flex-shrink-0 tabular-nums">
                  {done} / {total}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-zinc-600">{pct}% complete</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Upcoming due dates ───────────────────────────────────────────────────────

function UpcomingDueDates({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
}) {
  const today = new Date();
  const upcoming = tickets
    .filter((t) => t.status !== "done" && t.dueDate)
    .map((t) => ({ t, due: parseDue(t.dueDate!)! }))
    .filter((x) => x.due !== null)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 6);

  const dotClass: Record<TicketStatus, string> = {
    backlog: "bg-slate-400", "to-do": "bg-sky-400", "in-progress": "bg-amber-400",
    review: "bg-violet-400", blocked: "bg-red-500", done: "bg-emerald-400",
  };

  return (
    <Card title="Upcoming Due Dates">
      {upcoming.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-zinc-600 py-4 text-center">No upcoming deadlines.</p>
      ) : (
        <div className="space-y-0 divide-y divide-slate-100 dark:divide-zinc-800">
          {upcoming.map(({ t, due }) => {
            const daysLeft = daysBetween(today, due);
            const dateColor = daysLeft < 0
              ? "text-red-600 dark:text-red-400"
              : daysLeft <= 3
              ? "text-amber-600 dark:text-amber-400"
              : "text-slate-500 dark:text-zinc-500";
            const dueFmt = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });

            return (
              <button
              key={t.id}
              type="button"
              onClick={() => onTicketClick(t)}
              className="w-full text-left flex items-center gap-3 py-2.5 min-w-0 hover:bg-slate-50 dark:hover:bg-zinc-800/50 -mx-1 px-1 rounded transition-colors"
            >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass[t.status]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-slate-800 dark:text-zinc-200 truncate leading-snug">
                    {t.title}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">
                    <TicketTypeIcon type={t.type} />
                    {getTicketDisplayKey(t)} · {STATUS_LABEL[t.status]}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-[11px] font-semibold ${dateColor}`}>{dueFmt}</p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">
                    {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `in ${daysLeft}d`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Recently completed ───────────────────────────────────────────────────────

function RecentlyCompleted({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
}) {
  const done = tickets.filter((t) => t.status === "done");

  return (
    <Card title="Recently Completed">
      {done.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-zinc-600 py-4 text-center">No completed tickets yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          {done.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTicketClick(t)}
              className="w-full text-left flex items-center gap-3 py-2.5 min-w-0 hover:bg-slate-50 dark:hover:bg-zinc-800/50 -mx-1 px-1 rounded transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400 dark:bg-emerald-500" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-slate-800 dark:text-zinc-200 truncate leading-snug">
                  {t.title}
                </p>
                <p className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">
                  <TicketTypeIcon type={t.type} />
                  {getTicketDisplayKey(t)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <MemberTrigger
                  name={t.assignee.name}
                  avatar={t.assignee.avatar}
                  projectSlug={t.projectSlug}
                  nested
                  className="rounded-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.assignee.avatar} alt={t.assignee.name} className="w-5 h-5 rounded-full" title={t.assignee.name} />
                </MemberTrigger>
                <p className="text-[10px] text-slate-400 dark:text-zinc-600 whitespace-nowrap hidden sm:block">
                  {t.updatedAt.replace("Updated ", "")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Main InsightsView ────────────────────────────────────────────────────────

export function InsightsView({
  tickets,
  onTicketClick,
}: {
  tickets: Ticket[];
  onTicketClick: OnTicketClick;
}) {
  const today = new Date();
  const total      = tickets.length;
  const open       = tickets.filter((t) => t.status !== "done").length;
  const completed  = tickets.filter((t) => t.status === "done").length;
  const blocked    = tickets.filter((t) => t.status === "blocked").length;
  const overdue    = tickets.filter((t) => isOverdue(t, today)).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">

        {/* ── KPI row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPICard
            label="Open"
            value={open}
            subtitle={`of ${total} total tickets`}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
            }
          />
          <KPICard
            label="Completed"
            value={completed}
            subtitle={total > 0 ? `${Math.round((completed / total) * 100)}% completion rate` : "0% completion rate"}
            muted
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12l3 3 5-5" />
              </svg>
            }
          />
          <KPICard
            label="Blocked"
            value={blocked}
            subtitle="require attention"
            accent={blocked > 0}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            }
          />
          <KPICard
            label="Overdue"
            value={overdue}
            subtitle={overdue === 0 ? "all deadlines on track" : "past due date"}
            accent={overdue > 0}
            muted={overdue === 0}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            }
          />
        </div>

        {/* ── Charts row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusDonut tickets={tickets} />
          <AssigneeWorkload tickets={tickets} />
          <PriorityDistribution tickets={tickets} />
        </div>

        {/* ── Lists row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-6">
          <UpcomingDueDates tickets={tickets} onTicketClick={onTicketClick} />
          <RecentlyCompleted tickets={tickets} onTicketClick={onTicketClick} />
        </div>

      </div>
    </div>
  );
}
