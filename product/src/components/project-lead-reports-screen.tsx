"use client";

import { useState } from "react";
import { projects } from "@/lib/mock-projects";
import type { ProjectHealth } from "@/lib/mock-projects";
import type { TeamMember } from "@/lib/mock-team";
import { LEAD_PROJECT_SLUGS, aggregateTeam, PROJECT_TICKETS } from "@/components/project-lead-dashboard";
import { utilizationOf, capacityBarColor, capacityTextColor, remainingAvailabilityLabel } from "@/components/team-screen";
import { StatusBadge, HealthBadge } from "@/components/status-badge";
import { ReportStatusBar, Section, KpiCard, BlockCompletion, AnimatedBar } from "@/components/reports-shared";
import type { StatusItem } from "@/components/reports-shared";
import { RECENT_ACTIVITY, RecentActivityList } from "@/components/dashboard-shared";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";

// A Project Lead's Reports has no company-wide or billing data at all — every
// number here is scoped to LEAD_PROJECT_SLUGS (the same projects their
// Dashboard and Projects list already scope to). Two tabs answer the two
// questions a Lead actually has: is delivery on track, and is the team okay.

const MY_PROJECTS = projects.filter((p) => LEAD_PROJECT_SLUGS.includes(p.slug));
const MY_PROJECT_NAMES = MY_PROJECTS.map((p) => p.name);
const TEAM = aggregateTeam(LEAD_PROJECT_SLUGS);

// No per-member "blocked hours" field exists on TeamMember yet — this stands
// in for a future Time Tracking breakdown, kept internally consistent with
// each member's existing assignedHours/weeklyCapacity in mock-team.ts.
const BLOCKED_HOURS_BY_MEMBER: Record<string, number> = {
  "Sarah Chen": 4,
  "Marcus Lee": 10,
  "Priya Patel": 0,
  "David Kim": 2,
  "Elena Rossi": 6,
  "Jordan Wu": 0,
};

function blockedHoursOf(member: TeamMember): number {
  return BLOCKED_HOURS_BY_MEMBER[member.name] ?? 0;
}

// Reuses the exact same 3-tier vocabulary/badge as project health, so a
// member's status reads the same way a project's does.
function healthOf(member: TeamMember): ProjectHealth {
  const pct = utilizationOf(member);
  if (pct > 100) return "critical";
  if (pct >= 90 || blockedHoursOf(member) >= 6) return "needs-attention";
  return "healthy";
}

// ── Top KPIs (both tabs) ──────────────────────────────────────────────────────

const TOTAL_BLOCKED_TICKETS = MY_PROJECTS.reduce((sum, p) => sum + p.blockedTickets, 0);
const TOTAL_DUE_THIS_WEEK = MY_PROJECTS.reduce((sum, p) => sum + p.dueThisWeekTickets, 0);
const OVER_CAPACITY_COUNT = TEAM.filter((m) => utilizationOf(m) > 100).length;
const TOTAL_ASSIGNED_HOURS = TEAM.reduce((sum, m) => sum + m.assignedHours, 0);
const TOTAL_CAPACITY_HOURS = TEAM.reduce((sum, m) => sum + m.weeklyCapacity, 0);
const TEAM_UTILIZATION_PCT = Math.round((TOTAL_ASSIGNED_HOURS / TOTAL_CAPACITY_HOURS) * 100);
const AVG_PROJECT_PROGRESS = Math.round(MY_PROJECTS.reduce((sum, p) => sum + p.progress, 0) / MY_PROJECTS.length);

// ── Alerts banner (Delivery tab) ──────────────────────────────────────────────

function buildStatusItems(): StatusItem[] {
  const items: StatusItem[] = [];

  const overCapacity = TEAM.filter((m) => utilizationOf(m) > 100);
  if (overCapacity.length > 0) {
    items.push({
      id: "over-capacity",
      level: "warning",
      text: `${overCapacity.length} team member${overCapacity.length === 1 ? "" : "s"} over capacity`,
    });
  }

  const mostBlocked = [...MY_PROJECTS].sort((a, b) => b.blockedTickets - a.blockedTickets)[0];
  if (mostBlocked && mostBlocked.blockedTickets > 0) {
    items.push({
      id: "blocked-project",
      level: "critical",
      text: `${mostBlocked.name} blocked`,
    });
  }

  const onTrackCount = MY_PROJECTS.filter((p) => p.status === "active").length;
  items.push({ id: "on-track", level: "ok", text: `${onTrackCount} of ${MY_PROJECTS.length} projects on track` });

  return items.slice(0, 3);
}

const STATUS_ITEMS = buildStatusItems();

// ── Filters (Delivery tab, cosmetic — mirrors the rest of Reports) ───────────

const PROJECT_GROUPS: DropdownGroup[] = [
  { options: MY_PROJECTS.map((p) => ({ value: p.slug, label: p.name })) },
];

const ASSIGNEE_GROUPS: DropdownGroup[] = [
  { options: TEAM.map((m) => ({ value: m.name, label: m.name, avatar: m.avatar })) },
];

const STATUS_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "planning", label: "Planning" },
      { value: "active", label: "Active" },
      { value: "on-hold", label: "On Hold" },
      { value: "completed", label: "Completed" },
    ],
  },
];

const PRIORITY_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "critical", label: "Critical" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
];

// ── Upcoming Deadlines (Delivery tab) — same ticket pools the Lead's own
//    Dashboard uses, just scoped to all their projects instead of just
//    whichever one is active there. ───────────────────────────────────────────

const TODAY = new Date(2026, 5, 30);

function parseDue(dueDate?: string): number {
  return dueDate ? new Date(`${dueDate}, 2026`).getTime() : Infinity;
}

const UPCOMING_DEADLINES = LEAD_PROJECT_SLUGS.flatMap((slug) => PROJECT_TICKETS[slug] ?? [])
  .filter((t) => t.dueDate)
  .sort((a, b) => parseDue(a.dueDate) - parseDue(b.dueDate));

// ── Recent Changes (Delivery tab) ─────────────────────────────────────────────

const MY_RECENT_ACTIVITY = RECENT_ACTIVITY.filter((entry) => MY_PROJECT_NAMES.includes(entry.project));

// ── Tabs ──────────────────────────────────────────────────────────────────────

type ReportTab = "delivery" | "team";

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: "delivery", label: "Delivery" },
  { key: "team", label: "Team" },
];

function ReportTabs({ tab, onChange }: { tab: ReportTab; onChange: (t: ReportTab) => void }) {
  return (
    <div className="inline-flex items-center bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
      {REPORT_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={[
            "px-3.5 py-1.5 rounded-[7px] text-sm font-medium transition-all duration-150",
            tab === t.key
              ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm shadow-slate-200/80 dark:shadow-black/40"
              : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const ProjectIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 7l4-4h6l4 4" />
    <rect x="3" y="7" width="18" height="13" rx="2" />
  </svg>
);
const ClockIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);
const PersonIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const PeopleIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const BarsIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M3 6h18M3 12h14M3 18h8" />
  </svg>
);
const BlockedIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);
const PulseIcon = (
  <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectLeadReportsScreen() {
  const [tab, setTab] = useState<ReportTab>("delivery");
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-16">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
          Reports
        </h1>
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Monday, June 30, 2026</p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <ReportTabs tab={tab} onChange={setTab} />
      </div>

      {/* ── Top KPIs — always visible, both tabs ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard label="My Projects" value={MY_PROJECTS.length} sub="active" />
        <KpiCard
          label="Team Capacity"
          value={OVER_CAPACITY_COUNT}
          sub={`of ${TEAM.length} over capacity`}
          danger={OVER_CAPACITY_COUNT > 0}
        />
        <KpiCard
          label="Blocked Tickets"
          value={TOTAL_BLOCKED_TICKETS}
          sub="need attention"
          danger={TOTAL_BLOCKED_TICKETS > 0}
        />
        <KpiCard label="Due This Week" value={TOTAL_DUE_THIS_WEEK} sub="tickets" />
        <KpiCard
          label="Team Utilization"
          value={`${TEAM_UTILIZATION_PCT}%`}
          sub="assigned ÷ capacity"
          progress={TEAM_UTILIZATION_PCT}
          accent
        />
        <KpiCard
          label="Sprint Progress"
          value={`${AVG_PROJECT_PROGRESS}%`}
          sub="avg across projects"
          progress={AVG_PROJECT_PROGRESS}
          accent
        />
      </div>

      {tab === "delivery" && (
        <>
          {/* ── Alerts banner ────────────────────────────────────────────── */}
          <div className="mb-4">
            <ReportStatusBar items={STATUS_ITEMS} />
          </div>

          {/* ── Filters ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 flex-wrap mb-6 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-2.5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mr-2">
              Filter
            </span>
            <FilterDropdown label="Project" mode="multi" groups={PROJECT_GROUPS} selected={projectFilter} onChange={setProjectFilter} />
            <FilterDropdown label="Assignee" mode="multi" groups={ASSIGNEE_GROUPS} selected={assigneeFilter} onChange={setAssigneeFilter} searchable />
            <FilterDropdown label="Status" mode="multi" groups={STATUS_GROUPS} selected={statusFilter} onChange={setStatusFilter} />
            <FilterDropdown label="Priority" mode="multi" groups={PRIORITY_GROUPS} selected={priorityFilter} onChange={setPriorityFilter} />
          </div>

          <div className="space-y-5">
            {/* ── Project Health (+ Progress) ─────────────────────────────── */}
            <Section title="Project Health" count={MY_PROJECTS.length} icon={ProjectIcon}>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800">
                      <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[220px]">
                        Project
                      </th>
                      <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Status
                      </th>
                      <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Health
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Blocked
                      </th>
                      <th className="pb-2.5 pl-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Progress
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                    {MY_PROJECTS.map((project) => (
                      <tr key={project.slug} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-[9px] font-bold text-slate-500 dark:text-zinc-400 flex items-center justify-center flex-shrink-0">
                              {project.shortName}
                            </span>
                            <span className="font-medium text-slate-800 dark:text-zinc-200 truncate">{project.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <StatusBadge status={project.status} />
                        </td>
                        <td className="py-2.5">
                          <HealthBadge health={project.health} />
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {project.blockedTickets > 0 ? (
                            <span className="font-medium text-red-600 dark:text-red-400">{project.blockedTickets}</span>
                          ) : (
                            <span className="text-slate-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-4">
                          <BlockCompletion pct={project.progress} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ── Upcoming Deadlines (replaces Hours Distribution) ────────── */}
            <Section title="Upcoming Deadlines" count={UPCOMING_DEADLINES.length} icon={ClockIcon}>
              <div className="space-y-1">
                {UPCOMING_DEADLINES.map((ticket) => {
                  const isOverdue = parseDue(ticket.dueDate) < TODAY.getTime();
                  return (
                    <div key={ticket.id} className="flex items-center gap-2.5 py-1.5 px-2.5 -mx-2.5 rounded-lg">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-400" : "bg-slate-300 dark:bg-zinc-600"}`} />
                      <span className="flex-1 min-w-0 text-[13px] text-slate-700 dark:text-zinc-300 truncate">
                        {ticket.title}
                      </span>
                      <span className={`text-[11px] font-semibold flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-zinc-400"}`}>
                        {ticket.dueDate}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ── Recent Changes ──────────────────────────────────────────── */}
            <Section title="Recent Changes" icon={ClockIcon}>
              <RecentActivityList items={MY_RECENT_ACTIVITY} />
            </Section>
          </div>
        </>
      )}

      {tab === "team" && (
        <div className="space-y-5">

          {/* ── Team Capacity + Team Utilization ────────────────────────── */}
          <Section title="Team Capacity" icon={PeopleIcon}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard label="Total Capacity" value={<>{TOTAL_CAPACITY_HOURS}<span className="text-base font-medium ml-0.5">h</span></>} sub="per week" />
              <KpiCard label="Assigned" value={<>{TOTAL_ASSIGNED_HOURS}<span className="text-base font-medium ml-0.5">h</span></>} sub="this week" />
              <KpiCard
                label="Team Utilization"
                value={`${TEAM_UTILIZATION_PCT}%`}
                sub={`${OVER_CAPACITY_COUNT} over capacity`}
                progress={TEAM_UTILIZATION_PCT}
                accent
              />
            </div>
          </Section>

          {/* ── Hours by Person ──────────────────────────────────────────── */}
          <Section title="Hours by Person" count={TEAM.length} icon={PersonIcon}>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-zinc-800">
                    <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                      Person
                    </th>
                    <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                      Assigned
                    </th>
                    <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                      Capacity
                    </th>
                    <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                      Utilization
                    </th>
                    <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                      Remaining
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                  {TEAM.map((member) => {
                    const pct = utilizationOf(member);
                    return (
                      <tr key={member.name} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={member.avatar} alt={member.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                            <span className="font-medium text-slate-800 dark:text-zinc-200">{member.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                          {member.assignedHours}h
                        </td>
                        <td className="py-2.5 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                          {member.weeklyCapacity}h
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`font-semibold tabular-nums ${capacityTextColor(pct)}`}>{pct}%</span>
                        </td>
                        <td className="py-2.5 text-right text-xs text-slate-500 dark:text-zinc-400 tabular-nums">
                          {remainingAvailabilityLabel(member)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Workload ─────────────────────────────────────────────────── */}
          <Section title="Workload" icon={BarsIcon}>
            <div className="space-y-4">
              {TEAM.map((member) => {
                const pct = utilizationOf(member);
                return (
                  <div key={member.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={member.avatar} alt={member.name} className="w-5 h-5 rounded-full flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">{member.name}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200 tabular-nums leading-tight">
                        {member.assignedHours}h
                        <span className="font-normal text-slate-400 dark:text-zinc-600">{" / "}{member.weeklyCapacity}h</span>
                        <span className={`ml-2 font-semibold ${capacityTextColor(pct)}`}>{pct}%</span>
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                      <AnimatedBar pct={Math.min(pct, 100)} className={capacityBarColor(pct)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── Blocked Work by Member ───────────────────────────────────── */}
          <Section title="Blocked Work by Member" icon={BlockedIcon}>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-zinc-800">
                    <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                      Member
                    </th>
                    <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                      Blocked Hours
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                  {TEAM.map((member) => {
                    const blocked = blockedHoursOf(member);
                    return (
                      <tr key={member.name} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={member.avatar} alt={member.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                            <span className="font-medium text-slate-800 dark:text-zinc-200">{member.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {blocked > 0 ? (
                            <span className="font-medium text-red-600 dark:text-red-400">{blocked}h</span>
                          ) : (
                            <span className="text-slate-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Team Health ──────────────────────────────────────────────── */}
          <Section title="Team Health" count={TEAM.length} icon={PulseIcon}>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-zinc-800">
                    <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                      Member
                    </th>
                    <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                      Health
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                  {TEAM.map((member) => (
                    <tr key={member.name} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={member.avatar} alt={member.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                          <span className="font-medium text-slate-800 dark:text-zinc-200">{member.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <HealthBadge health={healthOf(member)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}
