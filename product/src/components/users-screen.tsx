"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { users as INITIAL_USERS, fullName } from "@/lib/mock-users";
import type { User, UserStatus } from "@/lib/mock-users";
import { getProjectBySlug, projects } from "@/lib/mock-projects";
import type { Role } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/current-user";
import { useCurrentUser } from "@/components/current-user-provider";
import { FilterDropdown } from "@/components/tickets/filter-dropdown";
import type { DropdownGroup } from "@/components/tickets/filter-dropdown";
import { MemberProfileModal, UserStatusBadge } from "@/components/member-profile-modal";
import type { ProfileTab } from "@/components/member-profile-modal";
import { InviteUserModal } from "@/components/invite-user-modal";

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

// ── Toast ─────────────────────────────────────────────────────────────────────
// Mock actions (Reset Password, Resend Invitation) have no real backend to
// call, so this is the only feedback surface for them — a brief, dismissable
// confirmation rather than a silent no-op.

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
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

const PROJECT_GROUPS: DropdownGroup[] = [{
  options: projects.map((p) => ({ value: p.slug, label: p.name })),
}];

export function UsersScreen() {
  const { user: currentUser } = useCurrentUser();
  const [usersList, setUsersList] = useState<User[]>(INITIAL_USERS);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);

  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [profileTarget, setProfileTarget] = useState<{ user: User; tab: ProfileTab } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  function updateUser(updated: User) {
    setUsersList((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  function handleInvited(newOrUpdated: User) {
    setUsersList((prev) => {
      const exists = prev.some((u) => u.id === newOrUpdated.id);
      return exists
        ? prev.map((u) => (u.id === newOrUpdated.id ? newOrUpdated : u))
        : [newOrUpdated, ...prev];
    });
    setShowInvite(false);
    setEditingUser(null);
    setToast(editingUser ? `${fullName(newOrUpdated)} was updated.` : `Invitation sent to ${newOrUpdated.email}.`);
  }

  async function copyInvitationLink(u: User) {
    const link = `https://app.jirita.com/invite/${u.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setToast("Invitation link copied to clipboard.");
    } catch {
      setToast(link);
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
        { label: "Reset Password", onClick: () => setToast(`Password reset email sent to ${u.email}.`) },
        { label: "Disable User", onClick: () => updateUser({ ...u, status: "Disabled" }) },
      ];
    }

    if (u.status === "Disabled") {
      return [
        ...common,
        { label: "Enable User", onClick: () => updateUser({ ...u, status: "Active" }) },
        { label: "Delete User", danger: true, onClick: () => setDeleteTarget(u) },
      ];
    }

    // Invited
    return [
      ...common,
      { label: "Resend Invitation", onClick: () => setToast(`Invitation resent to ${u.email}.`) },
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
          <FilterDropdown label="Project" mode="multi" groups={PROJECT_GROUPS} selected={projectFilter} onChange={setProjectFilter} />
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
                        title={u.projectSlugs.map((slug) => getProjectBySlug(slug)?.name ?? slug).join(", ")}
                        className="font-semibold text-slate-700 dark:text-zinc-300 tabular-nums hover:text-brand-600 dark:hover:text-brand-400 disabled:hover:text-slate-700 dark:disabled:hover:text-zinc-300 disabled:cursor-default transition-colors"
                      >
                        {u.projectSlugs.length}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                      <CapacityCell user={u} onSave={(hours) => updateUser({ ...u, weeklyCapacity: hours })} />
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                      {u.lastLogin ?? "Never"}
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
          onInvited={handleInvited}
        />
      )}

      {editingUser && (
        <InviteUserModal
          editingUser={editingUser}
          onClose={() => setEditingUser(null)}
          onInvited={handleInvited}
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
            setToast(`${fullName(deleteTarget)} was deleted.`);
            setDeleteTarget(null);
          }}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
