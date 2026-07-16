"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { tickets as MOCK_TICKETS, getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { loadProjectTickets, loadOrganizationTickets, loadOrganizationLabels, createOrganizationLabel } from "@/lib/tickets";
import {
  loadOrganizationMembers,
  loadProjectTeam,
  loadOrganizationProjects,
  loadLeadProjects,
  loadMemberProjects,
  type OrgMember,
} from "@/lib/projects";
import { buildLabelCatalog, parseDisplayDate, getTodayISO } from "@/components/tickets/ticket-ui";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { ViewSwitcher, type ViewMode } from "@/components/tickets/view-switcher";
import { FilterBar, type AddFilterKind } from "@/components/tickets/filter-bar";
import { EMPTY_DATE_RANGE, type DateRangeValue } from "@/components/tickets/date-range-filter-dropdown";
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

// `slug` is omitted for the org-wide "all projects" mode (the Admin
// Dashboard's global ticket list, reached at `/tickets` — see
// app/tickets/page.tsx) — every other caller keeps passing a real slug and
// is completely unaffected. `projectName` was already unused in this
// component before this change; left as-is.
export function TicketsScreen({ slug, projectName }: { slug?: string; projectName?: string }) {
  const { user, userId, organization, isDevFallback } = useCurrentUser();
  const canCreateTicket = canManage(user.role) && Boolean(slug);
  // Stable storage/session key for the "all projects" mode, kept distinct
  // from any real project slug so it can never collide with one.
  const scopeKey = slug ?? "__all__";
  // Real query-state handoff from Project Overview's Health Alert action
  // (admin-project-overview.tsx) and Project Reports' Delivery Progress
  // cards (project-reports-screen.tsx) — carried in the URL itself, unlike
  // the sessionStorage-based presetTicketsFilter below, so it survives a
  // refresh or browser back/forward the same way Work History's own
  // `?page=` query param already does.
  const router = useRouter();
  const searchParams = useSearchParams();
  // Project filter — org-wide "all projects" mode only (see
  // availableProjects/selectedProjectSlug below); `?project=` is never read
  // in single-project mode, where the route's own `slug` already fixes it
  // and this filter isn't rendered at all.
  const projectParam = slug ? null : searchParams.get("project");
  const alertsParam = searchParams.get("alerts");
  // De-duplicated (a malformed `?alerts=blocked,blocked` must never apply
  // or display a filter twice) — the single source both the OR-filter below
  // and FilterBar's visible alert chips read from, so they can never drift
  // out of sync with each other.
  const alertTypes = useMemo(
    () => (alertsParam ? Array.from(new Set(alertsParam.split(",").filter(Boolean))) : []),
    [alertsParam]
  );
  // Removes just one alert type from the URL (never touches activeChips,
  // which stays the quick filters' own separate state) — same router.push
  // query-state convention Work History's own `?page=` Previous/Next
  // already uses, so this stays part of browser history like every other
  // real navigation here (back restores the removed chip).
  const removeAlertType = useCallback(
    (type: string) => {
      const remaining = alertTypes.filter((t) => t !== type);
      const params = new URLSearchParams(searchParams.toString());
      if (remaining.length > 0) params.set("alerts", remaining.join(","));
      else params.delete("alerts");
      const qs = params.toString();
      const basePath = slug ? `/projects/${slug}/tickets` : "/tickets";
      router.push(`${basePath}${qs ? `?${qs}` : ""}`);
    },
    [alertTypes, searchParams, router, slug]
  );
  const [showNewTicket, setShowNewTicket] = useState(false);
  // Read saved state once per mount (useMemo with [] deps).
  // We keep it in sessionStorage until useEffect clears it, so strict-mode
  // double-invocation doesn't lose it on the "real" render.
  const saved = useMemo(() => readSaved(scopeKey), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dev-only fallback: no real organization membership — same mock array
  // used before this feature existed, just scoped to the current project
  // when there is one (real data is always scoped this way; see
  // loadProjectTickets), or every mock ticket in the org-wide "all
  // projects" mode (mirrors loadOrganizationTickets below). Never reached
  // once a real organization exists.
  const initialDevTickets = useMemo(
    () => (isDevFallback ? (slug ? MOCK_TICKETS.filter((t) => t.projectSlug === slug) : MOCK_TICKETS) : []),
    [isDevFallback, slug]
  );

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [ticketList, setTicketList] = useState<Ticket[]>(initialDevTickets);
  // Real org members for the Assigned filter's dropdown options only — the
  // filter itself stays unwired (see FilterBar), this just replaces the
  // mock names it used to show. Dev fallback shows none, never mock names.
  const [members, setMembers] = useState<OrgMember[]>([]);
  // Real, project-scoped roster for the actual Assignee-picking UI (New
  // Ticket, Quick Ticket Preview) — deliberately separate from `members`
  // above: only an active member of *this* project can be assigned a
  // ticket in it, but the Assigned filter is intentionally left showing
  // every org member, unchanged (out of scope for this restriction).
  const [assignableMembers, setAssignableMembers] = useState<OrgMember[]>([]);
  // The Project filter's own dropdown options — org-wide "all projects"
  // mode only (see the effect below); stays empty in single-project mode,
  // where the filter itself is never rendered at all.
  const [availableProjects, setAvailableProjects] = useState<{ slug: string; name: string }[]>([]);
  // Real per-org label catalog, only needed for the preview panel's Labels
  // editor (see editable prop below) — same catalog/merge Ticket Detail uses.
  const [orgLabels, setOrgLabels] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>(saved?.view ?? getDefaultTicketView());
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(() => {
    if (!saved?.previewTicketId) return null;
    return MOCK_TICKETS.find((t) => t.id === saved.previewTicketId) ?? null;
  });
  const [activeChips, setActiveChips] = useState<Set<string>>(
    () => new Set(saved?.activeChips ?? [])
  );
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? "");
  // Controlled here (not local to FilterBar) so they can be combined with
  // the quick-filter chips below in one shared filteredTickets — see
  // filter-bar.tsx's own comment on why these are now props, not state.
  const [assigned, setAssigned] = useState<string[]>([]);
  const [priority, setPriority] = useState<string[]>([]);
  const [status,   setStatus]   = useState<string[]>([]);
  // "Add Filter" filters — activeAddFilters tracks which chips are showing
  // in the bar (added via the menu, removed by clearing their value back to
  // empty); the values themselves live in their own state so each one keeps
  // working even while the others are added/removed independently.
  const [activeAddFilters, setActiveAddFilters] = useState<Set<AddFilterKind>>(new Set());
  const [labelsFilter,       setLabelsFilter]       = useState<string[]>([]);
  const [reporterFilter,     setReporterFilter]     = useState<string[]>([]);
  const [dueDateFilter,      setDueDateFilter]      = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const [createdDateFilter,  setCreatedDateFilter]  = useState<DateRangeValue>(EMPTY_DATE_RANGE);
  const [updatedDateFilter,  setUpdatedDateFilter]  = useState<DateRangeValue>(EMPTY_DATE_RANGE);

  const requestIdRef = useRef(0);

  const runFetch = useCallback(() => {
    if (!organization) return;
    const requestId = ++requestIdRef.current;
    // Org-wide "all projects" mode (no slug) loads every project's tickets
    // via the same real, RLS-scoped org-wide loader the Dashboards/Reports
    // already use — never a second/parallel query.
    const result$ = slug ? loadProjectTickets(organization.id, slug) : loadOrganizationTickets(organization.id);
    result$.then((result) => {
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

  useEffect(() => {
    // No single project to staff an Assignee picker from in "all projects"
    // mode — New Ticket is hidden there and the preview panel renders
    // read-only (see `editable` below), so `assignableMembers` simply stays
    // empty rather than loading a roster nothing will use.
    if (isDevFallback || !organization || !slug) return;
    loadProjectTeam(organization.id, slug).then((result) => {
      if (result.status === "ready") setAssignableMembers(result.members);
    });
  }, [isDevFallback, organization, slug]);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    loadOrganizationLabels(organization.id).then((result) => {
      if (result.status === "ready") setOrgLabels(result.labels.map((l) => l.name));
    });
  }, [isDevFallback, organization]);

  // Project filter options — org-wide "all projects" mode only (the
  // per-project Tickets page never renders this filter, so there's nothing
  // to load there). Scoped per the same real permission rule each role's
  // own "current project" picker elsewhere in this app already uses:
  // Admin sees every active org project (loadOrganizationProjects, RLS
  // already returns everything for an admin); Project Lead only projects
  // where they hold `project_memberships.project_role = 'lead'`
  // (loadLeadProjects — the exact same query the Project Lead Dashboard's
  // own Current Project selector uses); Member only projects with any real
  // active membership (loadMemberProjects — same as the Member Dashboard's
  // own project scope selector).
  useEffect(() => {
    if (isDevFallback || !organization || slug) return;
    if (user.role === "PROJECT_LEAD") {
      if (!userId) return;
      loadLeadProjects(organization.id, userId).then((result) => {
        if (result.status === "ready") setAvailableProjects(result.projects.map((p) => ({ slug: p.slug, name: p.name })));
      });
    } else if (user.role === "MEMBER") {
      if (!userId) return;
      loadMemberProjects(organization.id, userId).then((result) => {
        if (result.status === "ready") setAvailableProjects(result.projects.map((p) => ({ slug: p.slug, name: p.name })));
      });
    } else {
      loadOrganizationProjects(organization.id).then((result) => {
        if (result.status === "ready") {
          setAvailableProjects(
            result.projects.filter((p) => p.status === "active").map((p) => ({ slug: p.slug, name: p.name }))
          );
        }
      });
    }
  }, [isDevFallback, organization, slug, user.role, userId]);

  // Validated against the real, permission-scoped options list — same
  // "ignore a stale/inaccessible slug, fall back to unset" precedent the
  // Admin/Project Lead/Member Dashboards' own `?project=` scope selectors
  // already use (dashboard-screen.tsx's selectedProjectSlug), rather than
  // trusting the URL param as-is.
  const selectedProjectSlug = useMemo(
    () => (projectParam && availableProjects.some((p) => p.slug === projectParam) ? projectParam : null),
    [projectParam, availableProjects]
  );
  const projectFilter = useMemo(() => (selectedProjectSlug ? [selectedProjectSlug] : []), [selectedProjectSlug]);
  const onProjectChange = useCallback(
    (values: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (values.length > 0) params.set("project", values[0]);
      else params.delete("project");
      const qs = params.toString();
      router.push(`/tickets${qs ? `?${qs}` : ""}`);
    },
    [searchParams, router]
  );

  // Clear sessionStorage and restore scroll after first render
  useEffect(() => {
    const raw = sessionStorage.getItem(sessionKey(scopeKey));
    if (raw) {
      sessionStorage.removeItem(sessionKey(scopeKey));
      try {
        const state = JSON.parse(raw) as SavedState;
        if (state.scrollTop) {
          const main = document.querySelector("main");
          if (main) main.scrollTop = state.scrollTop;
        }
      } catch {}
    }
  }, [scopeKey]);

  function toggleChip(label: string) {
    setActiveChips((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  function handleAddFilter(kind: AddFilterKind) {
    setActiveAddFilters((prev) => new Set(prev).add(kind));
  }

  // Clearing a filter's value back to empty removes its chip from the bar
  // (returns it to the "Add Filter" menu) — same "clear = gone" convention
  // as the date-range popover's own comment.
  function removeAddFilter(kind: AddFilterKind) {
    setActiveAddFilters((prev) => {
      const next = new Set(prev);
      next.delete(kind);
      return next;
    });
  }

  function handleLabelsChange(values: string[]) {
    setLabelsFilter(values);
    if (values.length === 0) removeAddFilter("labels");
  }

  function handleReporterChange(values: string[]) {
    setReporterFilter(values);
    if (values.length === 0) removeAddFilter("reporter");
  }

  function handleDueDateRangeChange(value: DateRangeValue) {
    setDueDateFilter(value);
    if (!value.from && !value.to) removeAddFilter("due-date");
  }

  function handleCreatedDateRangeChange(value: DateRangeValue) {
    setCreatedDateFilter(value);
    if (!value.from && !value.to) removeAddFilter("created-date");
  }

  function handleUpdatedDateRangeChange(value: DateRangeValue) {
    setUpdatedDateFilter(value);
    if (!value.from && !value.to) removeAddFilter("updated-date");
  }

  // The single place every filter (search, the 3 dropdowns, the 5 "Add
  // Filter" filters, and the 5 quick chips) is actually applied — every view
  // below (Board/List/Calendar/Timeline/Insights) and the header's Tickets/
  // Estimated/Blocked counters all read from this one filtered list, so none
  // of them can drift out of sync or need their own copy of this logic.
  const filteredTickets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // "Mine"/"Unassigned" match the real assignee_profile_id, not the
    // display name (a name isn't a stable identifier — see
    // Ticket.assigneeProfileId). Dev fallback has no real ids to compare
    // (mock tickets never carry assigneeProfileId), so it falls back to
    // matching by name there only, same convention used elsewhere in dev
    // fallback (e.g. member-profile-modal.tsx).
    const isMine = (t: Ticket) =>
      isDevFallback ? t.assignee.name === user.name : userId !== null && t.assigneeProfileId === userId;
    const isUnassigned = (t: Ticket) =>
      isDevFallback ? t.assignee.name === "Unassigned" : t.assigneeProfileId == null;

    // Due Soon: active tickets due from today through the next 7 days,
    // never overdue — no existing reusable "due soon" definition applies to
    // real (non-mock-dated) tickets, see my-work-screen.tsx's isDueSoon,
    // which is pinned to a hardcoded mock "today" and isn't safe to reuse
    // for real dates.
    const todayISO = getTodayISO();
    const dueSoonCutoffISO = getTodayISO(7);
    const isDueSoon = (t: Ticket) => {
      if (t.status === "done" || !t.dueDate) return false;
      const dueISO = parseDisplayDate(t.dueDate);
      if (!dueISO) return false;
      return dueISO >= todayISO && dueISO <= dueSoonCutoffISO;
    };

    // Recently Updated: real updatedAtISO within the last 7 days. Undefined
    // for mock tickets (no real timestamp exists), so this never matches in
    // dev fallback.
    const nowMs = new Date().getTime();
    const isRecentlyUpdated = (t: Ticket) => {
      if (!t.updatedAtISO) return false;
      const diffMs = nowMs - new Date(t.updatedAtISO).getTime();
      return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
    };

    // Overdue — same real definition Project Overview's own Health Alerts
    // already use (status !== done, a real due date, in the past).
    const isOverdue = (t: Ticket) => t.status !== "done" && Boolean(t.dueDate) && parseDisplayDate(t.dueDate!) < todayISO;

    // Due Today — the exact same real definition the Admin Dashboard's own
    // "Due Today" KPI already uses (a real due date equal to today, no
    // status exclusion — unlike the "Due Soon" quick filter above, which
    // excludes done tickets and covers a 7-day window instead of one day).
    // Same todayISO/parseDisplayDate, never a second/different "today".
    const isDueToday = (t: Ticket) => Boolean(t.dueDate) && parseDisplayDate(t.dueDate!) === todayISO;

    // Completed This Month — the exact same real definition the Admin
    // Dashboard's own "tickets completed this month" health insight already
    // uses (status done, real updatedAtISO in the current calendar month —
    // the closest available signal for "when it was completed," since no
    // dedicated completed_at column exists). Same todayISO, never a
    // second/different "this month".
    const monthPrefix = todayISO.slice(0, 7);
    const isCompletedThisMonth = (t: Ticket) => t.status === "done" && t.updatedAtISO?.slice(0, 7) === monthPrefix;

    // Local calendar date (not UTC — same reasoning as getTodayISO) behind a
    // full timestamp, so Created/Updated Date ranges compare day-to-day like
    // the date-only inputs that set them, not exact instants.
    const toLocalDateISO = (iso: string): string => {
      const d = new Date(iso);
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${month}-${day}`;
    };
    const inDateRange = (dateISO: string | undefined, range: DateRangeValue): boolean => {
      if (!dateISO) return false;
      if (range.from && dateISO < range.from) return false;
      if (range.to && dateISO > range.to) return false;
      return true;
    };
    const hasDueDateFilter     = Boolean(dueDateFilter.from || dueDateFilter.to);
    const hasCreatedDateFilter = Boolean(createdDateFilter.from || createdDateFilter.to);
    const hasUpdatedDateFilter = Boolean(updatedDateFilter.from || updatedDateFilter.to);

    return ticketList.filter((t) => {
      if (query) {
        const matchesText =
          t.title.toLowerCase().includes(query) || getTicketDisplayKey(t).toLowerCase().includes(query);
        if (!matchesText) return false;
      }

      // Project — org-wide "all projects" mode only; selectedProjectSlug is
      // always null in single-project mode, so this is a no-op there.
      if (selectedProjectSlug && t.projectSlug !== selectedProjectSlug) return false;

      if (assigned.length > 0) {
        const value = assigned[0];
        if (value === "me") {
          if (!isMine(t)) return false;
        } else if (value === "unassigned") {
          if (!isUnassigned(t)) return false;
        } else if (t.assigneeProfileId !== value) {
          return false;
        }
      }

      if (priority.length > 0 && !priority.includes(t.priority)) return false;
      if (status.length > 0 && !status.includes(t.status)) return false;

      // "Add Filter" filters.
      // Labels: matches if the ticket has at least one of the selected
      // labels (OR within this filter — labels are multi-valued per
      // ticket, same convention as Priority/Status's own multi-select).
      if (labelsFilter.length > 0 && !labelsFilter.some((l) => t.labels.includes(l))) return false;
      // Reporter: who created the ticket, by real id — never the display name.
      if (reporterFilter.length > 0 && !reporterFilter.includes(t.createdByProfileId ?? "")) return false;
      if (hasDueDateFilter) {
        const dueISO = t.dueDate ? parseDisplayDate(t.dueDate) : "";
        if (!inDateRange(dueISO || undefined, dueDateFilter)) return false;
      }
      if (hasCreatedDateFilter && !inDateRange(t.createdAtISO ? toLocalDateISO(t.createdAtISO) : undefined, createdDateFilter)) return false;
      if (hasUpdatedDateFilter && !inDateRange(t.updatedAtISO ? toLocalDateISO(t.updatedAtISO) : undefined, updatedDateFilter)) return false;

      // Quick filter chips — every active one must match (AND).
      if (activeChips.has("Mine") && !isMine(t)) return false;
      if (activeChips.has("Blocked") && t.status !== "blocked") return false;
      if (activeChips.has("High Priority") && t.priority !== "highest" && t.priority !== "high") return false;
      if (activeChips.has("Due Soon") && !isDueSoon(t)) return false;
      if (activeChips.has("Recently Updated") && !isRecentlyUpdated(t)) return false;

      // Real URL query-state handoff (`?alerts=overdue,blocked`, etc.) from
      // both Project Overview's Health Alert action and Project Reports'
      // Delivery Progress cards — a ticket matches if it satisfies ANY of
      // the requested types (OR between types), still ANDed with
      // everything else above like every other filter here; in practice
      // nothing else is active when arriving from either link. "done"/
      // "in-progress"/"blocked" are the same canonical ticket statuses
      // used everywhere else in this app, never a parallel value.
      if (alertTypes.length > 0) {
        const matchesAlert = alertTypes.some((type) =>
          type === "overdue" ? isOverdue(t) :
          type === "due-today" ? isDueToday(t) :
          type === "completed-this-month" ? isCompletedThisMonth(t) :
          t.status === type
        );
        if (!matchesAlert) return false;
      }

      return true;
    });
  }, [
    ticketList, searchQuery, assigned, priority, status, activeChips, isDevFallback, user.name, userId,
    labelsFilter, reporterFilter, dueDateFilter, createdDateFilter, updatedDateFilter, alertTypes,
    selectedProjectSlug,
  ]);

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
    saveState(scopeKey, {
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

  // Passed to the preview panel's editable mode — after a successful inline
  // edit there, keeps the board/list card and the preview's own selection in
  // sync without a page reload (the panel already updates its own displayed
  // copy internally; this only updates the list this screen renders from).
  function handleTicketUpdated(updated: Ticket) {
    setTicketList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setPreviewTicket((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  const createLabel = async (name: string): Promise<{ status: "success"; name: string } | { status: "error"; message: string }> => {
    if (isDevFallback || !organization) {
      return { status: "error", message: "Not available in this mode." };
    }
    const result = await createOrganizationLabel(organization.id, name);
    if (result.status === "error") return result;
    setOrgLabels((prev) => [...prev, result.label.name]);
    return { status: "success", name: result.label.name };
  };

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

  // Computed once and reused by both the Labels filter (FilterBar) and the
  // preview panel's Labels editor, instead of each building its own copy.
  const allLabelOptions = buildLabelCatalog(orgLabels);

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
              {slug ? "Track and manage all work items for this project." : "Track and manage all work items across every project."}
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
          showProjectFilter={!slug}
          projects={availableProjects}
          project={projectFilter}
          onProjectChange={onProjectChange}
          members={members}
          assigned={assigned}
          onAssignedChange={setAssigned}
          priority={priority}
          onPriorityChange={setPriority}
          status={status}
          onStatusChange={setStatus}
          activeAddFilters={activeAddFilters}
          onAddFilter={handleAddFilter}
          allLabels={allLabelOptions}
          labels={labelsFilter}
          onLabelsChange={handleLabelsChange}
          reporter={reporterFilter}
          onReporterChange={handleReporterChange}
          dueDateRange={dueDateFilter}
          onDueDateRangeChange={handleDueDateRangeChange}
          createdDateRange={createdDateFilter}
          onCreatedDateRangeChange={handleCreatedDateRangeChange}
          updatedDateRange={updatedDateFilter}
          onUpdatedDateRangeChange={handleUpdatedDateRangeChange}
          alertChipTypes={alertTypes}
          onRemoveAlertChip={removeAlertType}
        />

        {/* Quick stats — recalculated from the filtered results, same as every view below */}
        <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-500 dark:text-zinc-500">
          <span className="font-semibold text-slate-700 dark:text-zinc-300">{filteredTickets.length}</span>
          <span>Tickets</span>
          <span className="mx-1 text-slate-200 dark:text-zinc-700">·</span>
          <span className="font-semibold text-slate-700 dark:text-zinc-300">
            {filteredTickets.reduce((s, t) => s + (t.hours ?? 0), 0)}h
          </span>
          <span>Estimated</span>
          <span className="mx-1 text-slate-200 dark:text-zinc-700">·</span>
          <span className="font-semibold text-red-600 dark:text-red-400">
            {filteredTickets.filter((t) => t.status === "blocked").length}
          </span>
          <span>Blocked</span>
        </div>

        <div className="mt-3 border-b border-slate-200 dark:border-zinc-800" />
      </div>

      {/* Content area — every view reads the same filteredTickets, so Board/List/Calendar/Timeline/Insights always agree */}
      {view === "board" ? (
        <BoardView tickets={filteredTickets} onTicketClick={openPreview} />
      ) : view === "calendar" ? (
        <CalendarView tickets={filteredTickets} onTicketClick={openPreview} />
      ) : view === "timeline" ? (
        <TimelineView tickets={filteredTickets} onTicketClick={openPreview} />
      ) : view === "insights" ? (
        <InsightsView tickets={filteredTickets} onTicketClick={openPreview} />
      ) : (
        <ListView tickets={filteredTickets} onTicketClick={openPreview} />
      )}

      {previewTicket !== null && (
        <TicketPreviewPanel
          ticket={previewTicket}
          // Each ticket's own real projectSlug — always correct in
          // single-project mode (identical to the page's own `slug`) and
          // required in "all projects" mode, where tickets can belong to
          // different projects.
          slug={previewTicket.projectSlug}
          onClose={closePreview}
          onBeforeNavigate={handleBeforeExpand}
          // Inline editing needs one definite project to scope the
          // Assignee picker to (see assignableMembers above) — only
          // available in single-project mode; "all projects" falls back to
          // the same read-only panel every other non-Tickets-board caller
          // already uses.
          editable={Boolean(slug)}
          isDevFallback={isDevFallback}
          members={assignableMembers}
          allLabels={allLabelOptions}
          onCreateLabel={createLabel}
          onTicketUpdated={handleTicketUpdated}
        />
      )}

      {/* No single project to create into in "all projects" mode — the
          button above is already hidden there (canCreateTicket requires
          slug), this guard just keeps the type honest. */}
      {showNewTicket && slug && (
        <NewTicketModal
          slug={slug}
          tickets={ticketList}
          members={assignableMembers}
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
          onPreviewDuplicate={handlePreviewDuplicate}
        />
      )}
    </div>
  );
}
