"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { AvailabilityStatus, TeamMember } from "@/lib/mock-team";
import { getTicketById, getTicketDisplayKey, tickets as ALL_TICKETS } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { StatusBadge as TicketStatusBadge, PriorityBadge, TicketTypeIcon, ActivityTimeline } from "@/components/tickets/ticket-ui";
import type { MockActivity } from "@/components/tickets/ticket-ui";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import type { User, UserStatus } from "@/lib/mock-users";
import { fullName } from "@/lib/mock-users";
import type { Role } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/current-user";
import { getProjectBySlug } from "@/lib/mock-projects";

// The one Member Profile Modal used everywhere in the app a member is
// clicked — ticket assignees, activity-feed actors, comment authors, team
// rosters, reports tables, timesheets. See member-profile.tsx for the
// context/trigger that opens this from anywhere without local state.
//
// It has two modes sharing one shell: pass `member`+`slug` (the existing,
// per-project TeamMember — every trigger app-wide) for the original
// single-view modal, unchanged. Pass `user` (the org-wide account record
// from the Users page, /users) to additionally get a
// Profile/Projects/Permissions/Security/Activity tab bar. A caller passes
// one or the other, never both.

// ── Status & capacity styling ───────────────────────────────────────────────────

const STATUS_STYLE: Record<AvailabilityStatus, { dot: string; text: string; bg: string }> = {
  Available: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  Busy:      { dot: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10" },
  Away:      { dot: "bg-slate-400 dark:bg-zinc-600", text: "text-slate-500 dark:text-zinc-400", bg: "bg-slate-100 dark:bg-zinc-800" },
};

export function StatusBadge({ status }: { status: AvailabilityStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

export function utilizationOf(member: TeamMember): number {
  return Math.round((member.assignedHours / member.weeklyCapacity) * 100);
}

export function capacityBarColor(pct: number): string {
  return pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-400" : "bg-emerald-500";
}

export function capacityTextColor(pct: number): string {
  return pct > 100
    ? "text-red-600 dark:text-red-400"
    : pct > 80
    ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";
}

export function CapacityBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full ${capacityBarColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function remainingAvailabilityLabel(member: TeamMember): string {
  const remaining = member.weeklyCapacity - member.assignedHours;
  return remaining >= 0 ? `${remaining}h available` : `${Math.abs(remaining)}h over capacity`;
}

// ── Account status styling (Users module) ───────────────────────────────────

const USER_STATUS_STYLE: Record<UserStatus, { dot: string; text: string; bg: string }> = {
  Active:   { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  Invited:  { dot: "bg-amber-500",   text: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10" },
  Disabled: { dot: "bg-slate-400 dark:bg-zinc-600", text: "text-slate-500 dark:text-zinc-400", bg: "bg-slate-100 dark:bg-zinc-800" },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const style = USER_STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${style.bg} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

// ── Member Profile Modal ─────────────────────────────────────────────────────

export type ProfileTab = "profile" | "projects" | "permissions" | "security" | "activity";

const PROFILE_TABS: { key: ProfileTab; label: string }[] = [
  { key: "profile",     label: "Profile" },
  { key: "projects",    label: "Projects" },
  { key: "permissions", label: "Permissions" },
  { key: "security",    label: "Security" },
  { key: "activity",    label: "Activity" },
];

export function MemberProfileModal({
  member,
  slug,
  user,
  initialTab = "profile",
  onClose,
}: {
  member?: TeamMember;
  /** Required when `member` is set (existing per-project mode); unused in user mode. */
  slug?: string;
  /** Org-wide account — when set, renders the tab bar instead of the plain single view. */
  user?: User;
  /** Which tab opens first in user mode — e.g. the Users table's "Projects"
   *  count cell deep-links straight to the Projects tab. */
  initialTab?: ProfileTab;
  onClose: () => void;
}) {
  const isUserMode = user !== undefined;
  const [visible, setVisible] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

  const pct = member ? utilizationOf(member) : 0;
  const memberTickets = member
    ? member.activeTicketIds.map((id) => getTicketById(id)).filter((t): t is Ticket => t !== undefined)
    : [];

  const displayName = user ? fullName(user) : member!.name;
  const displayAvatar = user ? user.avatar : member!.avatar;
  const displayRole = user ? ROLE_LABELS[user.role] : member!.role;
  const displayEmail = user ? user.email : member!.email;

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // While the ticket panel is open, let its own Escape handler close just
      // that layer instead of closing both at once.
      if (selectedTicket) return;
      handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicket]);

  return (
    <>
      <div
        aria-hidden
        onClick={() => (selectedTicket ? setSelectedTicket(null) : handleClose())}
        className={
          "fixed inset-0 z-50 bg-black/30 dark:bg-black/50 transition-opacity duration-200 " +
          (visible ? "opacity-100" : "opacity-0")
        }
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div
          role="dialog"
          aria-modal
          aria-label={displayName}
          className={
            "pointer-events-auto w-full max-w-2xl flex flex-col " +
            "max-h-[calc(100dvh-3rem)] bg-white dark:bg-zinc-950 " +
            "rounded-2xl border border-slate-200 dark:border-zinc-800 " +
            "shadow-2xl shadow-black/20 dark:shadow-black/60 " +
            "transition-all duration-200 ease-out " +
            (visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]")
          }
        >
          <div className="flex items-center justify-end gap-1.5 px-6 pt-5 flex-shrink-0">
            {!isUserMode && <MemberMenu />}
            <CloseButton onClick={handleClose} />
          </div>

          <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-8">
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayAvatar} alt={displayName} className="w-14 h-14 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">{displayName}</h1>
                  {user ? <UserStatusBadge status={user.status} /> : <StatusBadge status={member!.status} />}
                </div>
                <p className="text-sm text-slate-500 mt-0.5 dark:text-zinc-400">{displayRole}</p>
                {displayEmail && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5 dark:text-zinc-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {displayEmail}
                  </p>
                )}
              </div>
            </div>

            {user ? (
              <>
                <div className="mt-6 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-5">
                  {PROFILE_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={[
                        "pb-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                        activeTab === tab.key
                          ? "text-brand-600 border-brand-500 dark:text-brand-400 dark:border-brand-400"
                          : "text-slate-500 border-transparent hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="mt-6">
                  {activeTab === "profile" && <ProfileTabContent user={user} />}
                  {activeTab === "projects" && <ProjectsTabContent user={user} />}
                  {activeTab === "permissions" && <PermissionsTabContent user={user} />}
                  {activeTab === "security" && <SecurityTabContent user={user} />}
                  {activeTab === "activity" && <ActivityTabContent user={user} />}
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{member!.weeklyCapacity}h</p>
                  </div>
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Assigned Hours</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{member!.assignedHours}h</p>
                  </div>
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Utilization</p>
                    <p className={`text-lg font-bold mt-0.5 leading-none tabular-nums ${capacityTextColor(pct)}`}>{pct}%</p>
                  </div>
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Active Tickets</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{memberTickets.length}</p>
                  </div>
                </div>

                <div className="mt-7">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">
                    Current Workload
                  </h2>
                  <CapacityBar pct={pct} />
                  <p className={`mt-1.5 text-[13px] font-medium ${capacityTextColor(pct)}`}>
                    {remainingAvailabilityLabel(member!)}
                  </p>
                </div>

                <div className="mt-7 pt-6 border-t border-slate-100 dark:border-zinc-800">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1">
                    Active Tickets
                  </h2>
                  {memberTickets.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-zinc-500 mt-2">No active tickets.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {memberTickets.map((ticket) => (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => setSelectedTicket(ticket)}
                          className="w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <span className="flex items-center gap-1 text-xs font-mono text-slate-400 dark:text-zinc-500 flex-shrink-0 w-16">
                            <TicketTypeIcon type={ticket.type} />
                            {getTicketDisplayKey(ticket)}
                          </span>
                          <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-zinc-300 truncate">
                            {ticket.title}
                          </span>
                          <PriorityBadge priority={ticket.priority} />
                          <TicketStatusBadge status={ticket.status} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedTicket && slug && (
        <TicketPreviewPanel
          ticket={selectedTicket}
          slug={slug}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function MemberMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const items: { label: string; danger?: boolean }[] = [
    { label: "Send Message" },
    { label: "View Ticket History" },
    { label: "Remove from Project", danger: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Member actions"
        className={
          "p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors " +
          (open ? "text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800" : "")
        }
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>

      <div
        className={
          "absolute right-0 top-full mt-1.5 z-10 w-44 rounded-lg border bg-white dark:bg-zinc-900 " +
          "shadow-lg shadow-black/10 dark:shadow-black/40 border-slate-200 dark:border-zinc-700/60 " +
          "transition-all duration-150 origin-top-right " +
          (open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none")
        }
      >
        <div className="py-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setOpen(false)}
              className={
                "w-full px-3 py-1.5 text-[13px] text-left transition-colors duration-150 " +
                (item.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800/60")
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── User-mode tab content (Users module, /users) ────────────────────────────

function ProfileRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <p className="text-[13px] text-slate-500 dark:text-zinc-400">{label}</p>
      <div className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">{value}</div>
    </div>
  );
}

function ProfileTabContent({ user }: { user: User }) {
  return (
    <>
      <div className="flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Weekly Capacity</p>
          <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{user.weeklyCapacity}h</p>
        </div>
        <div className="flex-1 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Projects</p>
          <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{user.projectSlugs.length}</p>
        </div>
        <div className="flex-1 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Last Login</p>
          <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{user.lastLogin ?? "Never"}</p>
        </div>
        <div className="flex-1 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
            {user.status === "Invited" ? "Invited" : "Member Since"}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">
            {user.joinedAt.replace(/^Invited /, "")}
          </p>
        </div>
      </div>

      <div className="mt-7">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">
          Account
        </h2>
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 divide-y divide-slate-100 dark:divide-zinc-800">
          <ProfileRow label="Status" value={<UserStatusBadge status={user.status} />} />
          <ProfileRow label="Role" value={ROLE_LABELS[user.role]} />
          <ProfileRow label="Email" value={user.email} />
        </div>
      </div>
    </>
  );
}

// Derived live from the ticket dataset rather than mock-team.ts's TeamMember
// rows, so every assigned project shows real numbers — not every project a
// user is on has a corresponding TeamMember row (that roster only covers
// mobile-banking-app/internal-platform-migration today).
function ProjectsTabContent({ user }: { user: User }) {
  if (user.projectSlugs.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Not assigned to any projects yet.</p>;
  }
  const name = fullName(user);
  return (
    <div className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70">
      {user.projectSlugs.map((slug) => {
        const project = getProjectBySlug(slug);
        const projectTickets = ALL_TICKETS.filter((t) => t.projectSlug === slug && t.assignee.name === name);
        const activeTickets = projectTickets.filter((t) => t.status !== "done");
        const assignedHours = projectTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0);
        const isLead = project?.owner.name === name;
        return (
          <div key={slug} className="px-4 py-3">
            <Link
              href={`/projects/${slug}`}
              className="text-[13px] font-medium text-brand-600 dark:text-brand-400 hover:underline truncate block"
            >
              {project?.name ?? slug}
            </Link>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
              {isLead ? "Project Lead" : "Member"}
              <span className="mx-1.5 text-slate-300 dark:text-zinc-700">•</span>
              {activeTickets.length} active ticket{activeTickets.length === 1 ? "" : "s"}
              <span className="mx-1.5 text-slate-300 dark:text-zinc-700">•</span>
              {assignedHours}h assigned
            </p>
          </div>
        );
      })}
    </div>
  );
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Full access to every project, ticket, report, and workspace setting — including managing other users.",
  PROJECT_LEAD: "Can manage their assigned projects: tickets, milestones, team workload, and project-level reports.",
  MEMBER: "Can view and work on tickets assigned to them within the projects they're staffed on.",
};

function PermissionsTabContent({ user }: { user: User }) {
  return (
    <div>
      <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4.5 h-4.5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{ROLE_LABELS[user.role]}</p>
          <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5 max-w-md">{ROLE_DESCRIPTIONS[user.role]}</p>
        </div>
      </div>
      <p className="text-[12px] text-slate-400 dark:text-zinc-600 mt-3">
        Role is changed from the Edit User action — permissions are role-based and can&apos;t be customized per person.
      </p>
    </div>
  );
}

function SecurityTabContent({ user }: { user: User }) {
  const [resetSent, setResetSent] = useState(false);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 divide-y divide-slate-100 dark:divide-zinc-800">
        <ProfileRow label="Last Login" value={user.lastLogin ?? "Never"} />
        {user.browser && <ProfileRow label="Browser" value={user.browser} />}
        {user.os && <ProfileRow label="OS" value={user.os} />}
        {user.device && <ProfileRow label="Device" value={user.device} />}
        <ProfileRow label="Account Status" value={<UserStatusBadge status={user.status} />} />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-2">
          Password
        </h2>
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-zinc-700/70">
          <div>
            <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">Reset Password</p>
            <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5">
              Sends a password reset link to {user.email}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setResetSent(true)}
            disabled={resetSent}
            className="flex-shrink-0 text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resetSent ? "Email sent" : "Send Reset Email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity event icons ─────────────────────────────────────────────────────
// Each icon is a self-contained colored badge (see MockActivity.icon) so
// ActivityTimeline itself stays a plain, reusable dot-or-icon renderer.

type ActivityKind =
  | "login" | "joined" | "assigned" | "removed" | "passwordReset"
  | "invited" | "disabled" | "enabled" | "roleChanged";

function ActivityIconBadge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>
      {children}
    </span>
  );
}

const ACTIVITY_ICON: Record<ActivityKind, ReactNode> = {
  login: (
    <ActivityIconBadge className="bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  joined: (
    <ActivityIconBadge className="bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  assigned: (
    <ActivityIconBadge className="bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  removed: (
    <ActivityIconBadge className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM9 13h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  passwordReset: (
    <ActivityIconBadge className="bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="8" cy="15" r="4" />
        <path d="M10.5 12.5L20 3M17 6l3 3M14 9l2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  invited: (
    <ActivityIconBadge className="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  disabled: (
    <ActivityIconBadge className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M6 6l12 12" strokeLinecap="round" />
      </svg>
    </ActivityIconBadge>
  ),
  enabled: (
    <ActivityIconBadge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
  roleChanged: (
    <ActivityIconBadge className="bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400">
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </ActivityIconBadge>
  ),
};

function ActivityTabContent({ user }: { user: User }) {
  const primaryProject = user.projectSlugs[0] ? getProjectBySlug(user.projectSlugs[0]) : undefined;

  const events: MockActivity[] = user.status === "Invited"
    ? [{
        label: `Invitation email sent to ${user.email}`,
        timeAgo: user.joinedAt.replace(/^Invited /, ""),
        icon: ACTIVITY_ICON.invited,
      }]
    : [
        ...(user.status === "Disabled"
          ? [{ label: "User disabled", timeAgo: "Recently", icon: ACTIVITY_ICON.disabled }]
          : []),
        { label: "Logged in", timeAgo: user.lastLogin ?? "—", icon: ACTIVITY_ICON.login },
        ...(primaryProject
          ? [{ label: `Assigned to ${primaryProject.name}`, timeAgo: user.joinedAt, icon: ACTIVITY_ICON.assigned }]
          : []),
        { label: `Joined the workspace as ${ROLE_LABELS[user.role]}`, timeAgo: user.joinedAt, icon: ACTIVITY_ICON.joined },
      ];

  return events.length === 0 ? (
    <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No recent activity.</p>
  ) : (
    <ActivityTimeline events={events} ringClass="ring-white dark:ring-zinc-950" />
  );
}
