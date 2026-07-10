"use client";

import { useEffect, useRef, useState } from "react";
import { formatISODate } from "@/components/tickets/ticket-ui";

// A "Due Date"/"Created Date"/"Updated Date" filter needs a from/to range,
// which FilterDropdown's option-list popover can't render — this mirrors
// FilterDropdown's exact trigger/popover chrome (same classes, same
// clear-to-remove "x") so it reads as the same filter pattern, just with a
// small date-range form as its popover content instead of a list of options.

export interface DateRangeValue {
  from: string; // ISO yyyy-mm-dd, "" = unset
  to: string;   // ISO yyyy-mm-dd, "" = unset
}

export const EMPTY_DATE_RANGE: DateRangeValue = { from: "", to: "" };

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

export function DateRangeFilterDropdown({
  label,
  value,
  onChange,
  align = "left",
}: {
  label: string;
  value: DateRangeValue;
  /** Clearing both dates back to "" is how the caller knows to remove this
   *  filter from the bar — same "clear = gone" convention FilterDropdown
   *  already uses for its own built-in filters. */
  onChange: (next: DateRangeValue) => void;
  align?: "left" | "right";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const hasSelection = Boolean(value.from || value.to);

  let buttonLabel = label;
  if (hasSelection) {
    if (value.from && value.to) buttonLabel = `${label}: ${formatISODate(value.from)} – ${formatISODate(value.to)}`;
    else if (value.from) buttonLabel = `${label}: From ${formatISODate(value.from)}`;
    else buttonLabel = `${label}: Until ${formatISODate(value.to)}`;
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(EMPTY_DATE_RANGE);
  }

  const triggerBase =
    "inline-flex items-center gap-0.5 text-sm px-2 py-1.5 rounded-md transition-colors";
  const triggerActive =
    "text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 font-medium";
  const triggerDefault =
    "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={[triggerBase, hasSelection ? triggerActive : triggerDefault].join(" ")}
      >
        <span className="max-w-[150px] truncate">{buttonLabel}</span>
        {hasSelection ? (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(EMPTY_DATE_RANGE);
              }
            }}
            className="ml-0.5 text-brand-500 hover:text-brand-700 dark:hover:text-brand-300 transition-colors flex-shrink-0"
            aria-label={`Clear ${label} filter`}
          >
            <XIcon />
          </span>
        ) : (
          <ChevronDown />
        )}
      </button>

      <div
        role="dialog"
        aria-label={`${label} filter`}
        className={[
          "absolute top-full mt-1.5 z-50 w-max min-w-[200px]",
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
        <div className="p-3 space-y-2.5">
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-1">From</span>
            <input
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="w-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-1">To</span>
            <input
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="w-full text-sm bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
