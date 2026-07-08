// Mock data backing the /time-tracking operational module. Kept separate from
// mock-team.ts (which is per-project staffing) since this screen aggregates
// one row per person across all of their projects.

import { getProjectBySlug } from "@/lib/mock-projects";

export type TimesheetStatus = "Complete" | "Missing";
export type TimePeriod = "today" | "week" | "month" | "custom";

export interface CustomRange {
  from: string; // yyyy-mm-dd, native <input type="date"> format
  to: string;
}

// Pre-filled with a plausible recent range so Apply produces a sensible
// result even if nobody touches the fields.
export const DEFAULT_CUSTOM_RANGE: CustomRange = { from: "2026-06-15", to: "2026-06-28" };

export interface TimesheetRow {
  id: string;
  name: string;
  avatar: string;
  role: string;
  /** References ProjectSummary.slug in mock-projects.ts */
  projectSlugs: string[];
  client: string;
  hoursYesterday: number;
  hoursToday: number;
  hoursWeek: number;
  hoursMonth: number;
  /** Share of logged hours that are billable, applied uniformly across periods. */
  billableRatio: number;
  hourlyRate: number;
  weeklyCapacity: number;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

// There is no approval workflow — whether someone shows as "Complete" or
// "Missing" is derived purely from logged vs. expected hours for whatever
// period is selected (see isMissing / statusForPeriod below), not a stored
// field. Sarah, Marcus and Jordan are caught up everywhere; Priya and Elena
// have a monthly shortfall despite being current day-to-day/week-to-week;
// David is behind across every period.
export const timesheetRows: TimesheetRow[] = [
  {
    id: "tt-sarah",
    name: "Sarah Chen",
    avatar: avatar(47),
    role: "Project Lead",
    projectSlugs: ["mobile-banking-app"],
    client: "Meridian Bank",
    hoursYesterday: 7,
    hoursToday: 8,
    hoursWeek: 41,
    hoursMonth: 178,
    billableRatio: 0.9,
    hourlyRate: 145,
    weeklyCapacity: 40,
  },
  {
    id: "tt-marcus",
    name: "Marcus Lee",
    avatar: avatar(12),
    role: "Tech Lead",
    projectSlugs: ["mobile-banking-app", "internal-platform-migration"],
    client: "Meridian Bank",
    hoursYesterday: 7.5,
    hoursToday: 8.5,
    hoursWeek: 41,
    hoursMonth: 180,
    billableRatio: 0.8,
    hourlyRate: 150,
    weeklyCapacity: 40,
  },
  {
    id: "tt-priya",
    name: "Alejo Cadavid",
    avatar: avatar(33),
    role: "Admin",
    projectSlugs: ["mobile-banking-app", "data-warehouse-revamp"],
    client: "Meridian Bank",
    hoursYesterday: 6.5,
    hoursToday: 8,
    hoursWeek: 41,
    hoursMonth: 150,
    billableRatio: 0.85,
    hourlyRate: 120,
    weeklyCapacity: 40,
  },
  {
    id: "tt-david",
    name: "David Kim",
    avatar: avatar(22),
    role: "QA Engineer",
    projectSlugs: ["mobile-banking-app", "customer-support-portal"],
    client: "Meridian Bank",
    hoursYesterday: 7,
    hoursToday: 0,
    hoursWeek: 22,
    hoursMonth: 96,
    billableRatio: 0.75,
    hourlyRate: 95,
    weeklyCapacity: 32,
  },
  {
    id: "tt-elena",
    name: "Elena Rossi",
    avatar: avatar(5),
    role: "Designer",
    projectSlugs: ["client-website-redesign", "marketing-site-relaunch"],
    client: "RetailCo",
    hoursYesterday: 6,
    hoursToday: 5,
    hoursWeek: 41,
    hoursMonth: 110,
    billableRatio: 0.7,
    hourlyRate: 110,
    weeklyCapacity: 40,
  },
  {
    id: "tt-jordan",
    name: "Jordan Wu",
    avatar: avatar(15),
    role: "Engineer",
    projectSlugs: ["internal-platform-migration"],
    client: "Internal",
    hoursYesterday: 5.5,
    hoursToday: 8.5,
    hoursWeek: 41,
    hoursMonth: 178,
    billableRatio: 0.6,
    hourlyRate: 115,
    weeklyCapacity: 40,
  },
];

// Custom ranges have no stored hours of their own, so they're estimated from
// each row's weekly rate (hoursWeek / 5 workdays) scaled by the number of
// weekdays in the selected range — the same "hours per day" model Settings →
// Time Tracking uses for capacity.
function countWeekdays(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const end = new Date(ty, tm - 1, td);
  let cur = new Date(fy, fm - 1, fd);
  let count = 0;
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return count;
}

export function hoursForPeriod(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): number {
  if (period === "today") return row.hoursToday;
  if (period === "month") return row.hoursMonth;
  if (period === "week") return row.hoursWeek;
  const dailyRate = row.hoursWeek / 5;
  const weekdays = countWeekdays(customRange.from, customRange.to);
  return Math.round(dailyRate * weekdays * 10) / 10;
}

export function billableHoursForPeriod(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): number {
  return hoursForPeriod(row, period, customRange) * row.billableRatio;
}

export function nonBillableHoursForPeriod(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): number {
  const total = hoursForPeriod(row, period, customRange);
  return total - billableHoursForPeriod(row, period, customRange);
}

export function weeklyCapacityPct(row: TimesheetRow): number {
  return Math.round((row.hoursWeek / row.weeklyCapacity) * 100);
}

// Average weeks per month — keeps the "month" expectation consistent with
// the day/week model above without pretending to track a real calendar.
const MONTH_WEEKS = 4.33;

export function expectedHoursForPeriod(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): number {
  const dailyRate = row.weeklyCapacity / 5;
  if (period === "today") return dailyRate;
  if (period === "week") return row.weeklyCapacity;
  if (period === "month") return row.weeklyCapacity * MONTH_WEEKS;
  return dailyRate * countWeekdays(customRange.from, customRange.to);
}

// There is no approval workflow in this MVP — "Missing" is simply whoever
// hasn't logged their expected hours for the selected period, recomputed
// live rather than stored as a status field.
export function isMissing(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): boolean {
  return hoursForPeriod(row, period, customRange) + 0.01 < expectedHoursForPeriod(row, period, customRange);
}

export function missingHoursForPeriod(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): number {
  return Math.max(0, expectedHoursForPeriod(row, period, customRange) - hoursForPeriod(row, period, customRange));
}

export function statusForPeriod(
  row: TimesheetRow,
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): TimesheetStatus {
  return isMissing(row, period, customRange) ? "Missing" : "Complete";
}

export function periodDisplayLabel(period: TimePeriod): string {
  if (period === "today") return "Today";
  if (period === "month") return "This Month";
  if (period === "custom") return "Selected Range";
  return "This Week";
}

export interface TimeTrackingSummary {
  billableHours: number;
  nonBillableHours: number;
  hoursMissing: number;
  weeklyUtilizationPct: number;
  /** Hours logged that are billable × hourly rate — money to be billed, not recognized revenue. */
  projectedBilling: number;
}

export function computeSummary(
  rows: TimesheetRow[],
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): TimeTrackingSummary {
  let billableHours = 0;
  let nonBillableHours = 0;
  let projectedBilling = 0;

  for (const row of rows) {
    const billable = billableHoursForPeriod(row, period, customRange);
    billableHours += billable;
    nonBillableHours += nonBillableHoursForPeriod(row, period, customRange);
    projectedBilling += billable * row.hourlyRate;
  }

  const hoursMissing = rows.filter((r) => isMissing(r, period, customRange)).length;
  const weeklyUtilizationPct = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + weeklyCapacityPct(r), 0) / rows.length)
    : 0;

  return {
    billableHours: Math.round(billableHours),
    nonBillableHours: Math.round(nonBillableHours),
    hoursMissing,
    weeklyUtilizationPct,
    projectedBilling: Math.round(projectedBilling),
  };
}

export interface ClientBillingRow {
  client: string;
  billableHours: number;
  projectedBilling: number;
}

export function computeClientBilling(
  rows: TimesheetRow[],
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): ClientBillingRow[] {
  const byClient = new Map<string, ClientBillingRow>();

  for (const row of rows) {
    const billable = billableHoursForPeriod(row, period, customRange);
    const existing = byClient.get(row.client);
    if (existing) {
      existing.billableHours += billable;
      existing.projectedBilling += billable * row.hourlyRate;
    } else {
      byClient.set(row.client, {
        client: row.client,
        billableHours: billable,
        projectedBilling: billable * row.hourlyRate,
      });
    }
  }

  return [...byClient.values()]
    .map((c) => ({
      ...c,
      billableHours: Math.round(c.billableHours * 10) / 10,
      projectedBilling: Math.round(c.projectedBilling),
    }))
    .sort((a, b) => b.projectedBilling - a.projectedBilling);
}

export interface ProjectHoursRow {
  projectSlug: string;
  projectName: string;
  hours: number;
}

// Delivery-focused counterpart to computeClientBilling — "which projects are
// consuming the team's time" instead of "which clients to invoice". A row's
// hours are split evenly across their projectSlugs for this period, since
// there's no per-project time-entry breakdown in this MVP; that keeps the
// totals here consistent with hoursForPeriod rather than double-counting a
// person's hours once per project they're staffed on.
export function computeProjectHours(
  rows: TimesheetRow[],
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): ProjectHoursRow[] {
  const byProject = new Map<string, number>();

  for (const row of rows) {
    if (row.projectSlugs.length === 0) continue;
    const share = hoursForPeriod(row, period, customRange) / row.projectSlugs.length;
    for (const slug of row.projectSlugs) {
      byProject.set(slug, (byProject.get(slug) ?? 0) + share);
    }
  }

  return [...byProject.entries()]
    .map(([projectSlug, hours]) => ({
      projectSlug,
      projectName: getProjectBySlug(projectSlug)?.name ?? projectSlug,
      hours: Math.round(hours * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours);
}

export interface MissingHoursEntry {
  id: string;
  name: string;
  avatar: string;
  periodLabel: string;
  missingHours: number;
}

// Operational reminder, not an approval queue — just who's short on hours
// for the selected period, ranked by size of the gap.
export function computeMissingHours(
  rows: TimesheetRow[],
  period: TimePeriod,
  customRange: CustomRange = DEFAULT_CUSTOM_RANGE
): MissingHoursEntry[] {
  return rows
    .filter((r) => isMissing(r, period, customRange))
    .map((r) => ({
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      periodLabel: periodDisplayLabel(period),
      missingHours: Math.round(missingHoursForPeriod(r, period, customRange) * 10) / 10,
    }))
    .sort((a, b) => b.missingHours - a.missingHours);
}
