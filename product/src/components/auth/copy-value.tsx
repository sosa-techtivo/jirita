"use client";

import { useState } from "react";

// Small copy-to-clipboard row used in the login screen's "Prototype
// credentials" box — label + monospace value + a compact copy button that
// swaps to a "Copied" confirmation for a moment.
export function CopyableValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the value is
      // still visible and selectable by hand, so this is a silent no-op.
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-600">
          {label}
        </p>
        <p className="text-[12.5px] font-mono text-slate-700 dark:text-zinc-300 truncate">{value}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="9" y="9" width="11" height="11" rx="1.5" />
              <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
            </svg>
            Copy
          </>
        )}
      </button>
    </div>
  );
}
