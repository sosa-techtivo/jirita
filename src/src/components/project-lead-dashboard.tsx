"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import type { TeamMember } from "@/lib/mock-team";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import { TicketTypeIcon, parseDisplayDate, getTodayISO, formatISODate, PRIORITY_VALUES, ErrorToast } from "@/components/tickets/ticket-ui";
import {
  Card,
  ActiveTicketRow,
  RecentActivityList,
  MY_ACTIVE,
  av,
  HERO_CARD_CLASS,
  HERO_LABEL_CLASS,
  HERO_ACCENT_TEXT_CLASS,
  HERO_BORDER_CLASS,
  SkeletonBlock,
} from "@/components/dashboard-shared";
import type { DashboardActivityEntry } from "@/components/dashboard-shared";
import {
  utilizationOf,
  capacityTextColor,
  capacityBarColor,
  remainingAvailabilityLabel,
} from "@/components/member-profile-modal";
import { useMemberProfile } from "@/components/member-profile";
import { loadLeadProjects, loadProjectTeam, loadOrganizationMembers, addProjectMember } from "@/lib/projects";
import type { LeadProject, ProjectTeamMember, OrgMember } from "@/lib/projects";
import { loadProjectTickets, loadOrganizationLoggedMinutes, loadOrganizationLoggedTimeForRange, loadOrganizationActivity } from "@/lib/tickets";
import type { OrganizationActivityEvent, OrganizationTimeEntry } from "@/lib/tickets";
import { AddTeamMemberModal } from "@/components/add-team-member-modal";
import { NewNoteModal } from "@/components/notes-screen";
import { createNote } from "@/lib/notes";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";

// ── Data ──────────────────────────────────────────────────────────────────────
// Current Project / Current Delivery / Attention Required / Team Capacity /
// My Active Work / Recent Activity / Upcoming Deadlines are all real (see
// the data-loading effects inside ProjectLeadDashboard below —
// loadLeadProjects, loadProjectTickets, loadProjectTeam,
// loadOrganizationLoggedMinutes, loadOrganizationActivity, all
// already-existing loaders reused as-is). My Active Work / Recent Activity /
// Upcoming Deadlines / Team Capacity are all scoped to the whole selected
// project (every member/ticket, regardless of assignee), not just the
// signed-in Project Lead's own work. PROJECT_TICKETS / MY_ACTIVE mock data
// are no longer read by this component itself, but stay defined/exported
// as-is because projects-list-screen.tsx and project-lead-reports-screen.tsx
// still import them directly.

// Projects this Project Lead manages, per the still-mock Reports screen —
// kept exactly as-is (unused by this component's own Current Project
// selector anymore, which reads real data instead) because
// projects-list-screen.tsx and project-lead-reports-screen.tsx still import
// this exact constant and must keep working unchanged.
export const LEAD_PROJECT_SLUGS = ["mobile-banking-app", "client-website-redesign", "internal-platform-migration"];

// My Active Work's real status set (To Do / In Progress / Blocked / In
// Review) — deliberately narrower than the "active = status !== done" used
// by Current Delivery/Attention Required/Upcoming Deadlines elsewhere in
// this component: backlog tickets are excluded here on purpose, per spec.
const ACTIVE_WORK_STATUSES: Ticket["status"][] = ["to-do", "in-progress", "blocked", "review"];

// "All time" lower bound for loadOrganizationLoggedTimeForRange, so its
// per-ticket entries cover the same unbounded history
// loadOrganizationLoggedMinutes already sums for the Remaining Hours KPI's
// own displayed total — same convention dashboard-screen.tsx's own
// ALL_TIME_FROM_DATE already established, not a new one.
const ALL_TIME_FROM_DATE = "2000-01-01";

// Per-project ticket pools that feed the still-mock Upcoming Deadlines
// section only (Attention Required's own "Awaiting Review" is real — see
// the component body).
export const PROJECT_TICKETS: Record<string, Ticket[]> = {
  "mobile-banking-app": MY_ACTIVE,
  "client-website-redesign": [
    {
      id: "cwd-homepage-review", projectSlug: "client-website-redesign", ticketNumber: 1,
      title: "Homepage redesign review",
      description: "Review the updated homepage layout against brand guidelines before handoff.",
      status: "review", priority: "high", type: "TASK",
      assignee: { name: "Elena Rossi", avatar: av(5) },
      milestone: "Homepage Redesign", labels: ["Design"],
      hours: 6, dueDate: "Jul 10", updatedAt: "Updated 1 day ago",
    },
    {
      id: "cwd-cms-audit", projectSlug: "client-website-redesign", ticketNumber: 2,
      title: "CMS migration content audit",
      description: "Audit legacy CMS content before migrating to the new platform.",
      status: "to-do", priority: "medium", type: "TASK",
      assignee: { name: "Elena Rossi", avatar: av(5) },
      milestone: "CMS Migration", labels: ["Content"],
      hours: 8, dueDate: "Jul 18", updatedAt: "Updated 3 days ago",
    },
  ],
  "internal-platform-migration": [
    {
      id: "ipm-db-export-lead", projectSlug: "internal-platform-migration", ticketNumber: 1,
      title: "Legacy database export",
      description: "Export the legacy monolith database ahead of platform cutover.",
      status: "in-progress", priority: "high", type: "TASK",
      assignee: { name: "Jordan Wu", avatar: av(15) },
      milestone: "Platform Cutover", labels: ["Migration"],
      hours: 16, dueDate: "Jul 5", updatedAt: "Updated 4h ago",
    },
    {
      id: "ipm-cutover-plan-lead", projectSlug: "internal-platform-migration", ticketNumber: 2,
      title: "Migration cutover plan",
      description: "Finalize the staged cutover plan and rollback runbook.",
      status: "review", priority: "high", type: "TASK",
      assignee: { name: "Marcus Lee", avatar: av(12) },
      milestone: "Platform Cutover", labels: ["Planning"],
      hours: 8, dueDate: "Jul 1", updatedAt: "Updated 1 day ago",
    },
    {
      id: "ipm-read-replicas-lead", projectSlug: "internal-platform-migration", ticketNumber: 3,
      title: "Provision new read replicas",
      description: "Provision read replicas for the new platform's database layer.",
      status: "to-do", priority: "medium", type: "TASK",
      assignee: { name: "Jordan Wu", avatar: av(15) },
      milestone: "Platform Cutover", labels: ["Infrastructure"],
      hours: 10, dueDate: "Jul 8", updatedAt: "Updated 2 days ago",
    },
  ],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function HeroStat({ label, value, danger }: { label: string; value: ReactNode; danger?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums leading-none ${danger ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-zinc-50"}`}>
        {value}
      </p>
    </div>
  );
}

type AttentionTone = "critical" | "warning";

function AttentionCard({
  tone,
  icon,
  count,
  label,
  detail,
  href,
  onClick,
  disabled,
}: {
  tone:    AttentionTone;
  icon:    ReactNode;
  count:   ReactNode;
  label:   ReactNode;
  detail:  ReactNode;
  href:    string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const toneStyles: Record<AttentionTone, string> = {
    critical: "border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10",
    warning:  "border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10",
  };
  const iconTone: Record<AttentionTone, string> = {
    critical: "text-red-500 dark:text-red-400",
    warning:  "text-amber-500 dark:text-amber-400",
  };

  const className = `group h-full flex flex-col rounded-xl border p-4 shadow-sm shadow-slate-200/40 dark:shadow-black/20 transition-colors hover:border-brand-300 dark:hover:border-brand-700 ${toneStyles[tone]}`;

  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className={iconTone[tone]}>{icon}</span>
        <svg className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-700 group-hover:text-brand-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" d="M9 18l6-6-6-6" />
        </svg>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 leading-none">{count}</p>
      <p className="text-[13px] font-medium text-slate-700 dark:text-zinc-300 mt-1.5">{label}</p>
      <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">{detail}</p>
    </>
  );

  // Same visual card in every case — same className/content throughout.
  // `disabled` renders a plain, non-interactive <div> (no navigation, no
  // click handler) for an empty state that must not be clickable. A plain
  // `onClick` (used to open the Ticket Preview panel directly instead of
  // navigating) renders a <button> instead of a <Link>. Every existing
  // caller (no onClick, no disabled) keeps rendering the exact same <Link>
  // as before.
  if (disabled) {
    return <div className={className}>{content}</div>;
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left w-full`}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function TeamCapacityRow({ member, onOpen }: { member: TeamMember; onOpen: (m: TeamMember) => void }) {
  const pct    = utilizationOf(member);
  const isOver = member.assignedHours > member.weeklyCapacity;

  return (
    <button
      type="button"
      onClick={() => onOpen(member)}
      className={`w-full flex items-center gap-3 py-2.5 px-2.5 -mx-2.5 rounded-lg text-left transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50 ${isOver ? "bg-red-50/60 dark:bg-red-950/10" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="w-28 flex-shrink-0 min-w-0">
        <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">{member.name}</p>
        <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{member.role}</p>
      </div>
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${capacityBarColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="w-28 flex-shrink-0 text-right">
        <p className={`text-[12px] font-semibold tabular-nums ${capacityTextColor(pct)}`}>
          {remainingAvailabilityLabel(member)}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums">
          {member.assignedHours}h / {member.weeklyCapacity}h · {pct}%
        </p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectLeadDashboard() {
  const { user, userId, organization, isDevFallback } = useCurrentUser();
  const { openMemberProfile } = useMemberProfile();
  const [preview, setPreview] = useState<Ticket | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Current Project: real projects this profile leads (projects.owner_profile_id) ──
  const [projectsLoadState, setProjectsLoadState] = useState<"loading" | "ready" | "error">(
    isDevFallback ? "ready" : "loading"
  );
  const [projectsErrorMessage, setProjectsErrorMessage] = useState<string | null>(null);
  const [leadProjects, setLeadProjects] = useState<LeadProject[]>([]);

  useEffect(() => {
    if (isDevFallback || !organization || !userId) return;
    let cancelled = false;

    loadLeadProjects(organization.id, userId).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setProjectsLoadState("error");
        setProjectsErrorMessage(result.message);
        return;
      }
      setLeadProjects(result.projects);
      setProjectsLoadState("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, userId]);

  // ── Project scope selector — only shown when this Project Lead leads more
  // than one active project (see the header JSX below); with 0 or 1 led
  // projects there's nothing to pick, so the Dashboard just auto-scopes to
  // that single project the same way it always has. `?project=<slug>` is the
  // single source of truth (same real-URL-state precedent as the Admin
  // Dashboard's own scope selector), so refresh/back/forward all just work.
  // A requested slug that isn't one of this lead's own active projects
  // (stale link, no-longer-led project, another org) — or any leftover
  // `?project=` once only one project remains — falls back to the first led
  // project rather than trusted as-is.
  const requestedProjectSlug = searchParams.get("project");
  const activeSlug = useMemo(() => {
    if (leadProjects.length === 0) return "";
    if (leadProjects.length === 1) return leadProjects[0].slug;
    if (requestedProjectSlug && leadProjects.some((p) => p.slug === requestedProjectSlug)) return requestedProjectSlug;
    return leadProjects[0].slug;
  }, [leadProjects, requestedProjectSlug]);

  // Keeps the URL itself honest with the resolved selection above — clears
  // `?project=` once it's down to a single led project, and corrects a
  // stale/inaccessible slug back to the real fallback — via `router.replace`
  // (a correction, not a user-driven navigation, so it doesn't add a
  // spurious back-button entry the way an actual selector change does below).
  useEffect(() => {
    if (projectsLoadState !== "ready" || !requestedProjectSlug) return;
    const isValidMultiProjectSelection =
      leadProjects.length > 1 && leadProjects.some((p) => p.slug === requestedProjectSlug);
    if (isValidMultiProjectSelection) return;

    const params = new URLSearchParams(searchParams.toString());
    if (leadProjects.length > 1) params.set("project", activeSlug);
    else params.delete("project");
    const qs = params.toString();
    router.replace(`/dashboard${qs ? `?${qs}` : ""}`);
  }, [projectsLoadState, leadProjects, requestedProjectSlug, activeSlug, router, searchParams]);

  function handleScopeChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", slug);
    router.push(`/dashboard?${params.toString()}`);
  }

  // ── Current Delivery + Attention Required: real data for the selected project ──
  const [deliveryLoadState, setDeliveryLoadState] = useState<"loading" | "ready" | "error">(
    isDevFallback ? "ready" : "loading"
  );
  const [deliveryErrorMessage, setDeliveryErrorMessage] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [team, setTeam] = useState<ProjectTeamMember[]>([]);
  const [activeLoggedMinutes, setActiveLoggedMinutes] = useState(0);
  const [activeTimeEntries, setActiveTimeEntries] = useState<OrganizationTimeEntry[]>([]);
  const [activityEvents, setActivityEvents] = useState<OrganizationActivityEvent[]>([]);
  const [requestId, setRequestId] = useState(0);
  const runFetch = () => setRequestId((id) => id + 1);

  useEffect(() => {
    if (isDevFallback || !organization || !activeSlug) return;
    let cancelled = false;
    // Back to "loading" on every project switch too, not just the first
    // mount — the full-screen skeleton state below already exists and
    // already gates every section on `deliveryLoadState`, so reusing it
    // here is what keeps the previous project's tickets/team/hours/activity
    // from ever staying on screen while the new project's real data is
    // still in flight.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern used elsewhere in this app (e.g. member-profile-modal.tsx)
    setDeliveryLoadState("loading");

    (async () => {
      const ticketsResult = await loadProjectTickets(organization.id, activeSlug);
      if (cancelled) return;
      if (ticketsResult.status === "error") {
        setDeliveryLoadState("error");
        setDeliveryErrorMessage(ticketsResult.message);
        return;
      }
      const projectTicketsReal = ticketsResult.status === "ready" ? ticketsResult.tickets : [];
      const activeTicketIds = projectTicketsReal.filter((t) => t.status !== "done").map((t) => t.id);
      const allTicketIds = projectTicketsReal.map((t) => t.id);
      const todayISOForLoad = getTodayISO();

      const [teamResult, minutesResult, activeTimeEntriesResult, activityResult] = await Promise.all([
        loadProjectTeam(organization.id, activeSlug),
        loadOrganizationLoggedMinutes(activeTicketIds),
        // Per-ticket breakdown of the exact same historical, unbounded
        // window loadOrganizationLoggedMinutes already aggregates above —
        // needed to determine which individual tickets actually contribute
        // to the Remaining Hours KPI (see handleRemainingHoursClick below),
        // never a second definition of "logged minutes".
        loadOrganizationLoggedTimeForRange(activeTicketIds, ALL_TIME_FROM_DATE, todayISOForLoad),
        loadOrganizationActivity(allTicketIds),
      ]);
      if (cancelled) return;

      if (teamResult.status === "error") {
        setDeliveryLoadState("error");
        setDeliveryErrorMessage(teamResult.message);
        return;
      }
      if (minutesResult.status === "error") {
        setDeliveryLoadState("error");
        setDeliveryErrorMessage(minutesResult.message);
        return;
      }
      if (activeTimeEntriesResult.status === "error") {
        setDeliveryLoadState("error");
        setDeliveryErrorMessage(activeTimeEntriesResult.message);
        return;
      }
      if (activityResult.status === "error") {
        setDeliveryLoadState("error");
        setDeliveryErrorMessage(activityResult.message);
        return;
      }

      setTickets(projectTicketsReal);
      setTeam(teamResult.members);
      setActiveLoggedMinutes(minutesResult.totalMinutes);
      setActiveTimeEntries(activeTimeEntriesResult.entries);
      setActivityEvents(activityResult.events);
      setDeliveryLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, activeSlug, requestId]);

  // ── Quick Actions: Add Member / New Note / New Ticket, each opening the
  // exact same modal already used elsewhere in the app (Team's
  // AddTeamMemberModal, Notes' NewNoteModal, Tickets' NewTicketModal) —
  // never a second implementation of any of these flows. `orgMembers` is
  // the same real-org-roster query Team's own Add Member and the Tickets
  // board's own New Ticket already call. ──
  const [showAddMember, setShowAddMember] = useState(false);
  const [showNewNote, setShowNewNote] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [noteErrorMessage, setNoteErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    loadOrganizationMembers(organization.id).then((result) => {
      if (cancelled) return;
      if (result.status === "ready") setOrgMembers(result.members);
    });
    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization]);

  const addMemberCandidates = useMemo(
    () => orgMembers.filter((om) => !team.some((m) => m.id === om.id)),
    [orgMembers, team]
  );

  async function handleAddMember(profileId: string): Promise<{ success: boolean; message?: string }> {
    if (isDevFallback || !organization || !activeSlug) return { success: false, message: "Not available in this mode." };
    const result = await addProjectMember(organization.id, activeSlug, profileId);
    if (result.status === "error") return { success: false, message: result.message };
    runFetch();
    return { success: true };
  }

  async function handleCreateNote(input: { title: string; body: string; tag?: string }): Promise<boolean> {
    if (!organization || !activeSlug) return false;
    const result = await createNote(organization.id, activeSlug, { title: input.title, body: input.body });
    if (result.status === "error") {
      setNoteErrorMessage(result.message);
      return false;
    }
    setShowNewNote(false);
    return true;
  }

  function handleTicketCreated(ticket: Ticket) {
    setTickets((prev) => [ticket, ...prev]);
    setShowNewTicket(false);
    setPreview(ticket);
  }

  function handleTicketPreviewDuplicate(ticket: Ticket) {
    setShowNewTicket(false);
    setPreview(ticket);
  }

  const todayISO = getTodayISO();

  const activeProject = leadProjects.find((p) => p.slug === activeSlug);
  const contextTitle = activeProject?.name ?? "Project";

  const totalTickets = tickets.length;
  const completedTicketsList = tickets.filter((t) => t.status === "done");
  const completedTickets = completedTicketsList.length;
  const deliveryPct = totalTickets === 0 ? 0 : Math.round((completedTickets / totalTickets) * 100);

  const activeTickets = useMemo(() => tickets.filter((t) => t.status !== "done"), [tickets]);
  const estimatedActiveHours = useMemo(() => activeTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0), [activeTickets]);
  // Never negative/NaN/Infinity: plain subtraction of two finite numbers,
  // clamped at 0 — same "remaining = estimated - logged, floored at 0"
  // shape as the Admin Dashboard's Hours Burn KPI, just scoped to this
  // project's active tickets only (see the effect above).
  const remainingHours = Math.max(0, Math.round(estimatedActiveHours - activeLoggedMinutes / 60));

  // Per-ticket breakdown for the Remaining Hours KPI's own navigation only —
  // the displayed value/formula above is untouched. A ticket "contributes"
  // when its own remaining (hours minus its own logged minutes, floored at
  // 0) is greater than 0; done tickets are already excluded via
  // `activeTickets` above.
  const minutesByTicketId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of activeTimeEntries) {
      map.set(entry.ticketId, (map.get(entry.ticketId) ?? 0) + entry.minutes);
    }
    return map;
  }, [activeTimeEntries]);

  const remainingHoursTickets = useMemo(() => {
    return activeTickets.filter((t) => {
      const loggedMinutesForTicket = minutesByTicketId.get(t.id) ?? 0;
      const remainingIndividual = Math.max(0, (t.hours ?? 0) - loggedMinutesForTicket / 60);
      return remainingIndividual > 0;
    });
  }, [activeTickets, minutesByTicketId]);

  const blockedTicketsList = tickets.filter((t) => t.status === "blocked");
  const blockedTickets = blockedTicketsList.length;
  const dueTodayList = activeTickets.filter((t) => t.dueDate && parseDisplayDate(t.dueDate) === todayISO);
  const dueToday = dueTodayList.length;

  // Over Capacity — same assignedHours (active tickets only) + utilizationOf
  // calculation already used by Team/the Admin Dashboard, just scoped to
  // this one project's real roster instead of the org-wide one.
  const overCapacityMembers = useMemo(() => {
    return team
      .map((member) => {
        const assignedHours = activeTickets
          .filter((t) => t.assigneeProfileId === member.id)
          .reduce((sum, t) => sum + (t.hours ?? 0), 0);
        const pct = utilizationOf({
          id: member.id,
          projectSlug: activeSlug,
          name: member.name,
          role: member.title,
          email: member.email,
          avatar: member.avatar,
          status: "Available",
          weeklyCapacity: member.weeklyCapacity,
          assignedHours,
          activeTicketIds: [],
        });
        return {
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          role: member.title,
          projectRole: member.projectRole,
          pct,
        };
      })
      .filter((m) => m.pct > 100);
  }, [team, activeTickets, activeSlug]);

  const awaitingReview = useMemo(() => tickets.filter((t) => t.status === "review"), [tickets]);

  // ── Team Capacity: the real project roster (`team`, from loadProjectTeam —
  // already fetched above) combined with real assigned hours, same
  // "activeTickets (status !== done) matched by assigneeProfileId" shape
  // team-screen.tsx itself already uses — never a second query, never a
  // second definition of "assigned hours". Sorted by utilization descending,
  // same order the mock version already used. ──
  const teamCapacity = useMemo<TeamMember[]>(() => {
    return team
      .map((member) => {
        const ownActiveTickets = activeTickets.filter((t) => t.assigneeProfileId === member.id);
        return {
          id: member.id,
          projectSlug: activeSlug,
          name: member.name,
          role: member.title,
          email: member.email,
          avatar: member.avatar,
          status: "Available" as const,
          weeklyCapacity: member.weeklyCapacity,
          assignedHours: ownActiveTickets.reduce((sum, t) => sum + (t.hours ?? 0), 0),
          activeTicketIds: ownActiveTickets.map((t) => t.id),
          projectRole: member.projectRole,
        };
      })
      .sort((a, b) => utilizationOf(b) - utilizationOf(a));
  }, [team, activeTickets, activeSlug]);

  // ── My Active Work: every active ticket in the selected project, not just
  // the signed-in lead's own — "active" here is the explicit To Do/In
  // Progress/Blocked/In Review set (backlog and done are excluded), sorted
  // blocked-first, then by priority urgency, then by due date ascending
  // (undated tickets sort last). ──
  const myActiveWork = useMemo(() => {
    return tickets
      .filter((t) => ACTIVE_WORK_STATUSES.includes(t.status))
      .slice()
      .sort((a, b) => {
        const aBlocked = a.status === "blocked" ? 0 : 1;
        const bBlocked = b.status === "blocked" ? 0 : 1;
        if (aBlocked !== bBlocked) return aBlocked - bBlocked;

        const aPriority = PRIORITY_VALUES.indexOf(a.priority);
        const bPriority = PRIORITY_VALUES.indexOf(b.priority);
        if (aPriority !== bPriority) return aPriority - bPriority;

        if (a.dueDate && b.dueDate) return parseDisplayDate(a.dueDate).localeCompare(parseDisplayDate(b.dueDate));
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
  }, [tickets]);

  // ── Recent Activity: the same real ticket_activity feed the Admin
  // Dashboard already uses (loadOrganizationActivity), just fetched scoped
  // to this project's own ticket ids instead of every org ticket — see the
  // effect above. Ticket lookups resolve against this project's own tickets
  // state (never the mock catalog), and every entry shows this project's
  // real name since every event here already belongs to it. ──
  const ticketsById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const recentActivityEntries = useMemo<DashboardActivityEntry[]>(
    () =>
      activityEvents.map((event) => {
        const ticket = ticketsById.get(event.ticketId);
        const base = {
          id: event.id,
          avatar: event.actorAvatar,
          name: event.actorName ?? "Someone",
          ticket,
          project: contextTitle,
          time: event.time,
        };

        if (event.type === "blocked") return { ...base, type: "blocked" as const, verb: "marked" };
        if (event.type === "completed") return { ...base, type: "completed" as const, verb: "completed" };
        if (event.type === "hours") {
          return {
            ...base,
            type: "hours" as const,
            verb: "updated the estimate on",
            detail: <span className="font-medium">{event.oldHours}h → {event.newHours}h</span>,
          };
        }
        if (event.type === "assigned") {
          return {
            ...base,
            type: "assigned" as const,
            verb: "reassigned",
            detail: <>to <span className="font-medium">{event.newAssigneeName}</span></>,
          };
        }
        return {
          ...base,
          type: "priority" as const,
          verb: event.priorityRaised ? "raised priority on" : "lowered priority on",
          detail: <span className="font-medium">{event.oldPriorityLabel} → {event.newPriorityLabel}</span>,
        };
      }),
    [activityEvents, ticketsById, contextTitle]
  );

  // ── Upcoming Deadlines: every active (non-done) ticket in the selected
  // project with a due date, not just the signed-in lead's own — same
  // "active" definition as Current Delivery/Attention Required above,
  // sorted by due date ascending (overdue tickets included, styled below). ──
  const deadlines = useMemo(
    () =>
      tickets
        .filter((t) => t.status !== "done" && t.dueDate)
        .slice()
        .sort((a, b) => parseDisplayDate(a.dueDate as string).localeCompare(parseDisplayDate(b.dueDate as string))),
    [tickets]
  );

  // ── Target Date: the project's own real `projects.target_date`, already
  // queried and formatted (including its own "—" empty fallback) by
  // loadLeadProjects — never a ticket due date. `?? "—"` only covers
  // `activeProject` itself being momentarily unresolved, same "—" empty
  // state as before.
  const targetDate = activeProject?.targetDate ?? "—";

  const linkSlug = activeSlug || null;
  function projectHref(path: string): string {
    return linkSlug ? `/projects/${linkSlug}/${path}` : "/projects";
  }

  // Completed Tickets KPI (Current Delivery): reuses `completedTicketsList`,
  // the exact same source of truth already driving the KPI's count above —
  // no second query, no duplicated status filter. Zero matches stays
  // non-interactive; exactly one opens it directly in the existing Ticket
  // Preview panel (`preview` state, same as every other single-ticket click
  // on this dashboard); more than one hands off to the Tickets page scoped
  // to this project via the same `?alerts=` query-state convention used
  // elsewhere (e.g. Reports' own Completed card).
  function handleCompletedTicketsClick() {
    if (completedTicketsList.length === 0) return;
    if (completedTicketsList.length === 1) {
      setPreview(completedTicketsList[0]);
      return;
    }
    router.push(`/projects/${activeSlug}/tickets?alerts=done`);
  }

  // Estimated Hours Remaining KPI (Current Delivery): navigation is driven
  // by `remainingHoursTickets` (the per-ticket breakdown above), never by
  // the displayed `remainingHours` aggregate itself — the two can diverge
  // (per-ticket remaining is floored at 0 *before* summing, the displayed
  // total only after), so which tickets actually "contribute" has to be
  // determined individually. Zero contributing tickets stays
  // non-interactive; exactly one opens it directly in the existing Ticket
  // Preview panel (`preview` state, same as every other single-ticket click
  // on this dashboard); more than one hands off to the Tickets page scoped
  // to this project via the same `?alerts=` query-state convention Completed
  // Tickets above already uses — the union of the contributing tickets' own
  // statuses, never Time Tracking.
  function handleRemainingHoursClick() {
    if (remainingHoursTickets.length === 0) return;
    if (remainingHoursTickets.length === 1) {
      setPreview(remainingHoursTickets[0]);
      return;
    }
    const statuses = Array.from(new Set(remainingHoursTickets.map((t) => t.status)));
    router.push(`/projects/${activeSlug}/tickets?alerts=${statuses.join(",")}`);
  }

  // Blocked Tickets KPI (Current Delivery): reuses `blockedTicketsList`, the
  // exact same source of truth already driving the KPI's count above — no
  // second query, no duplicated status filter. Zero matches stays
  // non-interactive; exactly one opens it directly in the existing Ticket
  // Preview panel; more than one hands off to the Tickets page scoped to
  // this project via the same `?alerts=` query-state convention Completed
  // Tickets/Remaining Work already use.
  function handleBlockedTicketsClick() {
    if (blockedTicketsList.length === 0) return;
    if (blockedTicketsList.length === 1) {
      setPreview(blockedTicketsList[0]);
      return;
    }
    router.push(`/projects/${activeSlug}/tickets?alerts=blocked`);
  }

  const loading = projectsLoadState === "loading" || (leadProjects.length > 0 && deliveryLoadState === "loading");
  const loadError = projectsLoadState === "error" ? projectsErrorMessage : deliveryLoadState === "error" ? deliveryErrorMessage : null;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 pb-16">

        {/* ── Header (skeleton) ────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <SkeletonBlock className="h-[22px] w-52 mb-1" />
            <SkeletonBlock className="h-[14px] w-32" />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SkeletonBlock className="h-8 w-28" />
            <SkeletonBlock className="h-8 w-24" />
            <SkeletonBlock className="h-8 w-24" />
          </div>
        </div>

        {/* ── Section 1: Delivery Health (hero, skeleton) ─────────────────── */}
        <section className={`${HERO_CARD_CLASS} p-6 sm:p-7 mb-5`}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <SkeletonBlock className="h-[11px] w-28 mb-2" />
              <SkeletonBlock className="h-6 w-40" />
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <SkeletonBlock className="h-[10px] w-16" />
              <SkeletonBlock className="h-4 w-20" />
            </div>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex-shrink-0">
              <SkeletonBlock className="h-12 w-24 mb-3" />
              <SkeletonBlock className={`w-full sm:w-56 h-2 ${HERO_BORDER_CLASS}`} />
            </div>
            <div className={`flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 lg:pl-6 lg:border-l ${HERO_BORDER_CLASS}`}>
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <SkeletonBlock className="h-[10px] w-24 mb-1" />
                  <SkeletonBlock className="h-5 w-14" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 2: Attention Required (skeleton) ────────────────────── */}
        <SkeletonBlock className="h-[10px] w-32 mb-2" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-zinc-700/70 p-4">
              <div className="flex items-center justify-between mb-2">
                <SkeletonBlock className="h-4 w-4 rounded-full" />
              </div>
              <SkeletonBlock className="h-6 w-10 mb-1.5" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* ── Section 3: Team Capacity (skeleton) ─────────────────────────── */}
        <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
          <SkeletonBlock className="h-[10px] w-28 mb-4" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-0.5">
                <SkeletonBlock className="h-8 w-8 rounded-full flex-shrink-0" />
                <SkeletonBlock className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </section>

        <div className="mt-5 space-y-5">
          {/* ── Section 4: Project Work (skeleton) ────────────────────────── */}
          <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
            <SkeletonBlock className="h-[10px] w-24 mb-4" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} className="h-4 w-full" />
              ))}
            </div>
          </section>

          {/* ── Section 5: Recent Activity (skeleton) ─────────────────────── */}
          <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
            <SkeletonBlock className="h-[10px] w-28 mb-4" />
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonBlock className="h-7 w-7 rounded-full flex-shrink-0" />
                  <SkeletonBlock className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </section>

          {/* ── Section 6: Upcoming Deadlines (skeleton) ──────────────────── */}
          <section className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20">
            <SkeletonBlock className="h-[10px] w-32 mb-4" />
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} className="h-4 w-full" />
              ))}
            </div>
          </section>
        </div>

      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 pb-16">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load dashboard</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (leadProjects.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 pb-16">
        <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-6">
          Good morning, {user.name.split(" ")[0]} 👋
        </h1>
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">No projects assigned</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            You&apos;re not the Project Lead on any active project yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-1">
            Good morning, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-slate-400 dark:text-zinc-500">{formatISODate(todayISO)}</p>
        </div>

        {/* Top actions: project scope selector (only when leading more than
            one active project — see leadProjects.length above) + Quick
            Actions, same placement/component pattern as the Admin
            Dashboard's own scope selector. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {leadProjects.length > 1 && (
            <div className="relative inline-flex items-center">
              <select
                value={activeSlug}
                onChange={(event) => handleScopeChange(event.target.value)}
                aria-label="Current project"
                className="appearance-none text-[13px] font-medium pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {leadProjects.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2 w-3 h-3 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddMember(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M15 20v-1.5a3.5 3.5 0 00-3.5-3.5h-4A3.5 3.5 0 004 18.5V20" />
              <circle cx="9" cy="7.5" r="3" />
              <path strokeLinecap="round" d="M19 20v-1.5a3.5 3.5 0 00-2.5-3.36M14 4.13a3 3 0 010 5.74" />
            </svg>
            Add Member
          </button>
          <button
            type="button"
            onClick={() => setShowNewNote(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6l5 5v11a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2z" />
              <path strokeLinecap="round" d="M9 12h6M9 16h4" />
            </svg>
            New Note
          </button>
          <button
            type="button"
            onClick={() => setShowNewTicket(true)}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm shadow-brand-500/30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            New Ticket
          </button>
        </div>
      </div>

      {/* ── Section 1: Delivery Health (hero) ───────────────────────────────── */}
      <section className={`${HERO_CARD_CLASS} p-6 sm:p-7 mb-5`}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${HERO_LABEL_CLASS}`}>
              Current Delivery
            </p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">{contextTitle}</h2>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Target Date</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">{targetDate}</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-shrink-0">
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-bold tabular-nums leading-none ${HERO_ACCENT_TEXT_CLASS}`}>
                {deliveryPct}%
              </span>
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">Delivery Progress</span>
            </div>
            <div className={`w-full sm:w-56 h-2 rounded-full bg-white/80 dark:bg-zinc-800 border overflow-hidden mt-3 ${HERO_BORDER_CLASS}`}>
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${deliveryPct}%` }}
              />
            </div>
          </div>

          <div className={`flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 lg:pl-6 lg:border-l ${HERO_BORDER_CLASS}`}>
            {completedTickets > 0 ? (
              <button
                type="button"
                onClick={handleCompletedTicketsClick}
                className="w-full text-left p-0 cursor-pointer"
              >
                <HeroStat label="Completed Tickets" value={`${completedTickets} / ${totalTickets}`} />
              </button>
            ) : (
              <HeroStat label="Completed Tickets" value={`${completedTickets} / ${totalTickets}`} />
            )}
            {remainingHoursTickets.length > 0 ? (
              <button
                type="button"
                onClick={handleRemainingHoursClick}
                className="w-full text-left p-0 cursor-pointer"
              >
                <HeroStat label="Remaining Work (Open Tickets)" value={`${remainingHours}h`} />
              </button>
            ) : (
              <HeroStat label="Remaining Work (Open Tickets)" value={`${remainingHours}h`} />
            )}
            {blockedTickets > 0 ? (
              <button
                type="button"
                onClick={handleBlockedTicketsClick}
                className="w-full text-left p-0 cursor-pointer"
              >
                <HeroStat label="Blocked Tickets" value={blockedTickets} danger />
              </button>
            ) : (
              <HeroStat label="Blocked Tickets" value={blockedTickets} danger />
            )}
          </div>
        </div>
      </section>

      {/* ── Section 2: Attention Required ───────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2">
        Attention Required
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <AttentionCard
          tone="critical"
          count={blockedTickets === 1 ? getTicketDisplayKey(blockedTicketsList[0]) : blockedTickets}
          label={blockedTickets === 1 ? blockedTicketsList[0].title : "Blocked Tickets"}
          detail={
            blockedTickets === 1 ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                BLOCKED TICKET
              </span>
            ) : (
              "Needs unblocking"
            )
          }
          href={
            blockedTickets === 0
              ? projectHref("tickets")
              : blockedTickets === 1
                ? projectHref(`tickets/${getTicketDisplayKey(blockedTicketsList[0])}`)
                : projectHref("tickets?alerts=blocked")
          }
          onClick={blockedTickets === 1 ? () => setPreview(blockedTicketsList[0]) : undefined}
          icon={
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          }
        />
        <AttentionCard
          tone="warning"
          count={dueToday === 1 ? getTicketDisplayKey(dueTodayList[0]) : dueToday}
          label={dueToday === 1 ? dueTodayList[0].title : "Due Today"}
          detail={
            dueToday === 1 ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                DUE TODAY
              </span>
            ) : (
              formatISODate(todayISO)
            )
          }
          href={
            dueToday === 0
              ? projectHref("tickets")
              : dueToday === 1
                ? projectHref(`tickets/${getTicketDisplayKey(dueTodayList[0])}`)
                : projectHref("tickets?alerts=due-today")
          }
          onClick={dueToday === 1 ? () => setPreview(dueTodayList[0]) : undefined}
          disabled={dueToday === 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
          }
        />
        <AttentionCard
          tone="warning"
          count={overCapacityMembers.length === 1 ? "" : overCapacityMembers.length}
          label="Over Capacity"
          detail={overCapacityMembers.length > 0 ? overCapacityMembers.map((m) => m.name).join(", ") : "Team is balanced"}
          href={projectHref("team")}
          onClick={
            overCapacityMembers.length === 1
              ? () =>
                  openMemberProfile({
                    name: overCapacityMembers[0].name,
                    avatar: overCapacityMembers[0].avatar,
                    role: overCapacityMembers[0].role,
                    projectSlug: activeSlug,
                    profileId: overCapacityMembers[0].id,
                    projectRole: overCapacityMembers[0].projectRole,
                  })
              : undefined
          }
          disabled={overCapacityMembers.length === 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path strokeLinecap="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
        />
        <AttentionCard
          tone="warning"
          count={awaitingReview.length === 1 ? getTicketDisplayKey(awaitingReview[0]) : awaitingReview.length}
          label={awaitingReview.length === 1 ? awaitingReview[0].title : "Awaiting Review"}
          detail={
            awaitingReview.length === 1 ? (
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
                AWAITING REVIEW
              </span>
            ) : (
              awaitingReview[0]?.title ?? "High priority"
            )
          }
          href={
            awaitingReview.length === 0
              ? projectHref("tickets")
              : awaitingReview.length === 1
                ? projectHref(`tickets/${getTicketDisplayKey(awaitingReview[0])}`)
                : projectHref("tickets?alerts=review")
          }
          onClick={awaitingReview.length === 1 ? () => setPreview(awaitingReview[0]) : undefined}
          disabled={awaitingReview.length === 0}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-1.5 4L16 12H5" />
            </svg>
          }
        />
      </div>

      {/* ── Section 3: Team Capacity ─────────────────────────────────────────── */}
      <Card
        title="Team Capacity"
        count={teamCapacity.length}
        action={
          <Link href={projectHref("team")} className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
            View team →
          </Link>
        }
      >
        {teamCapacity.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No team members on this project yet.</p>
        ) : (
          <div className="space-y-0.5">
            {teamCapacity.map((member) => (
              <TeamCapacityRow
                key={member.id}
                member={member}
                onOpen={(m) =>
                  openMemberProfile({
                    name: m.name,
                    avatar: m.avatar,
                    role: m.role,
                    projectSlug: m.projectSlug,
                    profileId: m.id,
                    projectRole: m.projectRole,
                  })
                }
              />
            ))}
          </div>
        )}
      </Card>

      <div className="mt-5 space-y-5">

        {/* ── Section 4: Project Work ───────────────────────────────────────── */}
        <Card
          title="Project Work"
          count={myActiveWork.length}
          action={
            <Link href="/my-work" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
              View all →
            </Link>
          }
        >
          {myActiveWork.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No active tickets in this project.</p>
          ) : (
            <div className="space-y-0.5">
              {myActiveWork.map((t) => (
                <ActiveTicketRow key={t.id} ticket={t} onOpen={setPreview} />
              ))}
            </div>
          )}
        </Card>

        {/* ── Section 5: Recent Activity ──────────────────────────────────────── */}
        <Card title="Recent Activity">
          {recentActivityEntries.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No recent activity yet.</p>
          ) : (
            <RecentActivityList items={recentActivityEntries} onOpenTicket={setPreview} />
          )}
        </Card>

        {/* ── Section 6: Upcoming Deadlines ───────────────────────────────────── */}
        <Card title="Upcoming Deadlines">
          {deadlines.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-zinc-600 py-2">No upcoming deadlines.</p>
          ) : (
            <div className="space-y-1">
              {deadlines.map((t) => {
                const isOverdue = parseDisplayDate(t.dueDate as string) < todayISO;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPreview(t)}
                    className="w-full flex items-center gap-2.5 py-1.5 px-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-400" : "bg-slate-300 dark:bg-zinc-600"}`} />
                    <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      <TicketTypeIcon type={t.type} />
                      <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
                        {getTicketDisplayKey(t)}
                      </span>
                      <span className="min-w-0 text-[12px] text-slate-700 dark:text-zinc-300 truncate">
                        {t.title}
                      </span>
                    </span>
                    <span className={`text-[11px] font-semibold flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-zinc-400"}`}>
                      {t.dueDate}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

      </div>

      {/* ── Ticket preview panel ─────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={preview.projectSlug}
          onClose={() => setPreview(null)}
        />
      )}

      {/* ── Quick Actions' modals — the exact same flows Team/Notes/Tickets use ── */}
      {showAddMember && (
        <AddTeamMemberModal
          candidates={addMemberCandidates}
          onClose={() => setShowAddMember(false)}
          onAdd={handleAddMember}
        />
      )}

      {showNewNote && (
        <NewNoteModal
          projectName={contextTitle}
          onClose={() => setShowNewNote(false)}
          onCreated={handleCreateNote}
        />
      )}

      {showNewTicket && (
        <NewTicketModal
          slug={activeSlug}
          tickets={tickets}
          members={team}
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
          onPreviewDuplicate={handleTicketPreviewDuplicate}
        />
      )}

      {noteErrorMessage && <ErrorToast message={noteErrorMessage} onDismiss={() => setNoteErrorMessage(null)} />}

    </div>
  );
}
