"use client";

// Shared array-editor UI for a ticket's Acceptance Criteria list — the same
// component and the same underlying data structure (a plain, ordered
// string[]) new-ticket-modal.tsx's own Acceptance Criteria field uses, so
// Ticket Detail's edit mode (ticket-detail-screen.tsx's
// EditableAcceptanceCriteria) can never drift from what creating a ticket
// already looks/behaves like. Purely presentational — no internal state —
// each caller owns its own criteria array (and, in Ticket Detail's case,
// a paired per-row "done" flag the caller keeps outside this component)
// and passes add/update/remove handlers straight through.

import type { RefObject } from "react";

export function AcceptanceCriteriaFields({
  criteria,
  inputRefs,
  onAdd,
  onUpdate,
  onRemove,
}: {
  criteria: string[];
  inputRefs: RefObject<(HTMLInputElement | null)[]>;
  onAdd: () => void;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      {criteria.length > 0 && (
        <div className="mb-2 border border-slate-200 dark:border-zinc-800 rounded-lg divide-y divide-slate-100 dark:divide-zinc-800">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 group">
              {/* Visual checkbox */}
              <div className="w-3.5 h-3.5 rounded border-[1.5px] border-slate-300 dark:border-zinc-600 flex-shrink-0" />
              {/* Text input */}
              <input
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                value={c}
                placeholder="Add a criterion…"
                onChange={(e) => onUpdate(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onAdd(); }
                  if (e.key === "Backspace" && !c) {
                    e.preventDefault();
                    onRemove(i);
                    inputRefs.current[i - 1]?.focus();
                  }
                }}
                className="flex-1 bg-transparent text-[16px] sm:text-[13px] text-slate-800 dark:text-zinc-200 outline-none placeholder:text-slate-300 dark:placeholder:text-zinc-600 min-w-0"
              />
              {/* Remove */}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove criterion"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded text-slate-400 dark:text-zinc-600 hover:text-slate-700 dark:hover:text-zinc-300 transition-opacity flex-shrink-0"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 dark:text-zinc-600 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Add criterion
      </button>
    </>
  );
}
