"use client";

// Sprint MVP — the one management surface for a project's sprints: create,
// rename/reschedule, activate, close (with an open/closed ticket preview
// before confirming), and add/remove tickets. Visible only to Admin/Project
// Lead (gated by the caller, sprint-context-selector.tsx's own
// `canManage`) — Member only ever sees the read-only selector. Modeled on
// this app's existing modal shell (backdrop, centered card, Escape-to-
// close, inline error, `submitting` state — see close-parent-confirm-
// modal.tsx / project-settings-statuses.tsx) rather than inventing a new
// one.

import { useEffect, useMemo, useState } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { isTicketClosed, updateTicket, type TicketStatusOption } from "@/lib/tickets";
import { StatusBadge } from "@/components/tickets/ticket-ui";
import { createSprint, updateSprint, activateSprint, closeSprint, type Sprint } from "@/lib/sprints";

type View = { kind: "list" } | { kind: "create" } | { kind: "detail"; sprintId: string };

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SprintStatusPill({ status }: { status: Sprint["status"] }) {
  const meta =
    status === "active"
      ? { label: "Active", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" }
      : status === "closed"
      ? { label: "Closed", dot: "bg-slate-400 dark:bg-zinc-600", text: "text-slate-500 dark:text-zinc-500" }
      : { label: "Planned", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function formatSprintDateRange(sprint: Sprint): string | null {
  if (!sprint.startDate && !sprint.endDate) return null;
  if (sprint.startDate && sprint.endDate) return `${sprint.startDate} → ${sprint.endDate}`;
  return sprint.startDate ? `From ${sprint.startDate}` : `Until ${sprint.endDate}`;
}

// ── Dual-list ticket selector (Available ↔ Sprint tickets) ─────────────────
// Same small inline-svg icon convention as filter-dropdown.tsx's own
// Plus/X icons — no new icon primitive introduced.

function SmallPlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SmallXIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// Shared row shape for both columns — key/title/status badge are always the
// same three facts about a ticket; only the trailing action (add/remove/
// none) and an optional trailing note (which other sprint it's in) differ
// per caller.
function TicketRow({
  ticket,
  action,
  note,
  disabled,
}: {
  ticket: Ticket;
  action?: { label: string; onClick: () => void; pending: boolean; variant: "add" | "remove" };
  note?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 ${disabled ? "opacity-60" : "hover:bg-slate-50 dark:hover:bg-zinc-900"}`}
    >
      <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 flex-shrink-0">
        {getTicketDisplayKey(ticket)}
      </span>
      <span className="text-sm text-slate-700 dark:text-zinc-200 truncate flex-1" title={ticket.title}>
        {ticket.title}
      </span>
      <StatusBadge status={ticket.status} label={ticket.statusName} />
      {note && (
        <span
          className="text-[11px] text-slate-400 dark:text-zinc-500 flex-shrink-0 truncate max-w-[110px]"
          title={note}
        >
          {note}
        </span>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.pending}
          aria-label={action.label}
          title={action.label}
          className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
            action.variant === "add"
              ? "text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              : "text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
          }`}
        >
          {action.variant === "add" ? <SmallPlusIcon /> : <SmallXIcon />}
        </button>
      )}
    </div>
  );
}

function TicketGroupHeader({ label, count, action }: { label: string; count: number; action?: { label: string; onClick: () => void; disabled: boolean } }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/80 dark:bg-zinc-900/50 sticky top-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">
        {label} · {count}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function SprintListView({
  sprints,
  onSelect,
  onCreateNew,
}: {
  sprints: Sprint[];
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}) {
  return (
    <div className="space-y-1">
      {sprints.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-zinc-400 py-2">No sprints yet for this project.</p>
      )}
      {sprints.map((sprint) => {
        const range = formatSprintDateRange(sprint);
        return (
          <button
            key={sprint.id}
            type="button"
            onClick={() => onSelect(sprint.id)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-zinc-900 border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-zinc-100 truncate">{sprint.name}</div>
              {range && <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{range}</div>}
            </div>
            <SprintStatusPill status={sprint.status} />
          </button>
        );
      })}
      <button
        type="button"
        onClick={onCreateNew}
        className="w-full mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded-lg px-3 py-2 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
        New Sprint
      </button>
    </div>
  );
}

// ── Create ────────────────────────────────────────────────────────────────

function SprintCreateForm({
  submitting,
  onCancel,
  onSubmit,
}: {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: { name: string; startDate?: string; endDate?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sprint 12"
          className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submitting || name.trim().length === 0}
          onClick={() =>
            onSubmit({ name, startDate: startDate || undefined, endDate: endDate || undefined })
          }
          className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Sprint"}
        </button>
      </div>
    </div>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────

function SprintDetailView({
  slug,
  projectId,
  sprint,
  sprints,
  statuses,
  otherActiveSprintExists,
  tickets,
  submitting,
  setSubmitting,
  setError,
  onBack,
  onSprintsChange,
  onTicketChange,
}: {
  slug: string;
  projectId: string;
  sprint: Sprint;
  sprints: Sprint[];
  statuses: TicketStatusOption[];
  otherActiveSprintExists: boolean;
  tickets: Ticket[];
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  setError: (message: string | null) => void;
  onBack: () => void;
  onSprintsChange: (sprints: Sprint[]) => void;
  onTicketChange: (ticket: Ticket) => void;
}) {
  const readOnly = sprint.status === "closed";
  const [name, setName] = useState(sprint.name);
  const [startDate, setStartDate] = useState(sprint.startDate ?? "");
  const [endDate, setEndDate] = useState(sprint.endDate ?? "");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingTicketIds, setPendingTicketIds] = useState<Set<string>>(new Set());

  const dirty = name.trim() !== sprint.name || (startDate || "") !== (sprint.startDate ?? "") || (endDate || "") !== (sprint.endDate ?? "");

  const sprintTickets = useMemo(() => tickets.filter((t) => t.sprintId === sprint.id), [tickets, sprint.id]);
  const openCount = sprintTickets.filter((t) => !isTicketClosed(t)).length;
  const closedCount = sprintTickets.length - openCount;

  // The project's real Backlog status id (legacy_enum_value = 'backlog',
  // never the display name — a renamed Backlog status must keep classifying
  // correctly, same "never key off the literal status string" rule the rest
  // of this app already follows for anything status-derived). Undefined
  // only if a project's Backlog status was itself since deleted; every
  // ticket then simply falls into Suggested instead of Backlog rather than
  // disappearing.
  const backlogStatusId = useMemo(
    () => statuses.find((s) => s.legacyEnumValue === "backlog")?.id,
    [statuses]
  );

  const sprintsById = useMemo(() => new Map(sprints.map((s) => [s.id, s])), [sprints]);

  // Left column candidates — unassigned tickets only (sprint_id null);
  // tickets already in this sprint live in the right column, tickets in a
  // *different* sprint only ever surface here as an explicit search result
  // (see otherSprintMatches below), never in the default Suggested/Backlog
  // grouping.
  const unassigned = useMemo(() => tickets.filter((t) => !t.sprintId), [tickets]);
  const suggested = useMemo(
    () => unassigned.filter((t) => !isTicketClosed(t) && t.statusId !== backlogStatusId),
    [unassigned, backlogStatusId]
  );
  const backlog = useMemo(
    () => unassigned.filter((t) => t.statusId === backlogStatusId),
    [unassigned, backlogStatusId]
  );

  // Not memoized — plain per-render filters over already-memoized base
  // lists. Ticket lists here are one project's worth (never thousands), so
  // this is cheap; memoizing would need `matchesQuery` itself as a stable
  // dependency, which isn't worth the extra indirection for this cost.
  const query = search.trim().toLowerCase();
  const matchesQuery = (t: Ticket) =>
    !query || t.title.toLowerCase().includes(query) || getTicketDisplayKey(t).toLowerCase().includes(query);

  const suggestedFiltered = suggested.filter(matchesQuery);
  const backlogFiltered = backlog.filter(matchesQuery);

  // Informational-only: a ticket that already belongs to a *different*
  // sprint, surfaced only when explicitly searched for (never in the
  // default grouping — see the Sprint MVP UX refinement prompt this
  // dual-list replaced a flat checkbox list for). A match whose other
  // sprint is closed is shown disabled/read-only — never reassignable out
  // of a closed sprint, preserving its history (Sprint 0 included).
  const otherSprintMatches = query ? tickets.filter((t) => t.sprintId && t.sprintId !== sprint.id && matchesQuery(t)) : [];

  async function handleSaveDetails() {
    setSubmitting(true);
    setError(null);
    const result = await updateSprint(sprint.id, projectId, {
      name,
      startDate: startDate || null,
      endDate: endDate || null,
    });
    setSubmitting(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onSprintsChange(result.sprints);
  }

  async function handleActivate() {
    setSubmitting(true);
    setError(null);
    const result = await activateSprint(sprint.id, projectId);
    setSubmitting(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onSprintsChange(result.sprints);
  }

  async function handleConfirmClose() {
    setSubmitting(true);
    setError(null);
    const result = await closeSprint(sprint.id, projectId);
    setSubmitting(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onSprintsChange(result.sprints);
    setConfirmingClose(false);
    // Mirror close_sprint's own server-side split locally so the Board/List
    // behind this modal reflects it immediately, without a second fetch —
    // this is a local reconciliation of what the RPC just did, not a
    // second write.
    for (const t of sprintTickets) {
      if (!isTicketClosed(t)) onTicketChange({ ...t, sprintId: null });
    }
  }

  async function handleToggleTicket(ticket: Ticket, checked: boolean) {
    setPendingTicketIds((prev) => new Set(prev).add(ticket.id));
    setError(null);
    const result = await updateTicket(ticket.id, slug, { sprintId: checked ? sprint.id : null });
    setPendingTicketIds((prev) => {
      const next = new Set(prev);
      next.delete(ticket.id);
      return next;
    });
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    onTicketChange(result.ticket);
  }

  // "Add all suggested" — adds exactly the Suggested tickets currently
  // visible (i.e. respects an active search), never the wider unfiltered
  // Suggested set. Runs in parallel rather than reusing handleToggleTicket
  // per item — that function's own single shared `error` state would race
  // across concurrent calls; a partial failure here is reported as one
  // count instead, same "report by item, keep what succeeded" spirit
  // Comments' own batch attachment upload already uses.
  async function handleAddAllSuggested() {
    const toAdd = suggestedFiltered;
    if (toAdd.length === 0) return;
    setError(null);
    setPendingTicketIds((prev) => {
      const next = new Set(prev);
      toAdd.forEach((t) => next.add(t.id));
      return next;
    });
    const results = await Promise.all(toAdd.map((t) => updateTicket(t.id, slug, { sprintId: sprint.id })));
    setPendingTicketIds((prev) => {
      const next = new Set(prev);
      toAdd.forEach((t) => next.delete(t.id));
      return next;
    });
    for (const result of results) {
      if (result.status === "success") onTicketChange(result.ticket);
    }
    const failedCount = results.filter((r) => r.status === "error").length;
    if (failedCount > 0) {
      setError(`Failed to add ${failedCount} ticket${failedCount === 1 ? "" : "s"}. The rest were added.`);
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-medium text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 flex items-center gap-1"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All sprints
      </button>

      <div className="flex items-center justify-between">
        <SprintStatusPill status={sprint.status} />
        <div className="flex items-center gap-2">
          {sprint.status === "planned" && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleActivate}
              className="px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
              title={otherActiveSprintExists ? "Another sprint is currently active — close it first." : undefined}
            >
              Activate
            </button>
          )}
          {(sprint.status === "planned" || sprint.status === "active") && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmingClose(true)}
              className="px-3 py-1.5 text-[13px] font-semibold text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Close Sprint
            </button>
          )}
        </div>
      </div>

      {confirmingClose && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
          <p className="text-[13px] text-amber-800 dark:text-amber-300">
            Closing this sprint keeps its <strong>{closedCount}</strong> closed ticket{closedCount === 1 ? "" : "s"} attached, and returns{" "}
            <strong>{openCount}</strong> still-open ticket{openCount === 1 ? "" : "s"} to the general backlog.
          </p>
          <div className="flex items-center justify-end gap-2 mt-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmingClose(false)}
              className="px-3 py-1.5 text-[13px] font-medium text-slate-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-zinc-900 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmClose}
              className="px-3 py-1.5 text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Closing…" : "Close sprint"}
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100 disabled:opacity-60"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">Start date</label>
          <input
            type="date"
            value={startDate}
            disabled={readOnly}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100 disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">End date</label>
          <input
            type="date"
            value={endDate}
            disabled={readOnly}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100 disabled:opacity-60"
          />
        </div>
      </div>
      {!readOnly && dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={submitting || name.trim().length === 0}
            onClick={handleSaveDetails}
            className="px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Save changes
          </button>
        </div>
      )}

      {!readOnly && (
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets by key or title…"
            className="w-full text-sm bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 mb-3 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-zinc-100"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Left — Available tickets */}
            <div className="flex flex-col border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden min-w-0">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-900 bg-slate-50/80 dark:bg-zinc-900/50 flex-shrink-0">
                <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">Available tickets</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-900">
                {suggestedFiltered.length === 0 && backlogFiltered.length === 0 && otherSprintMatches.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-zinc-500 px-3 py-3">No tickets match.</p>
                )}

                {suggestedFiltered.length > 0 && (
                  <div>
                    <TicketGroupHeader
                      label="Suggested"
                      count={suggestedFiltered.length}
                      action={{
                        label: "Add all suggested",
                        onClick: handleAddAllSuggested,
                        disabled: suggestedFiltered.every((t) => pendingTicketIds.has(t.id)),
                      }}
                    />
                    <div className="divide-y divide-slate-100 dark:divide-zinc-900">
                      {suggestedFiltered.map((t) => (
                        <TicketRow
                          key={t.id}
                          ticket={t}
                          action={{
                            label: "Add to sprint",
                            variant: "add",
                            pending: pendingTicketIds.has(t.id),
                            onClick: () => handleToggleTicket(t, true),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {backlogFiltered.length > 0 && (
                  <div>
                    <TicketGroupHeader label="Backlog" count={backlogFiltered.length} />
                    <div className="divide-y divide-slate-100 dark:divide-zinc-900">
                      {backlogFiltered.map((t) => (
                        <TicketRow
                          key={t.id}
                          ticket={t}
                          action={{
                            label: "Add to sprint",
                            variant: "add",
                            pending: pendingTicketIds.has(t.id),
                            onClick: () => handleToggleTicket(t, true),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {otherSprintMatches.length > 0 && (
                  <div>
                    <TicketGroupHeader label="In other sprints" count={otherSprintMatches.length} />
                    <div className="divide-y divide-slate-100 dark:divide-zinc-900">
                      {otherSprintMatches.map((t) => {
                        const otherSprint = t.sprintId ? sprintsById.get(t.sprintId) : undefined;
                        const otherClosed = otherSprint?.status === "closed";
                        const note = otherSprint
                          ? `${otherSprint.name}${otherClosed ? " · Closed" : ""}`
                          : "In another sprint";
                        return (
                          <TicketRow
                            key={t.id}
                            ticket={t}
                            note={note}
                            disabled={otherClosed}
                            action={
                              otherClosed
                                ? undefined
                                : {
                                    label: "Move to this sprint",
                                    variant: "add",
                                    pending: pendingTicketIds.has(t.id),
                                    onClick: () => handleToggleTicket(t, true),
                                  }
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right — Sprint tickets */}
            <div className="flex flex-col border border-slate-200 dark:border-zinc-800 rounded-lg overflow-hidden min-w-0">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-900 bg-slate-50/80 dark:bg-zinc-900/50 flex-shrink-0">
                <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
                  Sprint tickets · {sprintTickets.length}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-900">
                {sprintTickets.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-zinc-500 px-3 py-3">No tickets added yet.</p>
                )}
                {sprintTickets.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    action={{
                      label: "Remove from sprint",
                      variant: "remove",
                      pending: pendingTicketIds.has(t.id),
                      onClick: () => handleToggleTicket(t, false),
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────

export function ManageSprintModal({
  slug,
  projectId,
  tickets,
  sprints,
  statuses,
  initialSprintId,
  onClose,
  onSprintsChange,
  onTicketChange,
}: {
  slug: string;
  projectId: string;
  tickets: Ticket[];
  sprints: Sprint[];
  statuses: TicketStatusOption[];
  initialSprintId?: string | null;
  onClose: () => void;
  onSprintsChange: (sprints: Sprint[]) => void;
  onTicketChange: (ticket: Ticket) => void;
}) {
  const [view, setView] = useState<View>(
    initialSprintId && sprints.some((s) => s.id === initialSprintId)
      ? { kind: "detail", sprintId: initialSprintId }
      : { kind: "list" }
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  const sortedSprints = useMemo(() => {
    const order: Record<Sprint["status"], number> = { active: 0, planned: 1, closed: 2 };
    return [...sprints].sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
  }, [sprints]);

  const detailSprint = view.kind === "detail" ? sprints.find((s) => s.id === view.sprintId) : undefined;

  const title = view.kind === "detail" ? detailSprint?.name ?? "Sprint" : view.kind === "create" ? "New Sprint" : "Sprints";

  // The detail view's dual-list ticket selector needs real width for
  // key/title/status badge to stay legible in two side-by-side columns —
  // List/Create stay at the original, narrower width, where a wide modal
  // would just be empty space.
  const modalWidthClass = view.kind === "detail" ? "max-w-3xl" : "max-w-lg";

  return (
    <>
      <div aria-hidden onClick={handleClose} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal
          aria-label="Manage sprint"
          className={`w-full ${modalWidthClass} max-h-[85vh] flex flex-col bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60`}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-zinc-900 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50 truncate">{title}</h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="text-slate-400 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 flex-shrink-0"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
            {error && <p className="text-[13px] text-red-600 dark:text-red-400 mb-3">{error}</p>}

            {view.kind === "list" && (
              <SprintListView
                sprints={sortedSprints}
                onSelect={(id) => {
                  setError(null);
                  setView({ kind: "detail", sprintId: id });
                }}
                onCreateNew={() => {
                  setError(null);
                  setView({ kind: "create" });
                }}
              />
            )}

            {view.kind === "create" && (
              <SprintCreateForm
                submitting={submitting}
                onCancel={() => setView({ kind: "list" })}
                onSubmit={async (input) => {
                  setSubmitting(true);
                  setError(null);
                  const result = await createSprint(projectId, input);
                  setSubmitting(false);
                  if (result.status === "error") {
                    setError(result.message);
                    return;
                  }
                  onSprintsChange(result.sprints);
                  const created = result.sprints.find((s) => s.name === input.name.trim());
                  setView(created ? { kind: "detail", sprintId: created.id } : { kind: "list" });
                }}
              />
            )}

            {view.kind === "detail" && detailSprint && (
              <SprintDetailView
                slug={slug}
                projectId={projectId}
                sprint={detailSprint}
                sprints={sprints}
                statuses={statuses}
                otherActiveSprintExists={sprints.some((s) => s.status === "active" && s.id !== detailSprint.id)}
                tickets={tickets}
                submitting={submitting}
                setSubmitting={setSubmitting}
                setError={setError}
                onBack={() => setView({ kind: "list" })}
                onSprintsChange={onSprintsChange}
                onTicketChange={onTicketChange}
              />
            )}
            {view.kind === "detail" && !detailSprint && (
              <p className="text-sm text-slate-500 dark:text-zinc-400">Sprint not found.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
