"use client";

import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { FIELD_LABEL, INPUT, INPUT_ERROR } from "./field-styles";

function EyeIcon({ crossedOut }: { crossedOut: boolean }) {
  if (crossedOut) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path
          d="M17.94 17.94A10.94 10.94 0 0112 20c-5.5 0-9.5-4.5-10.5-8 .6-2.1 1.9-4.2 3.6-5.7M9.9 4.24A10.4 10.4 0 0112 4c5.5 0 9.5 4.5 10.5 8-.36 1.28-1 2.6-1.9 3.8M14.12 14.12a3 3 0 11-4.24-4.24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M1 1l22 22" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path
        d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Reusable password input: show/hide toggle plus an optional discreet Caps
// Lock notice (login only needs the latter — reset password relies on the
// strength meter instead).
export const AuthPasswordField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    error?: string;
    showCapsLockWarning?: boolean;
  } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function AuthPasswordField(
  { label, error, showCapsLockWarning = false, className, onKeyUp, onKeyDown, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  function handleModifierCheck(e: KeyboardEvent<HTMLInputElement>) {
    if (showCapsLockWarning && typeof e.getModifierState === "function") {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  }

  return (
    <div>
      <label className={FIELD_LABEL}>{label}</label>
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          className={`${INPUT} pr-9 ${error ? INPUT_ERROR : ""} ${className ?? ""}`}
          onKeyDown={(e) => {
            handleModifierCheck(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            handleModifierCheck(e);
            onKeyUp?.(e);
          }}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors"
        >
          <EyeIcon crossedOut={visible} />
        </button>
      </div>
      {showCapsLockWarning && capsLockOn && !error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Caps Lock is on
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
});
