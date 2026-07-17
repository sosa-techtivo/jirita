"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { KpiCard, Section } from "@/components/reports-shared";
import { SkeletonBlock } from "@/components/dashboard-shared";
import { useCurrentUser } from "@/components/current-user-provider";
import { ProjectLeadTimeTrackingScreen } from "@/components/project-lead-time-tracking-screen";
import { MemberTrigger } from "@/components/member-profile";
import { getTodayISO } from "@/components/tickets/ticket-ui";
import { ROLE_LABELS } from "@/lib/current-user";
import { periodDisplayLabel } from "@/lib/mock-time-tracking";
import type { CustomRange, TimePeriod, TimesheetStatus } from "@/lib/mock-time-tracking";
import type { Ticket } from "@/lib/mock-tickets";
import type { ProjectSummary } from "@/lib/mock-projects";
import type { User } from "@/lib/mock-users";
import { loadOrganizationTickets, loadOrganizationLoggedTimeForRange } from "@/lib/tickets";
import type { OrganizationTimeEntry } from "@/lib/tickets";
import { loadOrganizationProjects, loadOrganizationMemberWeeklyCapacities } from "@/lib/projects";
import type { MemberWeeklyCapacityEntry } from "@/lib/projects";
import { loadOrganizationUsers } from "@/lib/users";
import {
  buildFinanceKpiSummary,
  buildBillingOverviewRows,
  buildBillableHoursByMemberRows,
} from "@/components/reports-screen";

// This module is the operational home for Time Tracking — reviewing today's
// and this week's logged hours and chasing missing entries. There is no
// approval workflow in this MVP; Configuration (working hours, rounding,
// estimation defaults) stays at /settings/time-tracking. See PROJECT_STATUS.md.
//
// Real data source: real tickets/projects/active-users/weekly-capacities are
// fetched once per organization (independent of the Period selector — Today/
// This Week/This Month are all fetched up front so switching between them is
// instant); a Custom Range is fetched separately, only when selected.
// Billable/non-billable and Projected Billing reuse Reports → Finance's own
// buildFinanceKpiSummary/buildBillingOverviewRows/buildBillableHoursByMemberRows
// verbatim (project category is the only source of billability, same rule,
// never a second implementation of it).

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[time-tracking]", ...args);
}

// ── Filter groups ─────────────────────────────────────────────────────────────
// Billing is real now — project.category is a closed 2-value domain, so
// this stays a fixed 3-option list ("All" plus the 2 real categories)
// rather than a catalog derived from data, same convention as the Hours
// filter's fixed buckets in Reports.
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

// Real page-header date — same "Weekday, Month Day, Year" convention (and
// the same real getTodayISO() source) as the Dashboard/Reports headers.
function formatHeaderDate(todayISO: string): string {
  return new Date(`${todayISO}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Real data helpers ────────────────────────────────────────────────────────

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Monday–Sunday bounds of the real current calendar week, inclusive — same
// "real current date, not the selected period" convention as Reports'
// getCurrentWeekBounds, just inclusive-end since loadOrganizationLoggedTimeForRange
// filters work_date with .lte, not a timestamptz .lt.
export function getCurrentWeekRange(): CustomRange {
  const today = new Date(`${getTodayISO()}T00:00:00`);
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toISODate(monday), to: toISODate(sunday) };
}

export function getCurrentMonthRange(): CustomRange {
  const [y, m] = getTodayISO().split("-").map(Number);
  return { from: toISODate(new Date(y, m - 1, 1)), to: toISODate(new Date(y, m, 0)) };
}

// Same "hours per weekday" capacity model the Custom Range estimate used
// before this screen was real, just now applied to a real weeklyCapacity
// and real logged hours instead of a mock row's static fields.
function countWeekdays(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const end = new Date(ty, tm - 1, td);
  let cur = new Date(fy, fm - 1, fd);
  let count = 0;
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return count;
}

const MONTH_WEEKS = 4.33;

export function expectedHoursForPeriod(weeklyCapacity: number, period: TimePeriod, customRange: CustomRange): number {
  const dailyRate = weeklyCapacity / 5;
  if (period === "today") return dailyRate;
  if (period === "week") return weeklyCapacity;
  if (period === "month") return weeklyCapacity * MONTH_WEEKS;
  return dailyRate * countWeekdays(customRange.from, customRange.to);
}

// A member's logged minutes for a project/client/billing-filtered ticket set,
// further restricted to the selected Member filter (when any) — the one
// scoping rule every widget on this page shares, so Billing by Client,
// Hours Missing, and the Timesheets table can never disagree about "what's
// in scope right now."
export function scopeEntries(
  entries: OrganizationTimeEntry[],
  ticketIds: Set<string>,
  memberIds: string[]
): OrganizationTimeEntry[] {
  const memberSet = memberIds.length > 0 ? new Set(memberIds) : null;
  return entries.filter((e) => {
    if (!ticketIds.has(e.ticketId)) return false;
    if (memberSet && (!e.loggedBy || !memberSet.has(e.loggedBy))) return false;
    return true;
  });
}

export function hoursByMember(entries: OrganizationTimeEntry[]): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const e of entries) {
    if (!e.loggedBy) continue;
    minutes.set(e.loggedBy, (minutes.get(e.loggedBy) ?? 0) + e.minutes);
  }
  const hours = new Map<string, number>();
  for (const [id, m] of minutes) hours.set(id, round1(m / 60));
  return hours;
}

export function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

// The row shape the table/section widgets render — every figure already
// resolved for the currently selected period/filters, so the renderers
// below just display fields instead of re-deriving them.
interface TimesheetViewRow {
  id: string;
  name: string;
  avatar: string;
  role: string;
  projectSlug?: string;
  hoursToday: number;
  hoursYesterday: number;
  hoursWeek: number;
  hoursMonth: number;
  hoursSelected: number;
  billableHours: number;
  nonBillableHours: number;
  capacityPct: number;
  status: TimesheetStatus;
}

interface ReferenceColumn {
  label: string;
  value: (row: TimesheetViewRow) => number;
}

// The table always leads with "Today", then shows the two reference points
// that are most useful for whatever period is selected — e.g. viewing Today
// wants a Yesterday comparison, viewing This Month wants This Week for
// nearer-term context.
function getReferenceColumns(period: TimePeriod): ReferenceColumn[] {
  const today:        ReferenceColumn = { label: "Today",         value: (r) => r.hoursToday };
  const yesterday:     ReferenceColumn = { label: "Yesterday",     value: (r) => r.hoursYesterday };
  const thisWeek:      ReferenceColumn = { label: "This Week",     value: (r) => r.hoursWeek };
  const weekTotal:     ReferenceColumn = { label: "Week Total",    value: (r) => r.hoursWeek };
  const monthTotal:    ReferenceColumn = { label: "Month Total",   value: (r) => r.hoursMonth };
  const selectedRange: ReferenceColumn = { label: "Selected Range", value: (r) => r.hoursSelected };

  switch (period) {
    case "today":  return [today, yesterday, thisWeek];
    case "month":  return [today, thisWeek, monthTotal];
    case "custom": return [today, selectedRange, monthTotal];
    default:       return [today, weekTotal, monthTotal]; // "week"
  }
}

export function TimeTrackingScreen() {
  const { user, organization } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Filter/period state — seeded from the URL so it survives a refresh or
  //    a navigate-away-and-back, then kept in sync back to the URL below. ──
  const [period, setPeriod] = useState<TimePeriod>(() => {
    const p = searchParams.get("period");
    return p === "today" || p === "week" || p === "month" || p === "custom" ? p : "week";
  });
  const [customRange, setCustomRange] = useState<CustomRange>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    return from && to ? { from, to } : { from: getTodayISO(-13), to: getTodayISO() };
  });
  const [memberFilter, setMemberFilter]   = useState<string[]>(() => parseListParam(searchParams.get("members")));
  const [projectFilter, setProjectFilter] = useState<string[]>(() => parseListParam(searchParams.get("projects")));
  const [clientFilter, setClientFilter]   = useState<string[]>(() => parseListParam(searchParams.get("client")));
  const [billingFilter, setBillingFilter] = useState<string[]>(() => parseListParam(searchParams.get("billing")));

  useEffect(() => {
    const params = new URLSearchParams();
    if (period !== "week") params.set("period", period);
    if (period === "custom") {
      params.set("from", customRange.from);
      params.set("to", customRange.to);
    }
    if (memberFilter.length > 0)  params.set("members", memberFilter.join(","));
    if (projectFilter.length > 0) params.set("projects", projectFilter.join(","));
    if (clientFilter.length > 0)  params.set("client", clientFilter.join(","));
    if (billingFilter.length > 0) params.set("billing", billingFilter.join(","));

    const qs = params.toString();
    if (qs === searchParams.toString()) return;
    router.replace(`/time-tracking${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [period, customRange, memberFilter, projectFilter, clientFilter, billingFilter, router, searchParams]);

  // ── Real data load — tickets/projects/active users/weekly capacities plus
  //    the fixed Today/Yesterday/This Week/This Month time-entry ranges are
  //    all fetched once per organization; a Custom Range is fetched
  //    separately below, only when selected. ──────────────────────────────
  const [rawTickets, setRawTickets]     = useState<Ticket[]>([]);
  const [rawProjects, setRawProjects]   = useState<ProjectSummary[]>([]);
  const [rawUsers, setRawUsers]         = useState<User[]>([]);
  const [rawCapacities, setRawCapacities] = useState<MemberWeeklyCapacityEntry[]>([]);
  const [entriesToday, setEntriesToday]         = useState<OrganizationTimeEntry[]>([]);
  const [entriesYesterday, setEntriesYesterday] = useState<OrganizationTimeEntry[]>([]);
  const [entriesWeek, setEntriesWeek]           = useState<OrganizationTimeEntry[]>([]);
  const [entriesMonth, setEntriesMonth]         = useState<OrganizationTimeEntry[]>([]);
  const [entriesCustom, setEntriesCustom]       = useState<OrganizationTimeEntry[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRequestId, setLoadRequestId] = useState(0);
  // Custom Range's own loading flag — kept separate from `loadState` (never
  // added to the effect below's own dependency array) since that effect
  // already depends on `loadState` itself; folding a Custom-Range-only
  // loading signal into that same state would make the effect re-run
  // (and re-cancel/cancel-itself) purely because of its own state update.
  const [customRangeLoading, setCustomRangeLoading] = useState(false);

  const isProjectLead = user.role === "PROJECT_LEAD";

  useEffect(() => {
    // Project Leads get their own purpose-built page (see the early return
    // below) with every billing/finance concept stripped out — never fetch
    // this org-wide Admin/Member data for them.
    if (!organization || isProjectLead) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: every data-dependent block below must show its own skeleton again the instant this effect re-runs — on mount and on tab-regain (organization gets a new reference from current-user-provider.tsx's existing focus listener, the same real refresh-on-focus mechanism the Dashboards/Projects/My Work/Reports already rely on) — same "reset before the async fetch resolves" pattern used elsewhere in this app.
    setLoadState("loading");

    (async () => {
      const [ticketsResult, projectsResult, usersResult, capacitiesResult] = await Promise.all([
        loadOrganizationTickets(organization.id),
        loadOrganizationProjects(organization.id),
        loadOrganizationUsers(organization.id),
        loadOrganizationMemberWeeklyCapacities(organization.id),
      ]);
      if (cancelled) return;

      if (ticketsResult.status === "error") { setLoadState("error"); setLoadError(ticketsResult.message); return; }
      if (projectsResult.status === "error") { setLoadState("error"); setLoadError(projectsResult.message); return; }
      if (usersResult.status === "error") { setLoadState("error"); setLoadError(usersResult.message); return; }
      if (capacitiesResult.status === "error") { setLoadState("error"); setLoadError(capacitiesResult.message); return; }

      const ticketIds = ticketsResult.tickets.map((t) => t.id);
      const todayISO = getTodayISO();
      const yesterdayISO = getTodayISO(-1);
      const week = getCurrentWeekRange();
      const month = getCurrentMonthRange();

      const [todayResult, yesterdayResult, weekResult, monthResult] = await Promise.all([
        loadOrganizationLoggedTimeForRange(ticketIds, todayISO, todayISO),
        loadOrganizationLoggedTimeForRange(ticketIds, yesterdayISO, yesterdayISO),
        loadOrganizationLoggedTimeForRange(ticketIds, week.from, week.to),
        loadOrganizationLoggedTimeForRange(ticketIds, month.from, month.to),
      ]);
      if (cancelled) return;

      if (todayResult.status === "error") { setLoadState("error"); setLoadError(todayResult.message); return; }
      if (yesterdayResult.status === "error") { setLoadState("error"); setLoadError(yesterdayResult.message); return; }
      if (weekResult.status === "error") { setLoadState("error"); setLoadError(weekResult.message); return; }
      if (monthResult.status === "error") { setLoadState("error"); setLoadError(monthResult.message); return; }

      setRawTickets(ticketsResult.tickets);
      setRawProjects(projectsResult.projects);
      setRawUsers(usersResult.users);
      setRawCapacities(capacitiesResult.capacities);
      setEntriesToday(todayResult.entries);
      setEntriesYesterday(yesterdayResult.entries);
      setEntriesWeek(weekResult.entries);
      setEntriesMonth(monthResult.entries);
      setLoadState("ready");
    })();

    return () => { cancelled = true; };
  }, [organization, isProjectLead, loadRequestId]);

  // Custom Range has no fixed window, so it's fetched on its own — only
  // once the core load above is ready, and only while Custom Range is
  // actually selected.
  useEffect(() => {
    if (!organization || isProjectLead) return;
    if (period !== "custom" || loadState !== "ready") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: shows the same skeleton again while a new Custom Range is fetched, mirroring the main effect above — `customRangeLoading` is never a dependency of this effect, so this can't cause it to re-run itself.
    setCustomRangeLoading(true);
    const ticketIds = rawTickets.map((t) => t.id);

    (async () => {
      const result = await loadOrganizationLoggedTimeForRange(ticketIds, customRange.from, customRange.to);
      if (cancelled) return;
      if (result.status === "error") {
        logDev("custom range time entries query failed", result.message);
        setCustomRangeLoading(false);
        return;
      }
      setEntriesCustom(result.entries);
      setCustomRangeLoading(false);
    })();

    return () => { cancelled = true; };
  }, [organization, isProjectLead, period, customRange, loadState, rawTickets]);

  // ── Real member roster — active org members only, same "active" scope
  //    Hours Missing/Timesheets are meant to cover. ──────────────────────
  const activeMembers = useMemo(
    () =>
      rawUsers
        .filter((u) => u.status === "Active")
        .map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`.trim() || "Unnamed",
          avatar: u.avatar,
          role: ROLE_LABELS[u.role],
          projectSlugs: u.projectSlugs,
        })),
    [rawUsers]
  );

  const visibleMembers = useMemo(() => {
    if (memberFilter.length === 0) return activeMembers;
    const selected = new Set(memberFilter);
    return activeMembers.filter((m) => selected.has(m.id));
  }, [activeMembers, memberFilter]);

  const capacityByMember = useMemo(
    () => new Map(rawCapacities.map((c) => [c.profileId, c.weeklyCapacity])),
    [rawCapacities]
  );

  // ── Project/Client/Billing scoping — narrows the ticket set every
  //    time-entry aggregate below reads from, so Project/Client reach every
  //    KPI/section on the page. Billing is intentionally excluded from
  //    capacityTicketIds below: capacity-based metrics (Hours Missing,
  //    Weekly Utilization, Timesheet Capacity %/Status) always use total
  //    logged hours regardless of billable/non-billable, per Team's own
  //    capacity/workload convention — only billingTicketIds (which also
  //    applies the Billing filter) feeds the Finance-reused calculations. ─
  const projectBySlug = useMemo(() => new Map(rawProjects.map((p) => [p.slug, p])), [rawProjects]);

  const billingTicketIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of rawTickets) {
      if (projectFilter.length > 0 && !projectFilter.includes(t.projectSlug)) continue;
      const project = projectBySlug.get(t.projectSlug);
      if (clientFilter.length > 0) {
        const client = project?.client as string | undefined;
        if (project?.category !== "client" || client !== clientFilter[0]) continue;
      }
      if (billingFilter.length > 0 && billingFilter[0] !== "__anyone__") {
        const wantBillable = billingFilter[0] === "billable";
        const isBillable = project?.category === "client";
        if (wantBillable !== isBillable) continue;
      }
      ids.add(t.id);
    }
    return ids;
  }, [rawTickets, projectBySlug, projectFilter, clientFilter, billingFilter]);

  const capacityTicketIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of rawTickets) {
      if (projectFilter.length > 0 && !projectFilter.includes(t.projectSlug)) continue;
      const project = projectBySlug.get(t.projectSlug);
      if (clientFilter.length > 0) {
        const client = project?.client as string | undefined;
        if (project?.category !== "client" || client !== clientFilter[0]) continue;
      }
      ids.add(t.id);
    }
    return ids;
  }, [rawTickets, projectBySlug, projectFilter, clientFilter]);

  const scopedToday     = useMemo(() => scopeEntries(entriesToday, capacityTicketIds, memberFilter), [entriesToday, capacityTicketIds, memberFilter]);
  const scopedYesterday = useMemo(() => scopeEntries(entriesYesterday, capacityTicketIds, memberFilter), [entriesYesterday, capacityTicketIds, memberFilter]);
  const scopedWeek      = useMemo(() => scopeEntries(entriesWeek, capacityTicketIds, memberFilter), [entriesWeek, capacityTicketIds, memberFilter]);
  const scopedMonth     = useMemo(() => scopeEntries(entriesMonth, capacityTicketIds, memberFilter), [entriesMonth, capacityTicketIds, memberFilter]);
  const scopedCustom    = useMemo(() => scopeEntries(entriesCustom, capacityTicketIds, memberFilter), [entriesCustom, capacityTicketIds, memberFilter]);

  const todayHours     = useMemo(() => hoursByMember(scopedToday), [scopedToday]);
  const yesterdayHours = useMemo(() => hoursByMember(scopedYesterday), [scopedYesterday]);
  const weekHours      = useMemo(() => hoursByMember(scopedWeek), [scopedWeek]);
  const monthHours     = useMemo(() => hoursByMember(scopedMonth), [scopedMonth]);
  const customHours    = useMemo(() => hoursByMember(scopedCustom), [scopedCustom]);

  // Billing-scoped (Project/Client/Billing + Member) entries for whichever
  // period is selected — kept separate from the capacity-scoped scopedX
  // above so the Billing filter only ever reaches the Finance-reused calcs
  // below, never Hours Missing/Weekly Utilization/Capacity %/Status.
  const entriesForSelectedPeriod = useMemo(() => {
    const raw =
      period === "today" ? entriesToday :
      period === "month" ? entriesMonth :
      period === "custom" ? entriesCustom :
      entriesWeek;
    return scopeEntries(raw, billingTicketIds, memberFilter);
  }, [period, entriesToday, entriesWeek, entriesMonth, entriesCustom, billingTicketIds, memberFilter]);

  // Reused verbatim from Reports → Finance — project category is the only
  // billability signal, never re-derived here.
  const financeSummary = useMemo(
    () => buildFinanceKpiSummary(rawTickets, rawProjects, entriesForSelectedPeriod),
    [rawTickets, rawProjects, entriesForSelectedPeriod]
  );

  const billingByMember = useMemo(() => {
    const rows = buildBillableHoursByMemberRows(
      rawTickets,
      rawProjects,
      entriesForSelectedPeriod,
      visibleMembers.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }))
    );
    return new Map(rows.map((r) => [r.id, r]));
  }, [rawTickets, rawProjects, entriesForSelectedPeriod, visibleMembers]);

  const clientBillingRows = useMemo(
    () =>
      buildBillingOverviewRows(rawTickets, rawProjects, entriesForSelectedPeriod)
        .filter((r) => r.id !== "internal" && r.billableHours > 0)
        .map((r) => ({ client: r.client, billableHours: r.billableHours, projectedBilling: r.estimatedInvoice })),
    [rawTickets, rawProjects, entriesForSelectedPeriod]
  );

  // ── Per-row view models — every KPI/section below reads from these, never
  //    re-deriving its own figures. ──────────────────────────────────────
  const viewRows = useMemo<TimesheetViewRow[]>(() => {
    return visibleMembers.map((m): TimesheetViewRow => {
      const hoursToday     = todayHours.get(m.id) ?? 0;
      const hoursYesterday = yesterdayHours.get(m.id) ?? 0;
      const hoursWeek      = weekHours.get(m.id) ?? 0;
      const hoursMonth     = monthHours.get(m.id) ?? 0;
      const hoursSelected =
        period === "today" ? hoursToday :
        period === "month" ? hoursMonth :
        period === "custom" ? (customHours.get(m.id) ?? 0) :
        hoursWeek;

      const weeklyCapacity = capacityByMember.get(m.id) ?? 0;
      const capacityPct = weeklyCapacity > 0 ? Math.round((hoursWeek / weeklyCapacity) * 100) : 0;
      const expected = expectedHoursForPeriod(weeklyCapacity, period, customRange);
      const status: TimesheetStatus = hoursSelected + 0.01 < expected ? "Missing" : "Complete";

      const billing = billingByMember.get(m.id);

      return {
        id: m.id,
        name: m.name,
        avatar: m.avatar,
        role: m.role,
        projectSlug: m.projectSlugs[0],
        hoursToday,
        hoursYesterday,
        hoursWeek,
        hoursMonth,
        hoursSelected,
        billableHours: billing?.billableHours ?? 0,
        nonBillableHours: billing?.nonBillableHours ?? 0,
        capacityPct,
        status,
      };
    });
  }, [visibleMembers, todayHours, yesterdayHours, weekHours, monthHours, customHours, capacityByMember, billingByMember, period, customRange]);

  // Real scope handoff for every Member Profile Modal trigger below
  // (Timesheets, Members Missing Hours) — reuses the existing Project
  // filter's own real selection (the same one already narrowing
  // capacityTicketIds/billingTicketIds above), never a new interpretation
  // of "scope": exactly one project selected means this page's own rows are
  // already reading that one project's own tickets/team, so the modal
  // should fetch that same project-scoped data; zero or 2+ selected means
  // this page is already aggregating across more than one project, so the
  // modal aggregates org-wide too (its own existing no-slug mode) rather
  // than arbitrarily picking one project out of a member's own real
  // `projectSlugs` list.
  const timeTrackingProjectSlug = projectFilter.length === 1 ? projectFilter[0] : undefined;

  const missingHoursList = useMemo(() => {
    return viewRows
      .filter((r) => r.status === "Missing")
      .map((r) => {
        const weeklyCapacity = capacityByMember.get(r.id) ?? 0;
        const expected = expectedHoursForPeriod(weeklyCapacity, period, customRange);
        return {
          id: r.id,
          name: r.name,
          avatar: r.avatar,
          periodLabel: periodDisplayLabel(period),
          missingHours: round1(Math.max(0, expected - r.hoursSelected)),
        };
      })
      .sort((a, b) => b.missingHours - a.missingHours);
  }, [viewRows, capacityByMember, period, customRange]);

  // Always week-based, independent of the selected period — same real
  // weekHours/capacity source the table's own Capacity column reads, and
  // the same "Return 0% when capacity is zero" rule as every other real
  // utilization calculation in this app.
  const weeklyUtilizationPct = useMemo(() => {
    let totalWeekHours = 0;
    let totalCapacity = 0;
    for (const r of viewRows) {
      totalWeekHours += r.hoursWeek;
      totalCapacity += capacityByMember.get(r.id) ?? 0;
    }
    return totalCapacity > 0 ? Math.round((totalWeekHours / totalCapacity) * 100) : 0;
  }, [viewRows, capacityByMember]);

  const summary = {
    billableHours: financeSummary.billableHours,
    nonBillableHours: financeSummary.nonBillableHours,
    hoursMissing: missingHoursList.length,
    weeklyUtilizationPct,
    projectedBilling: financeSummary.estimatedRevenue,
  };

  const referenceColumns = useMemo(() => getReferenceColumns(period), [period]);

  // ── Real filter option lists ────────────────────────────────────────────
  const memberGroups = useMemo<DropdownGroup[]>(() => {
    const options = activeMembers.map((m) => ({ value: m.id, label: m.name, avatar: m.avatar }));
    return options.length === 0 ? [] : [{ options }];
  }, [activeMembers]);

  const projectGroups = useMemo<DropdownGroup[]>(() => {
    const options = rawProjects.map((p) => ({ value: p.slug, label: p.name }));
    return options.length === 0 ? [] : [{ options }];
  }, [rawProjects]);

  const clientGroups = useMemo<DropdownGroup[]>(() => {
    const clients = Array.from(
      new Set(
        rawProjects
          .filter((p) => p.category === "client")
          .map((p) => p.client as string | undefined)
          .filter((c): c is string => Boolean(c))
      )
    );
    return clients.length === 0 ? [] : [{ options: clients.map((c) => ({ value: c, label: c })) }];
  }, [rawProjects]);

  // Project Leads manage delivery and team capacity, not company finances —
  // they get a purpose-built page with every billing/revenue concept
  // stripped out instead of a filtered version of this Admin view.
  if (isProjectLead) {
    return <ProjectLeadTimeTrackingScreen />;
  }

  if (loadState === "error") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-6 pb-16">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load time tracking</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {loadError ?? "Something went wrong."}
          </p>
          <button
            type="button"
            onClick={() => setLoadRequestId((id) => id + 1)}
            className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Every data-dependent block below (Overview KPIs, Timesheets, Members
  // Missing Hours, Billing by Client) gates on this — header/period
  // selector/filters below are never gated by it, so they stay visible and
  // operative through the very first load, a Billing Period/filter change,
  // and a tab-regain refresh alike.
  const isLoading = loadState === "loading" || customRangeLoading;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-16">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
            Time Tracking
          </h1>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{formatHeaderDate(getTodayISO())}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} appliedRange={customRange} onApplyRange={setCustomRange} />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-wrap mb-6 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-2.5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mr-2">
          Filter
        </span>
        <FilterDropdown label="Member"  mode="multi"  groups={memberGroups}  selected={memberFilter}  onChange={setMemberFilter} searchable />
        <FilterDropdown label="Project" mode="multi"  groups={projectGroups} selected={projectFilter} onChange={setProjectFilter} />
        <FilterDropdown label="Client"  mode="single" groups={clientGroups}  selected={clientFilter}  onChange={setClientFilter} />
        <FilterDropdown label="Billing" mode="single" groups={BILLING_GROUPS} selected={billingFilter} onChange={setBillingFilter} />
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-5 pt-4 pb-4 shadow-sm shadow-slate-200/40 dark:shadow-black/20"
            >
              <SkeletonBlock className="h-[10px] w-20 mb-2" />
              <SkeletonBlock className="h-6 w-14 mb-1.5" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          <KpiCard label="Billable Hours"     value={formatHours(summary.billableHours)}     sub={periodSubLabel(period, customRange)} accent />
          <KpiCard label="Non-Billable Hours" value={formatHours(summary.nonBillableHours)}   sub={periodSubLabel(period, customRange)} />
          <KpiCard label="Missing Hours"         value={summary.hoursMissing}                 sub="team members" danger={summary.hoursMissing > 0} />
          <KpiCard label="Weekly Utilization" value={`${summary.weeklyUtilizationPct}%`}       sub="of capacity" />
          <KpiCard label="Projected Billing"  value={formatCurrency(summary.projectedBilling)} sub={periodSubLabel(period, customRange)} accent />
        </div>
      )}

      {/* ── Timesheets ───────────────────────────────────────────────────── */}
      <Section
        title="Timesheets"
        count={isLoading ? undefined : viewRows.length}
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
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <SkeletonBlock className="h-7 w-7 rounded-full flex-shrink-0" />
                        <div className="min-w-0">
                          <SkeletonBlock className="h-4 w-28 mb-1" />
                          <SkeletonBlock className="h-3 w-16" />
                        </div>
                      </div>
                    </td>
                    {referenceColumns.map((col) => (
                      <td key={col.label} className="py-2.5 text-right">
                        <SkeletonBlock className="h-4 w-10 ml-auto" />
                      </td>
                    ))}
                    <td className="py-2.5 pl-4 text-right"><SkeletonBlock className="h-4 w-10 ml-auto" /></td>
                    <td className="py-2.5 text-right"><SkeletonBlock className="h-4 w-10 ml-auto" /></td>
                    <td className="py-2.5 pl-4 text-right"><SkeletonBlock className="h-4 w-10 ml-auto" /></td>
                    <td className="py-2.5 pl-4 text-right"><SkeletonBlock className="h-5 w-16 ml-auto rounded-full" /></td>
                    <td className="py-2.5 pl-4 text-right"><SkeletonBlock className="h-4 w-14 ml-auto" /></td>
                  </tr>
                ))
              ) : (
                viewRows.map((row) => (
                  <TimesheetTableRow
                    key={row.id}
                    row={row}
                    referenceColumns={referenceColumns}
                    modalProjectSlug={timeTrackingProjectSlug}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Action cards ─────────────────────────────────────────────────── */}
      {/* Operational reminders, not an approval queue — no approve/reject here. */}
      <div className="grid md:grid-cols-2 gap-5 mt-6">
        <Section
          title="Members Missing Hours"
          count={isLoading ? undefined : missingHoursList.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          }
        >
          {isLoading ? (
            <div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <SkeletonBlock className="h-6 w-6 rounded-full flex-shrink-0" />
                    <div className="min-w-0">
                      <SkeletonBlock className="h-[13px] w-24 mb-1" />
                      <SkeletonBlock className="h-[11px] w-16" />
                    </div>
                  </div>
                  <SkeletonBlock className="h-[11px] w-14 flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : missingHoursList.length === 0 ? (
            <p className="text-[13px] text-slate-400 dark:text-zinc-600 py-1">Everyone is caught up for this period.</p>
          ) : (
            <div>
              {missingHoursList.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
                  <MemberTrigger
                    name={entry.name}
                    avatar={entry.avatar}
                    profileId={entry.id}
                    projectSlug={timeTrackingProjectSlug}
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
          count={isLoading ? undefined : clientBillingRows.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5-1.343 1.5-3 1.5m0-6V6m0 1c1.11 0 2.08.402 2.599 1M12 8V6m0 8v1m0-1c-1.11 0-2.08-.402-2.599-1M12 15v2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          }
        >
          {isLoading ? (
            <div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
                  <SkeletonBlock className="h-[13px] w-24" />
                  <div className="text-right flex-shrink-0">
                    <SkeletonBlock className="h-[13px] w-16 mb-1 ml-auto" />
                    <SkeletonBlock className="h-[11px] w-20 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {clientBillingRows.map((c) => (
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
          )}
        </Section>
      </div>
    </div>
  );
}

function TimesheetTableRow({
  row,
  referenceColumns,
  modalProjectSlug,
}: {
  row: TimesheetViewRow;
  referenceColumns: ReferenceColumn[];
  /** Real scope handoff for this row's own Member Profile Modal trigger —
   *  see the parent's own `timeTrackingProjectSlug` comment. Deliberately
   *  not `row.projectSlug` (that field is only the first of this member's
   *  possibly-several real `projectSlugs`, kept solely for "View Work
   *  History"'s own single-project link below, not a real "this page is
   *  scoped to one project" signal). */
  modalProjectSlug?: string;
}) {
  const router = useRouter();

  const goToWorkHistory = useCallback(() => {
    if (!row.projectSlug) return;
    router.push(`/projects/${row.projectSlug}/team/${row.id}/work-history`);
  }, [router, row.projectSlug, row.id]);

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150">
      <td className="py-2.5 pr-4">
        <MemberTrigger
          name={row.name}
          avatar={row.avatar}
          role={row.role}
          profileId={row.id}
          projectSlug={modalProjectSlug}
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
        {formatHours(row.billableHours)}
      </td>
      <td className="py-2.5 text-right tabular-nums text-slate-500 dark:text-zinc-400">
        {formatHours(row.nonBillableHours)}
      </td>
      <td className="py-2.5 pl-4 text-right">
        <CapacityCell pct={row.capacityPct} />
      </td>
      <td className="py-2.5 pl-4 text-right">
        <StatusPill status={row.status} />
      </td>
      <td className="py-2.5 pl-4 text-right">
        <button
          type="button"
          onClick={goToWorkHistory}
          className="text-[12px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 whitespace-nowrap transition-colors"
        >
          Review →
        </button>
      </td>
    </tr>
  );
}
