"use client";

import { useState } from "react";
import { tickets } from "@/lib/mock-tickets";
import { ViewSwitcher, type ViewMode } from "@/components/tickets/view-switcher";
import { FilterBar } from "@/components/tickets/filter-bar";
import { BoardView } from "@/components/tickets/board-view";
import { ListView } from "@/components/tickets/list-view";
import { CalendarView } from "@/components/tickets/calendar-view";
import { TimelineView } from "@/components/tickets/timeline-view";

export function TicketsScreen({ slug, projectName }: { slug: string; projectName: string }) {
  const [view, setView] = useState<ViewMode>("board");

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          {/* Title + description */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none">
              Tickets
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              Track and manage all work items for this project.
            </p>
          </div>

          {/* View switcher + CTA — same row */}
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

        {/* Filter bar */}
        <FilterBar />

        <div className="mt-4 border-b border-slate-200 dark:border-zinc-800" />
      </div>

      {/* Content area — fills remaining height */}
      {view === "board" ? (
        <BoardView tickets={tickets} slug={slug} />
      ) : view === "calendar" ? (
        <CalendarView tickets={tickets} slug={slug} />
      ) : view === "timeline" ? (
        <TimelineView tickets={tickets} slug={slug} />
      ) : (
        <ListView tickets={tickets} slug={slug} />
      )}
    </div>
  );
}
