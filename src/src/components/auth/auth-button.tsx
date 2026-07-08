"use client";

import { forwardRef, type ReactNode } from "react";

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export const AuthSubmitButton = forwardRef<
  HTMLButtonElement,
  { loading?: boolean; disabled?: boolean; type?: "submit" | "button"; onClick?: () => void; children: ReactNode }
>(function AuthSubmitButton({ loading = false, disabled = false, type = "submit", onClick, children }, ref) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={
        "w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all " +
        (isDisabled
          ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed"
          : "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30")
      }
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function AuthSecondaryButton({
  loading = false,
  disabled = false,
  onClick,
  children,
}: {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
