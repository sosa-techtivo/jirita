"use client";

import { FilterChip } from "@/components/tickets/filter-chip";

const DROPDOWN_FILTERS = [
  { label: "Assigned" },
  { label: "Priority" },
  { label: "Milestone" },
  { label: "Status" },
];

const QUICK_FILTERS = ["Mine", "Blocked", "High Priority", "Due Soon", "Recently Updated"];

export interface FilterBarState {
  activeChips: Set<string>;
  searchQuery: string;
}

export function FilterBar({
  activeChips,
  onToggleChip,
  searchQuery,
  onSearchChange,
}: {
  activeChips: Set<string>;
  onToggleChip: (label: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
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
        {DROPDOWN_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className="inline-flex items-center gap-0.5 text-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            {f.label}
            <svg
              className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-600 mt-px"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ))}

        <span className="w-px h-4 bg-slate-200 dark:bg-zinc-700 mx-1 hidden sm:block" />

        {/* Add filter */}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Filter
        </button>
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
