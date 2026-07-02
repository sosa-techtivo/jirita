"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { KpiCard, Section } from "@/components/reports-shared";
import { useCurrentUser } from "@/components/current-user-provider";
import { ProjectLeadTimeTrackingScreen } from "@/components/project-lead-time-tracking-screen";
import { MemberTrigger } from "@/components/member-profile";
import {
  timesheetRows,
  computeSummary,
  computeClientBilling,
  computeMissingHours,
  billableHoursForPeriod,
  nonBillableHoursForPeriod,
  weeklyCapacityPct,
  hoursForPeriod,
  statusForPeriod,
  DEFAULT_CUSTOM_RANGE,
} from "@/lib/mock-time-tracking";
import type { CustomRange, TimePeriod, TimesheetRow, TimesheetStatus } from "@/lib/mock-time-tracking";

// This module is the operational home for Time Tracking — reviewing today's
// and this week's logged hours and chasing missing entries. There is no
// approval workflow in this MVP; Configuration (working hours, rounding,
// estimation defaults) stays at /settings/time-tracking. See PROJECT_STATUS.md.

// ── Filter groups ─────────────────────────────────────────────────────────────
// Member/Project/Client/Billing filters are interactive but cosmetic — same
// convention as the Reports and Tickets filter bars elsewhere in the app.
// The Period control is the one control that actually recomputes the numbers
// below it (KPI cards + the Billable/Non-Billable columns in the table).

export const MEMBER_GROUPS: DropdownGroup[] = [{
  options: timesheetRows.map((r) => ({ value: r.id, label: r.name, avatar: r.avatar })),
}];

export const PROJECT_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "mobile-banking-app",          label: "Mobile Banking App" },
    { value: "internal-platform-migration", label: "Internal Platform Migration" },
    { value: "customer-support-portal",     label: "Customer Support Portal" },
    { value: "data-warehouse-revamp",        label: "Data Warehouse Revamp" },
    { value: "client-website-redesign",      label: "Client Website Redesign" },
    { value: "marketing-site-relaunch",      label: "Marketing Site Relaunch" },
  ],
}];

export const CLIENT_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "Meridian Bank", label: "Meridian Bank" },
    { value: "RetailCo",      label: "RetailCo" },
    { value: "Internal",      label: "Internal" },
  ],
}];

// "All" is the shared "no filter" sentinel FilterDropdown already recognizes
// for single-select groups (see ANYONE in filter-dropdown.tsx).
// Billable/Non-Billable are cosmetic for now — projects don't yet carry a
// billable flag for time entries to inherit, so there's nothing to filter by.
const BILLING_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "__anyone__",   label: "All" },
    { value: "billable",     label: "Billable" },
    { value: "non-billable", label: "Non-Billable" },
  ],
}];

// Today / This Week / This Month cover the operational cases; Custom Range
// is the escape hatch. Deliberately no Last Month / This Quarter here — those
// stay in Reports → Finance, which is the historical-analysis view. This is
// current-work only.
const PERIOD_OPTIONS: { key: TimePeriod; label: string }[] = [
  { key: "today",  label: "Today" },
  { key: "week",   label: "This Week" },
  { key: "month",  label: "This Month" },
  { key: "custom", label: "Custom Range" },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

function formatRangeLabel(range: CustomRange): string {
  return `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;
}

// Same segmented-pill styling as ViewSwitcher / ReportTabs, and the same
// Custom Range popover UX as Reports → Finance's Billing Period selector:
// selecting a range replaces the button label with the formatted range;
// clicking that label again reopens the popover to adjust it.
export function PeriodSelector({
  value,
  onChange,
  appliedRange,
  onApplyRange,
}: {
  value: TimePeriod;
  onChange: (p: TimePeriod) => void;
  appliedRange: CustomRange;
  onApplyRange: (range: CustomRange) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<CustomRange>(appliedRange);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popoverOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPopoverOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPopoverOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [popoverOpen]);

  function openCustomRange() {
    setDraftRange(appliedRange);
    setPopoverOpen(true);
  }

  function applyCustomRange() {
    onApplyRange(draftRange);
    onChange("custom");
    setPopoverOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-1">
        {PERIOD_OPTIONS.map((option) => {
          const active = option.key === value;
          const isCustom = option.key === "custom";
          const label = isCustom && active ? formatRangeLabel(appliedRange) : option.label;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                if (isCustom) {
                  openCustomRange();
                } else {
                  onChange(option.key);
                  setPopoverOpen(false);
                }
              }}
              className={[
                "text-xs font-medium px-2.5 py-1 rounded-md transition-colors duration-150 whitespace-nowrap",
                active
                  ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Custom date range"
          className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-slate-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 shadow-lg shadow-black/10 dark:shadow-black/40 p-4"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2.5">
            Custom Range
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">From</span>
              <input
                type="date"
                value={draftRange.from}
                onChange={(e) => setDraftRange((r) => ({ ...r, from: e.target.value }))}
                className="w-full text-sm bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-md border border-slate-200 dark:border-zinc-700 px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">To</span>
              <input
                type="date"
                value={draftRange.to}
                onChange={(e) => setDraftRange((r) => ({ ...r, to: e.target.value }))}
                className="w-full text-sm bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-md border border-slate-200 dark:border-zinc-700 px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setPopoverOpen(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyCustomRange}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm shadow-brand-500/30"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<TimesheetStatus, string> = {
  Complete: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  Missing:  "bg-red-50     text-red-700     dark:bg-red-500/10     dark:text-red-400",
};

export function StatusPill({ status }: { status: TimesheetStatus }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

// High = overloaded = bad, same color direction as the Reports Team Workload table.
export function CapacityCell({ pct }: { pct: number }) {
  const cls =
    pct > 100 ? "text-red-600 dark:text-red-400" :
    pct > 85  ? "text-amber-600 dark:text-amber-400" :
                "text-emerald-600 dark:text-emerald-400";
  return <span className={`font-semibold tabular-nums ${cls}`}>{pct}%</span>;
}

export function formatHours(h: number): string {
  return `${Math.round(h * 10) / 10}h`;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

export function periodSubLabel(period: TimePeriod, range: CustomRange): string {
  if (period === "today") return "today";
  if (period === "month") return "this month";
  if (period === "custom") return formatRangeLabel(range);
  return "this week";
}

interface ReferenceColumn {
  label: string;
  value: (row: TimesheetRow) => number;
}

// The table always leads with "Today", then shows the two reference points
// that are most useful for whatever period is selected — e.g. viewing Today
// wants a Yesterday comparison, viewing This Month wants This Week for
// nearer-term context. Both "This Week" and "Week Total" read the same
// underlying hoursWeek figure; the label just changes with intent.
function getReferenceColumns(period: TimePeriod, customRange: CustomRange): ReferenceColumn[] {
  const today:    ReferenceColumn = { label: "Today",      value: (r) => hoursForPeriod(r, "today") };
  const yesterday: ReferenceColumn = { label: "Yesterday", value: (r) => r.hoursYesterday };
  const thisWeek: ReferenceColumn = { label: "This Week",  value: (r) => hoursForPeriod(r, "week") };
  const weekTotal: ReferenceColumn = { label: "Week Total", value: (r) => hoursForPeriod(r, "week") };
  const monthTotal: ReferenceColumn = { label: "Month Total", value: (r) => hoursForPeriod(r, "month") };
  const selectedRange: ReferenceColumn = {
    label: "Selected Range",
    value: (r) => hoursForPeriod(r, "custom", customRange),
  };

  switch (period) {
    case "today":  return [today, yesterday, thisWeek];
    case "month":  return [today, thisWeek, monthTotal];
    case "custom": return [today, selectedRange, monthTotal];
    default:       return [today, weekTotal, monthTotal]; // "week"
  }
}

export function TimeTrackingScreen() {
  const { user } = useCurrentUser();
  const [period, setPeriod]     = useState<TimePeriod>("week");
  const [customRange, setCustomRange] = useState<CustomRange>(DEFAULT_CUSTOM_RANGE);
  const [memberFilter, setMemberFilter]     = useState<string[]>([]);
  const [projectFilter, setProjectFilter]   = useState<string[]>([]);
  const [clientFilter, setClientFilter]     = useState<string[]>([]);
  const [billingFilter, setBillingFilter] = useState<string[]>([]);

  const rows = timesheetRows;

  const summary = useMemo(
    () => computeSummary(rows, period, customRange),
    [rows, period, customRange]
  );
  const clientBilling = useMemo(
    () => computeClientBilling(rows, period, customRange),
    [rows, period, customRange]
  );
  const missingHours = useMemo(
    () => computeMissingHours(rows, period, customRange),
    [rows, period, customRange]
  );
  const referenceColumns = useMemo(() => getReferenceColumns(period, customRange), [period, customRange]);

  // Project Leads manage delivery and team capacity, not company finances —
  // they get a purpose-built page with every billing/revenue concept
  // stripped out instead of a filtered version of this Admin view.
  if (user.role === "PROJECT_LEAD") {
    return <ProjectLeadTimeTrackingScreen />;
  }

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
        <FilterDropdown label="Billing" mode="single" groups={BILLING_GROUPS} selected={billingFilter} onChange={setBillingFilter} />
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <KpiCard label="Billable Hours"     value={formatHours(summary.billableHours)}     sub={periodSubLabel(period, customRange)} accent />
        <KpiCard label="Non-Billable Hours" value={formatHours(summary.nonBillableHours)}   sub={periodSubLabel(period, customRange)} />
        <KpiCard label="Hours Missing"      value={summary.hoursMissing}                    sub="team members" danger={summary.hoursMissing > 0} />
        <KpiCard label="Weekly Utilization" value={`${summary.weeklyUtilizationPct}%`}       sub="of capacity" />
        <KpiCard label="Projected Billing"  value={formatCurrency(summary.projectedBilling)} sub={periodSubLabel(period, customRange)} accent />
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
                {referenceColumns.map((col) => (
                  <th key={col.label} className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                    {col.label}
                  </th>
                ))}
                <th className="pb-2.5 pl-4 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Billable
                </th>
                <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                  Non-Billable
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
                <TimesheetTableRow
                  key={row.id}
                  row={row}
                  period={period}
                  customRange={customRange}
                  referenceColumns={referenceColumns}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Action cards ─────────────────────────────────────────────────── */}
      {/* Operational reminders, not an approval queue — no approve/reject here. */}
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
          title="Billing by Client"
          count={clientBilling.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5-1.343 1.5-3 1.5m0-6V6m0 1c1.11 0 2.08.402 2.599 1M12 8V6m0 8v1m0-1c-1.11 0-2.08-.402-2.599-1M12 15v2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          }
        >
          <div>
            {clientBilling.map((c) => (
              <div key={c.client} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
                <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">{c.client}</p>
                <div className="text-right flex-shrink-0">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                    {formatCurrency(c.projectedBilling)}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums">
                    {formatHours(c.billableHours)} billable
                  </p>
                </div>
              </div>
            ))}
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
  referenceColumns,
}: {
  row: TimesheetRow;
  period: TimePeriod;
  customRange: CustomRange;
  referenceColumns: ReferenceColumn[];
}) {
  const billable = billableHoursForPeriod(row, period, customRange);
  const nonBillable = nonBillableHoursForPeriod(row, period, customRange);
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
      {referenceColumns.map((col) => (
        <td key={col.label} className="py-2.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
          {formatHours(col.value(row))}
        </td>
      ))}
      <td className="py-2.5 pl-4 text-right tabular-nums font-semibold text-slate-800 dark:text-zinc-200">
        {formatHours(billable)}
      </td>
      <td className="py-2.5 text-right tabular-nums text-slate-500 dark:text-zinc-400">
        {formatHours(nonBillable)}
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
          Review →
        </button>
      </td>
    </tr>
  );
}
