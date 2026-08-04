"use client";

import { useEffect, useState } from "react";
import { deleteProjectPermanently } from "@/lib/projects";

// Shell (backdrop, centered alertdialog, red icon badge, Cancel/destructive-
// confirm footer) mirrors archive-project-modal.tsx / users-screen.tsx's
// own DeleteUserModal exactly — the two existing precedents for this
// pattern in Project Settings/Users. The one genuinely new piece is the
// "type the project name to continue" input: no existing modal in this
// codebase requires typed confirmation, since nothing else here is this
// irreversible (Archive is reversible; Delete User has its own real
// eligibility gate but no typed name).
//
// Deliberately has NO internal error display (unlike ArchiveProjectModal/
// DeleteUserModal's own inline red box) — per this feature's own
// requirement, a failure is reported via the caller's shared ErrorToast
// instead (onError below), while this modal stays open and keeps
// whatever the Admin already typed, so a retry doesn't require retyping
// the project name.

export function DeleteProjectModal({
  projectId,
  projectName,
  organizationId,
  onClose,
  onDeleted,
  onError,
}: {
  projectId: string;
  projectName: string;
  organizationId: string;
  onClose: () => void;
  /** Called once deletion has actually succeeded server-side — the caller
   *  closes this modal itself, refreshes its project list, and redirects. */
  onDeleted: () => void;
  /** Called with a message on failure — surfaced via the shared ErrorToast,
   *  same as every other backend-call failure in this screen. This modal
   *  stays open and the typed name is left exactly as it was. */
  onError: (message: string) => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleCancel() {
    if (submitting) return;
    onClose();
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  // Case-sensitive exact match, per this feature's own requirement.
  const nameMatches = typedName === projectName;

  async function handleConfirm() {
    if (!nameMatches || submitting) return;
    setSubmitting(true);
    const result = await deleteProjectPermanently(organizationId, projectId);
    setSubmitting(false);
    if (result.status === "error") {
      onError(result.message);
      return; // modal stays open, typedName untouched — the Admin can retry
    }
    onDeleted();
  }

  return (
    <>
      <div aria-hidden onClick={handleCancel} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label="Delete Project"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5l1.216-3.243A1.5 1.5 0 016.386 3.25h11.228a1.5 1.5 0 011.42 1.007L20.25 7.5M3.75 7.5h16.5M3.75 7.5v11.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V7.5M9.75 11.25h4.5" />
            </svg>
          </div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Delete Project</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">This action cannot be undone.</p>

          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-3">Deleting this project will permanently remove:</p>
          <ul className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5 space-y-0.5 list-disc list-inside">
            <li>Tickets</li>
            <li>Comments</li>
            <li>Time Entries</li>
            <li>Attachments</li>
            <li>Notes</li>
            <li>Reports</li>
            <li>GitHub configuration</li>
            <li>All other project data</li>
          </ul>

          <label htmlFor="delete-project-confirm-name" className="block text-[13px] text-slate-600 dark:text-zinc-300 mt-4 mb-1.5">
            Type <span className="font-semibold text-slate-800 dark:text-zinc-100">{projectName}</span> to continue.
          </label>
          <input
            id="delete-project-confirm-name"
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-white dark:bg-zinc-900 text-[16px] sm:text-[13px] font-medium text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors disabled:opacity-60"
          />

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
              disabled={!nameMatches || submitting}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Deleting…" : "Delete Project"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
