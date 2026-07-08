import type { ReactNode } from "react";

// Shared primitives for settings-style forms — originally local to
// settings-section-screen.tsx, extracted so project-settings-screen.tsx can
// reuse the same visual language without duplicating it.

export function Toggle({ on = true }: { on?: boolean }) {
  return (
    <div className={`relative w-9 h-5 rounded-full flex-shrink-0 ${on ? "bg-brand-500" : "bg-slate-200 dark:bg-zinc-700"}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </div>
  );
}

export function SelectField({ value, disabled = false }: { value: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors min-w-[160px] justify-between disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-zinc-900"
    >
      {value}
      <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

export function TextField({
  value,
  width = "w-52",
  disabled = false,
  placeholder,
}: {
  value: string;
  width?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      defaultValue={value}
      disabled={disabled}
      placeholder={placeholder}
      className={`text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-500 dark:focus:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-zinc-900 ${width}`}
    />
  );
}

export function NumberField({
  value,
  suffix,
  disabled = false,
}: {
  value: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        defaultValue={value}
        disabled={disabled}
        className="text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-500 dark:focus:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-zinc-900 w-20 text-center"
      />
      {suffix && <span className="text-[12px] text-slate-400 dark:text-zinc-500">{suffix}</span>}
    </div>
  );
}

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 last:border-0 border-b border-slate-100 dark:border-zinc-800/70">
      <div>
        <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">{label}</p>
        {hint && <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-3">{title}</h3>
      <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 px-5">
        {children}
      </div>
    </div>
  );
}

export function Chip({
  label,
  color = "slate",
}: {
  label: string;
  color?: "slate" | "blue" | "green" | "amber" | "red" | "violet" | "sky" | "emerald" | "orange";
}) {
  const colors: Record<string, string> = {
    slate:   "bg-slate-100   text-slate-600   dark:bg-zinc-800     dark:text-zinc-400",
    blue:    "bg-blue-50     text-blue-700    dark:bg-blue-500/10   dark:text-blue-400",
    green:   "bg-green-50    text-green-700   dark:bg-green-500/10  dark:text-green-400",
    amber:   "bg-amber-50    text-amber-700   dark:bg-amber-500/10  dark:text-amber-400",
    red:     "bg-red-50      text-red-700     dark:bg-red-500/10    dark:text-red-400",
    violet:  "bg-violet-50   text-violet-700  dark:bg-violet-500/10 dark:text-violet-400",
    sky:     "bg-sky-50      text-sky-700     dark:bg-sky-500/10    dark:text-sky-400",
    emerald: "bg-emerald-50  text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    orange:  "bg-orange-50   text-orange-700  dark:bg-orange-500/10 dark:text-orange-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${colors[color]}`}>
      {label}
    </span>
  );
}
