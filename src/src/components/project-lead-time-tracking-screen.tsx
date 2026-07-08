"use client";

import { useMemo, useState } from "react";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import { KpiCard, Section } from "@/components/reports-shared";
import {
  PeriodSelector,
  StatusPill,
  CapacityCell,
  formatHours,
  periodSubLabel,
  MEMBER_GROUPS,
  PROJECT_GROUPS,
  CLIENT_GROUPS,
} from "@/components/time-tracking-screen";
import {
  timesheetRows,
  computeSummary,
  computeMissingHours,
  computeProjectHours,
  weeklyCapacityPct,
  statusForPeriod,
  DEFAULT_CUSTOM_RANGE,
} from "@/lib/mock-time-tracking";
import type { CustomRange, TimePeriod, TimesheetRow } from "@/lib/mock-time-tracking";
import { MemberTrigger } from "@/components/member-profile";

// Project Leads manage delivery and team capacity, not company finances — no
// revenue, invoicing, hourly rates, or billing-by-client here. Every widget
// on this page answers a delivery question (who's overloaded, who's missing
// hours, which projects are consuming the most effort), never a financial
// one. See time-tracking-screen.tsx for the Admin/finance version this page
// is deliberately not a filtered copy of.

export function ProjectLeadTimeTrackingScreen() {
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [customRange, setCustomRange] = useState<CustomRange>(DEFAULT_CUSTOM_RANGE);
  const [memberFilter, setMemberFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);

  const rows = timesheetRows;

  const summary = useMemo(
    () => computeSummary(rows, period, customRange),
    [rows, period, customRange]
  );
  const projectHours = useMemo(
    () => computeProjectHours(rows, period, customRange),
    [rows, period, customRange]
  );
  const missingHours = useMemo(
    () => computeMissingHours(rows, period, customRange),
    [rows, period, customRange]
  );
  const overCapacityCount = useMemo(
    () => rows.filter((r) => weeklyCapacityPct(r) > 100).length,
    [rows]
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-16">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
            Time Tracking
          </h1>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Wednesday, July 1, 2026</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} appliedRange={customRange} onApplyRange={setCustomRange} />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-wrap mb-6 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-2.5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mr-2">
          Filter
        </span>
        <FilterDropdown label="Member"  mode="multi"  groups={MEMBER_GROUPS}  selected={memberFilter}  onChange={setMemberFilter} searchable />
        <FilterDropdown label="Project" mode="multi"  groups={PROJECT_GROUPS} selected={projectFilter} onChange={setProjectFilter} />
        <FilterDropdown label="Client"  mode="single" groups={CLIENT_GROUPS}  selected={clientFilter}  onChange={setClientFilter} />
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard label="Logged Hours"       value={formatHours(summary.billableHours)}   sub={periodSubLabel(period, customRange)} accent />
        <KpiCard label="Internal Hours"     value={formatHours(summary.nonBillableHours)} sub={periodSubLabel(period, customRange)} />
        <KpiCard label="Hours Missing"      value={summary.hoursMissing}                  sub="team members" danger={summary.hoursMissing > 0} />
        <KpiCard label="Weekly Utilization" value={`${summary.weeklyUtilizationPct}%`}     sub="of capacity" />
        <KpiCard
          label="Capacity Risk"
          value={overCapacityCount}
          sub="team members overloaded"
          danger={overCapacityCount > 0}
        />
      </div>

      {/* ── Timesheets ───────────────────────────────────────────────────── */}
      <Section
        title="Timesheets"
        count={rows.length}
        icon={
          <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        }
      >
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800">
                <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                  Member
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Today
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Week Total
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Month Total
                </th>
                <th className="pb-2.5 pl-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Capacity
                </th>
                <th className="pb-2.5 pl-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Status
                </th>
                <th className="pb-2.5 pl-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
              {rows.map((row) => (
                <TimesheetTableRow key={row.id} row={row} period={period} customRange={customRange} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Action cards ─────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-5 mt-6">
        <Section
          title="Hours Missing"
          count={missingHours.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          }
        >
          {missingHours.length === 0 ? (
            <p className="text-[13px] text-slate-400 dark:text-zinc-600 py-1">Everyone is caught up for this period.</p>
          ) : (
            <div>
              {missingHours.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
                  <MemberTrigger
                    name={entry.name}
                    avatar={entry.avatar}
                    className="flex items-center gap-2 min-w-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.avatar} alt={entry.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">{entry.name}</p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500">{entry.periodLabel}</p>
                    </div>
                  </MemberTrigger>
                  <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 whitespace-nowrap flex-shrink-0">
                    {formatHours(entry.missingHours)} missing
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Hours by Project"
          count={projectHours.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          }
        >
          <div>
            {projectHours.map((p) => {
              const pct = summary.billableHours + summary.nonBillableHours > 0
                ? Math.round((p.hours / (summary.billableHours + summary.nonBillableHours)) * 100)
                : 0;
              return (
                <div key={p.projectSlug} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">{p.projectName}</p>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                      {formatHours(p.hours)}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums">
                      {pct}% of team time
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}

function TimesheetTableRow({
  row,
  period,
  customRange,
}: {
  row: TimesheetRow;
  period: TimePeriod;
  customRange: CustomRange;
}) {
  const capacityPct = weeklyCapacityPct(row);
  const status = statusForPeriod(row, period, customRange);

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150">
      <td className="py-2.5 pr-4">
        <MemberTrigger
          name={row.name}
          avatar={row.avatar}
          role={row.role}
          projectSlug={row.projectSlugs[0]}
          className="flex items-center gap-2.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.avatar} alt={row.name} className="w-7 h-7 rounded-full flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-slate-800 dark:text-zinc-200 truncate">{row.name}</p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{row.role}</p>
          </div>
        </MemberTrigger>
      </td>
      <td className="py-2.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
        {formatHours(row.hoursToday)}
      </td>
      <td className="py-2.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
        {formatHours(row.hoursWeek)}
      </td>
      <td className="py-2.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
        {formatHours(row.hoursMonth)}
      </td>
      <td className="py-2.5 pl-4 text-right">
        <CapacityCell pct={capacityPct} />
      </td>
      <td className="py-2.5 pl-4 text-right">
        <StatusPill status={status} />
      </td>
      <td className="py-2.5 pl-4 text-right">
        <button
          type="button"
          className="text-[12px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 whitespace-nowrap transition-colors"
        >
          View →
        </button>
      </td>
    </tr>
  );
}
