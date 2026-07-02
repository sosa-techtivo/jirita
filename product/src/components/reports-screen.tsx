"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { useCurrentUser } from "@/components/current-user-provider";
import { ReportStatusBar, KpiCard, Section, BlockCompletion, AnimatedBar } from "@/components/reports-shared";
import type { StatusItem } from "@/components/reports-shared";
import { ProjectLeadReportsScreen } from "@/components/project-lead-reports-screen";
import { getTicketById, getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";

// ── Types ─────────────────────────────────────────────────────────────────────

type Risk          = "on-track" | "at-risk" | "blocked";
type PersonSortKey = "assignedTickets" | "estimatedHours" | "completedHours" | "remainingHours" | "blockedHours" | "capacity";

interface PersonRow {
  id:              string;
  name:            string;
  avatar:          string;
  assignedTickets: number;
  estimatedHours:  number;
  completedHours:  number;
  blockedHours:    number;
  capacity:        number;
}

interface ProjectRow {
  id:             string;
  name:           string;
  shortName:      string;
  tickets:        number;
  completedHours: number;
  estimatedHours: number;
  blocked:        number;
  completion:     number;
  risk:           Risk;
}

interface WorkloadEntry {
  id:             string;
  name:           string;
  avatar:         string;
  hours:          number;
  sprintCapacity: number;
  weekDelta:      number;
  capacity:       number;
}

interface HoursEntry {
  id:       string;
  label:    string;
  hours:    number;
  barClass: string;
}

interface ActivityEntry {
  id:     string;
  name:   string;
  avatar: string;
  /** The action fragment only — the ticket title never appears here; when
   *  `ticket` is set it renders on its own clickable line instead. */
  action: ReactNode;
  time:   string;
  group:  "today" | "yesterday" | "earlier";
  ticket?: Ticket;
}

type PeriodKey = "this-month" | "last-month" | "this-quarter" | "custom";

// Billing rows carry hours + a rate; the invoice/revenue figure is always
// derived (billableHours × avgRate) rather than stored, so the numbers can
// never drift out of sync with each other.
interface ClientBillingRow {
  id:               string;
  client:           string;
  billableHours:    number;
  nonBillableHours: number;
  avgRate:          number;
}

interface MemberBillingRow {
  id:               string;
  name:             string;
  avatar:           string;
  billableHours:    number;
  nonBillableHours: number;
  avgRate:          number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const av = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

// ── Mock data ─────────────────────────────────────────────────────────────────

const KPI_SUMMARY = {
  projects:           7,
  activeTickets:      97,
  estimatedHours:     320,
  completedHours:     212,
  blockedTickets:     11,
  completedThisMonth: 23,
  overdueTickets:     4,
};

const HOURS_BY_PERSON: PersonRow[] = [
  { id: "marcus", name: "Marcus Lee",  avatar: av(12), assignedTickets: 14, estimatedHours: 112, completedHours: 68, blockedHours: 24, capacity: 104 },
  { id: "sarah",  name: "Sarah Chen",  avatar: av(47), assignedTickets: 11, estimatedHours: 84,  completedHours: 52, blockedHours: 0,  capacity: 89  },
  { id: "david",  name: "David Kim",   avatar: av(22), assignedTickets: 9,  estimatedHours: 52,  completedHours: 31, blockedHours: 16, capacity: 72  },
  { id: "priya",  name: "Priya Patel", avatar: av(33), assignedTickets: 8,  estimatedHours: 44,  completedHours: 38, blockedHours: 0,  capacity: 65  },
  { id: "elena",  name: "Elena Rossi", avatar: av(5),  assignedTickets: 6,  estimatedHours: 28,  completedHours: 18, blockedHours: 8,  capacity: 45  },
];

const PROJECT_HEALTH: ProjectRow[] = [
  { id: "mba", name: "Mobile Banking App",          shortName: "MBA", tickets: 29, completedHours: 77,  estimatedHours: 184, blocked: 3, completion: 42, risk: "at-risk"  },
  { id: "ipm", name: "Internal Platform Migration", shortName: "IPM", tickets: 14, completedHours: 42,  estimatedHours: 62,  blocked: 0, completion: 68, risk: "on-track" },
  { id: "csp", name: "Customer Support Portal",     shortName: "CSP", tickets: 18, completedHours: 48,  estimatedHours: 88,  blocked: 2, completion: 54, risk: "on-track" },
  { id: "dwr", name: "Data Warehouse Revamp",       shortName: "DWR", tickets: 9,  completedHours: 23,  estimatedHours: 32,  blocked: 0, completion: 71, risk: "on-track" },
  { id: "msl", name: "Marketing Site Relaunch",     shortName: "MSL", tickets: 21, completedHours: 23,  estimatedHours: 96,  blocked: 5, completion: 24, risk: "blocked"  },
  { id: "cwd", name: "Client Website Redesign",     shortName: "CWD", tickets: 6,  completedHours: 6,   estimatedHours: 18,  blocked: 1, completion: 35, risk: "at-risk"  },
  { id: "pai", name: "Partner API Integration",     shortName: "PAI", tickets: 4,  completedHours: 8,   estimatedHours: 16,  blocked: 0, completion: 50, risk: "on-track" },
];

// ── Billing (Admin-only) ─────────────────────────────────────────────────────
// Mock only — hours/rates below are illustrative placeholders standing in for
// a future Time Tracking + invoicing integration. Billable + non-billable
// hours across clients (and separately across members) both total 212h, the
// same figure as KPI_SUMMARY.completedHours above — same underlying hours,
// just sliced two different ways.

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this-month",   label: "This Month" },
  { key: "last-month",   label: "Last Month" },
  { key: "this-quarter", label: "This Quarter" },
  { key: "custom",       label: "Custom Range" },
];

interface CustomRange {
  from: string; // yyyy-mm-dd, native <input type="date"> format
  to:   string;
}

// Pre-filled with June's bounds so Apply produces a sensible label even if
// nobody touches the fields — matches the "This Month" mock period.
const DEFAULT_CUSTOM_RANGE: CustomRange = { from: "2026-06-01", to: "2026-06-30" };

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const [, month, day] = iso.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

function formatRangeLabel(range: CustomRange): string {
  return `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;
}

// Same mock "today" the rest of this report is dated against.
const TODAY = new Date(2026, 5, 30);

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

type PresetKey = "today" | "this-week" | "this-month" | "last-month" | "this-quarter";

const RANGE_PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today",        label: "Today" },
  { key: "this-week",    label: "This Week" },
  { key: "this-month",   label: "This Month" },
  { key: "last-month",   label: "Last Month" },
  { key: "this-quarter", label: "This Quarter" },
];

function rangeForPreset(preset: PresetKey): CustomRange {
  const year = TODAY.getFullYear();
  const month = TODAY.getMonth();

  switch (preset) {
    case "today":
      return { from: toISO(TODAY), to: toISO(TODAY) };
    case "this-week": {
      const day = TODAY.getDay();
      const start = addDays(TODAY, day === 0 ? -6 : 1 - day); // Monday
      return { from: toISO(start), to: toISO(addDays(start, 6)) };
    }
    case "this-month":
      return { from: toISO(new Date(year, month, 1)), to: toISO(new Date(year, month + 1, 0)) };
    case "last-month":
      return { from: toISO(new Date(year, month - 1, 1)), to: toISO(new Date(year, month, 0)) };
    case "this-quarter": {
      const quarterStartMonth = Math.floor(month / 3) * 3;
      return { from: toISO(new Date(year, quarterStartMonth, 1)), to: toISO(new Date(year, quarterStartMonth + 3, 0)) };
    }
  }
}

const BILLING_BY_CLIENT: ClientBillingRow[] = [
  { id: "meridian",  client: "Meridian Bank", billableHours: 120, nonBillableHours: 8,  avgRate: 110 },
  { id: "retail-co", client: "RetailCo",      billableHours: 40,  nonBillableHours: 6,  avgRate: 85  },
  { id: "partner-a", client: "Partner A",     billableHours: 18,  nonBillableHours: 4,  avgRate: 90  },
  { id: "internal",  client: "Internal",      billableHours: 0,   nonBillableHours: 16, avgRate: 0   },
];

const BILLING_BY_MEMBER: MemberBillingRow[] = [
  { id: "marcus", name: "Marcus Lee",  avatar: av(12), billableHours: 64, nonBillableHours: 6, avgRate: 105 },
  { id: "sarah",  name: "Sarah Chen",  avatar: av(47), billableHours: 48, nonBillableHours: 6, avgRate: 115 },
  { id: "david",  name: "David Kim",   avatar: av(22), billableHours: 26, nonBillableHours: 6, avgRate: 80  },
  { id: "priya",  name: "Priya Patel", avatar: av(33), billableHours: 32, nonBillableHours: 8, avgRate: 90  },
  { id: "elena",  name: "Elena Rossi", avatar: av(5),  billableHours: 8,  nonBillableHours: 8, avgRate: 100 },
];

const BILLING_TOTALS = BILLING_BY_CLIENT.reduce(
  (acc, row) => ({
    billableHours:    acc.billableHours + row.billableHours,
    nonBillableHours: acc.nonBillableHours + row.nonBillableHours,
    revenue:          acc.revenue + row.billableHours * row.avgRate,
  }),
  { billableHours: 0, nonBillableHours: 0, revenue: 0 }
);

const UTILIZATION_PCT = Math.round(
  (BILLING_TOTALS.billableHours / (BILLING_TOTALS.billableHours + BILLING_TOTALS.nonBillableHours)) * 100
);

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

const WORKLOAD: WorkloadEntry[] = [
  { id: "marcus", name: "Marcus Lee",  avatar: av(12), hours: 112, sprintCapacity: 120, weekDelta: +18, capacity: 104 },
  { id: "sarah",  name: "Sarah Chen",  avatar: av(47), hours: 84,  sprintCapacity: 100, weekDelta: -6,  capacity: 89  },
  { id: "david",  name: "David Kim",   avatar: av(22), hours: 52,  sprintCapacity: 80,  weekDelta: +4,  capacity: 72  },
  { id: "priya",  name: "Priya Patel", avatar: av(33), hours: 44,  sprintCapacity: 80,  weekDelta: +2,  capacity: 65  },
  { id: "elena",  name: "Elena Rossi", avatar: av(5),  hours: 28,  sprintCapacity: 60,  weekDelta: -2,  capacity: 45  },
];

const HOURS_DIST: HoursEntry[] = [
  { id: "done",        label: "Done",        hours: 210, barClass: "bg-emerald-500" },
  { id: "in-progress", label: "In Progress", hours: 180, barClass: "bg-amber-400"  },
  { id: "to-do",       label: "To Do",       hours: 88,  barClass: "bg-slate-300 dark:bg-zinc-600" },
  { id: "blocked",     label: "Blocked",     hours: 60,  barClass: "bg-red-400"    },
  { id: "review",      label: "In Review",   hours: 42,  barClass: "bg-violet-500" },
];

const HOURS_DIST_TOTAL = HOURS_DIST.reduce((s, h) => s + h.hours, 0);

const ACTIVITY_GROUPS = [
  { id: "today",     label: "Today",            key: "today"     as const },
  { id: "yesterday", label: "Yesterday",         key: "yesterday" as const },
  { id: "earlier",   label: "Earlier This Week", key: "earlier"   as const },
];

const RECENT_CHANGES: ActivityEntry[] = [
  {
    id: "rc-1",
    name: "Priya Patel",
    avatar: av(33),
    action: <>changed Hours — <span className="font-medium">8h → 12h</span></>,
    time: "2 hours ago",
    group: "today",
    ticket: getTicketById("accessibility-audit"),
  },
  {
    id: "rc-2",
    name: "Marcus Lee",
    avatar: av(12),
    action: <>moved to <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span></>,
    time: "4 hours ago",
    group: "today",
    ticket: getTicketById("biometric-login-crash"),
  },
  {
    id: "rc-3",
    name: "Sarah Chen",
    avatar: av(47),
    action: "linked a PR to",
    time: "6 hours ago",
    group: "today",
    ticket: getTicketById("transaction-history-pagination"),
  },
  {
    id: "rc-4",
    name: "David Kim",
    avatar: av(22),
    action: <>changed assignee — <span className="font-medium">Marcus Lee</span></>,
    time: "Yesterday, 3pm",
    group: "yesterday",
    ticket: getTicketById("kyc-vendor-outage"),
  },
  {
    id: "rc-5",
    name: "Elena Rossi",
    avatar: av(5),
    action: <>changed Hours — <span className="font-medium">4h → 6h</span></>,
    time: "Yesterday, 11am",
    group: "yesterday",
    ticket: getTicketById("dark-mode-charts"),
  },
  {
    id: "rc-6",
    name: "Marcus Lee",
    avatar: av(12),
    action: "completed",
    time: "2 days ago",
    group: "earlier",
    ticket: getTicketById("mfa-onboarding"),
  },
  {
    id: "rc-7",
    name: "Sarah Chen",
    avatar: av(47),
    action: <>moved to <span className="text-amber-600 dark:text-amber-400 font-medium">In Progress</span></>,
    time: "2 days ago",
    group: "earlier",
    ticket: getTicketById("push-notification-setup"),
  },
];

// ── Filter groups ─────────────────────────────────────────────────────────────

const PROJECT_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "mobile-banking",    label: "Mobile Banking App" },
    { value: "internal-platform", label: "Internal Platform Migration" },
    { value: "customer-support",  label: "Customer Support Portal" },
    { value: "data-warehouse",    label: "Data Warehouse Revamp" },
    { value: "marketing-site",    label: "Marketing Site Relaunch" },
    { value: "client-website",    label: "Client Website Redesign" },
    { value: "partner-api",       label: "Partner API Integration" },
  ],
}];

const ASSIGNEE_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "marcus", label: "Marcus Lee",  avatar: av(12) },
    { value: "sarah",  label: "Sarah Chen",  avatar: av(47) },
    { value: "david",  label: "David Kim",   avatar: av(22) },
    { value: "priya",  label: "Priya Patel", avatar: av(33) },
    { value: "elena",  label: "Elena Rossi", avatar: av(5)  },
  ],
}];

const CLIENT_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "meridian",  label: "Meridian Bank" },
    { value: "retail-co", label: "RetailCo" },
    { value: "internal",  label: "Internal" },
    { value: "partner-a", label: "Partner A" },
  ],
}];

// Used by Project Lead's filter bar only — Admin has the Billing Period
// selector as the single source of truth for the reporting window instead.
const DATE_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "this-week",    label: "This Week" },
    { value: "this-month",   label: "This Month" },
    { value: "last-month",   label: "Last Month" },
    { value: "this-quarter", label: "This Quarter" },
  ],
}];

const STATUS_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "backlog",     label: "Inbox" },
    { value: "to-do",       label: "To Do" },
    { value: "in-progress", label: "In Progress" },
    { value: "blocked",     label: "Blocked" },
    { value: "review",      label: "In Review" },
    { value: "done",        label: "Done" },
  ],
}];

const PRIORITY_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "high",   label: "High"   },
    { value: "normal", label: "Normal" },
    { value: "low",    label: "Low"    },
  ],
}];

const LABEL_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "Security",    label: "Security"    },
    { value: "Bug",         label: "Bug"         },
    { value: "Performance", label: "Performance" },
    { value: "Design",      label: "Design"      },
    { value: "API",         label: "API"         },
    { value: "Compliance",  label: "Compliance"  },
  ],
}];

const HOURS_GROUPS: DropdownGroup[] = [{
  options: [
    { value: "0-8",   label: "0 – 8h"   },
    { value: "8-24",  label: "8 – 24h"  },
    { value: "24-48", label: "24 – 48h" },
    { value: "48+",   label: "48h+"     },
  ],
}];

// ── Report Status Bar ─────────────────────────────────────────────────────────
// ReportStatusBar itself lives in reports-shared.tsx (reused by the Project
// Lead's Reports page too); this function only derives Admin-specific items.

function deriveStatusItems(): StatusItem[] {
  const items: StatusItem[] = [];

  const overloaded = HOURS_BY_PERSON.filter((p) => p.estimatedHours > 80);
  if (overloaded.length > 0) {
    items.push({
      id:    "overloaded",
      level: "warning",
      text:  `${overloaded.length} developers overloaded`,
    });
  }

  const mostBlocked = [...PROJECT_HEALTH].sort((a, b) => b.blocked - a.blocked)[0];
  if (mostBlocked.blocked > 0) {
    items.push({
      id:    "blocked-project",
      level: "critical",
      text:  `${mostBlocked.name} blocked`,
    });
  }

  items.push({
    id:    "completed",
    level: "ok",
    text:  `${KPI_SUMMARY.completedThisMonth} tickets completed`,
  });

  return items.slice(0, 3);
}

const STATUS_ITEMS = deriveStatusItems();

// ReportStatusBar, KpiCard, Section, BlockCompletion, and AnimatedBar all live
// in reports-shared.tsx now — reused as-is by the Project Lead's Reports page.

const RISK_STYLES: Record<Risk, string> = {
  "on-track": "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  "at-risk":  "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  "blocked":  "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
};

const RISK_LABELS: Record<Risk, string> = {
  "on-track": "On Track",
  "at-risk":  "At Risk",
  "blocked":  "Blocked",
};

function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${RISK_STYLES[risk]}`}>
      {RISK_LABELS[risk]}
    </span>
  );
}

function CapacityCell({ pct }: { pct: number }) {
  const cls =
    pct > 100 ? "text-red-600 dark:text-red-400" :
    pct > 80  ? "text-amber-600 dark:text-amber-400" :
                "text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`font-semibold tabular-nums ${cls}`}>{pct}%</span>
  );
}

// Unlike CapacityCell (where high = overloaded = bad), a high billable
// utilization % is the goal, so the color scale runs the other direction.
function UtilizationCell({ pct }: { pct: number }) {
  const cls =
    pct < 60 ? "text-red-600 dark:text-red-400" :
    pct < 80 ? "text-amber-600 dark:text-amber-400" :
               "text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`font-semibold tabular-nums ${cls}`}>{pct}%</span>
  );
}

type ReportTab = "delivery" | "finance";

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: "delivery", label: "Delivery" },
  { key: "finance",  label: "Finance"  },
];

// Same segmented-pill styling as ViewSwitcher (tickets board/list/etc. toggle)
// so the tab language stays consistent across the app.
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

// Global period selector — cosmetic only for now. Selecting a period doesn't
// recompute any figures yet; it's here to establish where a real Time
// Tracking date-range integration will plug in later.
function PeriodSelector({ value, onChange }: { value: PeriodKey; onChange: (key: PeriodKey) => void }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [appliedRange, setAppliedRange] = useState<CustomRange>(DEFAULT_CUSTOM_RANGE);
  const [draftRange, setDraftRange] = useState<CustomRange>(DEFAULT_CUSTOM_RANGE);
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
    setAppliedRange(draftRange);
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

          <div className="flex flex-wrap gap-1.5 mb-3">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setDraftRange(rangeForPreset(preset.key))}
                className="text-[11px] font-medium px-2 py-1 rounded-full border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 dark:border-zinc-800 -mx-4 mb-3" />

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

// Sortable column header — shows a chevron on hover (always visible when active)
function SortTh({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
}: {
  label:       string;
  sortKey:     PersonSortKey;
  currentSort: PersonSortKey;
  sortDir:     "asc" | "desc";
  onSort:      (k: PersonSortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none group whitespace-nowrap"
    >
      <span className="inline-flex items-center justify-end gap-1">
        <span className={active ? "text-slate-600 dark:text-zinc-300" : "text-slate-400 dark:text-zinc-600 group-hover:text-slate-500 dark:group-hover:text-zinc-500 transition-colors duration-150"}>
          {label}
        </span>
        <svg
          className={[
            "w-2.5 h-2.5 flex-shrink-0 transition-all duration-150",
            active
              ? "text-slate-500 dark:text-zinc-400 opacity-100"
              : "text-slate-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100",
            active && sortDir === "asc" ? "-rotate-180" : "",
          ].join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </th>
  );
}

function ExportDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const standardFormats = [
    { label: "Export CSV",   path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { label: "Export Excel", path: "M3 10h18M3 14h18M10 3v18M3 7l2-2h14l2 2M3 17l2 2h14l2-2" },
    { label: "Export PDF",   path: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
  ];
  const businessFormats = [
    { label: "Export Client Report",   path: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
    { label: "Export Invoice Summary", path: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors duration-150 shadow-sm cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export
        <svg
          className={`w-3 h-3 text-slate-400 dark:text-zinc-600 mt-px transition-transform duration-150 ${open ? "-rotate-180" : ""}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div
        className={[
          "absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border",
          "bg-white dark:bg-zinc-900",
          "shadow-lg shadow-black/10 dark:shadow-black/40",
          "border-slate-200 dark:border-zinc-700/60",
          "transition-all duration-150 origin-top-right",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none",
        ].join(" ")}
      >
        <div className="py-1.5">
          {standardFormats.map(({ label, path }) => (
            <button
              key={label}
              type="button"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors duration-150 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={path} />
              </svg>
              {label}
            </button>
          ))}

          <div className="my-1 mx-2 border-t border-slate-100 dark:border-zinc-800" />

          {businessFormats.map(({ label, path }) => (
            <button
              key={label}
              type="button"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors duration-150 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={path} />
              </svg>
              {label}
            </button>
          ))}

          <div className="my-1 mx-2 border-t border-slate-100 dark:border-zinc-800" />

          <button
            type="button"
            disabled
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left text-slate-400 dark:text-zinc-600 cursor-default"
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="flex-1">Schedule Report</span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-300 dark:text-zinc-700 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 px-1.5 py-0.5 rounded">
              Soon
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReportsScreen() {
  const { user } = useCurrentUser();

  // Project Lead gets a purpose-built Delivery/Team report scoped to their own
  // projects instead of this company-wide Delivery/Finance view — has to be a
  // separate component (not just an early return with more hooks below) so
  // switching roles never changes how many hooks render on this component.
  if (user.role === "PROJECT_LEAD") {
    return <ProjectLeadReportsScreen />;
  }

  return <AdminReportsScreen />;
}

function AdminReportsScreen() {
  const { user } = useCurrentUser();
  const isAdmin = user.role === "ADMIN";

  const [tab, setTab] = useState<ReportTab>("delivery");

  // Cosmetic only — see PeriodSelector.
  const [period, setPeriod] = useState<PeriodKey>("this-month");

  const [projectFilter,  setProjectFilter]  = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [clientFilter,   setClientFilter]   = useState<string[]>([]);
  const [dateFilter,     setDateFilter]     = useState<string[]>([]);
  const [statusFilter,   setStatusFilter]   = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [labelFilter,    setLabelFilter]    = useState<string[]>([]);
  const [hoursFilter,    setHoursFilter]    = useState<string[]>([]);
  const [preview,        setPreview]        = useState<Ticket | null>(null);

  // Hours by Person — sort state
  const [personSort,    setPersonSort]    = useState<PersonSortKey>("estimatedHours");
  const [personSortDir, setPersonSortDir] = useState<"asc" | "desc">("desc");
  const [personFading,  setPersonFading]  = useState(false);

  function handlePersonSort(key: PersonSortKey) {
    setPersonFading(true);
    setTimeout(() => {
      if (personSort === key) {
        setPersonSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setPersonSort(key);
        setPersonSortDir("desc");
      }
      setPersonFading(false);
    }, 110);
  }

  const sortedPersonRows = [...HOURS_BY_PERSON].sort((a, b) => {
    const mult = personSortDir === "asc" ? 1 : -1;
    const val  = (r: PersonRow) =>
      personSort === "remainingHours" ? r.estimatedHours - r.completedHours : r[personSort];
    return (val(a) - val(b)) * mult;
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-16">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
            Reports
          </h1>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Monday, June 30, 2026</p>
        </div>
        <ExportDropdown />
      </div>

      {/* ── Report tabs (Admin only — Project Lead only ever sees Delivery) ─── */}
      {isAdmin && (
        <div className="mb-5">
          <ReportTabs tab={tab} onChange={setTab} />
        </div>
      )}

      {(!isAdmin || tab === "delivery") && (
        <>

      {/* ── Status bar ───────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <ReportStatusBar items={STATUS_ITEMS} />
      </div>

      {/* ── Top filters ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-wrap mb-6 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 px-4 py-2.5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mr-2">
          Filter
        </span>
        <FilterDropdown label="Project"    mode="multi"  groups={PROJECT_GROUPS}  selected={projectFilter}  onChange={setProjectFilter} />
        <FilterDropdown label="Assignee"   mode="multi"  groups={ASSIGNEE_GROUPS} selected={assigneeFilter} onChange={setAssigneeFilter} searchable />
        <FilterDropdown label="Client"     mode="single" groups={CLIENT_GROUPS}   selected={clientFilter}   onChange={setClientFilter} />
        {!isAdmin && (
          <FilterDropdown label="Date Range" mode="single" groups={DATE_GROUPS} selected={dateFilter} onChange={setDateFilter} />
        )}
        <FilterDropdown label="Status"     mode="multi"  groups={STATUS_GROUPS}   selected={statusFilter}   onChange={setStatusFilter} />
        <FilterDropdown label="Priority"   mode="multi"  groups={PRIORITY_GROUPS} selected={priorityFilter} onChange={setPriorityFilter} />
        <FilterDropdown label="Labels"     mode="multi"  groups={LABEL_GROUPS}    selected={labelFilter}    onChange={setLabelFilter} />
        <FilterDropdown label="Hours"      mode="single" groups={HOURS_GROUPS}    selected={hoursFilter}    onChange={setHoursFilter} />
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard label="Projects"        value={KPI_SUMMARY.projects}           sub="active" />
        <KpiCard label="Active Tickets"  value={KPI_SUMMARY.activeTickets}      sub="open" />
        <KpiCard
          label="Hours Burn"
          value={
            <>
              {KPI_SUMMARY.completedHours}
              <span className="text-base font-medium ml-0.5">h</span>
              <span className="text-sm font-normal text-brand-400 dark:text-brand-600 mx-1.5">/</span>
              <span className="text-lg font-semibold text-brand-400 dark:text-brand-600">
                {KPI_SUMMARY.estimatedHours}h
              </span>
            </>
          }
          sub={`${Math.round((KPI_SUMMARY.completedHours / KPI_SUMMARY.estimatedHours) * 100)}% complete`}
          progress={Math.round((KPI_SUMMARY.completedHours / KPI_SUMMARY.estimatedHours) * 100)}
          accent
        />
        <KpiCard label="Blocked"         value={KPI_SUMMARY.blockedTickets}     sub="need attention" danger />
        <KpiCard label="Done This Month" value={KPI_SUMMARY.completedThisMonth} sub="in June" />
        <KpiCard
          label="Overdue"
          value={KPI_SUMMARY.overdueTickets}
          sub="past due date"
          danger={KPI_SUMMARY.overdueTickets > 0}
        />
      </div>

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* ── Hours by Person ───────────────────────────────────────────────── */}
        <Section
          title="Hours by Person"
          count={HOURS_BY_PERSON.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          }
        >
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800">
                  <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                    Person
                  </th>
                  <SortTh label="Tickets"    sortKey="assignedTickets" currentSort={personSort} sortDir={personSortDir} onSort={handlePersonSort} />
                  <SortTh label="Est. Hours" sortKey="estimatedHours"  currentSort={personSort} sortDir={personSortDir} onSort={handlePersonSort} />
                  <SortTh label="Completed"  sortKey="completedHours"  currentSort={personSort} sortDir={personSortDir} onSort={handlePersonSort} />
                  <SortTh label="Remaining"  sortKey="remainingHours"  currentSort={personSort} sortDir={personSortDir} onSort={handlePersonSort} />
                  <SortTh label="Blocked"    sortKey="blockedHours"    currentSort={personSort} sortDir={personSortDir} onSort={handlePersonSort} />
                  <SortTh label="Capacity"   sortKey="capacity"        currentSort={personSort} sortDir={personSortDir} onSort={handlePersonSort} />
                </tr>
              </thead>
              <tbody
                className="divide-y divide-slate-50 dark:divide-zinc-800/60 transition-opacity duration-110"
                style={{ opacity: personFading ? 0 : 1 }}
              >
                {sortedPersonRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default"
                  >
                    <td className="py-2.5 pr-4">
                      <MemberTrigger name={row.name} avatar={row.avatar} className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.avatar} alt={row.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-zinc-200">{row.name}</span>
                      </MemberTrigger>
                    </td>
                    <td className="py-2.5 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                      {row.assignedTickets}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                      {row.estimatedHours}h
                    </td>
                    <td className="py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {row.completedHours}h
                    </td>
                    <td className="py-2.5 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                      {row.estimatedHours - row.completedHours}h
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.blockedHours > 0 ? (
                        <span className="font-medium text-red-600 dark:text-red-400">{row.blockedHours}h</span>
                      ) : (
                        <span className="text-slate-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <CapacityCell pct={row.capacity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Project Health ────────────────────────────────────────────────── */}
        <Section
          title="Project Health"
          count={PROJECT_HEALTH.length}
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 7l4-4h6l4 4" />
              <rect x="3" y="7" width="18" height="13" rx="2" />
            </svg>
          }
        >
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800">
                  <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[220px]">
                    Project
                  </th>
                  <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                    Tickets
                  </th>
                  <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                    Hours
                  </th>
                  <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                    Blocked
                  </th>
                  <th className="pb-2.5 pl-4 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                    Completion
                  </th>
                  <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                    Risk
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                {PROJECT_HEALTH.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-pointer group"
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-zinc-800 text-[9px] font-bold text-slate-500 dark:text-zinc-400 flex items-center justify-center flex-shrink-0 transition-colors duration-150 group-hover:bg-brand-50 group-hover:text-brand-600 dark:group-hover:bg-brand-500/10 dark:group-hover:text-brand-400">
                          {row.shortName}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-zinc-200 truncate group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors duration-150">
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                      {row.tickets}
                    </td>
                    <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-slate-800 dark:text-zinc-200">
                        {row.completedHours}h
                      </span>
                      <span className="text-slate-400 dark:text-zinc-600 font-normal text-xs mx-1">/</span>
                      <span className="text-slate-400 dark:text-zinc-500 text-xs">
                        {row.estimatedHours}h
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.blocked > 0 ? (
                        <span className="font-medium text-red-600 dark:text-red-400">{row.blocked}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-4">
                      <BlockCompletion pct={row.completion} />
                    </td>
                    <td className="py-2.5 text-right">
                      <RiskBadge risk={row.risk} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Workload + Hours Distribution ─────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-5">

          {/* Workload */}
          <Section
            title="Workload"
            icon={
              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 6h18M3 12h14M3 18h8" />
              </svg>
            }
          >
            <div className="space-y-4">
              {WORKLOAD.map((entry) => {
                const barPct        = Math.round((entry.hours / entry.sprintCapacity) * 100);
                const clampedBarPct = Math.min(barPct, 100);
                const barColor  =
                  entry.capacity > 100 ? "bg-red-400" :
                  entry.capacity > 80  ? "bg-amber-400" :
                                         "bg-brand-500";
                const pctColor  =
                  entry.capacity > 100 ? "text-red-600 dark:text-red-400" :
                  entry.capacity > 80  ? "text-amber-600 dark:text-amber-400" :
                                         "text-brand-600 dark:text-brand-500";
                const deltaPositive = entry.weekDelta > 0;
                const deltaColor    = deltaPositive
                  ? "text-amber-500 dark:text-amber-500"
                  : "text-slate-400 dark:text-zinc-500";

                return (
                  <div key={entry.id}>
                    <div className="flex items-center justify-between mb-1">
                      <MemberTrigger name={entry.name} avatar={entry.avatar} className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.avatar} alt={entry.name} className="w-5 h-5 rounded-full flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                          {entry.name}
                        </span>
                      </MemberTrigger>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200 tabular-nums leading-tight">
                          {entry.hours}h
                          <span className="font-normal text-slate-400 dark:text-zinc-600">
                            {" / "}{entry.sprintCapacity}h
                          </span>
                        </p>
                        <p className={`text-xs font-semibold tabular-nums leading-tight mt-0.5 ${pctColor}`}>
                          {barPct}%
                        </p>
                        <p className={`text-[10px] tabular-nums leading-tight mt-0.5 ${deltaColor}`}>
                          {deltaPositive ? "+" : ""}{entry.weekDelta}h this week
                        </p>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                      <AnimatedBar pct={clampedBarPct} className={barColor} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-slate-400 dark:text-zinc-600 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                overloaded
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                heavy
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                normal
              </span>
            </p>
          </Section>

          {/* Hours Distribution */}
          <Section
            title="Hours Distribution"
            icon={
              <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 19V9M12 19V5M20 19v-7" />
              </svg>
            }
          >
            <div className="space-y-4">
              {HOURS_DIST.map((entry) => {
                const pct = Math.round((entry.hours / HOURS_DIST_TOTAL) * 100);
                return (
                  <div key={entry.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                        {entry.label}
                      </span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 tabular-nums">
                        {entry.hours}h
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                      <AnimatedBar pct={pct} className={entry.barClass} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-600 tabular-nums">
                      {pct}%
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-slate-400 dark:text-zinc-600 tabular-nums">
              Total:{" "}
              <span className="font-semibold text-slate-600 dark:text-zinc-400">
                {HOURS_DIST_TOTAL}h
              </span>
            </p>
          </Section>
        </div>

        {/* ── Recent Changes ────────────────────────────────────────────────── */}
        <Section
          title="Recent Changes"
          icon={
            <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          }
        >
          <div className="space-y-5">
            {ACTIVITY_GROUPS.map((ag) => {
              const entries = RECENT_CHANGES.filter((e) => e.group === ag.key);
              if (entries.length === 0) return null;
              return (
                <div key={ag.id}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-zinc-700 mb-2.5">
                    {ag.label}
                  </p>
                  <ul className="space-y-3.5">
                    {entries.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-3">
                        <MemberTrigger name={entry.name} avatar={entry.avatar} className="flex-shrink-0 mt-0.5 rounded-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={entry.avatar}
                            alt={entry.name}
                            className="w-6 h-6 rounded-full"
                          />
                        </MemberTrigger>
                        <div className="text-sm leading-snug min-w-0 flex-1">
                          <p className="text-slate-700 dark:text-zinc-300">
                            <MemberTrigger name={entry.name} avatar={entry.avatar} className="font-medium text-slate-900 dark:text-zinc-100 hover:underline">
                              {entry.name}
                            </MemberTrigger>{" "}
                            {entry.action}
                          </p>
                          {entry.ticket && (
                            <button
                              type="button"
                              onClick={() => setPreview(entry.ticket!)}
                              className="group/ref mt-1 flex items-baseline gap-1.5 min-w-0 max-w-full text-left"
                            >
                              <TicketTypeIcon type={entry.ticket.type} />
                              <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 flex-shrink-0">
                                {getTicketDisplayKey(entry.ticket)}
                              </span>
                              <span className="text-sm font-medium text-slate-700 dark:text-zinc-300 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 group-hover/ref:underline truncate">
                                {entry.ticket.title}
                              </span>
                            </button>
                          )}
                          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                            {entry.time}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

        </>
      )}

      {/* ── Finance tab (Admin only) — billing/business metrics, kept fully
          separate from Delivery's project-execution metrics above. ─────── */}
      {isAdmin && tab === "finance" && (
        <>
          {/* ── Billing period + financial KPIs ──────────────────────────── */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
              Billing Period
            </h2>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <KpiCard
              label="Billable Hours"
              value={<>{BILLING_TOTALS.billableHours}<span className="text-base font-medium ml-0.5">h</span></>}
              sub="this period"
              accent
            />
            <KpiCard
              label="Non-billable Hours"
              value={<>{BILLING_TOTALS.nonBillableHours}<span className="text-base font-medium ml-0.5">h</span></>}
              sub="internal / overhead"
            />
            <KpiCard
              label="Utilization"
              value={`${UTILIZATION_PCT}%`}
              sub="billable ÷ logged"
              progress={UTILIZATION_PCT}
              accent
            />
            <KpiCard
              label="Estimated Revenue"
              value={formatCurrency(BILLING_TOTALS.revenue)}
              sub="billable hours × rate"
              accent
            />
          </div>

          {/* ── Sections ─────────────────────────────────────────────────── */}
          <div className="space-y-5">
            <Section
              title="Billing Overview"
              count={BILLING_BY_CLIENT.length}
              icon={
                <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.66 0-3 .672-3 1.5S10.34 11 12 11s3 .672 3 1.5-1.34 1.5-3 1.5m0-6V6m0 1v6m0 0v1m0-1c-1.66 0-3-.672-3-1.5M17 7H9a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" />
                </svg>
              }
            >
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800">
                      <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                        Client
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Billable Hours
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Non-billable Hours
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Average Rate
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Estimated Invoice
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                    {BILLING_BY_CLIENT.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default">
                        <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-zinc-200">
                          {row.client}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                          {row.billableHours}h
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {row.nonBillableHours > 0 ? (
                            <span className="text-slate-500 dark:text-zinc-400">{row.nonBillableHours}h</span>
                          ) : (
                            <span className="text-slate-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {row.avgRate > 0 ? (
                            <span className="text-slate-500 dark:text-zinc-400">{formatCurrency(row.avgRate)}/h</span>
                          ) : (
                            <span className="text-slate-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-brand-700 dark:text-brand-400 tabular-nums">
                          {formatCurrency(row.billableHours * row.avgRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-100 dark:border-zinc-800">
                      <td className="pt-2.5 font-semibold text-slate-600 dark:text-zinc-300">Total</td>
                      <td className="pt-2.5 text-right font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                        {BILLING_TOTALS.billableHours}h
                      </td>
                      <td className="pt-2.5 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                        {BILLING_TOTALS.nonBillableHours}h
                      </td>
                      <td className="pt-2.5" />
                      <td className="pt-2.5 text-right font-bold text-brand-700 dark:text-brand-400 tabular-nums">
                        {formatCurrency(BILLING_TOTALS.revenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Section>

            <Section
              title="Billable Hours by Member"
              count={BILLING_BY_MEMBER.length}
              icon={
                <svg className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
                </svg>
              }
            >
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800">
                      <th className="pb-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 w-[200px]">
                        Member
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Billable
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Non-billable
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Utilization %
                      </th>
                      <th className="pb-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                        Estimated Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
                    {BILLING_BY_MEMBER.map((row) => {
                      const utilization = Math.round((row.billableHours / (row.billableHours + row.nonBillableHours)) * 100);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150 cursor-default">
                          <td className="py-2.5 pr-4">
                            <MemberTrigger name={row.name} avatar={row.avatar} className="flex items-center gap-2.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.avatar} alt={row.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                              <span className="font-medium text-slate-800 dark:text-zinc-200">{row.name}</span>
                            </MemberTrigger>
                          </td>
                          <td className="py-2.5 text-right font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                            {row.billableHours}h
                          </td>
                          <td className="py-2.5 text-right text-slate-500 dark:text-zinc-400 tabular-nums">
                            {row.nonBillableHours}h
                          </td>
                          <td className="py-2.5 text-right">
                            <UtilizationCell pct={utilization} />
                          </td>
                          <td className="py-2.5 text-right font-semibold text-brand-700 dark:text-brand-400 tabular-nums">
                            {formatCurrency(row.billableHours * row.avgRate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        </>
      )}

      {/* ── Ticket preview panel ────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={preview.projectSlug}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
