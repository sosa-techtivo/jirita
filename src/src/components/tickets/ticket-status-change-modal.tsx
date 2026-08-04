"use client";

// Modeled on archive-project-modal.tsx's shell (backdrop, centered
// alertdialog, icon badge, Cancel/Confirm footer) — a neutral, brand-
// colored confirmation rather than a destructive/red one, since changing
// a ticket's status is easily reversible, unlike archiving a project.

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";

export function TicketStatusChangeModal({
  ticket,
  fromLabel,
  toLabel,
  onCancel,
  onConfirm,
}: {
  ticket: Ticket;
  fromLabel: string;
  toLabel: string;
  /** Card visually never left its column until this resolves — cancelling
   *  needs no separate "revert" of its own. */
  onCancel: () => void;
  /** Real save (board-view.tsx wires this to the same updateTicket() path
   *  every other status editor already uses). The caller closes this
   *  modal itself on success; a failure keeps the modal open with the
   *  error shown, so the ticket's column never changes. */
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
    // Already in flight — a second click (or a stray double-fire) can
    // never send a duplicate status change.
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
          aria-label="Change ticket status"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">
            Move {getTicketDisplayKey(ticket)} to {toLabel}?
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">
            This changes <span className="font-medium text-slate-700 dark:text-zinc-200">{ticket.title}</span>&apos;s
            status from <span className="font-medium text-slate-700 dark:text-zinc-200">{fromLabel}</span> to{" "}
            <span className="font-medium text-slate-700 dark:text-zinc-200">{toLabel}</span>.
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
              className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Moving…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
