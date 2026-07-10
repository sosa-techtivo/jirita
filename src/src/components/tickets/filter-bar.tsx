"use client";

import { useState } from "react";
import { FilterChip } from "@/components/tickets/filter-chip";
import { FilterDropdown, type DropdownGroup } from "@/components/tickets/filter-dropdown";
import type { OrgMember } from "@/lib/projects";

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

const PRIORITY_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "highest", label: "Highest" },
      { value: "high",    label: "High"    },
      { value: "medium",  label: "Medium"  },
      { value: "low",     label: "Low"     },
    ],
  },
];

const STATUS_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "backlog",      label: "Inbox"       },
      { value: "to-do",        label: "To Do"       },
      { value: "in-progress",  label: "In Progress" },
      { value: "blocked",      label: "Blocked"     },
      { value: "review",       label: "In Review"   },
      { value: "done",         label: "Done"        },
    ],
  },
];

const ADD_FILTER_GROUPS: DropdownGroup[] = [
  {
    options: [
      { value: "labels",       label: "Labels"       },
      { value: "due-date",     label: "Due Date"     },
      { value: "reporter",     label: "Reporter"     },
      { value: "created-date", label: "Created Date" },
      { value: "updated-date", label: "Updated Date" },
    ],
  },
];

const QUICK_FILTERS = ["Mine", "Blocked", "High Priority", "Due Soon", "Recently Updated"];

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
}: {
  activeChips: Set<string>;
  onToggleChip: (label: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  members: OrgMember[];
}) {
  const [assigned,  setAssigned]  = useState<string[]>([]);
  const [priority,  setPriority]  = useState<string[]>([]);
  const [status,    setStatus]    = useState<string[]>([]);
  const assignedGroups = buildAssignedGroups(members);

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
          onChange={setAssigned}
          searchable
        />
        <FilterDropdown
          label="Priority"
          mode="multi"
          groups={PRIORITY_GROUPS}
          selected={priority}
          onChange={setPriority}
        />
        <FilterDropdown
          label="Status"
          mode="multi"
          groups={STATUS_GROUPS}
          selected={status}
          onChange={setStatus}
        />

        <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1 hidden sm:block" />

        {/* Add Filter */}
        <FilterDropdown
          label="Add Filter"
          mode="menu"
          groups={ADD_FILTER_GROUPS}
          selected={[]}
          onChange={() => {}}
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
      </div>
    </div>
  );
}
