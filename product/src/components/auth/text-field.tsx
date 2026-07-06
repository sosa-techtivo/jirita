"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { FIELD_LABEL, INPUT, INPUT_ERROR } from "./field-styles";

export const AuthTextField = forwardRef<
  HTMLInputElement,
  { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>
>(function AuthTextField({ label, error, className, ...props }, ref) {
  return (
    <div>
      <label className={FIELD_LABEL}>{label}</label>
      <input
        ref={ref}
        aria-invalid={!!error}
        className={`${INPUT} ${error ? INPUT_ERROR : ""} ${className ?? ""}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
});
