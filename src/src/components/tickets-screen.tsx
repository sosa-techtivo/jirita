"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tickets as MOCK_TICKETS } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { loadProjectTickets } from "@/lib/tickets";
import { loadOrganizationMembers, type OrgMember } from "@/lib/projects";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { ViewSwitcher, type ViewMode } from "@/components/tickets/view-switcher";
import { FilterBar } from "@/components/tickets/filter-bar";
import { BoardView } from "@/components/tickets/board-view";
import { ListView } from "@/components/tickets/list-view";
import { CalendarView } from "@/components/tickets/calendar-view";
import { TimelineView } from "@/components/tickets/timeline-view";
import { InsightsView } from "@/components/tickets/insights-view";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { getDefaultTicketView } from "@/lib/user-preferences";

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

// Lets another screen (e.g. the Admin Project Overview's blocked-tickets
// banner) hand off to this screen already filtered, by writing into the same
// saved-state slot this screen reads on mount — the same mechanism the
// ticket preview panel already uses to restore view/scroll position.
export function presetTicketsFilter(slug: string, chips: string[]) {
  if (typeof window === "undefined") return;
  saveState(slug, {
    view: "board",
    previewTicketId: null,
    activeChips: chips,
    searchQuery: "",
    scrollTop: 0,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TicketsScreen({ slug, projectName }: { slug: string; projectName: string }) {
  const { user, organization, isDevFallback } = useCurrentUser();
  const canCreateTicket = canManage(user.role);
  const [showNewTicket, setShowNewTicket] = useState(false);
  // Read saved state once per mount (useMemo with [] deps).
  // We keep it in sessionStorage until useEffect clears it, so strict-mode
  // double-invocation doesn't lose it on the "real" render.
  const saved = useMemo(() => readSaved(slug), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev-only fallback: no real organization membership — same mock array
  // used before this feature existed, just scoped to the current project
  // (real data is always scoped this way; see loadProjectTickets). Never
  // reached once a real organization exists.
  const initialDevTickets = useMemo(
    () => (isDevFallback ? MOCK_TICKETS.filter((t) => t.projectSlug === slug) : []),
    [isDevFallback, slug]
  );

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [ticketList, setTicketList] = useState<Ticket[]>(initialDevTickets);
  // Real org members for the Assigned filter's dropdown options only — the
  // filter itself stays unwired (see FilterBar), this just replaces the
  // mock names it used to show. Dev fallback shows none, never mock names.
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [view, setView] = useState<ViewMode>(saved?.view ?? getDefaultTicketView());
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(() => {
    if (!saved?.previewTicketId) return null;
    return MOCK_TICKETS.find((t) => t.id === saved.previewTicketId) ?? null;
  });
  const [activeChips, setActiveChips] = useState<Set<string>>(
    () => new Set(saved?.activeChips ?? [])
  );
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? "");

  const requestIdRef = useRef(0);

  const runFetch = useCallback(() => {
    if (!organization) return;
    const requestId = ++requestIdRef.current;
    loadProjectTickets(organization.id, slug).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (result.status === "ready") {
        setTicketList(result.tickets);
        setLoadState("ready");
      } else if (result.status === "not-found") {
        setTicketList([]);
        setLoadState("ready");
      } else {
        setLoadErrorMessage(result.message);
        setLoadState("error");
      }
    });
  }, [organization, slug]);

  useEffect(() => {
    if (isDevFallback) return; // handled synchronously above — no fetch needed
    runFetch();
  }, [isDevFallback, runFetch]);

  useEffect(() => {
    if (isDevFallback || !organization) return; // dev fallback: no mock members either
    loadOrganizationMembers(organization.id).then((result) => {
      if (result.status === "ready") setMembers(result.members);
    });
  }, [isDevFallback, organization]);

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

  function handleTicketCreated(ticket: Ticket) {
    setTicketList((prev) => [ticket, ...prev]);
    setShowNewTicket(false);
    setPreviewTicket(ticket);
  }

  function handlePreviewDuplicate(ticket: Ticket) {
    setShowNewTicket(false);
    setPreviewTicket(ticket);
  }

  if (loadState === "loading") {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500">
        Loading tickets…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load tickets</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
          {loadErrorMessage ?? "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={runFetch}
          className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          Retry
        </button>
      </div>
    );
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
            {canCreateTicket && (
              <button
                type="button"
                onClick={() => setShowNewTicket(true)}
                className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20 whitespace-nowrap"
              >
                + New Ticket
              </button>
            )}
          </div>
        </div>

        <FilterBar
          activeChips={activeChips}
          onToggleChip={toggleChip}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          members={members}
        />

        {/* Quick stats */}
        <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-500 dark:text-zinc-500">
          <span className="font-semibold text-slate-700 dark:text-zinc-300">{ticketList.length}</span>
          <span>Tickets</span>
          <span className="mx-1 text-slate-200 dark:text-zinc-700">·</span>
          <span className="font-semibold text-slate-700 dark:text-zinc-300">
            {ticketList.reduce((s, t) => s + (t.hours ?? 0), 0)}h
          </span>
          <span>Estimated</span>
          <span className="mx-1 text-slate-200 dark:text-zinc-700">·</span>
          <span className="font-semibold text-red-600 dark:text-red-400">
            {ticketList.filter((t) => t.status === "blocked").length}
          </span>
          <span>Blocked</span>
        </div>

        <div className="mt-3 border-b border-slate-200 dark:border-zinc-800" />
      </div>

      {/* Content area */}
      {view === "board" ? (
        <BoardView tickets={ticketList} onTicketClick={openPreview} />
      ) : view === "calendar" ? (
        <CalendarView tickets={ticketList} onTicketClick={openPreview} />
      ) : view === "timeline" ? (
        <TimelineView tickets={ticketList} onTicketClick={openPreview} />
      ) : view === "insights" ? (
        <InsightsView tickets={ticketList} onTicketClick={openPreview} />
      ) : (
        <ListView tickets={ticketList} onTicketClick={openPreview} />
      )}

      {previewTicket !== null && (
        <TicketPreviewPanel
          ticket={previewTicket}
          slug={slug}
          onClose={closePreview}
          onBeforeNavigate={handleBeforeExpand}
        />
      )}

      {showNewTicket && (
        <NewTicketModal
          slug={slug}
          tickets={ticketList}
          members={members}
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
          onPreviewDuplicate={handlePreviewDuplicate}
        />
      )}
    </div>
  );
}
