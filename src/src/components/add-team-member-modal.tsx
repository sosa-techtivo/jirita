"use client";

import { useEffect, useRef, useState } from "react";

// Modeled on add-client-modal.tsx's shell (backdrop, centered dialog,
// sticky footer) — trimmed to the one field this minimal flow needs, a
// picker over real organization members instead of a text field.

const FIELD_LABEL =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";

const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "transition-colors";

export interface AddTeamMemberCandidate {
  id: string;
  name: string;
}

export function AddTeamMemberModal({
  candidates,
  onClose,
  onAdd,
}: {
  /** Real organization members not already on this project's team. */
  candidates: AddTeamMemberCandidate[];
  onClose: () => void;
  onAdd: (profileId: string) => Promise<{ success: boolean; message?: string }>;
}) {
  const [visible, setVisible] = useState(false);
  const [profileId, setProfileId] = useState(candidates[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (visible) selectRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function handleClose() {
    if (submitting) return;
    setVisible(false);
    setTimeout(onClose, 200);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  const canSubmit = profileId.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await onAdd(profileId);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Something went wrong.");
      return;
    }
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <>
      <div
        aria-hidden
        onClick={handleClose}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label="Add Member"
          className={
            "pointer-events-auto w-full max-w-sm flex flex-col " +
            "bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Add Member</h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 pb-2 space-y-4">
            {candidates.length === 0 ? (
              <p className="text-[13px] text-slate-400 dark:text-zinc-500 pb-1">
                Every organization member is already on this project&apos;s team.
              </p>
            ) : (
              <div>
                <label className={FIELD_LABEL}>
                  Member<span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
                </label>
                <select
                  ref={selectRef}
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className={INPUT}
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && <p className="text-[13px] text-red-600 dark:text-red-400 pb-1">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
            <button
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || candidates.length === 0}
              className={
                "inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all " +
                (canSubmit && candidates.length > 0
                  ? "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed")
              }
            >
              {submitting ? "Adding…" : "Add Member"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
