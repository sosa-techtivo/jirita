"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getTeamByProjectSlug } from "@/lib/mock-team";
import { tickets } from "@/lib/mock-tickets";
import type { TicketStatus } from "@/lib/mock-tickets";
import { getProjectBySlug } from "@/lib/mock-projects";
import { StatusBadge as ProjectStatusBadge } from "@/components/status-badge";
import {
  StatusBadge as MemberStatusBadge,
  CapacityBar,
  capacityTextColor,
  utilizationOf,
} from "@/components/member-profile-modal";
import { useMemberProfile } from "@/components/member-profile";

// ── Mock/derived data helpers ────────────────────────────────────────────────
//
// Tickets aren't split per project in this mock dataset yet (TicketsScreen and
// ProjectOverview treat the same list as "this project's tickets"), so Reports
// follows the same convention. Team membership IS scoped per project.

// No real time-tracking source exists per ticket yet, so "logged hours" is
// approximated from ticket status until that data is available.
const STATUS_LOG_RATIO: Record<TicketStatus, number> = {
  backlog: 0,
  "to-do": 0.05,
  "in-progress": 0.5,
  review: 0.85,
  blocked: 0.35,
  done: 1,
};

const REPORTING_PERIOD = "Jun 23 – Jul 4";

const DELIVERY_STATUS_FILTER: Record<"total" | "completed" | "in-progress" | "blocked", string | null> = {
  total: null,
  completed: "done",
  "in-progress": "in-progress",
  blocked: "blocked",
};

// ── Shared shells (mirrors the visual language of the global Reports page) ──

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-slate-900 dark:text-zinc-50",
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">{label}</p>
      <p className={`text-xl font-bold mt-1 leading-none tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function ClickableStat({
  label,
  value,
  valueClass,
  onClick,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border border-slate-200 dark:border-zinc-700/70 px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors"
    >
      <Stat label={label} value={value} valueClass={valueClass} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectReportsScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const project = getProjectBySlug(slug);
  const members = getTeamByProjectSlug(slug);
  const { openMemberProfile } = useMemberProfile();

  // Team capacity — same computation as the Team page.
  const totalWeeklyCapacity = members.reduce((sum, m) => sum + m.weeklyCapacity, 0);
  const totalAssignedHours = members.reduce((sum, m) => sum + m.assignedHours, 0);
  const teamUtilization = totalWeeklyCapacity === 0 ? 0 : Math.round((totalAssignedHours / totalWeeklyCapacity) * 100);

  // Hours
  const estimatedHours = tickets.reduce((sum, t) => sum + (t.hours ?? 0), 0);
  const loggedHours = Math.round(
    tickets.reduce((sum, t) => sum + (t.hours ?? 0) * STATUS_LOG_RATIO[t.status], 0)
  );
  const remainingHours = Math.max(estimatedHours - loggedHours, 0);
  const loggedPct = estimatedHours === 0 ? 0 : Math.round((loggedHours / estimatedHours) * 100);

  // Delivery
  const totalTickets = tickets.length;
  const completedTickets = tickets.filter((t) => t.status === "done");
  const inProgressCount = tickets.filter((t) => t.status === "in-progress").length;
  const blockedCount = tickets.filter((t) => t.status === "blocked").length;
  const completionPct = totalTickets === 0 ? 0 : Math.round((completedTickets.length / totalTickets) * 100);

  const completedHours = completedTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0);

  function goToTickets(status: string | null) {
    router.push(status ? `/projects/${slug}/tickets?status=${status}` : `/projects/${slug}/tickets`);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Reports</h1>
        <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
          Monitor project health, capacity and delivery progress.
        </p>
      </div>

      {/* ── Summary KPI strip ─────────────────────────────────────────────── */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Project Health</p>
          <div className="mt-2">
            <ProjectStatusBadge status={project?.status ?? "active"} />
          </div>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">
            {totalWeeklyCapacity}
            <span className="text-base font-medium text-slate-400 dark:text-zinc-600 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4 bg-brand-50/30 dark:bg-brand-950/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">Assigned Hours</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300 mt-1 leading-none">
            {totalAssignedHours}
            <span className="text-base font-medium text-brand-400 dark:text-brand-500 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Team Utilization</p>
          <p className={`text-2xl font-bold mt-1 leading-none tabular-nums ${capacityTextColor(teamUtilization)}`}>
            {teamUtilization}%
          </p>
        </div>
      </div>

      {/* ── Sections ─────────────────────────────────────────────────────── */}
      <div className="mt-6 space-y-5">

        {/* Estimated vs Logged Hours */}
        <Section
          title="Estimated vs Logged Hours"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          }
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Stat label="Estimated Hours" value={`${estimatedHours}h`} />
            <Stat label="Logged Hours" value={`${loggedHours}h`} valueClass="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Remaining Hours" value={`${remainingHours}h`} valueClass="text-slate-500 dark:text-zinc-400" />
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${loggedPct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-zinc-600 tabular-nums">{loggedPct}% logged</p>
        </Section>

        {/* Team Workload */}
        <Section
          title="Team Workload"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          }
        >
          {members.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No team members assigned to this project yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {members.map((member) => {
                const pct = utilizationOf(member);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => openMemberProfile({ name: member.name, avatar: member.avatar, role: member.role, projectSlug: member.projectSlug })}
                    className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-zinc-200 truncate">{member.name}</p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">{member.role}</p>
                    </div>
                    <MemberStatusBadge status={member.status} />
                    <div className="w-36 flex-shrink-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-slate-600 dark:text-zinc-300 tabular-nums">
                          {member.assignedHours}h <span className="font-normal text-slate-400 dark:text-zinc-600">/ {member.weeklyCapacity}h</span>
                        </span>
                        <span className={`font-semibold tabular-nums ${capacityTextColor(pct)}`}>{pct}%</span>
                      </div>
                      <CapacityBar pct={pct} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* Delivery Progress */}
        <Section
          title="Delivery Progress"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <ClickableStat label="Total Tickets" value={totalTickets} onClick={() => goToTickets(DELIVERY_STATUS_FILTER.total)} />
            <ClickableStat
              label="Completed"
              value={completedTickets.length}
              valueClass="text-emerald-600 dark:text-emerald-400"
              onClick={() => goToTickets(DELIVERY_STATUS_FILTER.completed)}
            />
            <ClickableStat
              label="In Progress"
              value={inProgressCount}
              valueClass="text-amber-600 dark:text-amber-400"
              onClick={() => goToTickets(DELIVERY_STATUS_FILTER["in-progress"])}
            />
            <ClickableStat
              label="Blocked"
              value={blockedCount}
              valueClass="text-red-600 dark:text-red-400"
              onClick={() => goToTickets(DELIVERY_STATUS_FILTER.blocked)}
            />
          </div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-500 dark:text-zinc-400">Completion</span>
            <span className="font-semibold text-slate-700 dark:text-zinc-200 tabular-nums">{completionPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completionPct}%` }} />
          </div>
        </Section>

        {/* Delivery Snapshot */}
        <Section
          title="Delivery Snapshot"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Reporting Period" value={<span className="text-sm">{REPORTING_PERIOD}</span>} />
            <Stat label="Completed Tickets" value={completedTickets.length} />
            <Stat label="Completed Hours" value={`${completedHours}h`} />
            <Stat label="Remaining Hours" value={`${remainingHours}h`} />
          </div>
        </Section>
      </div>

    </div>
  );
}
