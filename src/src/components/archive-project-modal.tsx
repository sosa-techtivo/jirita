"use client";

import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/mock-projects";
import { useOrganizationProjects } from "@/components/organization-projects-provider";

// Modeled on the Delete User confirmation modal's shell (backdrop, centered
// alertdialog, red icon badge, Cancel/destructive-confirm footer) — see
// users-screen.tsx's DeleteUserModal.

export function ArchiveProjectModal({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const { archiveProject } = useOrganizationProjects();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await archiveProject(project.slug);
    setSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Something went wrong.");
      return;
    }
    onClose();
  }

  return (
    <>
      <div aria-hidden onClick={handleCancel} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label="Archive project"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5l1.216-3.243A1.5 1.5 0 016.386 3.25h11.228a1.5 1.5 0 011.42 1.007L20.25 7.5M3.75 7.5h16.5M3.75 7.5v11.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V7.5M9.75 11.25h4.5" />
            </svg>
          </div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Archive {project.name}?</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">
            This hides the project from the active projects list. Its tickets, comments, activity, and time tracking
            are not deleted — everything stays exactly as it is, and the project can be restored later.
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
              {submitting ? "Archiving…" : "Archive Project"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
