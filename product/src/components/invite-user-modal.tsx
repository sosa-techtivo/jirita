"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/current-user";
import { projects } from "@/lib/mock-projects";
import type { User } from "@/lib/mock-users";

// Modeled on the New Ticket modal's shell (backdrop, centered dialog,
// scrollable body, sticky footer) — see tickets/new-ticket-modal.tsx.

const FIELD_LABEL =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";

const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "placeholder:text-slate-300 dark:placeholder:text-zinc-600 transition-colors";

const ROLE_OPTIONS: Role[] = ["MEMBER", "PROJECT_LEAD", "ADMIN"];

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;
// Pool of avatars not already used by named mock people, so a newly invited
// user gets a plausible, non-colliding placeholder.
const INVITE_AVATAR_POOL = [51, 44, 60, 8, 25, 36, 68, 19];
let nextAvatarIndex = 0;

function nextInviteAvatar(): string {
  const id = INVITE_AVATAR_POOL[nextAvatarIndex % INVITE_AVATAR_POOL.length];
  nextAvatarIndex += 1;
  return avatar(id);
}

function InlineToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${on ? "bg-brand-500" : "bg-slate-200 dark:bg-zinc-700"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

// Also reused for "Edit User" (from the row Actions menu) via `editingUser`
// — same fields minus "Send invitation immediately" (not meaningful once an
// account already exists), so there's one form instead of two near-duplicates.
export function InviteUserModal({
  editingUser,
  onClose,
  onInvited,
}: {
  editingUser?: User;
  onClose: () => void;
  onInvited: (user: User) => void;
}) {
  const isEditing = editingUser !== undefined;
  const [visible, setVisible] = useState(false);
  const [firstName, setFirstName] = useState(editingUser?.firstName ?? "");
  const [lastName, setLastName] = useState(editingUser?.lastName ?? "");
  const [email, setEmail] = useState(editingUser?.email ?? "");
  const [role, setRole] = useState<Role>(editingUser?.role ?? "MEMBER");
  const [weeklyCapacity, setWeeklyCapacity] = useState(String(editingUser?.weeklyCapacity ?? 40));
  const [selectedProjects, setSelectedProjects] = useState<string[]>(editingUser?.projectSlugs ?? []);
  const [sendImmediately, setSendImmediately] = useState(true);

  const firstNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => { if (visible) firstNameRef.current?.focus(); }, [visible]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleProject(slug: string) {
    setSelectedProjects((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    const capacity = Math.max(0, parseInt(weeklyCapacity, 10) || 0);

    if (editingUser) {
      onInvited({
        ...editingUser,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        role,
        weeklyCapacity: capacity,
        projectSlugs: selectedProjects,
      });
      return;
    }

    onInvited({
      id: `user-invited-${Date.now()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      avatar: nextInviteAvatar(),
      role,
      status: "Invited",
      weeklyCapacity: capacity,
      projectSlugs: selectedProjects,
      lastLogin: null,
      joinedAt: sendImmediately ? "Invited just now" : "Not yet invited",
    });
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
          aria-label="Invite User"
          className={
            "pointer-events-auto w-full max-w-lg flex flex-col " +
            "max-h-[calc(100dvh-3rem)] bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">{isEditing ? "Edit User" : "Invite User"}</h2>
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
          <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL}>
                  First Name<span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
                </label>
                <input
                  ref={firstNameRef}
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={FIELD_LABEL}>
                  Last Name<span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className={INPUT}
                />
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Email<span className="ml-1.5 text-brand-500 dark:text-brand-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.doe@techtivo.com"
                className={INPUT}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL}>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={INPUT}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FIELD_LABEL}>Weekly Capacity</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={weeklyCapacity}
                    onChange={(e) => setWeeklyCapacity(e.target.value)}
                    className={`${INPUT} pr-9`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 dark:text-zinc-500">
                    h
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>
                Assign Projects
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">optional</span>
              </label>
              <div className="rounded-lg border border-slate-200 dark:border-zinc-700 max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800">
                {projects.map((project) => {
                  const checked = selectedProjects.includes(project.slug);
                  return (
                    <label
                      key={project.slug}
                      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-slate-700 dark:text-zinc-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900"
                    >
                      <span
                        className={[
                          "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          checked
                            ? "bg-brand-600 border-brand-600 dark:bg-brand-500 dark:border-brand-500"
                            : "border-slate-300 dark:border-zinc-600",
                        ].join(" ")}
                      >
                        {checked && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProject(project.slug)}
                        className="sr-only"
                      />
                      <span className="truncate">{project.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {!isEditing && (
              <div className="flex items-center justify-between gap-4 pb-4">
                <div>
                  <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">Send invitation immediately</p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">
                    Emails the invite link right away. Turn off to create the account and invite later.
                  </p>
                </div>
                <InlineToggle on={sendImmediately} onClick={() => setSendImmediately((v) => !v)} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
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
              {isEditing ? "Save Changes" : sendImmediately ? "Send Invitation" : "Create User"}
              {canSubmit && (
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
