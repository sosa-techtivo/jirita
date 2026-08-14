"use client";

// Shown instead of (never in addition to) the generic TicketStatusChangeModal
// whenever a manual close would leave a parent ticket's own open children
// behind — Ticket Detail's status selector, the Preview/Quick Edit panel,
// and Kanban drag-and-drop all show this exact same modal for this exact
// same case, via the shared countOpenChildTickets() check (lib/tickets.ts).
// Modeled on ticket-status-change-modal.tsx's own shell.

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";

export function CloseParentConfirmModal({
  ticket,
  openChildrenCount,
  onCancel,
  onConfirm,
}: {
  ticket: Ticket;
  openChildrenCount: number;
  onCancel: () => void;
  /** Real save — the caller's own updateTicket()/onMoveTicket() path. The
   *  caller closes this modal itself on success; a failure keeps it open
   *  with the error shown, so the ticket's status never changes. */
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
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onConfirm();
    setSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Something went wrong. Please try again.");
    }
  }

  return (
    <>
      <div aria-hidden onClick={handleCancel} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label="Close ticket with open child tickets"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">
            Close {getTicketDisplayKey(ticket)}?
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">
            This ticket still has {openChildrenCount} open child ticket{openChildrenCount === 1 ? "" : "s"}.
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
              className="px-4 py-2 text-[13px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Closing…" : "Close anyway"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
