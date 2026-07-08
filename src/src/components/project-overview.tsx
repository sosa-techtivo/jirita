"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { tickets as ALL_MOCK_TICKETS, getTicketById, getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket, TicketStatus } from "@/lib/mock-tickets";
import { TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { TicketListRow } from "@/components/tickets/ticket-card";
import { BoardView } from "@/components/tickets/board-view";
import { MemberTrigger } from "@/components/member-profile";
import { getTeamByProjectSlug } from "@/lib/mock-team";
import { useCurrentUser } from "@/components/current-user-provider";
import { ProjectCategoryBadge } from "@/components/status-badge";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { presetTicketsFilter } from "@/components/tickets-screen";
import { AdminProjectOverview } from "@/components/admin-project-overview";
import { ProjectLeadProjectOverview } from "@/components/project-lead-project-overview";

// The Member Project Overview is a personal workspace inside the project —
// "what do I need to work on here today?" — not a scaled-down Project Lead
// dashboard. It never shows project-wide health, capacity, or org metrics;
// everything on this page is scoped to the current member's own tickets and
// actions within this one project. (Cross-project "my work" already exists
// as MemberDashboard — this is the single-project counterpart.)

const TODAY = new Date(2026, 5, 30); // Jun 30, 2026 — same "today" the rest of the app uses

function parseDue(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}, 2026`);
  return isNaN(d.getTime()) ? null : d;
}

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
// relevant tickets regardless of which view is showing them.
function projectWorkRank(t: Ticket): number {
  if (t.status === "blocked") return 0;
  const due = parseDue(t.dueDate);
  if (due !== null && due.getTime() < TODAY.getTime()) return 1;
  if (due !== null && due.getTime() === TODAY.getTime()) return 2;
  if (t.priority === "high") return 3;
  if (t.status === "in-progress") return 4;
  if (t.status === "review") return 5;
  return 6;
}

function sortByProjectWorkRank(a: Ticket, b: Ticket): number {
  const diff = projectWorkRank(a) - projectWorkRank(b);
  if (diff !== 0) return diff;
  const da = parseDue(a.dueDate)?.getTime() ?? Infinity;
  const db = parseDue(b.dueDate)?.getTime() ?? Infinity;
  return da - db;
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

// ── Needs My Attention: ticket-driven (blocked/overdue/due today) plus a
//    couple of hand-authored review/mention notifications — this prototype
//    has no comment-mention or review-request data model yet, so those two
//    always point at real tickets in this project via getTicketById rather
//    than inventing fake ones. ──────────────────────────────────────────────

type AttentionKind = "blocked" | "overdue" | "due-today" | "review" | "mention";

const ATTENTION_TONE: Record<AttentionKind, string> = {
  blocked:     "text-red-500 dark:text-red-400",
  overdue:     "text-red-500 dark:text-red-400",
  "due-today": "text-amber-500 dark:text-amber-400",
  review:      "text-sky-500 dark:text-sky-400",
  mention:     "text-violet-500 dark:text-violet-400",
};

interface AttentionItem {
  id: string;
  kind: AttentionKind;
  reason: ReactNode;
  ticket: Ticket;
  rank: number;
}

function buildTicketAttention(t: Ticket): AttentionItem | null {
  const due = parseDue(t.dueDate);
  const isOverdue = due !== null && due.getTime() < TODAY.getTime();
  const isDueToday = due !== null && due.getTime() === TODAY.getTime();

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

const PERSONAL_NOTIFICATIONS: { id: string; kind: AttentionKind; ticketId: string; reason: ReactNode; rank: number }[] = [
  {
    id: "review-1",
    kind: "review",
    ticketId: "push-notification-setup",
    reason: <><span className="font-medium">Sarah Chen</span> requested your review</>,
    rank: 3,
  },
  {
    id: "mention-1",
    kind: "mention",
    ticketId: "api-rate-limiting",
    reason: <><span className="font-medium">Marcus Lee</span> mentioned you in a comment</>,
    rank: 4,
  },
];

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

// ── My Activity: only events where the current member actually participates
//    — either they performed the action ("You ..."), or the action was
//    directed at them (assigned to them, commented on their ticket,
//    mentioned them). Never general project activity. This prototype has no
//    real comment/mention/time-log data model yet, so entries are hand-
//    authored like the attention notifications above, but every one of them
//    always points at a real ticket via getTicketById. ────────────────────

const activityAvatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

interface MyActivityTemplate {
  id: string;
  /** True when the current member performed the action — renders as "You". */
  isMe: boolean;
  actorName: string;
  actorAvatar: string;
  /** The action fragment only — the ticket title never appears here; it
   *  renders on its own clickable line via getTicketDisplayKey instead. */
  message: ReactNode;
  detail?: ReactNode;
  ticketId: string;
  time: string;
}

const MY_ACTIVITY: MyActivityTemplate[] = [
  {
    id: "my-activity-1", isMe: true, actorName: "", actorAvatar: "",
    message: <>marked <span className="text-red-600 dark:text-red-400 font-medium">Blocked</span></>,
    ticketId: "kyc-vendor-outage", time: "2h ago",
  },
  {
    id: "my-activity-2", isMe: false, actorName: "Sarah Chen", actorAvatar: activityAvatar(47),
    message: "commented on",
    ticketId: "kyc-vendor-outage", time: "3h ago",
  },
  {
    id: "my-activity-3", isMe: true, actorName: "", actorAvatar: "",
    message: <>logged <span className="font-medium">2h</span> on</>,
    ticketId: "kyc-vendor-outage", time: "5h ago",
  },
  {
    id: "my-activity-4", isMe: false, actorName: "Sarah Chen", actorAvatar: activityAvatar(47),
    message: "assigned",
    detail: <>to <span className="font-medium">you</span></>,
    ticketId: "mfa-onboarding", time: "Yesterday",
  },
  {
    id: "my-activity-5", isMe: true, actorName: "", actorAvatar: "",
    message: "completed",
    ticketId: "mfa-onboarding", time: "Yesterday",
  },
  {
    id: "my-activity-6", isMe: false, actorName: "Marcus Lee", actorAvatar: activityAvatar(12),
    message: "mentioned you in a comment on",
    ticketId: "api-rate-limiting", time: "2 days ago",
  },
];

function MyActivityRow({
  entry,
  slug,
  currentUser,
  onOpen,
}: {
  entry: MyActivityTemplate;
  slug: string;
  currentUser: { name: string; avatar: string };
  onOpen: (t: Ticket) => void;
}) {
  const ticket = getTicketById(entry.ticketId);
  if (!ticket) return null;

  const name = entry.isMe ? "You" : entry.actorName;
  const actorAvatar = entry.isMe ? currentUser.avatar : entry.actorAvatar;

  return (
    <li className="flex items-start gap-3">
      <MemberTrigger
        name={entry.isMe ? currentUser.name : entry.actorName}
        avatar={actorAvatar}
        projectSlug={slug}
        className="flex-shrink-0 mt-0.5 rounded-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={actorAvatar} alt={name} className="w-6 h-6 rounded-full" />
      </MemberTrigger>
      <div className="text-sm leading-snug min-w-0 flex-1">
        <p className="text-slate-700 dark:text-zinc-300">
          <span className="font-medium text-slate-900 dark:text-zinc-100">{name}</span> {entry.message}
        </p>
        <button
          type="button"
          onClick={() => onOpen(ticket)}
          className="group/ref mt-1 flex items-baseline gap-1.5 min-w-0 max-w-full text-left"
        >
          <TicketTypeIcon type={ticket.type} />
          <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 flex-shrink-0">
            {getTicketDisplayKey(ticket)}
          </span>
          <span className="text-sm font-medium text-slate-700 dark:text-zinc-300 group-hover/ref:text-brand-600 dark:group-hover/ref:text-brand-400 group-hover/ref:underline truncate">
            {ticket.title}
          </span>
        </button>
        <p className="flex items-center gap-1.5 flex-wrap text-xs text-slate-400 mt-0.5 dark:text-zinc-500">
          {entry.detail && (
            <>
              {entry.detail}
              <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
            </>
          )}
          {entry.time}
        </p>
      </div>
    </li>
  );
}

export function ProjectOverview({ slug = "mobile-banking-app" }: { slug?: string }) {
  const { user } = useCurrentUser();
  // Declared before the role branches below so hook order stays identical
  // across renders even if the role switches at runtime without unmounting.
  const [preview, setPreview] = useState<Ticket | null>(null);
  const [workView, setWorkView] = useState<ProjectWorkView>(() => readStoredProjectWorkView(slug));

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

  const team = getTeamByProjectSlug(slug);

  // ── Scope everything to this member's own tickets in this project ────────
  const myTickets = ALL_MOCK_TICKETS.filter((t) => t.projectSlug === slug && t.assignee.name === user.name);
  const myOpenTickets = myTickets.filter((t) => t.status !== "done");
  const myBlockedTickets = myOpenTickets.filter((t) => t.status === "blocked");
  // No close-date field exists on Ticket in this MVP, so "this month" is
  // approximated as every ticket of mine currently marked Done — same
  // approximation the Admin/Project Lead overviews use for the whole project.
  const myCompletedThisMonth = myTickets.filter((t) => t.status === "done").length;

  const myOpenTicketsRanked = [...myOpenTickets].sort(sortByProjectWorkRank);
  const myProjectWorkPreview = myOpenTicketsRanked.slice(0, PROJECT_WORK_PREVIEW_LIMIT);
  const hasMoreProjectWork = myOpenTickets.length > PROJECT_WORK_PREVIEW_LIMIT;

  const weekEnd = new Date(TODAY);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const dueThisWeekCount = myOpenTickets.filter((t) => {
    const due = parseDue(t.dueDate);
    return due !== null && due.getTime() >= TODAY.getTime() && due.getTime() <= weekEnd.getTime();
  }).length;
  const dueTodayCount = myOpenTickets.filter((t) => {
    const due = parseDue(t.dueDate);
    return due !== null && due.getTime() === TODAY.getTime();
  }).length;

  const personalNotifications: AttentionItem[] = PERSONAL_NOTIFICATIONS
    .map((n) => {
      const ticket = getTicketById(n.ticketId);
      return ticket ? { id: n.id, kind: n.kind, ticket, reason: n.reason, rank: n.rank } : null;
    })
    .filter((x): x is AttentionItem => x !== null);

  const attentionItems: AttentionItem[] = [
    ...myOpenTickets.map(buildTicketAttention).filter((x): x is AttentionItem => x !== null),
    ...personalNotifications,
  ].sort((a, b) => a.rank - b.rank);

  const reviewNotification = personalNotifications.find((n) => n.kind === "review");
  const mentionNotification = personalNotifications.find((n) => n.kind === "mention");

  const bannerClauses: ReactNode[] = [];
  if (dueTodayCount > 0) bannerClauses.push(`${dueTodayCount} ticket${dueTodayCount === 1 ? "" : "s"} due today`);
  if (reviewNotification) bannerClauses.push(reviewNotification.reason);
  if (mentionNotification) bannerClauses.push(mentionNotification.reason);
  if (myBlockedTickets.length > 0) {
    bannerClauses.push(
      `${myBlockedTickets.length} blocked ticket${myBlockedTickets.length === 1 ? "" : "s"} need${myBlockedTickets.length === 1 ? "s" : ""} attention`
    );
  }


  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* ===== Project Header ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            MB
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Mobile Banking App</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
              </span>
              <ProjectCategoryBadge category="client" />
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-xl dark:text-zinc-400">
              iOS and Android banking experience for Meridian Bank — redesign of onboarding, transfers, and
              biometric authentication.
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-zinc-500">
              <span>
                Owned by <span className="text-slate-600 font-medium dark:text-zinc-300">Sarah Chen</span>
              </span>
              <span className="text-slate-300 dark:text-zinc-700">·</span>
              <span>Started Mar 3, 2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Slim alert banner — member-specific only ===== */}
      {bannerClauses.length > 0 && (
        <Link
          href={`/projects/${slug}/tickets`}
          onClick={() => presetTicketsFilter(slug, myBlockedTickets.length > 0 ? ["Mine", "Blocked"] : ["Mine"])}
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
            {MY_ACTIVITY.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No recent activity involving you on this project yet.</p>
            ) : (
              <ul className="space-y-4">
                {MY_ACTIVITY.map((entry) => (
                  <MyActivityRow key={entry.id} entry={entry} slug={slug} currentUser={user} onOpen={setPreview} />
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
