"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AvailabilityStatus, TeamMember } from "@/lib/mock-team";
import { TEAM_MEMBER_REMOVED_EVENT, TEAM_PROJECT_LEAD_CHANGED_EVENT } from "@/lib/mock-team";
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
import { loadProjectTickets, loadOrganizationTickets, loadUserActivity } from "@/lib/tickets";
import type { UserActivityEvent } from "@/lib/tickets";
import { generatePasswordResetLink } from "@/lib/users";
import {
  hasProjectMemberHistory,
  removeProjectMember,
  setProjectLead,
  loadProjectTeam,
  loadOrganizationMemberWeeklyCapacities,
} from "@/lib/projects";
import { useCurrentUser } from "@/components/current-user-provider";
import { ResetPasswordLinkModal } from "@/components/reset-password-link-modal";

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

// weeklyCapacity/assignedHours normally already arrive as real, defaulted
// numbers (loadProjectTeam/loadProjectTickets both fall back to 0 for a
// null/missing value) — this is the last line of defense against a 0,
// negative, or otherwise non-finite value reaching a division, not a
// replacement for that upstream defaulting.
function normalizeHours(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function utilizationOf(member: TeamMember): number {
  const weeklyCapacity = normalizeHours(member.weeklyCapacity);
  const assignedHours = normalizeHours(member.assignedHours);
  // 0 weekly capacity has nothing to divide by — 0% utilized, never NaN
  // (0/0) or Infinity (positive/0).
  if (weeklyCapacity <= 0) return 0;
  return Math.round((assignedHours / weeklyCapacity) * 100);
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
  // Text elsewhere is free to show over-100% (over-allocation is real and
  // meaningful) — only the bar's own width is clamped, same existing
  // convention as before, just also guarded against a NaN/negative pct
  // ever reaching the rendered style.
  const safePct = Number.isFinite(pct) ? Math.min(Math.max(pct, 0), 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full ${capacityBarColor(safePct)}`} style={{ width: `${safePct}%` }} />
    </div>
  );
}

export function remainingAvailabilityLabel(member: TeamMember): string {
  const weeklyCapacity = normalizeHours(member.weeklyCapacity);
  const assignedHours = normalizeHours(member.assignedHours);
  const remaining = weeklyCapacity - assignedHours;
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
  realProfileId,
  user,
  initialTab = "profile",
  onClose,
}: {
  member?: TeamMember;
  /** Real project slug when the caller has one (a project-scoped context —
   *  Team, Project Overview, a ticket's own project, etc.). Omitted for an
   *  org-wide context (Recent Activity, Team Workload, Reports) — metrics
   *  then aggregate across every project this viewer can access, same
   *  "All Projects" convention the Dashboards already use. */
  slug?: string;
  /** The real profiles.id this member was opened with (see MemberIdentity's
   *  own doc in mock-team.ts) — the single, authoritative key this modal
   *  uses to fetch its own real data below. Every real "click a person"
   *  trigger app-wide now supplies this; only truly mock-only contexts
   *  (the still-mock Project Lead Reports/Time Tracking screens) omit it,
   *  in which case this modal falls back to resolveTeamMember's existing
   *  mock-driven numbers exactly as before, never a crash. */
  realProfileId?: string;
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
  const { organization, isDevFallback } = useCurrentUser();

  // The single real-data fetch every "click a person" trigger app-wide now
  // funnels through — driven purely by (realProfileId, slug), never by
  // name/avatar matching or a per-caller pre-computed number. Project-scoped
  // (slug set) reads that one project's own tickets/team; org-wide (no
  // slug) aggregates across every project this viewer can access — the
  // exact same real loaders (loadProjectTickets/loadProjectTeam,
  // loadOrganizationTickets/loadOrganizationMemberWeeklyCapacities) every
  // other real screen in this app already uses for the same numbers, so
  // Team Workload/Reports/Team/Project Overview/Recent Activity/etc. can
  // never disagree about what "this member's real workload" means.
  const [realMemberData, setRealMemberData] = useState<{ activeTickets: Ticket[]; weeklyCapacity: number } | null>(
    null
  );

  useEffect(() => {
    // Reset the instant a different member's card opens (or this one closes)
    // so stale numbers from the previous member never flash for the new one
    // while the real fetch below is in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clears stale data the moment the identity changes, before the async fetch below resolves
    setRealMemberData(null);
    if (!realProfileId || isDevFallback || !organization) return;
    let cancelled = false;

    (async () => {
      if (slug) {
        const [ticketsResult, teamResult] = await Promise.all([
          loadProjectTickets(organization.id, slug),
          loadProjectTeam(organization.id, slug),
        ]);
        if (cancelled || ticketsResult.status !== "ready") return;
        const activeTickets = ticketsResult.tickets.filter(
          (t) => t.assigneeProfileId === realProfileId && t.status !== "done"
        );
        const weeklyCapacity =
          teamResult.status === "ready"
            ? teamResult.members.find((m) => m.id === realProfileId)?.weeklyCapacity ?? 0
            : 0;
        setRealMemberData({ activeTickets, weeklyCapacity });
      } else {
        const [ticketsResult, capacitiesResult] = await Promise.all([
          loadOrganizationTickets(organization.id),
          loadOrganizationMemberWeeklyCapacities(organization.id),
        ]);
        if (cancelled || ticketsResult.status !== "ready") return;
        const activeTickets = ticketsResult.tickets.filter(
          (t) => t.assigneeProfileId === realProfileId && t.status !== "done"
        );
        const weeklyCapacity =
          capacitiesResult.status === "ready"
            ? capacitiesResult.capacities.find((c) => c.profileId === realProfileId)?.weeklyCapacity ?? 0
            : 0;
        setRealMemberData({ activeTickets, weeklyCapacity });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [realProfileId, slug, isDevFallback, organization]);

  // Active = not the one final/closed status ("done") — the same real
  // definition already used for "open"/"active" tickets everywhere else in
  // the app (e.g. Team's own assignedHours, project-overview.tsx's
  // openTickets), applied here via the real assigneeProfileId match above,
  // never a name-string guess. Falls back to resolveTeamMember's existing
  // mock-driven data only when this member truly has no real profileId
  // (see its own doc above) — never a crash, never a mismatched number.
  const memberTickets = member
    ? realMemberData
      ? realMemberData.activeTickets
      : member.activeTicketIds.map((id) => getTicketById(id)).filter((t): t is Ticket => t !== undefined)
    : [];

  // weeklyCapacity/assignedHours stay whatever resolveTeamMember resolved
  // (the mock roster's value, or its 0h/40h stub) only when no real fetch
  // above ever ran — real data is always authoritative once it exists,
  // never silently overwritten back to a stub 0.
  const effectiveMember = member && {
    ...member,
    weeklyCapacity: realMemberData ? realMemberData.weeklyCapacity : member.weeklyCapacity,
    assignedHours: realMemberData
      ? memberTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0)
      : member.assignedHours,
  };

  const pct = effectiveMember ? utilizationOf(effectiveMember) : 0;

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
            {!isUserMode && <MemberMenu member={member!} slug={slug!} onClose={handleClose} />}
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
                    <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{effectiveMember!.weeklyCapacity}h</p>
                  </div>
                  <div className="flex-1 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Assigned Hours</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 mt-0.5 leading-none">{effectiveMember!.assignedHours}h</p>
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
                    {remainingAvailabilityLabel(effectiveMember!)}
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

      {selectedTicket && (
        <TicketPreviewPanel
          ticket={selectedTicket}
          // The ticket's own real project — always correct (identical to
          // the outer `slug` in the existing single-project mode), and
          // required when realActiveTickets spans more than one project
          // (Team Workload), where there's no single outer `slug` at all.
          slug={selectedTicket.projectSlug}
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

// "Send Message" was removed outright — no internal messaging system
// exists in JIRITA, so it never did anything and isn't replaced by
// anything. "View Work History" (renamed from "View Ticket History") now
// closes this modal and navigates to its own dedicated, paginated page
// (/projects/[slug]/team/[userId]/work-history — see work-history-screen.tsx)
// instead of opening a second modal, so a history that grows into the
// hundreds/thousands of tickets is never loaded whole into a small dialog.
// That route requires a real project slug — for a member opened without one
// (the Admin Dashboard's Team Workload widget under "All Projects" scope,
// where no single project applies), "View Work History" is omitted from
// `items` below rather than built into an invalid `/projects//team/...`
// path; no global/cross-project equivalent page exists yet to fall back to.
// "Remove from Project" is real (removeProjectMember) and only ever offered
// when hasProjectMemberHistory confirms this member has no real
// participation in the project yet — never rendered disabled, simply
// omitted from `items` otherwise. That check (and both actions) only
// resolve correctly when `member.id` is a real profiles.id, which is only
// ever true when this modal was opened from Team (see mock-team.ts's
// resolveTeamMember — every other trigger across the app still passes a
// mock/synthesized id, for which the history check safely defaults to
// "has history" and Remove from Project never appears, matching this
// menu's previous — dead — behavior for those contexts; View Work History
// would simply navigate to an empty page for those, same as opening it for
// anyone with no real history today). The real guarantee against deleting
// a member with history is the database trigger (20260809000000), not this
// hidden/shown decision — a stale "no history" read (a contribution
// landing between the check and the click) simply fails the delete
// silently here, same as this menu's other items have never surfaced
// errors before.
function MemberMenu({
  member,
  slug,
  onClose,
}: {
  member: TeamMember;
  slug: string;
  onClose: () => void;
}) {
  const { user, organization, isDevFallback } = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [canRemove, setCanRemove] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    hasProjectMemberHistory(organization.id, slug, member.id).then((hasHistory) => {
      if (!cancelled) setCanRemove(!hasHistory);
    });
    return () => {
      cancelled = true;
    };
  }, [organization, isDevFallback, slug, member.id]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  async function handleRemove() {
    setOpen(false);
    if (isDevFallback || !organization) return;
    const result = await removeProjectMember(organization.id, slug, member.id);
    if (result.status !== "success") return; // leave the member/modal exactly as-is on failure — no separate error UI added here, per this action's existing (unchanged) behavior
    // Only fired once the server has actually confirmed the delete — never
    // before, so Team's own listener (team-screen.tsx) is reacting to a
    // real, already-committed removal, not an optimistic guess.
    window.dispatchEvent(
      new CustomEvent(TEAM_MEMBER_REMOVED_EVENT, { detail: { slug, profileId: member.id } })
    );
    onClose();
  }

  function handleViewWorkHistory() {
    setOpen(false);
    onClose();
    router.push(`/projects/${slug}/team/${member.id}/work-history`);
  }

  // Only an Admin viewer can promote a Project Lead, and only onto a member
  // whose real org-wide role is itself Admin or Project Lead (member.role
  // is that real org role label — see loadProjectTeam's own title field —
  // never Member). member.projectRole is only ever set by the real Team
  // roster (loadProjectTeam); every other TeamMember source in this app
  // (mock rosters, resolveTeamMember's stubs) leaves it undefined, which
  // also keeps this off outside a real Team context, same as canRemove
  // above already relies on a real profiles.id. Same "wait for the server
  // to confirm before touching anything" shape as handleRemove — no
  // optimistic update here means no rollback is ever needed on failure.
  async function handleMakeLead() {
    setOpen(false);
    if (isDevFallback || !organization) return;
    const result = await setProjectLead(organization.id, slug, member.id);
    if (result.status !== "success") return;
    window.dispatchEvent(
      new CustomEvent(TEAM_PROJECT_LEAD_CHANGED_EVENT, { detail: { slug, profileId: member.id } })
    );
    onClose();
  }

  const canMakeLead =
    user.role === "ADMIN" &&
    member.projectRole !== undefined &&
    member.projectRole !== "lead" &&
    (member.role === "Admin" || member.role === "Project Lead");

  const items: { label: string; danger?: boolean; onClick: () => void }[] = [
    // Requires a real project slug to build a valid route — omitted
    // outright (not shown disabled) when there isn't one, same "simply
    // omitted" convention Remove from Project already uses below.
    ...(slug ? [{ label: "View Work History", onClick: handleViewWorkHistory }] : []),
    ...(canMakeLead ? [{ label: "Make Project Lead", onClick: handleMakeLead }] : []),
    ...(canRemove ? [{ label: "Remove from Project", danger: true, onClick: handleRemove }] : []),
  ];

  // No valid action at all (e.g. Team Workload under "All Projects," where
  // View Work History is the only action this context could ever offer) —
  // the "⋯" trigger itself is omitted rather than opening onto an empty
  // popover.
  if (items.length === 0) return null;

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
              onClick={item.onClick}
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

// Same feedback surface as invite-user-modal.tsx's CopyFeedback (used there
// for the exact same "link copied" purpose) — duplicated locally rather
// than imported for the same reason ResetPasswordLinkModal was pulled into
// its own file instead of importing users-screen.tsx's Toast: this modal
// is mounted from many unrelated places app-wide (see this file's own
// header comment) and must stay self-contained, not coupled to one
// screen's own toast state.
function CopyLinkFeedback({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3200);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 bg-slate-900 dark:bg-zinc-800 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-lg shadow-black/20">
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Password reset link copied to clipboard.
    </div>
  );
}

// "Generate Reset Link" reuses the exact same Server Action, client
// wrapper, and success modal as the Users row menu's "Reset Password"
// action (generatePasswordResetLink / ResetPasswordLinkModal — see
// src/lib/server/invite-user-action.ts's generatePasswordResetLinkAction).
// Nothing here generates a link or talks to Supabase Auth directly; this
// is only the same call wired to a second entry point, same as
// users-screen.tsx's own onClick.
function SecurityTabContent({ user }: { user: User }) {
  const { organization, isDevFallback } = useCurrentUser();
  const [generating, setGenerating] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  async function handleGenerateResetLink() {
    if (isDevFallback || !organization || generating) return;
    setResetError(null);
    setGenerating(true);
    const result = await generatePasswordResetLink(organization.id, user.id);
    setGenerating(false);

    if (result.status === "error") {
      setResetError(result.message);
      return;
    }
    setResetLink(result.resetLink);
  }

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
        {resetError && (
          <p role="alert" className="text-[12px] text-red-600 dark:text-red-400 mb-2">
            {resetError}
          </p>
        )}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-zinc-700/70">
          <div>
            <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">Reset Password</p>
            <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5">
              Generates a password reset link for {user.email}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateResetLink}
            disabled={generating}
            className="flex-shrink-0 text-[13px] font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? "Generating…" : "Generate Reset Link"}
          </button>
        </div>
      </div>

      {resetLink && (
        <ResetPasswordLinkModal
          link={resetLink}
          onCopy={() => setLinkCopied(true)}
          onClose={() => setResetLink(null)}
        />
      )}
      {linkCopied && <CopyLinkFeedback onDismiss={() => setLinkCopied(false)} />}
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

// Real activity for this user, sourced from ticket_activity via
// loadUserActivity (tickets.ts) — never inferred from the account's current
// status/dates the way the old mock events here were ("Logged in",
// "Assigned to <project>", "Invitation email sent", "User disabled"), which
// is exactly why those were removed instead of kept alongside real data.
// "Joined the workspace" is the one account-level event kept, since it's
// backed by a real organization_memberships.created_at, shown separately
// from the empty-state check below so it's never confused with actual
// ticket activity.
function ActivityTabContent({ user }: { user: User }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ticketEvents, setTicketEvents] = useState<UserActivityEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clears the previous member's activity the moment a different profile opens, before the async fetch below resolves
    setStatus("loading");
    setTicketEvents([]);
    setErrorMessage(null);
    loadUserActivity(user.id).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }
      setTicketEvents(result.events);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (status === "loading") {
    return <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Loading activity…</p>;
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-[12.5px] text-red-700 dark:text-red-400"
      >
        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
        </svg>
        <span>{errorMessage ?? "Couldn't load activity."}</span>
      </div>
    );
  }

  const realEvents: MockActivity[] = ticketEvents.map((ev) => ({
    label: (
      <>
        {ev.labelPrefix}
        {ev.ticketKey && ev.projectSlug ? (
          <Link
            href={`/projects/${ev.projectSlug}/tickets/${ev.ticketKey}`}
            className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            {ev.ticketKey}
          </Link>
        ) : (
          ev.ticketKey
        )}
        {ev.labelSuffix}
      </>
    ),
    timeAgo: ev.timeAgo,
  }));

  const joinedEvent: MockActivity = {
    label: `Joined the workspace as ${ROLE_LABELS[user.role]}`,
    timeAgo: user.joinedAt.replace(/^Invited /, ""),
    icon: ACTIVITY_ICON.joined,
  };

  return (
    <>
      {realEvents.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No activity recorded yet.</p>
      )}
      <ActivityTimeline events={[...realEvents, joinedEvent]} ringClass="ring-white dark:ring-zinc-950" />
    </>
  );
}
