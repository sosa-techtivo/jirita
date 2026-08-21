"use client";

// Sprint MVP — the Tickets/Board header's sprint context selector, plus the
// "Manage sprint" entry point next to it. Reuses FilterDropdown (the exact
// same component filter-bar.tsx already uses for Assigned/Priority/Status)
// rather than a bespoke dropdown, per this app's own "stay consistent with
// existing dropdowns" convention.
//
// The context value is one of: "all" (global behavior, unchanged), "backlog"
// (sprint_id is null), or a real sprints.id (that sprint's own tickets only).
// Always exactly one selected — re-clicking the active option clears the
// underlying FilterDropdown selection to `[]`, which the caller normalizes
// back to "all" (see tickets-screen.tsx), the same way clearing every other
// single-select filter here means "no restriction."

import { FilterDropdown, type DropdownGroup } from "@/components/tickets/filter-dropdown";
import { STATUS_CLASS } from "@/components/tickets/ticket-ui";
import type { Sprint } from "@/lib/sprints";

export const SPRINT_CONTEXT_ALL = "all";
export const SPRINT_CONTEXT_BACKLOG = "backlog";

// Trigger-button pill classes for the current Sprint context — same
// StatusBadge `bg-*/text-*` convention (ticket-ui.tsx), applied via
// FilterDropdown's own optional badgeClassName. Backlog reuses that
// status's exact existing badge class; a closed sprint reuses the same
// neutral family, one shade quieter; an active sprint gets a soft green
// — deliberately plain `green`, not `emerald` (STATUS_CLASS.done's own
// color), so "active sprint" is never mistaken for a Done state.
// Exported so ticket-detail-screen.tsx's own read-only Sprint field can
// reuse the exact same three classes instead of a second, drifting copy.
export const SPRINT_BACKLOG_BADGE_CLASS = STATUS_CLASS.backlog;
export const SPRINT_ACTIVE_BADGE_CLASS = "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400";
export const SPRINT_CLOSED_BADGE_CLASS = "bg-slate-50 text-slate-400 dark:bg-zinc-800/60 dark:text-zinc-500";
// Neutral gray "has a selection" trigger container for Sprint specifically
// — the generic FilterDropdown default there is brand/purple (Assigned/
// Priority/Status keep that), but Sprint's own value already carries its
// own status color via the badge above, so its outer container instead
// stays the same neutral gray family as the Backlog/closed badges.
const SPRINT_TRIGGER_ACTIVE_CLASS = "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 font-medium";

function buildSprintGroups(sprints: Sprint[]): DropdownGroup[] {
  const active = sprints.find((s) => s.status === "active");
  const closed = sprints.filter((s) => s.status === "closed");

  const groups: DropdownGroup[] = [
    {
      options: [
        { value: SPRINT_CONTEXT_ALL, label: "All tickets" },
        { value: SPRINT_CONTEXT_BACKLOG, label: "Backlog", badgeClassName: SPRINT_BACKLOG_BADGE_CLASS },
      ],
    },
  ];

  if (active) {
    groups.push({
      divider: true,
      options: [{ value: active.id, label: active.name, badgeClassName: SPRINT_ACTIVE_BADGE_CLASS }],
    });
  }

  if (closed.length > 0) {
    groups.push({
      divider: true,
      options: closed.map((s) => ({ value: s.id, label: s.name, badgeClassName: SPRINT_CLOSED_BADGE_CLASS })),
    });
  }

  return groups;
}

function ManageSprintIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 12h9.75M10.5 18h9.75M3.75 6h.007v.008H3.75V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 18h.007v.008H3.75V18zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

export function SprintContextSelector({
  sprints,
  value,
  onChange,
  canManage,
  onManage,
}: {
  sprints: Sprint[];
  value: string;
  onChange: (value: string) => void;
  canManage: boolean;
  onManage: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FilterDropdown
        label="Sprint"
        mode="single"
        groups={buildSprintGroups(sprints)}
        selected={[value]}
        onChange={(values) => onChange(values[0] ?? SPRINT_CONTEXT_ALL)}
        triggerActiveClassName={SPRINT_TRIGGER_ACTIVE_CLASS}
      />
      {canManage && (
        <button
          type="button"
          onClick={onManage}
          className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded-md text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
        >
          <ManageSprintIcon />
          Manage sprint
        </button>
      )}
    </div>
  );
}
