"use client";

import { FilterChip } from "@/components/tickets/filter-chip";
import { FilterDropdown, type DropdownGroup } from "@/components/tickets/filter-dropdown";
import { DateRangeFilterDropdown, type DateRangeValue } from "@/components/tickets/date-range-filter-dropdown";
import { PRIORITY_VALUES, PRIORITY_LABEL, STATUS_LABEL } from "@/components/tickets/ticket-ui";
import type { TicketStatus } from "@/lib/mock-tickets";
import type { OrgMember } from "@/lib/projects";

export type AddFilterKind = "labels" | "due-date" | "reporter" | "created-date" | "updated-date";

// ── Static option groups ──────────────────────────────────────────────────────

const ASSIGNED_BASE_GROUP: DropdownGroup = {
  options: [
    { value: "__anyone__", label: "Anyone" },
    { value: "me",         label: "Me" },
    { value: "unassigned", label: "Unassigned" },
  ],
};

// Real org members only — no mock names. If there are none yet (dev
// fallback, or an org with no other members), the dropdown just shows the
// base group above.
function buildAssignedGroups(members: OrgMember[]): DropdownGroup[] {
  if (members.length === 0) return [ASSIGNED_BASE_GROUP];
  return [
    ASSIGNED_BASE_GROUP,
    {
      divider: true,
      options: members.map((member) => ({
        value: member.id,
        label: member.name,
        displayLabel: member.name.split(" ")[0],
        avatar: member.avatar,
      })),
    },
  ];
}

// Sourced from ticket-ui.tsx's PRIORITY_VALUES/PRIORITY_LABEL — the same
// values Ticket creation/editing/preview/detail/board/list/calendar/
// timeline all use, so this dropdown can never drift out of sync with them.
const PRIORITY_GROUPS: DropdownGroup[] = [
  {
    options: PRIORITY_VALUES.map((value) => ({ value, label: PRIORITY_LABEL[value] })),
  },
];

const STATUS_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "backlog",      label: "Backlog"     },
      { value: "to-do",        label: "To Do"       },
      { value: "in-progress",  label: "In Progress" },
      { value: "blocked",      label: "Blocked"     },
      { value: "review",       label: "In Review"   },
      { value: "done",         label: "Done"        },
    ],
  },
];

const ADD_FILTER_LABEL: Record<AddFilterKind, string> = {
  labels:        "Labels",
  "due-date":    "Due Date",
  reporter:      "Reporter",
  "created-date": "Created Date",
  "updated-date": "Updated Date",
};

const ADD_FILTER_KINDS = Object.keys(ADD_FILTER_LABEL) as AddFilterKind[];

const QUICK_FILTERS = ["Mine", "Blocked", "High Priority", "Due Soon", "Recently Updated"];

// Labels for real URL-applied filters handed off from Project Overview's
// Health Alert action and Project Reports' Delivery Progress cards
// (?alerts=overdue,blocked,done,in-progress, etc. — see tickets-screen.tsx).
// "overdue" isn't a real ticket status, so it keeps its own label; every
// other type is a canonical TicketStatus and reuses the app's existing
// STATUS_LABEL mapping instead of a parallel/duplicate label.
const NON_STATUS_ALERT_LABEL: Record<string, string> = { overdue: "Overdue" };

function alertChipLabel(type: string): string {
  return STATUS_LABEL[type as TicketStatus] ?? NON_STATUS_ALERT_LABEL[type] ?? type;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FilterBarState {
  activeChips: Set<string>;
  searchQuery: string;
}

export function FilterBar({
  activeChips,
  onToggleChip,
  searchQuery,
  onSearchChange,
  members,
  assigned,
  onAssignedChange,
  priority,
  onPriorityChange,
  status,
  onStatusChange,
  activeAddFilters,
  onAddFilter,
  allLabels,
  labels,
  onLabelsChange,
  reporter,
  onReporterChange,
  dueDateRange,
  onDueDateRangeChange,
  createdDateRange,
  onCreatedDateRangeChange,
  updatedDateRange,
  onUpdatedDateRangeChange,
  alertChipTypes,
  onRemoveAlertChip,
}: {
  activeChips: Set<string>;
  onToggleChip: (label: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  members: OrgMember[];
  /** Controlled by the caller (not local state) so it can be combined with
   *  the quick-filter chips and applied once to the shared ticket list —
   *  see TicketsScreen's filteredTickets. */
  assigned: string[];
  onAssignedChange: (values: string[]) => void;
  priority: string[];
  onPriorityChange: (values: string[]) => void;
  status: string[];
  onStatusChange: (values: string[]) => void;
  /** Which "Add Filter" options currently have a chip showing in the bar —
   *  same controlled-by-the-caller reasoning as assigned/priority/status. */
  activeAddFilters: Set<AddFilterKind>;
  onAddFilter: (kind: AddFilterKind) => void;
  allLabels: string[];
  labels: string[];
  onLabelsChange: (values: string[]) => void;
  reporter: string[];
  onReporterChange: (values: string[]) => void;
  dueDateRange: DateRangeValue;
  onDueDateRangeChange: (value: DateRangeValue) => void;
  createdDateRange: DateRangeValue;
  onCreatedDateRangeChange: (value: DateRangeValue) => void;
  updatedDateRange: DateRangeValue;
  onUpdatedDateRangeChange: (value: DateRangeValue) => void;
  /** Real, already-applied URL filters (Project Overview's Health Alert
   *  action) — rendered with the same FilterChip style as the quick
   *  filters below, never a second chip design. */
  alertChipTypes: string[];
  onRemoveAlertChip: (type: string) => void;
}) {
  const assignedGroups = buildAssignedGroups(members);
  const reporterGroups: DropdownGroup[] = [
    {
      options: members.map((member) => ({
        value: member.id,
        label: member.name,
        displayLabel: member.name.split(" ")[0],
        avatar: member.avatar,
      })),
    },
  ];
  const labelGroups: DropdownGroup[] = [
    { options: allLabels.map((l) => ({ value: l, label: l })) },
  ];
  // Menu only offers filters not already showing as a chip — matches the
  // existing Assigned/Priority/Status dropdowns' own "one instance" pattern.
  const addFilterGroups: DropdownGroup[] = [
    {
      options: ADD_FILTER_KINDS.filter((k) => !activeAddFilters.has(k)).map((k) => ({
        value: k,
        label: ADD_FILTER_LABEL[k],
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Search + dropdown filters */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Search */}
        <label className="relative block">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-64 text-sm bg-slate-100 dark:bg-zinc-900 placeholder:text-slate-400 dark:placeholder:text-zinc-500 text-slate-800 dark:text-zinc-100 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
          />
        </label>

        <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1 hidden sm:block" />

        {/* Dropdown filters */}
        <FilterDropdown
          label="Assigned"
          mode="single"
          groups={assignedGroups}
          selected={assigned}
          onChange={onAssignedChange}
          searchable
        />
        <FilterDropdown
          label="Priority"
          mode="multi"
          groups={PRIORITY_GROUPS}
          selected={priority}
          onChange={onPriorityChange}
        />
        <FilterDropdown
          label="Status"
          mode="multi"
          groups={STATUS_GROUPS}
          selected={status}
          onChange={onStatusChange}
        />

        {/* Filters added via "Add Filter" — same FilterDropdown pattern as
            Assigned/Priority/Status; clearing a chip's value back to empty
            removes it from the bar (see the onChange handlers below). */}
        {activeAddFilters.has("labels") && (
          <FilterDropdown
            label="Labels"
            mode="multi"
            groups={labelGroups}
            selected={labels}
            onChange={onLabelsChange}
            searchable
          />
        )}
        {activeAddFilters.has("reporter") && (
          <FilterDropdown
            label="Reporter"
            mode="multi"
            groups={reporterGroups}
            selected={reporter}
            onChange={onReporterChange}
            searchable
          />
        )}
        {activeAddFilters.has("due-date") && (
          <DateRangeFilterDropdown label="Due Date" value={dueDateRange} onChange={onDueDateRangeChange} />
        )}
        {activeAddFilters.has("created-date") && (
          <DateRangeFilterDropdown label="Created Date" value={createdDateRange} onChange={onCreatedDateRangeChange} />
        )}
        {activeAddFilters.has("updated-date") && (
          <DateRangeFilterDropdown label="Updated Date" value={updatedDateRange} onChange={onUpdatedDateRangeChange} />
        )}

        <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1 hidden sm:block" />

        {/* Add Filter */}
        <FilterDropdown
          label="Add Filter"
          mode="menu"
          groups={addFilterGroups}
          selected={[]}
          onChange={(values) => onAddFilter(values[0] as AddFilterKind)}
          align="right"
          variant="add"
        />
      </div>

      {/* Quick filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {QUICK_FILTERS.map((label) => (
          <FilterChip
            key={label}
            label={label}
            active={activeChips.has(label)}
            onToggle={() => onToggleChip(label)}
          />
        ))}
        {/* Real URL-applied filters (Project Overview's Health Alert action,
            Project Reports' Delivery Progress cards) — same FilterChip
            style/remove interaction as the quick filters above. Skips any
            type whose label is already shown active via a quick filter
            (e.g. "Blocked") so the same filter is never rendered as two
            separate chips. */}
        {alertChipTypes
          .filter((type) => !activeChips.has(alertChipLabel(type)))
          .map((type) => (
            <FilterChip
              key={`alert-${type}`}
              label={alertChipLabel(type)}
              active
              onToggle={() => onRemoveAlertChip(type)}
            />
          ))}
      </div>
    </div>
  );
}
