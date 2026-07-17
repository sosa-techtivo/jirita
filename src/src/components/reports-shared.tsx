"use client";

import { useState, useEffect, Fragment } from "react";
import type { ReactNode } from "react";

// Presentational pieces shared between the Admin/company-wide Reports page
// and the Project Lead's scoped Reports page — kept here (rather than in
// reports-screen.tsx) so neither screen has to import the other.

export interface StatusItem {
  id: string;
  level: "warning" | "critical" | "ok";
  text: string;
}

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
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
  ok: "text-emerald-700 dark:text-emerald-500",
};

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

export function KpiCard({
  label,
  value,
  sub,
  accent,
  danger,
  progress,
  disabled,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
  progress?: number;
  /** True when there's nothing real to navigate to (e.g. "My Projects" with
   *  zero real projects) — suppresses the hover/lift affordance below and
   *  is never wrapped in a button, so it never shows a cursor or responds
   *  to a click. Only "My Projects" (Project Lead Reports) passes this
   *  today; every other card omits both this and `onClick` and keeps its
   *  existing plain, non-interactive rendering exactly as before. */
  disabled?: boolean;
  /** Real navigation handler — when present (and not `disabled`), the whole
   *  card becomes a single clickable surface instead of a plain block. */
  onClick?: () => void;
}) {
  const content = (
    <>
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
      {sub && <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} />
        </div>
      )}
    </>
  );

  const baseClassName = [
    "rounded-xl border px-5 pt-4 shadow-sm shadow-slate-200/40 dark:shadow-black/20",
    "transition-all duration-200",
    progress !== undefined ? "pb-3" : "pb-4",
    accent
      ? "border-brand-100 dark:border-brand-700/40 bg-brand-50/40 dark:bg-brand-500/5"
      : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900",
    disabled ? "" : "hover:shadow-md hover:-translate-y-px",
  ].join(" ");

  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={`${baseClassName} text-left w-full`}>
        {content}
      </button>
    );
  }

  return <div className={baseClassName}>{content}</div>;
}

export function Section({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: ReactNode;
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

export function BlockCompletion({ pct }: { pct: number }) {
  const TOTAL = 10;
  const filled = Math.round(pct / 10);
  const empty = TOTAL - filled;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[13px] leading-none select-none" aria-hidden>
        <span className="text-brand-500">{"█".repeat(filled)}</span>
        <span className="text-slate-200 dark:text-zinc-700">{"░".repeat(empty)}</span>
      </span>
      <span className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums w-8">{pct}%</span>
    </span>
  );
}

export function AnimatedBar({ pct, className }: { pct: number; className: string }) {
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
