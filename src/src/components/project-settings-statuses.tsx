"use client";

import { useEffect, useRef, useState } from "react";
import { SettingGroup } from "@/components/settings-ui";
import { ErrorToast } from "@/components/tickets/ticket-ui";
import {
  loadProjectTicketStatuses,
  createTicketStatus,
  renameTicketStatus,
  setDefaultTicketStatus,
  changeTicketStatusGroup,
  reorderTicketStatuses,
  deleteTicketStatus,
  type TicketStatusOption,
} from "@/lib/tickets";

// Fase 3 — Project Settings → Statuses. Lets an Admin or Project Lead
// (the only two roles that can even reach this page, see
// project-settings-screen.tsx's own route gate) manage a project's real
// ticket_statuses catalog: create, rename, delete, set the default open
// status, move a status between Open/Closed, and reorder within its own
// group. No color/icon configuration, no transition rules, no per-status
// permissions — this is deliberately just the catalog itself.
//
// No drag-and-drop library exists anywhere in this app (checked
// package.json), and the Board's own native-HTML5 drag pattern
// (board-column.tsx) is shaped for "drop a card on a column," not for
// reordering rows within one list — different enough that copying it here
// would mean inventing a new interaction, not reusing an existing one. Per
// this feature's own fallback instruction, reordering uses plain Up/Down
// buttons instead.

function normalizeGroupOrder(statuses: TicketStatusOption[], groupType: "open" | "closed"): TicketStatusOption[] {
  return statuses.filter((s) => s.groupType === groupType).sort((a, b) => a.sortOrder - b.sortOrder);
}

// ── Delete confirmation ──────────────────────────────────────────────────────
// Same shell archive-project-modal.tsx already establishes for a
// destructive confirm (backdrop, centered alertdialog, red icon badge,
// Cancel/destructive-confirm footer) — this feature's own delete action
// copies that structure rather than introducing a new one.

function DeleteStatusModal({
  status,
  onCancel,
  onConfirm,
}: {
  status: TicketStatusOption;
  onCancel: () => void;
  onConfirm: () => Promise<{ success: boolean; message?: string }>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (submitting) return;
    onCancel();
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await onConfirm();
    setSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Something went wrong.");
      return;
    }
  }

  return (
    <>
      <div aria-hidden onClick={handleCancel} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label="Delete status"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5l1.216-3.243A1.5 1.5 0 016.386 3.25h11.228a1.5 1.5 0 011.42 1.007L20.25 7.5M3.75 7.5h16.5M3.75 7.5v11.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V7.5M9.75 11.25h4.5" />
            </svg>
          </div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Delete &quot;{status.name}&quot;?</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">
            This can&apos;t be undone. Tickets currently using this status must be moved to a different one first.
          </p>
          {error && <p className="text-[13px] text-red-600 dark:text-red-400 mt-3">{error}</p>}
          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Deleting…" : "Delete Status"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── "Choose a new default before moving this one to Closed" prompt ─────────
// Only ever shown for the one genuinely tricky transition: moving the
// current default open status to Closed. Every other group change/rename/
// delete/reorder needs no extra step.

function ReplaceDefaultModal({
  status,
  otherOpenStatuses,
  onCancel,
  onConfirm,
}: {
  status: TicketStatusOption;
  otherOpenStatuses: TicketStatusOption[];
  onCancel: () => void;
  onConfirm: (newDefaultStatusId: string) => Promise<{ success: boolean; message?: string }>;
}) {
  const [selectedId, setSelectedId] = useState(otherOpenStatuses[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (submitting) return;
    onCancel();
  }

  async function handleConfirm() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    const result = await onConfirm(selectedId);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Something went wrong.");
    }
  }

  return (
    <>
      <div aria-hidden onClick={handleCancel} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label="Choose a new default status"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Choose a new default status</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">
            &quot;{status.name}&quot; is the default open status. Pick another open status to take over as default before moving it to Closed.
          </p>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-4 w-full text-[16px] sm:text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-500 dark:focus:border-brand-400"
          >
            {otherOpenStatuses.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </select>
          {error && <p className="text-[13px] text-red-600 dark:text-red-400 mt-3">{error}</p>}
          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || !selectedId}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Move to Closed"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Row actions menu ─────────────────────────────────────────────────────────

function StatusRowMenu({
  status,
  isFirst,
  isLast,
  canDelete,
  onRename,
  onSetDefault,
  onChangeGroup,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  status: TicketStatusOption;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onRename: () => void;
  onSetDefault: () => void;
  onChangeGroup: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const items: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void }[] = [
    { label: "Rename", onClick: () => { setOpen(false); onRename(); } },
    ...(status.groupType === "open" && !status.isDefault
      ? [{ label: "Set as default", onClick: () => { setOpen(false); onSetDefault(); } }]
      : []),
    {
      label: status.groupType === "open" ? "Move to Closed" : "Move to Open",
      onClick: () => { setOpen(false); onChangeGroup(); },
    },
    { label: "Move up", disabled: isFirst, onClick: () => { setOpen(false); onMoveUp(); } },
    { label: "Move down", disabled: isLast, onClick: () => { setOpen(false); onMoveDown(); } },
    {
      label: "Delete",
      danger: true,
      disabled: !canDelete,
      onClick: () => { setOpen(false); onDelete(); },
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Status actions"
        className={
          "p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800" : "")
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      <div
        className={
          "absolute right-0 top-full mt-1.5 z-10 w-44 rounded-lg border bg-white dark:bg-zinc-900 " +
          "shadow-lg shadow-black/10 dark:shadow-black/40 border-slate-200 dark:border-zinc-700/60 " +
          "transition-all duration-150 origin-top-right " +
          (open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none")
        }
      >
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={item.onClick}
              className={
                "w-full px-3 py-1.5 text-[13px] text-left transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed " +
                (item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:hover:bg-transparent"
                  : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60 disabled:hover:bg-transparent")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── One status row (name, default badge, actions — inline rename included) ──

function StatusRow({
  status,
  isFirst,
  isLast,
  canDelete,
  onRename,
  onSetDefault,
  onChangeGroup,
  onMoveUp,
  onMoveDown,
  onDeleteRequested,
}: {
  status: TicketStatusOption;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onRename: (name: string) => void;
  onSetDefault: () => void;
  onChangeGroup: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeleteRequested: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(status.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitRename() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed.length === 0 || trimmed === status.name) {
      setDraft(status.name);
      return;
    }
    onRename(trimmed);
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setDraft(status.name); setEditing(false); }
            }}
            className="text-[16px] sm:text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:border-brand-500 dark:focus:border-brand-400 w-48"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate text-left"
          >
            {status.name}
          </button>
        )}
        {status.isDefault && (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400">
            Default
          </span>
        )}
      </div>

      <StatusRowMenu
        status={status}
        isFirst={isFirst}
        isLast={isLast}
        canDelete={canDelete}
        onRename={() => setEditing(true)}
        onSetDefault={onSetDefault}
        onChangeGroup={onChangeGroup}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onDelete={onDeleteRequested}
      />
    </div>
  );
}

// ── Inline "+ Add Status" row ────────────────────────────────────────────────

function AddStatusRow({ groupType, onAdd }: { groupType: "open" | "closed"; onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function commit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setAdding(false);
      setName("");
      return;
    }
    onAdd(trimmed);
    setName("");
    setAdding(false);
  }

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 text-[12px] font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
      >
        + Add status
      </button>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={name}
        placeholder={groupType === "open" ? "e.g. Awaiting Vendor" : "e.g. Won&apos;t Fix"}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setName(""); setAdding(false); }
        }}
        className="text-[16px] sm:text-[13px] text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:border-brand-500 dark:focus:border-brand-400 w-48"
      />
      <button
        type="button"
        onClick={commit}
        className="text-[12px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md px-2.5 py-1 transition-colors"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => { setName(""); setAdding(false); }}
        className="text-[12px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────────────

export function ProjectSettingsStatuses({ projectId }: { projectId: string }) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<TicketStatusOption[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketStatusOption | null>(null);
  const [replaceDefaultTarget, setReplaceDefaultTarget] = useState<TicketStatusOption | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProjectTicketStatuses(projectId).then((result) => {
      if (cancelled) return;
      if (result.status === "ready") {
        setStatuses(result.statuses);
        setLoadState("ready");
      } else {
        setLoadErrorMessage(result.message);
        setLoadState("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function applyResult(result: { status: "success"; statuses: TicketStatusOption[] } | { status: "error"; message: string }) {
    if (result.status === "success") {
      setStatuses(result.statuses);
      return { success: true as const };
    }
    setActionError(result.message);
    return { success: false as const, message: result.message };
  }

  async function handleAdd(groupType: "open" | "closed", name: string) {
    const result = await createTicketStatus(projectId, name, groupType);
    applyResult(result);
  }

  async function handleRename(status: TicketStatusOption, name: string) {
    const result = await renameTicketStatus(status.id, projectId, name);
    applyResult(result);
  }

  async function handleSetDefault(status: TicketStatusOption) {
    const result = await setDefaultTicketStatus(status.id, projectId);
    applyResult(result);
  }

  async function handleChangeGroup(status: TicketStatusOption) {
    const nextGroup = status.groupType === "open" ? "closed" : "open";
    if (nextGroup === "closed" && status.isDefault) {
      setReplaceDefaultTarget(status);
      return;
    }
    const result = await changeTicketStatusGroup(status.id, projectId, nextGroup);
    applyResult(result);
  }

  async function handleConfirmReplaceDefault(status: TicketStatusOption, newDefaultStatusId: string) {
    const result = await changeTicketStatusGroup(status.id, projectId, "closed", newDefaultStatusId);
    const outcome = applyResult(result);
    if (outcome.success) setReplaceDefaultTarget(null);
    return outcome;
  }

  async function handleReorder(groupType: "open" | "closed", orderedIds: string[]) {
    const result = await reorderTicketStatuses(projectId, groupType, orderedIds);
    applyResult(result);
  }

  function moveWithinGroup(groupType: "open" | "closed", status: TicketStatusOption, direction: "up" | "down") {
    const group = normalizeGroupOrder(statuses, groupType);
    const index = group.findIndex((s) => s.id === status.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= group.length) return;
    const reordered = [...group];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    handleReorder(groupType, reordered.map((s) => s.id));
  }

  async function handleConfirmDelete(status: TicketStatusOption) {
    const result = await deleteTicketStatus(status.id, projectId);
    const outcome = applyResult(result);
    if (outcome.success) setDeleteTarget(null);
    return outcome;
  }

  if (loadState === "loading") {
    return (
      <SettingGroup title="Statuses">
        <p className="py-4 text-[13px] text-slate-400 dark:text-zinc-500">Loading statuses…</p>
      </SettingGroup>
    );
  }

  if (loadState === "error") {
    return (
      <SettingGroup title="Statuses">
        <p className="py-4 text-[13px] text-red-600 dark:text-red-400">{loadErrorMessage}</p>
      </SettingGroup>
    );
  }

  const openStatuses = normalizeGroupOrder(statuses, "open");
  const closedStatuses = normalizeGroupOrder(statuses, "closed");

  function renderGroup(groupType: "open" | "closed", label: string, list: TicketStatusOption[]) {
    return (
      <div className="py-4 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">
          {label}
        </h4>
        <div>
          {list.map((status, index) => (
            <StatusRow
              key={status.id}
              status={status}
              isFirst={index === 0}
              isLast={index === list.length - 1}
              canDelete={list.length > 1 && !status.isDefault}
              onRename={(name) => handleRename(status, name)}
              onSetDefault={() => handleSetDefault(status)}
              onChangeGroup={() => handleChangeGroup(status)}
              onMoveUp={() => moveWithinGroup(groupType, status, "up")}
              onMoveDown={() => moveWithinGroup(groupType, status, "down")}
              onDeleteRequested={() => setDeleteTarget(status)}
            />
          ))}
        </div>
        <AddStatusRow groupType={groupType} onAdd={(name) => handleAdd(groupType, name)} />
      </div>
    );
  }

  return (
    <SettingGroup title="Statuses">
      <p className="text-[12px] text-slate-400 dark:text-zinc-500 pt-3.5 -mb-1">
        Configure the ticket statuses available in this project — grouped by whether they count as open or closed work.
      </p>
      {renderGroup("open", "Open statuses", openStatuses)}
      {renderGroup("closed", "Closed statuses", closedStatuses)}

      {deleteTarget && (
        <DeleteStatusModal
          status={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleConfirmDelete(deleteTarget)}
        />
      )}

      {replaceDefaultTarget && (
        <ReplaceDefaultModal
          status={replaceDefaultTarget}
          otherOpenStatuses={openStatuses.filter((s) => s.id !== replaceDefaultTarget.id)}
          onCancel={() => setReplaceDefaultTarget(null)}
          onConfirm={(newDefaultStatusId) => handleConfirmReplaceDefault(replaceDefaultTarget, newDefaultStatusId)}
        />
      )}

      {actionError && <ErrorToast message={actionError} onDismiss={() => setActionError(null)} />}
    </SettingGroup>
  );
}
