"use client";

export function FilterChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-all duration-150",
        active
          ? "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/30"
          : "bg-white text-slate-600 border-slate-300 hover:border-slate-400 hover:text-slate-800 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-600 dark:hover:border-zinc-500 dark:hover:text-zinc-100",
      ].join(" ")}
    >
      {active && (
        <svg
          className="w-2.5 h-2.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      )}
      {label}
    </button>
  );
}
