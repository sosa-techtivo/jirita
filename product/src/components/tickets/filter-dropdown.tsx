"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DropdownOption {
  value: string;
  label: string;
  displayLabel?: string; // short form used in the button label (e.g. "Sarah" for "Sarah Chen")
  avatar?: string;
}

export interface DropdownGroup {
  divider?: boolean; // show a separator line before this group
  options: DropdownOption[];
}

export type FilterMode = "single" | "multi" | "menu";

interface FilterDropdownProps {
  label: string;
  mode: FilterMode;
  groups: DropdownGroup[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  align?: "left" | "right";
  variant?: "default" | "add";
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevronDown() {
  return (
    <svg
      className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 dark:text-zinc-600 mt-px"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-3 h-3"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const ANYONE = "__anyone__";

export function FilterDropdown({
  label,
  mode,
  groups,
  selected,
  onChange,
  searchable = false,
  align = "left",
  variant = "default",
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Focus search field when popover opens
  useEffect(() => {
    if (isOpen && searchable) {
      const id = setTimeout(() => searchRef.current?.focus(), 10);
      return () => clearTimeout(id);
    }
    if (!isOpen) setSearch("");
  }, [isOpen, searchable]);

  // ── Button label ────────────────────────────────────────────────────────────

  const allOptions = groups.flatMap((g) => g.options);
  const hasSelection = mode !== "menu" && selected.length > 0;

  let buttonLabel = label;
  if (hasSelection) {
    const first = allOptions.find((o) => o.value === selected[0]);
    const firstDisplay = first?.displayLabel ?? first?.label ?? selected[0];
    buttonLabel = `${label}: ${firstDisplay}`;
    if (selected.length > 1) buttonLabel += ` +${selected.length - 1}`;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleOptionClick(value: string) {
    if (mode === "menu") {
      setIsOpen(false);
      return;
    }
    if (mode === "single") {
      if (value === ANYONE || selected[0] === value) {
        onChange([]);
      } else {
        onChange([value]);
      }
      setIsOpen(false);
    } else {
      // multi — keep popover open
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      onChange(next);
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  // ── Filtered groups ─────────────────────────────────────────────────────────

  const filteredGroups =
    searchable && search.trim()
      ? groups
          .map((g) => ({
            ...g,
            options: g.options.filter((o) =>
              o.label.toLowerCase().includes(search.toLowerCase())
            ),
          }))
          .filter((g) => g.options.length > 0)
      : groups;

  // ── Render ──────────────────────────────────────────────────────────────────

  const triggerBase =
    "inline-flex items-center gap-0.5 text-sm px-2 py-1.5 rounded-md transition-colors";

  const triggerActive = hasSelection
    ? "text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 font-medium"
    : "";

  const triggerDefault =
    "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800";

  const triggerAdd =
    "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800";

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={[
          triggerBase,
          variant === "add" ? triggerAdd : hasSelection ? triggerActive : triggerDefault,
        ].join(" ")}
      >
        {variant === "add" && <PlusIcon />}
        <span className="max-w-[150px] truncate">{buttonLabel}</span>
        {hasSelection ? (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange([]);
              }
            }}
            className="ml-0.5 text-brand-500 hover:text-brand-700 dark:hover:text-brand-300 transition-colors flex-shrink-0"
            aria-label={`Clear ${label} filter`}
          >
            <XIcon />
          </span>
        ) : (
          !hasSelection && <ChevronDown />
        )}
      </button>

      {/* Popover */}
      <div
        role="dialog"
        aria-label={`${label} filter`}
        className={[
          "absolute top-full mt-1.5 z-50 w-max min-w-[200px] max-w-[280px]",
          "rounded-xl border bg-white dark:bg-zinc-900",
          "shadow-lg shadow-black/10 dark:shadow-black/40",
          "border-slate-200 dark:border-zinc-700/60",
          "transition-all duration-150 origin-top",
          align === "right" ? "right-0" : "left-0",
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none",
        ].join(" ")}
      >
        {/* Search field */}
        {searchable && (
          <div className="px-2 pt-2 pb-1">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm bg-slate-100 dark:bg-zinc-800 placeholder:text-slate-400 dark:placeholder:text-zinc-600 text-slate-800 dark:text-zinc-100 rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
            />
          </div>
        )}

        {/* Options */}
        <div className="py-1.5">
          {filteredGroups.map((group, gi) => (
            <div key={gi}>
              {group.divider && gi > 0 && (
                <div className="my-1 mx-2 border-t border-slate-100 dark:border-zinc-800" />
              )}
              {group.options.map((option) => {
                const isAnyone = option.value === ANYONE;
                const isSelected =
                  mode !== "menu" &&
                  (isAnyone
                    ? selected.length === 0
                    : selected.includes(option.value));

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleOptionClick(option.value)}
                    className={[
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors",
                      isSelected
                        ? "text-brand-700 dark:text-brand-400 bg-brand-50/60 dark:bg-brand-500/10"
                        : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60",
                    ].join(" ")}
                  >
                    {/* Selection indicator */}
                    {mode === "multi" && (
                      <span
                        className={[
                          "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          isSelected
                            ? "bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500"
                            : "border-slate-300 dark:border-zinc-600",
                        ].join(" ")}
                      >
                        {isSelected && (
                          <span className="text-white">
                            <CheckIcon />
                          </span>
                        )}
                      </span>
                    )}
                    {mode === "single" && (
                      <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-brand-600 dark:text-brand-400">
                        {isSelected && <CheckIcon />}
                      </span>
                    )}

                    {/* Avatar */}
                    {option.avatar && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={option.avatar}
                        alt={option.label}
                        className="w-5 h-5 rounded-full flex-shrink-0"
                      />
                    )}

                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {filteredGroups.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400 dark:text-zinc-600">
              No results
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
