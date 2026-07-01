"use client";

import { useState, Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import type { Ticket } from "@/lib/mock-tickets";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectLeadDashboard } from "@/components/project-lead-dashboard";
import { MemberDashboard } from "@/components/member-dashboard";
import {
  av,
  MY_ACTIVE,
  RECENT_ACTIVITY,
  Card,
  ActiveTicketRow,
  RecentActivityList,
  HERO_LABEL_CLASS,
  HERO_ACCENT_TEXT_CLASS,
} from "@/components/dashboard-shared";

// ── Helpers ───────────────────────────────────────────────────────────────────

const HOURS_BURN_PCT = Math.round((212 / 320) * 100); // 66%

// ── Data (drawn from Reports + My Work mock sets) ─────────────────────────────

// At-risk + blocked projects from Reports PROJECT_HEALTH
const PROJECTS_AT_RISK = [
  { id: "msl", name: "Marketing Site Relaunch", risk: "blocked" as const, blocked: 5, completedHours: 23,  estimatedHours: 96  },
  { id: "mba", name: "Mobile Banking App",      risk: "at-risk" as const, blocked: 3, completedHours: 77,  estimatedHours: 184 },
  { id: "cwd", name: "Client Website Redesign", risk: "at-risk" as const, blocked: 1, completedHours: 6,   estimatedHours: 18  },
];

// Team workload from Reports WORKLOAD (hours / weekly capacity)
const WORKLOAD = [
  { id: "marcus", name: "Marcus Lee",  avatar: av(12), hours: 112, capacity: 120 },
  { id: "sarah",  name: "Sarah Chen",  avatar: av(47), hours: 84,  capacity: 100 },
  { id: "david",  name: "David Kim",   avatar: av(22), hours: 52,  capacity: 80  },
  { id: "priya",  name: "Priya Patel", avatar: av(33), hours: 44,  capacity: 80  },
  { id: "elena",  name: "Elena Rossi", avatar: av(5),  hours: 28,  capacity: 60  },
];

// Insights derived from team data
const INSIGHTS: Array<{ id: string; level: "ok" | "warning" | "critical"; text: string }> = [
  { id: "i1", level: "critical", text: "Marketing Site Relaunch blocked — 5 tickets" },
  { id: "i2", level: "warning",  text: "Marcus and Sarah above capacity" },
  { id: "i3", level: "ok",       text: "23 tickets completed this month" },
  { id: "i4", level: "warning",  text: `Hours burn at ${HOURS_BURN_PCT}% · ${320 - 212}h remaining` },
];

// ── Sub-components ────────────────────────────────────────────────────────────

type InsightLevel = "ok" | "warning" | "critical";

function InsightIcon({ level }: { level: InsightLevel }) {
  if (level === "ok") {
    return (
      <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" d="M5 12l5 5L20 7" />
      </svg>
    );
  }
  if (level === "critical") {
    return (
      <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
}

function InsightsBand({ items }: { items: typeof INSIGHTS }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-3 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      {items.map((item, i) => (
        <Fragment key={item.id}>
          <span className="flex items-center gap-2">
            <InsightIcon level={item.level} />
            <span className={`text-[12px] ${item.level === "critical" ? "font-medium text-slate-800 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-400"}`}>
              {item.text}
            </span>
          </span>
          {i < items.length - 1 && (
            <span className="hidden sm:block text-slate-200 dark:text-zinc-800 select-none" aria-hidden="true">·</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function DashKpiCard({
  label,
  value,
  sub,
  accent,
  danger,
  progress,
}: {
  label:     string;
  value:     ReactNode;
  sub?:      string;
  accent?:   boolean;
  danger?:   boolean;
  progress?: number;
}) {
  return (
    <div
      className={[
        "h-full flex flex-col rounded-xl border shadow-sm shadow-slate-200/40 dark:shadow-black/20 px-5 pt-4 pb-4",
        // Every KPI card shares the same dark card background/border — an
        // Admin overview shouldn't let one metric visually outweigh the
        // others. Accent cards keep their light-mode tint but, in dark
        // mode, only add a faint violet ring as emphasis instead of a
        // brighter background (brand-300/400/900/950 aren't defined in the
        // theme, so the old `dark:bg-brand-950/15` etc. silently fell back
        // to the *light* class, which is why this card looked washed out).
        accent
          ? "border-brand-100 bg-brand-50/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:ring-1 dark:ring-inset dark:ring-violet-500/15"
          : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900",
      ].join(" ")}
    >
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${accent ? HERO_LABEL_CLASS : "text-slate-400 dark:text-zinc-600"}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold leading-none ${danger ? "text-red-600 dark:text-red-400" : accent ? HERO_ACCENT_TEXT_CLASS : "text-slate-900 dark:text-zinc-50"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>}
      <div className="mt-auto pt-3">
        {progress !== undefined && (
          <div className="h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: "on-track" | "at-risk" | "blocked" }) {
  const styles = {
    "on-track": "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10",
    "at-risk":  "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10",
    "blocked":  "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10",
  };
  const labels = { "on-track": "On Track", "at-risk": "At Risk", "blocked": "Blocked" };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ${styles[risk]}`}>
      {labels[risk]}
    </span>
  );
}

function WorkloadRow({
  name,
  avatar,
  hours,
  capacity,
}: {
  name:     string;
  avatar:   string;
  hours:    number;
  capacity: number;
}) {
  const pct    = Math.min(100, Math.round((hours / capacity) * 100));
  const isOver = hours > capacity;
  const isHigh = !isOver && pct > 85;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar} alt={name} className="w-5 h-5 rounded-full flex-shrink-0" />
      <span className="text-[12px] text-slate-600 dark:text-zinc-400 w-14 flex-shrink-0 truncate">
        {name.split(" ")[0]}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isOver ? "bg-amber-400" : isHigh ? "bg-amber-300" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums flex-shrink-0 w-8 text-right ${isOver ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-zinc-400"}`}>
        {hours}h
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const { user } = useCurrentUser();
  const [preview, setPreview] = useState<Ticket | null>(null);

  // The Project Lead gets a purpose-built operational dashboard instead of a
  // filtered version of this organization-wide one.
  if (user.role === "PROJECT_LEAD") {
    return <ProjectLeadDashboard />;
  }

  // Members (Engineer / QA / Designer) get a personal-productivity dashboard
  // instead of a filtered version of this organization-wide one.
  if (user.role === "MEMBER") {
    return <MemberDashboard />;
  }

  const canManageOrg = canManage(user.role);

  const deadlines = [...MY_ACTIVE]
    .filter((t) => t.dueDate)
    .sort((a, b) => {
      const da = new Date(`${a.dueDate}, 2026`).getTime();
      const db = new Date(`${b.dueDate}, 2026`).getTime();
      return da - db;
    });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-1">
            Good morning, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-slate-400 dark:text-zinc-500">Tuesday, June 30</p>
        </div>

        {/* Quick Actions */}
        {canManageOrg && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7l4-4h6l4 4" />
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path strokeLinecap="round" d="M12 12v4M10 14h4" />
              </svg>
              New Project
            </Link>
            <Link
              href="/projects/mobile-banking-app/team"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" d="M15 20v-1.5a3.5 3.5 0 00-3.5-3.5h-4A3.5 3.5 0 004 18.5V20" />
                <circle cx="9" cy="7.5" r="3" />
                <path strokeLinecap="round" d="M19 20v-1.5a3.5 3.5 0 00-2.5-3.36M14 4.13a3 3 0 010 5.74" />
              </svg>
              Add Member
            </Link>
            <Link
              href="/projects/mobile-banking-app/tickets"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm shadow-brand-500/30"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" d="M12 4v16m8-8H4" />
              </svg>
              New Ticket
            </Link>
          </div>
        )}
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2">
        Organization Health
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <DashKpiCard
          label="Assigned Tickets"
          value={14}
          sub="11 active"
        />
        <DashKpiCard
          label="Hours Burn"
          value={<>212<span className="text-base font-normal opacity-40 ml-0.5">/ 320h</span></>}
          sub={`${HOURS_BURN_PCT}% complete`}
          accent
          progress={HOURS_BURN_PCT}
        />
        <DashKpiCard
          label="Blocked"
          value={11}
          sub="across all projects"
          danger
        />
        <DashKpiCard
          label="Due Today"
          value={3}
          sub="Jun 30"
        />
      </div>

      {/* ── Insights band ──────────────────────────────────────────────────── */}
      <InsightsBand items={INSIGHTS} />

      {/* ── Two-column main content ─────────────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

        {/* Left: My Active Work + Recent Activity */}
        <div className="space-y-5 min-w-0">

          <Card
            title="My Active Work"
            count={MY_ACTIVE.length}
            action={
              <Link href="/my-work" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                View all →
              </Link>
            }
          >
            <div className="space-y-0.5">
              {MY_ACTIVE.map((t) => (
                <ActiveTicketRow key={t.id} ticket={t} onOpen={setPreview} />
              ))}
            </div>
          </Card>

          <Card title="Recent Activity">
            <RecentActivityList items={RECENT_ACTIVITY} />
          </Card>

        </div>

        {/* Right: Projects at Risk + Team Workload + Upcoming Deadlines */}
        <div className="space-y-5">

          <Card
            title="Projects at Risk"
            count={PROJECTS_AT_RISK.length}
            action={
              <Link href="/reports" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                Full report →
              </Link>
            }
          >
            <div className="space-y-4">
              {PROJECTS_AT_RISK.map((p) => {
                const pct = Math.round((p.completedHours / p.estimatedHours) * 100);
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">
                        {p.name}
                      </span>
                      <RiskBadge risk={p.risk} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${p.risk === "blocked" ? "bg-red-400" : "bg-amber-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 flex-shrink-0 tabular-nums w-8 text-right">
                        {pct}%
                      </span>
                    </div>
                    {p.blocked > 0 && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">
                        {p.blocked} blocked ticket{p.blocked !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card
            title="Team Workload"
            action={
              <Link href="/reports" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
                Details →
              </Link>
            }
          >
            <div>
              {WORKLOAD.map((w) => (
                <WorkloadRow key={w.id} name={w.name} avatar={w.avatar} hours={w.hours} capacity={w.capacity} />
              ))}
            </div>
          </Card>

          <Card title="My Upcoming Deadlines">
            <div className="space-y-1">
              {deadlines.map((t) => {
                const isOverdue =
                  t.dueDate === "Jun 28" ||
                  t.dueDate === "Jun 29" ||
                  t.dueDate === "Jun 30";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPreview(t)}
                    className="w-full flex items-center gap-2.5 py-1.5 px-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-400" : "bg-slate-300 dark:bg-zinc-600"}`} />
                    <span className="flex-1 min-w-0 text-[12px] text-slate-700 dark:text-zinc-300 truncate">
                      {t.title}
                    </span>
                    <span className={`text-[11px] font-semibold flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-zinc-400"}`}>
                      {t.dueDate}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

        </div>
      </div>

      {/* ── Ticket preview panel ────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug="mobile-banking-app"
          onClose={() => setPreview(null)}
        />
      )}

    </div>
  );
}
