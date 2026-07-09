"use client";

import { useEffect, useRef, useState } from "react";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import type { ProjectSummary } from "@/lib/mock-projects";

// Modeled on the Invite User modal's shell (backdrop, centered dialog,
// scrollable body, sticky footer) — see invite-user-modal.tsx.

const FIELD_LABEL =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";

const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "placeholder:text-slate-300 dark:placeholder:text-zinc-600 transition-colors";

export function CreateProjectModal({
  editingProject,
  onClose,
}: {
  editingProject?: ProjectSummary;
  onClose: () => void;
}) {
  const isEditing = editingProject !== undefined;
  const { createProject, updateProject } = useOrganizationProjects();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState(editingProject?.name ?? "");
  const [description, setDescription] = useState(editingProject?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (visible) nameRef.current?.focus();
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

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = isEditing
      ? await updateProject({ slug: editingProject.slug, name, description })
      : await createProject({ name, description });
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
          aria-label={isEditing ? "Edit Project" : "Create Project"}
          className={
            "pointer-events-auto w-full max-w-md flex flex-col " +
            "max-h-[calc(100dvh-3rem)] bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">
              {isEditing ? "Edit Project" : "Create Project"}
            </h2>
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
          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4">
            <div>
              <label className={FIELD_LABEL}>
                Project Name<span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marketing Site Relaunch"
                className={INPUT}
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Description
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">optional</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What's this project about?"
                className={`${INPUT} resize-none`}
              />
            </div>

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
              disabled={!canSubmit}
              className={
                "inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all " +
                (canSubmit
                  ? "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                  : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed")
              }
            >
              {submitting ? (isEditing ? "Saving…" : "Creating…") : isEditing ? "Save Changes" : "Create Project"}
              {canSubmit && !submitting && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
