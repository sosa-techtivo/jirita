"use client";

export type ViewMode = "list" | "board" | "calendar" | "timeline";

interface ViewOption {
  mode: ViewMode;
  label: string;
  icon: React.ReactNode;
}

const VIEWS: ViewOption[] = [
  {
    mode: "list",
    label: "List",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M9 6H5v3h4V6zM9 15H5v3h4v-3zM21 8H13M21 12H13M21 17H13" />
      </svg>
    ),
  },
  {
    mode: "board",
    label: "Board",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="18" rx="1.5" />
        <rect x="14" y="3" width="7" height="11" rx="1.5" />
      </svg>
    ),
  },
  {
    mode: "calendar",
    label: "Calendar",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    mode: "timeline",
    label: "Timeline",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="currentColor">
        <rect x="1" y="2.5" width="5" height="2.5" rx="1.25" />
        <rect x="4.5" y="6" width="8" height="2.5" rx="1.25" />
        <rect x="2" y="9.5" width="6" height="2.5" rx="1.25" />
      </svg>
    ),
  },
];

export function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.mode}
          type="button"
          onClick={() => onChange(v.mode)}
          className={[
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-xs font-medium transition-all duration-150",
            view === v.mode
              ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm shadow-slate-200/80 dark:shadow-black/40"
              : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
          ].join(" ")}
        >
          {v.icon}
          {v.label}
        </button>
      ))}
    </div>
  );
}
