"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { fullName } from "@/lib/mock-users";
import type { User, UserStatus } from "@/lib/mock-users";
import type { Role } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/current-user";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import {
  loadOrganizationUsers,
  updateOrganizationMember,
  disableOrganizationMember,
  enableOrganizationMember,
  generatePasswordResetLink,
} from "@/lib/users";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { MemberProfileModal, UserStatusBadge, useRefreshOnFocusAndVisibility } from "@/components/member-profile-modal";
import type { ProfileTab } from "@/components/member-profile-modal";
import { InviteUserModal } from "@/components/invite-user-modal";
import { ResetPasswordLinkModal } from "@/components/reset-password-link-modal";
import { SkeletonBlock } from "@/components/dashboard-shared";

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE_CLASS: Record<Role, string> = {
  ADMIN:        "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  PROJECT_LEAD: "bg-sky-50    text-sky-700    dark:bg-sky-500/10    dark:text-sky-400",
  MEMBER:       "bg-slate-100 text-slate-600  dark:bg-zinc-800      dark:text-zinc-400",
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0 ${ROLE_BADGE_CLASS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
// Mirrors this screen's own real layout (header/Invite, search+filters,
// table+rows) using the same SkeletonBlock primitive the Dashboards/
// Projects list already build their own skeletons out of, rather than a
// second skeleton pattern. Shown on the real initial load only — a
// focus/visibility-driven background refresh never resets `loadState` back
// to "loading" (see the real fetch effect below), so it never re-appears
// and never blanks the table the user is already looking at.
function UsersLoadingSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SkeletonBlock className="h-[22px] w-20" />
          <SkeletonBlock className="h-[14px] w-64 mt-2" />
        </div>
        <SkeletonBlock className="h-8 w-32" />
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <SkeletonBlock className="h-8 w-full sm:w-64 flex-shrink-0" />
        <div className="flex items-center gap-1.5">
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-7 w-16" />
          <SkeletonBlock className="h-7 w-20" />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800">
                <th className="py-2.5 pl-5 text-left"><SkeletonBlock className="h-[10px] w-10" /></th>
                <th className="py-2.5 text-left"><SkeletonBlock className="h-[10px] w-12" /></th>
                <th className="py-2.5 text-left"><SkeletonBlock className="h-[10px] w-10" /></th>
                <th className="py-2.5 text-left"><SkeletonBlock className="h-[10px] w-12" /></th>
                <th className="py-2.5 text-right"><SkeletonBlock className="h-[10px] w-14 ml-auto" /></th>
                <th className="py-2.5 text-right"><SkeletonBlock className="h-[10px] w-20 ml-auto" /></th>
                <th className="py-2.5 text-right"><SkeletonBlock className="h-[10px] w-16 ml-auto" /></th>
                <th className="py-2.5 pr-5 text-right"><SkeletonBlock className="h-[10px] w-12 ml-auto" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className="py-2.5 pl-5 pr-4">
                    <div className="flex items-center gap-2.5">
                      <SkeletonBlock className="w-7 h-7 rounded-full flex-shrink-0" />
                      <SkeletonBlock className="h-3.5 w-28" />
                    </div>
                  </td>
                  <td className="py-2.5 pr-4"><SkeletonBlock className="h-3.5 w-36" /></td>
                  <td className="py-2.5 pr-4"><SkeletonBlock className="h-4 w-20 rounded-full" /></td>
                  <td className="py-2.5 pr-4"><SkeletonBlock className="h-4 w-16 rounded-full" /></td>
                  <td className="py-2.5 pr-4 text-right"><SkeletonBlock className="h-3.5 w-6 ml-auto" /></td>
                  <td className="py-2.5 pr-4 text-right"><SkeletonBlock className="h-3.5 w-10 ml-auto" /></td>
                  <td className="py-2.5 pr-4 text-right"><SkeletonBlock className="h-3.5 w-16 ml-auto" /></td>
                  <td className="py-2.5 pr-5 text-right"><SkeletonBlock className="h-6 w-6 rounded-lg ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
// Resend Invitation is still mock (no real backend to call), so this is the
// only feedback surface for it — a brief, dismissable
// confirmation rather than a silent no-op.

interface ToastState {
  message: string;
  variant: "success" | "error";
}

// variant only ever changes the icon (checkmark vs. alert) — an error must
// never be signaled with the same confirmation icon as a success. Position,
// background, and text styling stay identical for both.
function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 bg-slate-900 dark:bg-zinc-800 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-black/20">
      {toast.variant === "error" ? (
        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {toast.message}
    </div>
  );
}

// ── Delete confirmation ──────────────────────────────────────────────────────

function DeleteUserModal({
  user,
  onCancel,
  onConfirm,
}: {
  user: User;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <>
      <div aria-hidden onClick={onCancel} className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-label="Delete user"
          className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl shadow-black/20 dark:shadow-black/60 p-6"
        >
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Delete {fullName(user)}?</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1.5">
            This permanently removes their account and access. Any tickets already assigned to them keep their assignment history. This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-[13px] font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Delete User
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Row actions menu ─────────────────────────────────────────────────────────

interface RowAction {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  // Positioned with `fixed` + coordinates measured from the trigger button,
  // not `absolute` inside the table row — the table's horizontal scroll
  // wrapper needs `overflow-x-auto`, which (per the CSS overflow spec) also
  // computes overflow-y as auto, clipping an `absolute` dropdown on the
  // last row or two. `fixed` positioning escapes that clipping entirely.
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="User actions"
        className={
          "p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800" : "")
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      {open && coords && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: coords.top, right: coords.right }}
          className="z-50 w-48 rounded-lg border bg-white dark:bg-zinc-900 shadow-lg shadow-black/10 dark:shadow-black/40 border-slate-200 dark:border-zinc-700/60"
        >
          <div className="py-1">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => { setOpen(false); action.onClick(); }}
                className={
                  "w-full px-3 py-1.5 text-[13px] text-left transition-colors duration-150 " +
                  (action.danger
                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60")
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Inline-editable Weekly Capacity cell ─────────────────────────────────────

const MIN_CAPACITY = 0;
const MAX_CAPACITY = 168; // hours in a week — same sane ceiling as the Invite/Edit form

function CapacityCell({ user, onSave }: { user: User; onSave: (hours: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(user.weeklyCapacity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(String(user.weeklyCapacity));
    setEditing(true);
  }

  function commit() {
    const parsed = Math.round(Number(draft));
    const clamped = Number.isFinite(parsed)
      ? Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, parsed))
      : user.weeklyCapacity;
    if (clamped !== user.weeklyCapacity) onSave(clamped);
    setEditing(false);
  }

  function cancel() {
    setDraft(String(user.weeklyCapacity));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="tabular-nums text-slate-600 dark:text-zinc-400 hover:text-brand-600 dark:hover:text-brand-400 hover:underline underline-offset-2 transition-colors"
      >
        {user.weeklyCapacity}h
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min={MIN_CAPACITY}
      max={MAX_CAPACITY}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      className="w-16 text-right tabular-nums bg-white dark:bg-zinc-900 border border-brand-400 dark:border-brand-500 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
    />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const ROLE_GROUPS: DropdownGroup[] = [{
  options: (["ADMIN", "PROJECT_LEAD", "MEMBER"] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
}];

const STATUS_GROUPS: DropdownGroup[] = [{
  options: (["Active", "Invited", "Disabled"] as UserStatus[]).map((s) => ({ value: s, label: s })),
}];

export function UsersScreen() {
  const { user: currentUser, organization, isDevFallback } = useCurrentUser();
  // Real, org-scoped project list — same source Sidebar/Projects already
  // use — for the Project filter's options and for resolving a user's
  // projectSlugs to display names below (no mock-projects.ts involved).
  const { projects: orgProjects } = useOrganizationProjects();
  const projectNameBySlug = useMemo(
    () => new Map(orgProjects.map((p) => [p.slug, p.name])),
    [orgProjects]
  );
  const projectGroups: DropdownGroup[] = useMemo(
    () => [{ options: orgProjects.map((p) => ({ value: p.slug, label: p.name })) }],
    [orgProjects]
  );

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);

  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ user: User; tab: ProfileTab } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [resetPasswordLink, setResetPasswordLink] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  function showToast(message: string, variant: ToastState["variant"] = "success") {
    setToast({ message, variant });
  }

  const requestIdRef = useRef(0);
  // Guards both Disable and Enable (never both at once for the same row —
  // the menu only ever offers one or the other based on current status).
  const membershipStatusChangeIds = useRef<Set<string>>(new Set());
  const generatingResetLinkIds = useRef<Set<string>>(new Set());
  // Once the first real load has ever succeeded, a later background
  // refresh (focus/visibility regain) that fails must never blank the
  // table with an error screen or stale zeros — only the true first load
  // ever shows the skeleton or the error state.
  const hasLoadedRef = useRef(false);
  // Collapses `organization`'s own focus-driven reference change and the
  // explicit focus/visibilitychange listener below firing together into a
  // single real request.
  const lastRunAtRef = useRef(0);

  // No mock fallback here (unlike e.g. Projects' dev-only mock roster) —
  // this module has no real backend without a real organization, so dev
  // fallback simply shows an empty list rather than fabricated accounts.
  const runFetch = useCallback(() => {
    if (isDevFallback || !organization) return;
    const now = Date.now();
    if (now - lastRunAtRef.current < 300) return;
    lastRunAtRef.current = now;
    if (!hasLoadedRef.current) setLoadState("loading");
    const requestId = ++requestIdRef.current;
    loadOrganizationUsers(organization.id).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (result.status === "ready") {
        hasLoadedRef.current = true;
        setUsersList(result.users);
        // If View Profile is open, keep it open on the same real user and
        // the same active tab — just resolved fresh by the same real
        // `profileId`, never by name/email/avatar/array position, and
        // never closed by a background refresh.
        setProfileTarget((prev) => {
          if (!prev) return prev;
          const updated = result.users.find((u) => u.id === prev.user.id);
          return updated ? { user: updated, tab: prev.tab } : prev;
        });
        setLoadState("ready");
      } else if (!hasLoadedRef.current) {
        setLoadErrorMessage(result.message);
        setLoadState("error");
      }
    });
  }, [isDevFallback, organization]);

  useEffect(() => {
    runFetch();
  }, [runFetch]);

  // Real refresh on window focus regain and tab-visibility regain — search
  // and filters live in their own separate state below, untouched by this.
  useRefreshOnFocusAndVisibility(runFetch);

  const searchId = useId();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return usersList.filter((u) => {
      const matchesSearch =
        query === "" ||
        u.firstName.toLowerCase().includes(query) ||
        u.lastName.toLowerCase().includes(query) ||
        fullName(u).toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query);
      const matchesRole = roleFilter.length === 0 || roleFilter.includes(u.role);
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(u.status);
      const matchesProject =
        projectFilter.length === 0 || u.projectSlugs.some((slug) => projectFilter.includes(slug));
      return matchesSearch && matchesRole && matchesStatus && matchesProject;
    });
  }, [usersList, search, roleFilter, statusFilter, projectFilter]);

  function openProfile(user: User, tab: ProfileTab = "profile") {
    setProfileTarget({ user, tab });
  }

  // Real persistence for the three fields organization_memberships already
  // backs (role, status, weekly_capacity) — reuses that table's existing
  // admin-only RLS, no RPC needed since this screen is already Admin-gated
  // below. Re-fetches on success so the list always reflects the real
  // persisted row rather than an optimistic guess.
  async function persistMemberUpdate(
    user: User,
    updates: { role?: Role; status?: UserStatus; weeklyCapacity?: number },
    successMessage: string
  ) {
    if (isDevFallback || !organization) return;
    const result = await updateOrganizationMember(organization.id, user.id, updates);
    if (result.status === "error") {
      showToast(result.message, "error");
      return;
    }
    runFetch();
    showToast(successMessage);
  }

  // "Disable User" and "Enable User" — organization_memberships has no
  // UPDATE grant for the authenticated role, so both go through the same
  // Server Action (disableOrganizationMember / enableOrganizationMember,
  // one shared implementation server-side) rather than persistMemberUpdate's
  // direct client-side update; see src/lib/server/disable-user-action.ts.
  // The in-flight guard below is what prevents a second click (e.g.
  // reopening the row menu quickly) from firing a second request for the
  // same user while the first is still pending — the menu itself already
  // closes on click, same as every other row action.
  async function handleSetMembershipStatus(user: User, targetStatus: "Active" | "Disabled") {
    if (isDevFallback || !organization) return;
    if (membershipStatusChangeIds.current.has(user.id)) return;
    membershipStatusChangeIds.current.add(user.id);
    const result =
      targetStatus === "Disabled"
        ? await disableOrganizationMember(organization.id, user.id)
        : await enableOrganizationMember(organization.id, user.id);
    membershipStatusChangeIds.current.delete(user.id);

    if (result.status === "error") {
      showToast(result.message, "error");
      return;
    }
    runFetch();
    showToast(`${fullName(user)} was ${targetStatus === "Disabled" ? "disabled" : "enabled"}.`);
  }

  // "Reset Password" — generates a single-use recovery link server-side
  // (never sends mail) via generatePasswordResetLink; see
  // src/lib/server/invite-user-action.ts's generatePasswordResetLinkAction.
  // Nothing here changes organization_memberships or profiles, so unlike
  // handleSetMembershipStatus there's no runFetch — the list has nothing to
  // refresh. Success opens ResetPasswordLinkModal instead of a toast.
  async function handleGeneratePasswordResetLink(user: User) {
    if (isDevFallback || !organization) return;
    if (generatingResetLinkIds.current.has(user.id)) return;
    generatingResetLinkIds.current.add(user.id);
    const result = await generatePasswordResetLink(organization.id, user.id);
    generatingResetLinkIds.current.delete(user.id);

    if (result.status === "error") {
      showToast(result.message, "error");
      return;
    }
    setResetPasswordLink(result.resetLink);
  }

  // The modal itself performs the real edit (Server Action, via
  // editOrganizationMember — see invite-user-modal.tsx) and only calls this
  // after it actually succeeds — refetch so Users reflects the real
  // persisted row, never a locally-simulated one. Mirrors handleInviteSent's
  // pattern. Name/role/weekly capacity are the fields the form persists;
  // email/project-assignment edits in the same form are still display-only
  // (no write path for those), unchanged from before.
  function handleEdited(updated: User) {
    setEditingUser(null);
    runFetch();
    showToast(`${fullName(updated)} was updated.`);
  }

  // The modal itself performs the real invite (Server Action) and only
  // calls this after it actually succeeds — refetch so the new Invited row
  // comes from Supabase like every other row, never a locally-simulated one.
  function handleInviteSent(email: string) {
    setShowInvite(false);
    runFetch();
    showToast(`Invitation sent to ${email}.`);
  }

  async function copyInvitationLink(u: User) {
    const link = `https://app.jirita.com/invite/${u.id}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Invitation link copied to clipboard.");
    } catch {
      showToast(link);
    }
  }

  // Lifecycle-appropriate actions only — e.g. an Active user can't be
  // deleted directly (Disable first), and a Disabled user has no password
  // to reset.
  function actionsFor(u: User): RowAction[] {
    const common: RowAction[] = [
      { label: "View Profile", onClick: () => openProfile(u, "profile") },
      { label: "Edit User", onClick: () => setEditingUser(u) },
    ];

    if (u.status === "Active") {
      return [
        ...common,
        { label: "Reset Password", onClick: () => handleGeneratePasswordResetLink(u) },
        { label: "Disable User", onClick: () => handleSetMembershipStatus(u, "Disabled") },
      ];
    }

    if (u.status === "Disabled") {
      return [
        ...common,
        { label: "Enable User", onClick: () => handleSetMembershipStatus(u, "Active") },
        { label: "Delete User", danger: true, onClick: () => setDeleteTarget(u) },
      ];
    }

    // Invited
    return [
      ...common,
      { label: "Resend Invitation", onClick: () => showToast(`Invitation resent to ${u.email}.`) },
      { label: "Copy Invitation Link", onClick: () => copyInvitationLink(u) },
    ];
  }

  if (currentUser.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 px-4">
        <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Admins only</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
          User management is only available to Admins.
        </p>
      </div>
    );
  }

  if (loadState === "loading") {
    return <UsersLoadingSkeleton />;
  }

  if (loadState === "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load users</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
          {loadErrorMessage ?? "Something went wrong."}
        </p>
        <button
          type="button"
          onClick={runFetch}
          className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Users</h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
            Manage user accounts, access and permissions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors flex-shrink-0 dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          + Invite User
        </button>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor={searchId} className="relative w-full sm:w-64 flex-shrink-0">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id={searchId}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>

        <div className="flex items-center gap-1 flex-wrap">
          <FilterDropdown label="Role" mode="multi" groups={ROLE_GROUPS} selected={roleFilter} onChange={setRoleFilter} />
          <FilterDropdown label="Status" mode="multi" groups={STATUS_GROUPS} selected={statusFilter} onChange={setStatusFilter} />
          <FilterDropdown label="Project" mode="multi" groups={projectGroups} selected={projectFilter} onChange={setProjectFilter} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-zinc-800">
                <th className="py-2.5 pl-5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Name</th>
                <th className="py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Email</th>
                <th className="py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Role</th>
                <th className="py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Status</th>
                <th className="py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Projects</th>
                <th className="py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</th>
                <th className="py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Last Login</th>
                <th className="py-2.5 pr-5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-zinc-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400 dark:text-zinc-500">
                    {usersList.length === 0 ? "No users yet." : "No users match your search or filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-zinc-800/30 transition-colors duration-150">
                    <td className="py-2.5 pl-5 pr-4">
                      <button
                        type="button"
                        onClick={() => openProfile(u, "profile")}
                        className="flex items-center gap-2.5 text-left hover:opacity-80 transition-opacity"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u.avatar} alt={fullName(u)} className="w-7 h-7 rounded-full flex-shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-zinc-200 whitespace-nowrap">{fullName(u)}</span>
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500 dark:text-zinc-400 whitespace-nowrap">{u.email}</td>
                    <td className="py-2.5 pr-4"><RoleBadge role={u.role} /></td>
                    <td className="py-2.5 pr-4"><UserStatusBadge status={u.status} /></td>
                    <td className="py-2.5 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => openProfile(u, "projects")}
                        disabled={u.projectSlugs.length === 0}
                        title={u.projectSlugs.map((slug) => projectNameBySlug.get(slug) ?? slug).join(", ")}
                        className="font-semibold text-slate-700 dark:text-zinc-300 tabular-nums hover:text-brand-600 dark:hover:text-brand-400 disabled:hover:text-slate-700 dark:disabled:hover:text-zinc-300 disabled:cursor-default transition-colors"
                      >
                        {u.projectSlugs.length}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                      <CapacityCell
                        user={u}
                        onSave={(hours) => persistMemberUpdate(u, { weeklyCapacity: hours }, "Weekly capacity updated.")}
                      />
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {u.lastLogin ?? "—"}
                    </td>
                    <td className="py-2.5 pr-5 text-right">
                      <RowActionsMenu actions={actionsFor(u)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onInviteSent={handleInviteSent}
          onLinkGenerated={runFetch}
        />
      )}

      {editingUser && (
        <InviteUserModal
          editingUser={editingUser}
          onClose={() => setEditingUser(null)}
          onEdited={handleEdited}
        />
      )}

      {profileTarget && (
        <MemberProfileModal
          user={profileTarget.user}
          initialTab={profileTarget.tab}
          onClose={() => setProfileTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteUserModal
          user={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            setUsersList((prev) => prev.filter((u) => u.id !== deleteTarget.id));
            showToast(`${fullName(deleteTarget)} was deleted.`);
            setDeleteTarget(null);
          }}
        />
      )}

      {resetPasswordLink && (
        <ResetPasswordLinkModal
          link={resetPasswordLink}
          onCopy={() => showToast("Password reset link copied to clipboard.")}
          onClose={() => setResetPasswordLink(null)}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
