"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket, TicketStatus } from "@/lib/mock-tickets";
import { TicketTypeIcon, getTodayISO, parseDisplayDate } from "@/components/tickets/ticket-ui";
import { TicketListRow } from "@/components/tickets/ticket-card";
import { BoardView } from "@/components/tickets/board-view";
import { MemberTrigger } from "@/components/member-profile";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { ProjectCategoryBadge, StatusBadge } from "@/components/status-badge";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { presetTicketsFilter } from "@/components/tickets-screen";
import { AdminProjectOverview } from "@/components/admin-project-overview";
import { ProjectLeadProjectOverview } from "@/components/project-lead-project-overview";
import { loadProjectDetail, loadProjectTeam } from "@/lib/projects";
import type { ProjectDetail, ProjectTeamMember } from "@/lib/projects";
import { loadProjectTickets, loadOrganizationActivity } from "@/lib/tickets";
import type { OrganizationActivityEvent } from "@/lib/tickets";
import {
  PROJECT_ACTIVITY_PREVIEW_LIMIT,
  ExpandableDescription,
  activityEventToEntry,
} from "@/components/admin-project-overview";
import type { ActivityEntry, TeamMember } from "@/components/admin-project-overview";
import { SkeletonBlock } from "@/components/dashboard-shared";

// The Member Project Overview is a personal workspace inside the project —
// "what do I need to work on here today?" — not a scaled-down Project Lead
// dashboard. It never shows project-wide health, capacity, or org metrics;
// everything on this page is scoped to the current member's own tickets and
// actions within this one project. (Cross-project "my work" already exists
// as MemberDashboard — this is the single-project counterpart.) Header,
// project loading, Team, and the activity-formatting helper are all reused
// directly from admin-project-overview.tsx — never a second/parallel
// implementation of the same real data.

// ── My Project Work: same List/Board interaction pattern as My Work
//    (my-work-screen.tsx), scoped to this project and shown as a capped
//    preview — "View all project tickets →" is where the full, unbounded
//    list lives. Focus intentionally isn't offered here — scope is already
//    limited to one project, and "Needs My Attention" already covers
//    prioritization; Focus stays exclusive to My Work's cross-project view,
//    where it earns its keep. My Work itself has no persisted view today, so
//    this reuses its localStorage convention (see current-user-provider.tsx)
//    rather than calling into My Work's local state, keeping My Work's own
//    behavior untouched. ─────────────────────────────────────────────────

type ProjectWorkView = "list" | "board";
const PROJECT_WORK_VIEW_OPTIONS: ProjectWorkView[] = ["list", "board"];
const PROJECT_WORK_PREVIEW_LIMIT = 5;

function projectWorkViewStorageKey(slug: string): string {
  return `jirita-project-work-view:${slug}`;
}

// Reads a previously stored preference. Anyone with "focus" saved from
// before Focus was removed from this block silently migrates to "list".
function readStoredProjectWorkView(slug: string): ProjectWorkView {
  if (typeof window === "undefined") return "list";
  const stored = window.localStorage.getItem(projectWorkViewStorageKey(slug));
  return stored === "board" ? "board" : "list";
}

// Same urgency ordering vocabulary used by "Needs My Attention" below
// (blocked → overdue → due today → high priority → in progress → review →
// to-do), but as a total order so the preview can be capped to the N most
// relevant tickets regardless of which view is showing them. Takes the real
// current local date (todayISO) rather than a fixed mock date.
function projectWorkRank(t: Ticket, todayISO: string): number {
  if (t.status === "blocked") return 0;
  const due = t.dueDate ? parseDisplayDate(t.dueDate) : null;
  if (due !== null && due < todayISO) return 1;
  if (due !== null && due === todayISO) return 2;
  if (t.priority === "high" || t.priority === "highest") return 3;
  if (t.status === "in-progress") return 4;
  if (t.status === "review") return 5;
  return 6;
}

function sortByProjectWorkRank(a: Ticket, b: Ticket, todayISO: string): number {
  const diff = projectWorkRank(a, todayISO) - projectWorkRank(b, todayISO);
  if (diff !== 0) return diff;
  const da = a.dueDate ? parseDisplayDate(a.dueDate) : null;
  const db = b.dueDate ? parseDisplayDate(b.dueDate) : null;
  if (da && db) return da.localeCompare(db);
  if (da) return -1;
  if (db) return 1;
  return 0;
}

// ── My Work: grouped by status ───────────────────────────────────────────────

const STATUS_GROUPS: { status: TicketStatus; label: string; labelClass: string }[] = [
  { status: "blocked",     label: "Blocked",     labelClass: "text-red-500 dark:text-red-400" },
  { status: "in-progress", label: "In Progress", labelClass: "text-amber-500 dark:text-amber-400" },
  { status: "review",      label: "In Review",   labelClass: "text-violet-500 dark:text-violet-400" },
  { status: "to-do",       label: "To Do",       labelClass: "text-sky-500 dark:text-sky-400" },
  { status: "backlog",     label: "Backlog",     labelClass: "text-slate-400 dark:text-zinc-500" },
];

function WorkGroup({
  label,
  labelClass,
  ticketsInGroup,
  onOpen,
}: {
  label: string;
  labelClass: string;
  ticketsInGroup: Ticket[];
  onOpen: (t: Ticket) => void;
}) {
  if (ticketsInGroup.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className={`text-xs font-medium mb-1.5 ${labelClass}`}>{label} ({ticketsInGroup.length})</p>
      <div className="rounded-lg border border-slate-100 dark:border-zinc-800 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
        {ticketsInGroup.map((ticket) => (
          <TicketListRow key={ticket.id} ticket={ticket} onTicketClick={onOpen} />
        ))}
      </div>
    </div>
  );
}

// ── Needs My Attention: real, ticket-driven only (blocked/overdue/due
//    today) — this MVP has no real comment-mention or review-request data
//    model, so the mock's hand-authored review/mention notifications are
//    removed outright rather than replaced with fabricated ones; when none
//    of the three real conditions apply to any of the member's own tickets,
//    this section (and its banner clauses) simply don't render, same as the
//    interface's own existing empty behavior. ─────────────────────────────

type AttentionKind = "blocked" | "overdue" | "due-today";

const ATTENTION_TONE: Record<AttentionKind, string> = {
  blocked:     "text-red-500 dark:text-red-400",
  overdue:     "text-red-500 dark:text-red-400",
  "due-today": "text-amber-500 dark:text-amber-400",
};

interface AttentionItem {
  id: string;
  kind: AttentionKind;
  reason: string;
  ticket: Ticket;
  rank: number;
}

function buildTicketAttention(t: Ticket, todayISO: string): AttentionItem | null {
  const due = t.dueDate ? parseDisplayDate(t.dueDate) : null;
  const isOverdue = due !== null && due < todayISO;
  const isDueToday = due !== null && due === todayISO;

  if (t.status === "blocked") {
    return { id: `blocked-${t.id}`, kind: "blocked", ticket: t, reason: "Blocked — needs unblocking", rank: 0 };
  }
  if (isOverdue) {
    return { id: `overdue-${t.id}`, kind: "overdue", ticket: t, reason: "Overdue", rank: 1 };
  }
  if (isDueToday) {
    return { id: `due-${t.id}`, kind: "due-today", ticket: t, reason: "Due today", rank: 2 };
  }
  return null;
}

function AttentionRow({ item, slug, onOpen }: { item: AttentionItem; slug: string; onOpen: (t: Ticket) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.ticket)}
      className="w-full py-2.5 flex items-start justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 -mx-2 px-2 rounded-lg transition-colors"
    >
      <div className="min-w-0">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <TicketTypeIcon type={item.ticket.type} />
          <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
            {getTicketDisplayKey(item.ticket)}
          </span>
          <span className="text-sm text-slate-800 dark:text-zinc-200 truncate">{item.ticket.title}</span>
        </span>
        <p className={`text-xs mt-0.5 ${ATTENTION_TONE[item.kind]}`}>{item.reason}</p>
      </div>
      <MemberTrigger
        name={item.ticket.assignee.name}
        avatar={item.ticket.assignee.avatar}
        projectSlug={slug}
        nested
        className="flex-shrink-0 mt-0.5 rounded-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.ticket.assignee.avatar}
          alt={item.ticket.assignee.name}
          className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
        />
      </MemberTrigger>
    </button>
  );
}

// The /projects/[slug] page itself is a server component (so it can't call
// useCurrentUser/useOrganizationProjects directly), so its breadcrumb is a
// small client component instead — same "server page, client breadcrumb"
// split already used by ProjectSettingsBreadcrumb (project-settings-
// screen.tsx) and TicketDetailBreadcrumb (ticket-detail-screen.tsx). Reuses
// the org's already-loaded real project list (OrganizationProjectsProvider,
// mounted once in layout.tsx) rather than a new fetch — the exact same
// source Sidebar/`/projects`/those other breadcrumbs already read from.
export function ProjectOverviewBreadcrumb({ slug }: { slug: string }) {
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;
  return (
    <>
      <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
        Projects
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200">{projectName}</span>
    </>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
// The Member view's own layout differs from Admin/Project Lead's shared
// ProjectOverviewSkeleton (admin-project-overview.tsx) — a different KPI
// set, "My Project Work" (with its own List/Board toggle row) instead of
// "Active Work", "My Activity" instead of "Project Activity", and a
// 2-or-3-card right column (Needs My Attention/Team/Quick Links) instead of
// Admin's fixed 2 (Team/Project Health) — so it gets its own skeleton rather
// than forcing a mismatched shape through the shared one. Mirrors the real
// render below section-for-section/proportion-for-proportion, using the
// same `SkeletonBlock` primitive as every other skeleton in this app. Shown
// only for the true first load (`loadState === "loading"`) — this branch is
// only ever reached once the role is already known to be MEMBER (see the
// ADMIN/PROJECT_LEAD returns above), so ADMIN/PROJECT_LEAD never render it.
function MemberProjectOverviewSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* ===== Project Header ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <SkeletonBlock className="w-11 h-11 rounded-xl flex-shrink-0" />
          <div>
            <div className="flex items-center gap-2.5">
              <SkeletonBlock className="h-6 w-48 rounded" />
              <SkeletonBlock className="h-5 w-16 rounded-md" />
            </div>
            <SkeletonBlock className="h-4 w-72 rounded mt-2" />
            <SkeletonBlock className="h-3 w-32 rounded mt-3" />
          </div>
        </div>
      </div>

      {/* ===== Alert banner ===== */}
      <SkeletonBlock className="h-9 w-full rounded-md mt-5" />

      {/* ===== KPI strip ===== */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 px-5 py-4">
            <SkeletonBlock className="h-2.5 w-20 rounded mb-2" />
            <SkeletonBlock className="h-6 w-10 rounded" />
          </div>
        ))}
      </div>

      {/* ===== My Project Work + My Activity, Needs My Attention + Team + Quick Links ===== */}
      <div className="mt-10 grid grid-cols-3 gap-8 items-start">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-center justify-between gap-3 mb-3">
              <SkeletonBlock className="h-3 w-28 rounded" />
              <SkeletonBlock className="h-7 w-24 rounded-lg" />
            </div>
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} className="h-9 w-full rounded-lg" />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <SkeletonBlock className="h-3 w-24 rounded mb-4" />
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <SkeletonBlock className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonBlock className="h-3.5 w-3/4 rounded" />
                    <SkeletonBlock className="h-2.5 w-16 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <SkeletonBlock className="h-3 w-32 rounded mb-3" />
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBlock className="h-3.5 w-4/5 rounded" />
                  <SkeletonBlock className="h-2.5 w-16 rounded" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="mb-3 space-y-1.5">
              <SkeletonBlock className="h-3 w-12 rounded" />
              <SkeletonBlock className="h-2.5 w-24 rounded" />
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <SkeletonBlock className="w-7 h-7 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <SkeletonBlock className="h-3.5 w-24 rounded" />
                    <SkeletonBlock className="h-2.5 w-16 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <SkeletonBlock className="h-3 w-24 rounded mb-3" />
            <SkeletonBlock className="h-3.5 w-32 rounded" />
          </section>
        </div>
      </div>
    </div>
  );
}

export function ProjectOverview({ slug = "mobile-banking-app" }: { slug?: string }) {
  const { user, userId, organization, isDevFallback } = useCurrentUser();
  // Declared before the role branches below so hook order stays identical
  // across renders even if the role switches at runtime without unmounting.
  const [preview, setPreview] = useState<Ticket | null>(null);
  const [workView, setWorkView] = useState<ProjectWorkView>(() => readStoredProjectWorkView(slug));

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [myActivityEvents, setMyActivityEvents] = useState<OrganizationActivityEvent[]>([]);
  const [requestId, setRequestId] = useState(0);

  const runFetch = useCallback(() => setRequestId((id) => id + 1), []);

  // Same data-loading shape as AdminProjectOverview's/ProjectLeadProjectOverview's
  // own effect (same loaders, same real sources), plus one real, actor-scoped
  // activity read for "My Activity" (loadOrganizationActivity's own optional
  // actorProfileId filter — see lib/tickets.ts — never a second/parallel
  // activity query).
  useEffect(() => {
    // ADMIN/PROJECT_LEAD render AdminProjectOverview/ProjectLeadProjectOverview
    // instead (see the role branches below) — each of those already does its
    // own real fetch, so this effect stays a no-op for those roles rather
    // than duplicating the same network calls for a view that's never shown.
    if (isDevFallback || !organization || !userId || user.role !== "MEMBER") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern used elsewhere in this app (e.g. member-profile-modal.tsx)
    setLoadState("loading");

    (async () => {
      const projectResult = await loadProjectDetail(organization.id, slug);
      if (cancelled) return;
      if (projectResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(projectResult.message);
        return;
      }
      if (projectResult.status === "not-found") {
        setLoadState("error");
        setLoadErrorMessage("Project not found.");
        return;
      }

      const ticketsResult = await loadProjectTickets(organization.id, slug);
      if (cancelled) return;
      if (ticketsResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(ticketsResult.message);
        return;
      }
      const projectTickets = ticketsResult.status === "ready" ? ticketsResult.tickets : [];
      const ticketIds = projectTickets.map((t) => t.id);

      const [teamResult, activityResult] = await Promise.all([
        loadProjectTeam(organization.id, slug),
        loadOrganizationActivity(ticketIds, PROJECT_ACTIVITY_PREVIEW_LIMIT, userId),
      ]);
      if (cancelled) return;

      if (teamResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(teamResult.message);
        return;
      }
      if (activityResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(activityResult.message);
        return;
      }

      setProject(projectResult.project);
      setTickets(projectTickets);
      setTeamMembers(teamResult.members);
      setMyActivityEvents(activityResult.events);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, userId, user.role, slug, requestId]);

  function changeWorkView(next: ProjectWorkView) {
    setWorkView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(projectWorkViewStorageKey(slug), next);
    }
  }

  // Admins get an executive project-health dashboard, and Project Leads get
  // an execution-focused "what needs my attention today" view — see
  // admin-project-overview.tsx / project-lead-project-overview.tsx. This
  // component is the Member's personal-workspace-inside-the-project view.
  if (user.role === "ADMIN") {
    return <AdminProjectOverview slug={slug} />;
  }
  if (user.role === "PROJECT_LEAD") {
    return <ProjectLeadProjectOverview slug={slug} />;
  }

  if (loadState === "loading") {
    return <MemberProjectOverviewSkeleton />;
  }

  if (loadState === "error" || !project) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load project</h3>
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
      </div>
    );
  }

  const todayISO = getTodayISO();
  const monthPrefix = todayISO.slice(0, 7);

  const team: TeamMember[] = teamMembers.map((m) => ({ id: m.id, name: m.name, role: m.title, avatar: m.avatar }));
  const ticketsById = new Map(tickets.map((t) => [t.id, t]));

  // ── Scope everything to this member's own tickets in this project ────────
  const myTickets = tickets.filter((t) => t.assigneeProfileId === userId);
  const myOpenTickets = myTickets.filter((t) => t.status !== "done");
  const myBlockedTickets = myOpenTickets.filter((t) => t.status === "blocked");
  // Same real "done this calendar month" signal Admin/Project Lead Project
  // Overview already use (a done ticket's own updated_at falling in the
  // current month) — not the mock's looser "every ticket of mine ever
  // marked Done" approximation.
  const myCompletedThisMonth = myTickets.filter(
    (t) => t.status === "done" && t.updatedAtISO?.slice(0, 7) === monthPrefix
  ).length;

  const myOpenTicketsRanked = [...myOpenTickets].sort((a, b) => sortByProjectWorkRank(a, b, todayISO));
  const myProjectWorkPreview = myOpenTicketsRanked.slice(0, PROJECT_WORK_PREVIEW_LIMIT);
  const hasMoreProjectWork = myOpenTickets.length > PROJECT_WORK_PREVIEW_LIMIT;

  const weekEnd = new Date(`${todayISO}T00:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndISO = weekEnd.toISOString().slice(0, 10);
  const dueThisWeekCount = myOpenTickets.filter((t) => {
    const due = t.dueDate ? parseDisplayDate(t.dueDate) : null;
    return due !== null && due >= todayISO && due <= weekEndISO;
  }).length;
  const dueTodayCount = myOpenTickets.filter((t) => t.dueDate && parseDisplayDate(t.dueDate) === todayISO).length;

  const attentionItems: AttentionItem[] = myOpenTickets
    .map((t) => buildTicketAttention(t, todayISO))
    .filter((x): x is AttentionItem => x !== null)
    .sort((a, b) => a.rank - b.rank);

  const bannerClauses: string[] = [];
  if (dueTodayCount > 0) bannerClauses.push(`${dueTodayCount} ticket${dueTodayCount === 1 ? "" : "s"} due today`);
  if (myBlockedTickets.length > 0) {
    bannerClauses.push(
      `${myBlockedTickets.length} blocked ticket${myBlockedTickets.length === 1 ? "" : "s"} need${myBlockedTickets.length === 1 ? "s" : ""} attention`
    );
  }

  // Review action target — same real "1 ticket → straight to it, 2+ → the
  // Tickets page with the alert type applied as a real, visible URL filter"
  // pattern Admin/Project Lead Project Overview already implement (see
  // alertActionHref there and its own `?alerts=` handoff, read by
  // tickets-screen.tsx), reused as-is rather than a second implementation —
  // just scoped to this member's own blocked tickets instead of the whole
  // project's. "Mine" still goes through the existing presetTicketsFilter
  // mechanism (unchanged) so the Tickets page stays scoped to this member's
  // own tickets, exactly as the banner itself already promises.
  let blockedActionHref: string | null = null;
  if (myBlockedTickets.length === 1) {
    blockedActionHref = `/projects/${slug}/tickets/${getTicketDisplayKey(myBlockedTickets[0])}`;
  } else if (myBlockedTickets.length > 1) {
    blockedActionHref = `/projects/${slug}/tickets?alerts=blocked`;
  }

  // ── My Activity: real ticket_activity events on this project where the
  // signed-in member is the actor (loadOrganizationActivity's actorProfileId
  // filter above) — the same real event categories/labels Admin/Project
  // Lead Project Overview already use for their own activity feeds, via the
  // same activityEventToEntry, never a second formatting function.
  const myActivity: ActivityEntry[] = myActivityEvents.map((event) =>
    activityEventToEntry(event, ticketsById.get(event.ticketId))
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* ===== Project Header ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {project.shortName}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">{project.name}</h1>
              <StatusBadge status={project.status} />
              <ProjectCategoryBadge category={project.category} />
            </div>
            <ExpandableDescription text={project.description} />
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-zinc-500">
              <span>Started {project.createdAt}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Slim alert banner — member-specific only ===== */}
      {bannerClauses.length > 0 && (
        <Link
          href={blockedActionHref ?? `/projects/${slug}/tickets`}
          onClick={() => {
            // The direct-to-ticket case (exactly 1 blocked ticket) doesn't
            // navigate to the Tickets list at all, so there's no filter to
            // preset; every other case still scopes that list to this
            // member's own tickets via the existing presetTicketsFilter
            // mechanism, unchanged — "Blocked" itself now comes from the
            // real `?alerts=blocked` URL filter baked into blockedActionHref
            // above instead of this sessionStorage preset.
            if (myBlockedTickets.length !== 1) presetTicketsFilter(slug, ["Mine"]);
          }}
          className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 hover:bg-amber-100/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <p className="flex-1">
            {bannerClauses.map((clause, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5 text-amber-400 dark:text-amber-600" aria-hidden="true">·</span>}
                {clause}
              </span>
            ))}
          </p>
          <span className="text-xs font-medium text-amber-700 flex-shrink-0 dark:text-amber-400">
            Review →
          </span>
        </Link>
      )}

      {/* ===== KPI strip — member-focused only ===== */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">My Open Tickets</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{myOpenTickets.length}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Due This Week</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{dueThisWeekCount}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">My Blocked Tickets</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1 leading-none">{myBlockedTickets.length}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Completed This Month</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 leading-none">{myCompletedThisMonth}</p>
        </div>
      </div>

      {/* ===== My Work + My Activity, Team + Quick Links ===== */}
      <div className="mt-10 grid grid-cols-3 gap-8 items-start">
        {/* Left column: primary content */}
        <div className="col-span-2 space-y-6 min-w-0">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">My Project Work</h2>

              {/* View toggle — same List/Board/Focus pattern as My Work */}
              <div className="flex items-center bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
                {PROJECT_WORK_VIEW_OPTIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => changeWorkView(v)}
                    className={[
                      "px-2.5 py-1.5 rounded-[7px] text-xs font-medium transition-all duration-150",
                      workView === v
                        ? "bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-50 shadow-sm shadow-slate-200/80 dark:shadow-black/40"
                        : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200",
                    ].join(" ")}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {myOpenTickets.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">
                You&apos;re all caught up — nothing assigned to you in this project right now.
              </p>
            ) : workView === "board" ? (
              <div className="mt-3 flex flex-col h-[320px] min-w-0">
                <BoardView tickets={myProjectWorkPreview} onTicketClick={setPreview} />
              </div>
            ) : (
              <div>
                {STATUS_GROUPS.map((g) => (
                  <WorkGroup
                    key={g.status}
                    label={g.label}
                    labelClass={g.labelClass}
                    ticketsInGroup={myProjectWorkPreview.filter((t) => t.status === g.status)}
                    onOpen={setPreview}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                {myOpenTickets.length} open · {myCompletedThisMonth} completed this month
                {hasMoreProjectWork && ` · showing ${myProjectWorkPreview.length}`}
              </p>
              <Link
                href={`/projects/${slug}/tickets`}
                onClick={() => presetTicketsFilter(slug, ["Mine"])}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 flex-shrink-0"
              >
                View all project tickets →
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 dark:text-zinc-400">My Activity</h2>
            {myActivity.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No recent activity involving you on this project yet.</p>
            ) : (
              <ul className="space-y-4">
                {myActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <MemberTrigger name={entry.name} avatar={entry.avatar} projectSlug={slug} className="flex-shrink-0 mt-0.5 rounded-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.avatar} alt={entry.name} className="w-6 h-6 rounded-full" />
                    </MemberTrigger>
                    <div className="text-sm leading-snug min-w-0 flex-1">
                      <p className="text-slate-700 dark:text-zinc-300">
                        <span className="font-medium text-slate-900 dark:text-zinc-100">{entry.name}</span> {entry.message}
                      </p>
                      {entry.ticket && (
                        <button
                          type="button"
                          onClick={() => setPreview(entry.ticket!)}
                          className="group/ref mt-1 flex items-baseline gap-1.5 min-w-0 max-w-full text-left"
                        >
                          <TicketTypeIcon type={entry.ticket.type} />
                          <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 flex-shrink-0">
                            {getTicketDisplayKey(entry.ticket)}
                          </span>
                          <span className="text-sm font-medium text-slate-700 dark:text-zinc-300 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 group-hover/ref:underline truncate">
                            {entry.ticket.title}
                          </span>
                        </button>
                      )}
                      <p className="text-xs text-slate-400 mt-0.5 dark:text-zinc-500">{entry.time}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right column: actionable content first, informational content after */}
        <div className="space-y-6">
          {attentionItems.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-zinc-400">Needs My Attention</h2>
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {attentionItems.map((item) => (
                  <AttentionRow key={item.id} item={item} slug={slug} onOpen={setPreview} />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Team</h2>
              <p className="text-xs text-slate-400 dark:text-zinc-500">{team.length} members</p>
            </div>
            {team.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No team members on this project yet.</p>
            ) : (
              <ul className="space-y-3">
                {team.map((member) => (
                  <li key={member.id}>
                    <MemberTrigger
                      name={member.name}
                      avatar={member.avatar}
                      role={member.role}
                      projectSlug={slug}
                      className="flex items-center gap-2.5 w-full text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={member.avatar} alt={member.name} className="w-7 h-7 rounded-full" />
                      <div className="text-sm leading-tight flex-1">
                        <p className="font-medium text-slate-800 dark:text-zinc-200">{member.name}</p>
                        <p className="text-xs text-slate-400 dark:text-zinc-500">{member.role}</p>
                      </div>
                    </MemberTrigger>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 dark:text-zinc-400">Quick Links</h2>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link
                  href={`/projects/${slug}/notes`}
                  className="text-slate-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400"
                >
                  Notes &amp; Documentation
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>

      {/* ── Ticket preview panel ─────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={slug}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
