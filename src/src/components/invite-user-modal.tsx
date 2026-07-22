"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/current-user";
import type { User } from "@/lib/mock-users";
import { useCurrentUser } from "@/components/current-user-provider";
import { inviteOrganizationUser, generateOrganizationInviteLink, editOrganizationMember } from "@/lib/users";

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

type InviteMethod = "email" | "link";

const INVITE_METHOD_OPTIONS: { value: InviteMethod; label: string }[] = [
  { value: "email", label: "Send by email" },
  { value: "link", label: "Generate invite link" },
];

// Same pill segmented-control pattern as profile-screen.tsx's
// TicketViewToggle — reused here rather than a new visual pattern.
function InviteMethodToggle({
  value,
  onChange,
  disabled,
}: {
  value: InviteMethod;
  onChange: (v: InviteMethod) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800"
      role="radiogroup"
      aria-label="Invitation Method"
    >
      {INVITE_METHOD_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isActive
                ? "bg-white text-slate-700 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Mirrors users-screen.tsx's Toast exactly (same feedback surface used by
// the project's other copy-to-clipboard action, copyInvitationLink) — kept
// local rather than imported to avoid a circular import between the two
// modules.
function CopyFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 bg-slate-900 dark:bg-zinc-800 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-black/20">
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {message}
    </div>
  );
}

// Also reused for "Edit User" (from the row Actions menu) via `editingUser`
// — same fields, so there's one form instead of two near-duplicates.
// Editing is real (editOrganizationMember, a Server Action — see
// handleSubmit below), same as inviting (onInviteSent).
export function InviteUserModal({
  editingUser,
  onClose,
  onEdited,
  onInviteSent,
  onLinkGenerated,
}: {
  editingUser?: User;
  onClose: () => void;
  /** Edit mode only — called after the real edit succeeds, so the parent can refetch the list. */
  onEdited?: (user: User) => void;
  /** "Send by email" only — called after the real invite succeeds, so the parent can refetch the list. */
  onInviteSent?: (email: string) => void;
  /** "Generate invite link" only — called once the link (and its profile/membership rows) are created, so the parent can quietly refetch the list while the modal stays open showing the link. */
  onLinkGenerated?: () => void;
}) {
  const { organization, isDevFallback } = useCurrentUser();
  const isEditing = editingUser !== undefined;
  const [visible, setVisible] = useState(false);
  const [firstName, setFirstName] = useState(editingUser?.firstName ?? "");
  const [lastName, setLastName] = useState(editingUser?.lastName ?? "");
  const [email, setEmail] = useState(editingUser?.email ?? "");
  // Editing an existing user always keeps *their own* real role/capacity
  // (editingUser.role/weeklyCapacity) — Settings → General's own defaults
  // below are never consulted in that case, so changing them later can
  // never retroactively alter an existing member. A brand-new invite has no
  // editingUser, so it falls through to organization.defaultRole/
  // defaultWeeklyCapacity — the real, admin-configured workspace policy
  // (organizations.default_role/default_weekly_capacity) — never a fixed
  // "MEMBER"/40 assumption. The final `?? "MEMBER"`/`?? 40` is only a
  // type-safety net for the one instant `organization` itself hasn't
  // resolved yet (this modal only ever opens from the already
  // AuthGuard-gated `/users` page, so organization is real by the time
  // anyone can click "Invite User") — never the actual functional default.
  const [role, setRole] = useState<Role>(editingUser?.role ?? organization?.defaultRole ?? "MEMBER");
  const [weeklyCapacity, setWeeklyCapacity] = useState(
    String(editingUser?.weeklyCapacity ?? organization?.defaultWeeklyCapacity ?? 40)
  );
  const [method, setMethod] = useState<InviteMethod>("email");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0;

  // The invite itself only ever creates a workspace membership — never a
  // project assignment. editingUser's own projectSlugs pass through
  // untouched (via the spread) rather than being overwritten here; project
  // staffing is Team → Add Member's job, not this form's.
  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    const capacity = Math.max(0, parseInt(weeklyCapacity, 10) || 0);

    if (editingUser) {
      setFormError(null);
      if (isDevFallback || !organization) {
        setFormError("Editing users isn't available in this mode.");
        return;
      }

      setSubmitting(true);
      const editResult = await editOrganizationMember(organization.id, editingUser.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        weeklyCapacity: capacity,
      });
      setSubmitting(false);

      if (editResult.status === "error") {
        setFormError(editResult.message);
        return;
      }

      onEdited?.({
        ...editingUser,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        role,
        weeklyCapacity: capacity,
      });
      handleClose();
      return;
    }

    setFormError(null);
    if (isDevFallback || !organization) {
      setFormError("Inviting users isn't available in this mode.");
      return;
    }

    const fields = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      role,
      weeklyCapacity: capacity,
    };

    setSubmitting(true);

    if (method === "email") {
      const result = await inviteOrganizationUser(organization.id, fields);
      setSubmitting(false);

      if (result.status === "error") {
        setFormError(result.message);
        return;
      }

      onInviteSent?.(email.trim());
      handleClose();
      return;
    }

    const result = await generateOrganizationInviteLink(organization.id, fields);
    setSubmitting(false);

    if (result.status === "error") {
      setFormError(result.message);
      return;
    }

    // Stays open — the form is replaced by the success state below so the
    // admin can copy the link, rather than closing like the email flow.
    setInviteLink(result.inviteLink);
    onLinkGenerated?.();
  }

  async function handleCopyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      // Clipboard write can fail (permissions, non-secure context); the
      // link is already visible and selectable in the read-only field
      // either way, so there's nothing further to recover here.
    }
    setLinkCopied(true);
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
            {inviteLink ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-700 dark:text-emerald-400"
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Invite link generated successfully.</span>
              </div>
            ) : (
              formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400"
                >
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
                  </svg>
                  <span>{formError}</span>
                </div>
              )
            )}

            {inviteLink ? (
              <div>
                <label className={FIELD_LABEL}>Invite Link</label>
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className={INPUT}
                />
              </div>
            ) : (
              <>
                {!isEditing && (
                  <div>
                    <label className={FIELD_LABEL}>Invitation Method</label>
                    <InviteMethodToggle value={method} onChange={setMethod} disabled={submitting} />
                  </div>
                )}

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
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 mt-1 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 rounded-b-2xl bg-slate-50/40 dark:bg-zinc-900/20">
            {inviteLink ? (
              <>
                <button
                  onClick={handleCopyLink}
                  className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Copy Link
                </button>

                <button
                  onClick={handleClose}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className={
                    "inline-flex items-center gap-2 px-6 py-2.5 text-[13px] font-semibold rounded-lg transition-all " +
                    (canSubmit && !submitting
                      ? "bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white shadow-md shadow-brand-600/25 dark:shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-600/30"
                      : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed")
                  }
                >
                  {isEditing
                    ? submitting ? "Saving…" : "Save Changes"
                    : submitting
                      ? method === "link" ? "Generating…" : "Sending…"
                      : method === "link" ? "Generate Invite Link" : "Send Invitation"}
                  {canSubmit && !submitting && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {linkCopied && <CopyFeedback message="Invite link copied to clipboard." onDismiss={() => setLinkCopied(false)} />}
    </>
  );
}
