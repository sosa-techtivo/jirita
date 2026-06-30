"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import type { ReactNode } from "react";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";

// ── Types ─────────────────────────────────────────────────────────────────────

type Risk          = "on-track" | "at-risk" | "blocked";
type PersonSortKey = "assignedTickets" | "estimatedHours" | "completedHours" | "remainingHours" | "blockedHours" | "capacity";

export interface StatusItem {
  id:    string;
  level: "warning" | "critical" | "ok";
  text:  string;
}

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
  action: ReactNode;
  time:   string;
  group:  "today" | "yesterday" | "earlier";
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
    action: (
      <>
        changed Hours on{" "}
        <span className="font-medium">&ldquo;Accessibility audit&rdquo;</span>
        {" — "}
        <span className="font-medium">8h → 12h</span>
      </>
    ),
    time: "2 hours ago",
    group: "today",
  },
  {
    id: "rc-2",
    name: "Marcus Lee",
    avatar: av(12),
    action: (
      <>
        moved{" "}
        <span className="font-medium">&ldquo;Fix biometric login crash&rdquo;</span> to{" "}
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span>
      </>
    ),
    time: "4 hours ago",
    group: "today",
  },
  {
    id: "rc-3",
    name: "Sarah Chen",
    avatar: av(47),
    action: (
      <>
        linked a PR to{" "}
        <span className="font-medium">&ldquo;Transaction history pagination&rdquo;</span>
      </>
    ),
    time: "6 hours ago",
    group: "today",
  },
  {
    id: "rc-4",
    name: "David Kim",
    avatar: av(22),
    action: (
      <>
        changed assignee on{" "}
        <span className="font-medium">&ldquo;KYC vendor API outage plan&rdquo;</span> to{" "}
        <span className="font-medium">Marcus Lee</span>
      </>
    ),
    time: "Yesterday, 3pm",
    group: "yesterday",
  },
  {
    id: "rc-5",
    name: "Elena Rossi",
    avatar: av(5),
    action: (
      <>
        changed Hours on{" "}
        <span className="font-medium">&ldquo;Dark mode charts&rdquo;</span>
        {" — "}
        <span className="font-medium">4h → 6h</span>
      </>
    ),
    time: "Yesterday, 11am",
    group: "yesterday",
  },
  {
    id: "rc-6",
    name: "Marcus Lee",
    avatar: av(12),
    action: (
      <>
        completed{" "}
        <span className="font-medium">&ldquo;Add MFA onboarding step&rdquo;</span>
      </>
    ),
    time: "2 days ago",
    group: "earlier",
  },
  {
    id: "rc-7",
    name: "Sarah Chen",
    avatar: av(47),
    action: (
      <>
        moved{" "}
        <span className="font-medium">&ldquo;Push notification setup&rdquo;</span> to{" "}
        <span className="text-amber-600 dark:text-amber-400 font-medium">In Progress</span>
      </>
    ),
    time: "2 days ago",
    group: "earlier",
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

const STATUS_ICON: Record<StatusItem["level"], ReactNode> = {
  warning: (
    <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  critical: (
    <svg className="w-3.5 h-3.5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  ok: (
    <svg className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STATUS_TEXT: Record<StatusItem["level"], string> = {
  warning:  "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
  ok:       "text-emerald-700 dark:text-emerald-500",
};

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

export function ReportStatusBar({ items }: { items: StatusItem[] }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-y-2 px-5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      {items.map((item, i) => (
        <Fragment key={item.id}>
          {i > 0 && (
            <span
              className="hidden sm:block px-3 text-slate-300 dark:text-zinc-700 select-none text-sm leading-none"
              aria-hidden
            >
              ·
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {STATUS_ICON[item.level]}
            <span className={`text-[13px] font-medium whitespace-nowrap ${STATUS_TEXT[item.level]}`}>
              {item.text}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
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
        "rounded-xl border px-5 pt-4 shadow-sm shadow-slate-200/40 dark:shadow-black/20",
        "transition-all duration-200 hover:shadow-md hover:-translate-y-px",
        progress !== undefined ? "pb-3" : "pb-4",
        accent
          ? "border-brand-100 dark:border-brand-700/40 bg-brand-50/40 dark:bg-brand-500/5"
          : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900",
      ].join(" ")}
    >
      <p
        className={[
          "text-[10px] font-bold uppercase tracking-widest mb-1",
          accent ? "text-brand-500" : "text-slate-400 dark:text-zinc-600",
        ].join(" ")}
      >
        {label}
      </p>
      <p
        className={[
          "text-2xl font-bold leading-none",
          danger
            ? "text-red-600 dark:text-red-400"
            : accent
            ? "text-brand-700 dark:text-brand-500"
            : "text-slate-900 dark:text-zinc-50",
        ].join(" ")}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>
      )}
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  icon,
  children,
}: {
  title:    string;
  count?:   number;
  icon?:    ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
          {title}
        </h2>
        {count !== undefined && (
          <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

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

function BlockCompletion({ pct }: { pct: number }) {
  const TOTAL  = 10;
  const filled = Math.round(pct / 10);
  const empty  = TOTAL - filled;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[13px] leading-none select-none" aria-hidden>
        <span className="text-brand-500">{"█".repeat(filled)}</span>
        <span className="text-slate-200 dark:text-zinc-700">{"░".repeat(empty)}</span>
      </span>
      <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums w-8">
        {pct}%
      </span>
    </span>
  );
}

function AnimatedBar({ pct, className }: { pct: number; className: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setWidth(pct), 60);
    return () => clearTimeout(id);
  }, [pct]);
  return (
    <div
      className={`h-full rounded-full ${className}`}
      style={{ width: `${width}%`, transition: "width 220ms ease-out" }}
    />
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
  const [projectFilter,  setProjectFilter]  = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [clientFilter,   setClientFilter]   = useState<string[]>([]);
  const [dateFilter,     setDateFilter]     = useState<string[]>([]);
  const [statusFilter,   setStatusFilter]   = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [labelFilter,    setLabelFilter]    = useState<string[]>([]);
  const [hoursFilter,    setHoursFilter]    = useState<string[]>([]);

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
        <FilterDropdown label="Date Range" mode="single" groups={DATE_GROUPS}     selected={dateFilter}     onChange={setDateFilter} />
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
                      <div className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.avatar} alt={row.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-zinc-200">{row.name}</span>
                      </div>
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
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.avatar} alt={entry.name} className="w-5 h-5 rounded-full flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                          {entry.name}
                        </span>
                      </div>
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={entry.avatar}
                          alt={entry.name}
                          className="w-6 h-6 rounded-full mt-0.5 flex-shrink-0"
                        />
                        <div className="text-sm leading-snug min-w-0">
                          <p className="text-slate-700 dark:text-zinc-300">
                            <span className="font-medium text-slate-900 dark:text-zinc-100">
                              {entry.name}
                            </span>{" "}
                            {entry.action}
                          </p>
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
    </div>
  );
}
