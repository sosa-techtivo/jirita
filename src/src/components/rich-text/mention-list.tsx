"use client";

// The @mention picker popup — rendered imperatively by mention-suggestion.ts
// (via Tiptap's ReactRenderer) whenever the user types "@" inside a
// RichTextEditor that was given `mentionCandidates`. Positioning is handled
// entirely by Suggestion's own `props.mount()` (Floating UI under the
// hood); this component only ever renders the list itself, same "reuse
// what's given, don't reinvent positioning" scope as everywhere else this
// feature touches.

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { MentionCandidate } from "./mention-types";

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<
  MentionListRef,
  { items: MentionCandidate[]; command: (item: MentionCandidate) => void }
>(function MentionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // A changed result set (new query, or the roster itself just loaded)
  // always resets the highlighted row back to the top match.
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="w-56 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-black/10 dark:shadow-black/40 px-3 py-2 text-[13px] text-slate-400 dark:text-zinc-600">
        No matching members
      </div>
    );
  }

  return (
    <div className="w-56 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-black/10 dark:shadow-black/40 py-1">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          // mousedown (not click) would otherwise steal focus/selection
          // from the editor a beat before the click itself registers.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => selectItem(index)}
          className={
            "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors " +
            (index === selectedIndex
              ? "bg-brand-50/60 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400"
              : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60")
          }
        >
          <Avatar src={item.avatar} name={item.name} className="w-6 h-6 rounded-full flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium truncate">{item.name}</span>
            <span className="block text-[11px] text-slate-400 dark:text-zinc-500 truncate">{item.email}</span>
          </span>
        </button>
      ))}
    </div>
  );
});
