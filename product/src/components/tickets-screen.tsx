"use client";

import { useEffect, useMemo, useState } from "react";
import { tickets } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { ViewSwitcher, type ViewMode } from "@/components/tickets/view-switcher";
import { FilterBar } from "@/components/tickets/filter-bar";
import { BoardView } from "@/components/tickets/board-view";
import { ListView } from "@/components/tickets/list-view";
import { CalendarView } from "@/components/tickets/calendar-view";
import { TimelineView } from "@/components/tickets/timeline-view";
import { InsightsView } from "@/components/tickets/insights-view";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";

// ── Persisted state shape ─────────────────────────────────────────────────────

interface SavedState {
  view: ViewMode;
  previewTicketId: string | null;
  activeChips: string[];
  searchQuery: string;
  scrollTop: number;
}

function sessionKey(slug: string) {
  return `jirita-tickets-${slug}`;
}

// Read (but don't yet remove) saved state on render so it's available to useState.
// Removal happens in useEffect to avoid strict-mode double-invoke issues.
function readSaved(slug: string): SavedState | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(sessionKey(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedState;
  } catch {
    return null;
  }
}

function saveState(slug: string, state: SavedState) {
  sessionStorage.setItem(sessionKey(slug), JSON.stringify(state));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TicketsScreen({ slug, projectName }: { slug: string; projectName: string }) {
  // Read saved state once per mount (useMemo with [] deps).
  // We keep it in sessionStorage until useEffect clears it, so strict-mode
  // double-invocation doesn't lose it on the "real" render.
  const saved = useMemo(() => readSaved(slug), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [view, setView] = useState<ViewMode>(saved?.view ?? "board");
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(() => {
    if (!saved?.previewTicketId) return null;
    return tickets.find((t) => t.id === saved.previewTicketId) ?? null;
  });
  const [activeChips, setActiveChips] = useState<Set<string>>(
    () => new Set(saved?.activeChips ?? [])
  );
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? "");

  // Clear sessionStorage and restore scroll after first render
  useEffect(() => {
    const raw = sessionStorage.getItem(sessionKey(slug));
    if (raw) {
      sessionStorage.removeItem(sessionKey(slug));
      try {
        const state = JSON.parse(raw) as SavedState;
        if (state.scrollTop) {
          const main = document.querySelector("main");
          if (main) main.scrollTop = state.scrollTop;
        }
      } catch {}
    }
  }, [slug]);

  function toggleChip(label: string) {
    setActiveChips((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function openPreview(ticket: Ticket) {
    setPreviewTicket(ticket);
  }

  function closePreview() {
    setPreviewTicket(null);
  }

  // Called synchronously when the user clicks "Expand" — saves full page state
  // to sessionStorage so the tickets page can restore it on return.
  function handleBeforeExpand() {
    const main = document.querySelector("main");
    saveState(slug, {
      view,
      previewTicketId: previewTicket?.id ?? null,
      activeChips: [...activeChips],
      searchQuery,
      scrollTop: main?.scrollTop ?? 0,
    });
  }

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
              Tickets
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Track and manage all work items for this project.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 mt-0.5">
            <ViewSwitcher view={view} onChange={setView} />
            <button
              type="button"
              className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20 whitespace-nowrap"
            >
              + New Ticket
            </button>
          </div>
        </div>

        <FilterBar
          activeChips={activeChips}
          onToggleChip={toggleChip}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="mt-4 border-b border-slate-200 dark:border-zinc-800" />
      </div>

      {/* Content area */}
      {view === "board" ? (
        <BoardView tickets={tickets} onTicketClick={openPreview} />
      ) : view === "calendar" ? (
        <CalendarView tickets={tickets} onTicketClick={openPreview} />
      ) : view === "timeline" ? (
        <TimelineView tickets={tickets} onTicketClick={openPreview} />
      ) : view === "insights" ? (
        <InsightsView tickets={tickets} onTicketClick={openPreview} />
      ) : (
        <ListView tickets={tickets} onTicketClick={openPreview} />
      )}

      {previewTicket !== null && (
        <TicketPreviewPanel
          ticket={previewTicket}
          slug={slug}
          onClose={closePreview}
          onBeforeNavigate={handleBeforeExpand}
        />
      )}
    </div>
  );
}
