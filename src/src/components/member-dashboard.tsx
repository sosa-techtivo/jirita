"use client";

import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/components/current-user-provider";
import { TicketListRow } from "@/components/tickets/ticket-card";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { StatusBadge, PriorityBadge, TicketTypeIcon, getTodayISO, parseDisplayDate } from "@/components/tickets/ticket-ui";
import { statusMeta } from "@/components/status-badge";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { ProjectStatus } from "@/lib/mock-projects";
import {
  loadOrganizationTickets,
  loadProfileLoggedTimeForDate,
  loadProfileLoggedMinutesForRange,
  loadMemberAttentionEvents,
} from "@/lib/tickets";
import type { ProfileTimeEntry, MemberAttentionEvent } from "@/lib/tickets";
import { loadMemberWeeklyCapacity } from "@/lib/projects";
import {
  Card,
  ActiveTicketRow,
  av,
  HERO_CARD_CLASS,
  HERO_LABEL_CLASS,
} from "@/components/dashboard-shared";

// A Member (Engineer / QA / Designer) may be staffed on several projects at
// once, but they don't think in terms of projects — their context is their
// work. So this dashboard never asks them to pick a project; every project
// a ticket belongs to shows up only as a small badge above the ticket
// title, the same way "Resolve login crash / Mobile Banking App" would
// read in a personal work queue.

export interface Project {
  slug: string;
  name: string;
  /** Shortened label for the compact project badge (e.g. "Mobile Banking"
   *  instead of "Mobile Banking App") so it never competes with the title. */
  shortLabel: string;
}

const PROJECTS = {
  mba: { slug: "mobile-banking-app", name: "Mobile Banking App", shortLabel: "Mobile Banking" },
  cwd: { slug: "client-website-redesign", name: "Client Website Redesign", shortLabel: "Client Website" },
  ipm: { slug: "internal-platform-migration", name: "Internal Platform Migration", shortLabel: "Internal Platform" },
} satisfies Record<string, Project>;

export interface WorkItem {
  ticket: Ticket;
  project: Project;
}

// ── Mock scaffolding kept for src/components/member-projects-screen.tsx
//    ("My Projects"), which still reads MEMBER_WORK/WorkItem directly and is
//    out of scope for this pass — MemberDashboard() below no longer reads
//    any of this and is fully real. ─────────────────────────────────────────

export const MEMBER_WORK: WorkItem[] = [
  {
    project: PROJECTS.mba,
    ticket: {
      id: "dk-kyc-outage", projectSlug: "mobile-banking-app", ticketNumber: 8,
      title: "Third-party KYC vendor API outage",
      description: "Vendor integration has been failing intermittently for the past week.",
      status: "blocked", priority: "high", type: "BUG",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "Security Audit", labels: ["Integration"],
      hours: 16, dueDate: "Jun 28", updatedAt: "Updated 6 days ago",
    },
  },
  {
    project: PROJECTS.mba,
    ticket: {
      id: "dk-regression-ios", projectSlug: "mobile-banking-app", ticketNumber: 18,
      title: "iOS 18 regression suite failing on biometric flow",
      description: "The automated regression suite can't get past the Face ID step on iOS 18 devices.",
      status: "blocked", priority: "high", type: "BUG",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "Beta Release", labels: ["QA", "Bug"],
      hours: 5, dueDate: "Jul 2", updatedAt: "Updated 1 day ago",
    },
  },
  {
    project: PROJECTS.cwd,
    ticket: {
      id: "dk-homepage-review", projectSlug: "client-website-redesign", ticketNumber: 1,
      title: "Homepage redesign review",
      description: "Sign off on the updated homepage layout against brand guidelines before handoff.",
      status: "in-progress", priority: "medium", type: "TASK",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "Homepage Redesign", labels: ["QA"],
      hours: 2, dueDate: "Jun 30", updatedAt: "Updated 3h ago",
    },
  },
  {
    project: PROJECTS.cwd,
    ticket: {
      id: "dk-cms-audit", projectSlug: "client-website-redesign", ticketNumber: 2,
      title: "CMS migration content audit",
      description: "Audit legacy CMS content before migrating to the new platform.",
      status: "to-do", priority: "high", type: "TASK",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "CMS Migration", labels: ["Content"],
      hours: 8, dueDate: "Jul 20", updatedAt: "Updated 3 days ago",
    },
  },
  {
    project: PROJECTS.mba,
    ticket: {
      id: "dk-a11y-audit", projectSlug: "mobile-banking-app", ticketNumber: 12,
      title: "Accessibility audit and WCAG 2.1 fixes",
      description: "Ensure VoiceOver and TalkBack compatibility for WCAG 2.1 AA compliance.",
      status: "in-progress", priority: "medium", type: "TASK",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "Beta Release", labels: ["Accessibility", "Compliance"],
      hours: 6, dueDate: "Jul 5", updatedAt: "Updated yesterday",
    },
  },
  {
    project: PROJECTS.ipm,
    ticket: {
      id: "dk-db-export-qa", projectSlug: "internal-platform-migration", ticketNumber: 4,
      title: "Legacy database export QA verification",
      description: "Verify row counts and integrity checksums on the exported legacy database.",
      status: "to-do", priority: "low", type: "TASK",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "Platform Cutover", labels: ["QA"],
      hours: 4, dueDate: "Jul 8", updatedAt: "Updated 2 days ago",
    },
  },
  {
    project: PROJECTS.mba,
    ticket: {
      id: "dk-api-rate-review", projectSlug: "mobile-banking-app", ticketNumber: 7,
      title: "API rate limiting — QA sign-off",
      description: "Final verification pass on per-client rate limits before release.",
      status: "review", priority: "medium", type: "TASK",
      assignee: { name: "David Kim", avatar: av(22) },
      milestone: "Security Audit", labels: ["Security", "API"],
      hours: 2, dueDate: "Jul 3", updatedAt: "Updated 3h ago",
    },
  },
];

// Only actionable, ticket-specific events belong here — never general
// project activity. If it doesn't ask the member to do something (review,
// pick up reassigned work, or notice a changed estimate/new blocker), it
// doesn't qualify.
type AttentionType = "mention" | "reassigned" | "review" | "estimate" | "blocked";

const ATTENTION_META: Record<AttentionType, { dot: string; label: string }> = {
  mention:    { dot: "bg-violet-400", label: "Mentioned" },
  reassigned: { dot: "bg-sky-400",    label: "Reassigned" },
  review:     { dot: "bg-sky-400",    label: "Review requested" },
  estimate:   { dot: "bg-brand-400",  label: "Estimate changed" },
  blocked:    { dot: "bg-red-400",    label: "Blocked" },
};

interface AttentionItem {
  id: string;
  type: AttentionType;
  /** The action fragment only — the ticket title never appears here; it
   *  renders on its own clickable line via getTicketDisplayKey instead. */
  verb: ReactNode;
  /** Extra context shown in the meta line, e.g. "8h → 6h" or "to you". */
  detail?: ReactNode;
  time: string;
  ticketId?: string;
}

// No @mention-detection exists in this schema (comments aren't parsed for
// mentions), so real MemberAttentionEvents never carry type "mention" — it
// stays a defined category for the shared dict/type below and simply never
// renders, same "kept but unreachable until real data exists" precedent
// used elsewhere in this app (e.g. Project Notes' Tag field).
function attentionItemFromEvent(event: MemberAttentionEvent): AttentionItem {
  const name = event.actorName ?? "Someone";

  if (event.type === "blocked") {
    return {
      id: event.id, type: "blocked", time: event.time, ticketId: event.ticketId,
      verb: <><span className="font-medium">{name}</span> marked</>,
    };
  }
  if (event.type === "reassigned") {
    return {
      id: event.id, type: "reassigned", time: event.time, ticketId: event.ticketId,
      verb: <><span className="font-medium">{name}</span> reassigned</>,
      detail: "to you",
    };
  }
  if (event.type === "review") {
    return {
      id: event.id, type: "review", time: event.time, ticketId: event.ticketId,
      verb: <><span className="font-medium">{name}</span> moved to review</>,
    };
  }
  // estimate
  return {
    id: event.id, type: "estimate", time: event.time, ticketId: event.ticketId,
    verb: "Estimate changed",
    detail: <span className="font-medium">{event.oldHours}h → {event.newHours}h</span>,
  };
}

// ── Sort: Blocked → Due Today → High Priority → In Progress → Ready to
//    Start → In Review. Also drives "Recommended Next" (its top result). ──
//    Operates on real Ticket.dueDate (a display string like "Jun 30") and
//    the real, current local date — never a fixed/mock date.

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Same "urgent window" convention the rest of the dashboards use for red
// due-date styling — today plus the two days right before it.
const URGENT_WINDOW_DAYS = 2;

function isUrgentDue(dueDate: string | undefined, todayISO: string): boolean {
  if (!dueDate) return false;
  const iso = parseDisplayDate(dueDate);
  if (!iso || iso > todayISO) return false;
  const diffDays = Math.round(
    (new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000
  );
  return diffDays <= URGENT_WINDOW_DAYS;
}

function tierOf(ticket: Ticket, todayISO: string): number {
  if (ticket.status === "blocked") return 0;
  if (isUrgentDue(ticket.dueDate, todayISO)) return 1;
  if (ticket.priority === "high" || ticket.priority === "highest") return 2;
  if (ticket.status === "in-progress") return 3;
  if (ticket.status === "to-do") return 4;
  if (ticket.status === "review") return 5;
  return 6;
}

function dueSortValue(dueDate?: string): number {
  if (!dueDate) return Infinity;
  const iso = parseDisplayDate(dueDate);
  return iso ? new Date(`${iso}T00:00:00`).getTime() : Infinity;
}

function compareWork(a: Ticket, b: Ticket, todayISO: string): number {
  const diff = tierOf(a, todayISO) - tierOf(b, todayISO);
  return diff !== 0 ? diff : dueSortValue(a.dueDate) - dueSortValue(b.dueDate);
}

function isFuture(dueDate: string | undefined, todayISO: string): boolean {
  return dueDate !== undefined && !isUrgentDue(dueDate, todayISO);
}

// Matches the header's original "Tuesday, June 30" style, built from the
// user's real local date instead of a fixed string.
function formatFullDate(todayISO: string): string {
  return new Date(`${todayISO}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Monday–Sunday — same "This Week" convention reports-screen.tsx already
// uses (rangeForPreset's "this-week" case), just built from the real
// current date instead of a fixed mock TODAY.
function getWeekRangeISO(todayISO: string): { start: string; end: string } {
  const today = new Date(`${todayISO}T00:00:00`);
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: toISO(monday), end: toISO(sunday) };
}

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

// Every project always renders with the same accent color everywhere in the
// app — that color already exists as the status dot next to this project in
// the sidebar (see sidebar.tsx / status-badge.tsx), so it's reused here
// rather than inventing a separate per-project color scheme. Real project
// data has no shortened-label field, so the badge shows the real project
// name in full.
function ProjectBadge({ name, status }: { name: string; status?: ProjectStatus }) {
  const meta = status ? statusMeta[status] : undefined;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 ${meta?.text ?? "text-slate-400 dark:text-zinc-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta?.dot ?? "bg-slate-300 dark:bg-zinc-600"}`} />
      {name}
    </span>
  );
}

function AttentionRow({
  item,
  ticket,
  onOpen,
}: {
  item: AttentionItem;
  ticket: Ticket | undefined;
  onOpen: (id: string) => void;
}) {
  const meta = ATTENTION_META[item.type];

  const content = (
    <>
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${meta.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-slate-700 dark:text-zinc-300">{item.verb}</p>
        {ticket && (
          <p className="flex items-baseline gap-1.5 min-w-0 mt-1">
            <TicketTypeIcon type={ticket.type} />
            <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 flex-shrink-0">
              {getTicketDisplayKey(ticket)}
            </span>
            <span className="text-[13px] font-medium text-slate-700 dark:text-zinc-300 truncate">
              {ticket.title}
            </span>
          </p>
        )}
        <p className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
          {meta.label}
          {item.detail && (
            <>
              <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
              {item.detail}
            </>
          )}
          <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
          {item.time}
        </p>
      </div>
    </>
  );

  if (!item.ticketId) {
    return <div className="flex items-start gap-2.5 py-2">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(item.ticketId!)}
      className="w-full flex items-start gap-2.5 py-2 px-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
    >
      {content}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MemberDashboard() {
  const { user, userId, organization, isDevFallback } = useCurrentUser();
  const [preview, setPreview] = useState<Ticket | null>(null);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [projects, setProjects] = useState<{ slug: string; name: string; status: ProjectStatus }[]>([]);
  const [todayEntries, setTodayEntries] = useState<ProfileTimeEntry[]>([]);
  const [attentionEvents, setAttentionEvents] = useState<MemberAttentionEvent[]>([]);
  const [weeklyCapacity, setWeeklyCapacity] = useState(0);
  const [weekLoggedMinutes, setWeekLoggedMinutes] = useState(0);
  const [requestId, setRequestId] = useState(0);

  const runFetch = () => setRequestId((id) => id + 1);
  const todayISO = getTodayISO();

  useEffect(() => {
    if (isDevFallback || !organization || !userId) return;
    let cancelled = false;

    (async () => {
      const ticketsResult = await loadOrganizationTickets(organization.id);
      if (cancelled) return;
      if (ticketsResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(ticketsResult.message);
        return;
      }

      const myActiveTicketIds = ticketsResult.tickets
        .filter((t) => t.assigneeProfileId === userId && t.status !== "done")
        .map((t) => t.id);

      const { start: weekStart, end: weekEnd } = getWeekRangeISO(getTodayISO());
      const [timeResult, attentionResult, capacityResult, weekMinutesResult] = await Promise.all([
        loadProfileLoggedTimeForDate(userId, getTodayISO()),
        loadMemberAttentionEvents(myActiveTicketIds, userId),
        loadMemberWeeklyCapacity(userId, user.weeklyCapacity),
        loadProfileLoggedMinutesForRange(userId, weekStart, weekEnd),
      ]);
      if (cancelled) return;

      if (timeResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(timeResult.message);
        return;
      }
      if (attentionResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(attentionResult.message);
        return;
      }
      if (capacityResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(capacityResult.message);
        return;
      }
      if (weekMinutesResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(weekMinutesResult.message);
        return;
      }

      setTickets(ticketsResult.tickets);
      setProjects(ticketsResult.projects);
      setTodayEntries(timeResult.entries);
      setAttentionEvents(attentionResult.events);
      setWeeklyCapacity(capacityResult.weeklyCapacity);
      setWeekLoggedMinutes(weekMinutesResult.totalMinutes);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, userId, requestId, user.weeklyCapacity]);

  const ticketsById = useMemo(() => new Map(tickets.map((t) => [t.id, t])), [tickets]);
  const projectsBySlug = useMemo(() => new Map(projects.map((p) => [p.slug, p])), [projects]);

  const activeWork = useMemo(
    () =>
      userId
        ? tickets.filter((t) => t.assigneeProfileId === userId && t.status !== "done").sort((a, b) => compareWork(a, b, todayISO))
        : [],
    [tickets, userId, todayISO]
  );

  const recommended = activeWork[0] ?? null;

  const dueTodayCount = useMemo(
    () => activeWork.filter((t) => t.dueDate && parseDisplayDate(t.dueDate) === todayISO).length,
    [activeWork, todayISO]
  );

  const loggedTodayMinutes = useMemo(() => todayEntries.reduce((sum, e) => sum + e.minutes, 0), [todayEntries]);
  const loggedTodayHours = round1(loggedTodayMinutes / 60);

  const weekLoggedHours = round1(weekLoggedMinutes / 60);
  const remainingThisWeekHours = Math.max(round1(weeklyCapacity - weekLoggedHours), 0);
  const weekProgressPct = weeklyCapacity > 0 ? Math.min(100, Math.round((weekLoggedHours / weeklyCapacity) * 100)) : 0;

  const loggedTodayByProject = useMemo(() => {
    const bySlug = new Map<string, number>();
    for (const entry of todayEntries) {
      const ticket = ticketsById.get(entry.ticketId);
      if (!ticket) continue;
      bySlug.set(ticket.projectSlug, (bySlug.get(ticket.projectSlug) ?? 0) + entry.minutes);
    }
    return Array.from(bySlug.entries())
      .map(([slug, minutes]) => ({
        slug,
        name: projectsBySlug.get(slug)?.name ?? slug,
        status: projectsBySlug.get(slug)?.status,
        hours: round1(minutes / 60),
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [todayEntries, ticketsById, projectsBySlug]);

  const upcoming = useMemo(
    () =>
      activeWork
        .filter((t) => isFuture(t.dueDate, todayISO))
        .sort((a, b) => dueSortValue(a.dueDate) - dueSortValue(b.dueDate)),
    [activeWork, todayISO]
  );

  const attentionItems = useMemo(() => attentionEvents.map(attentionItemFromEvent), [attentionEvents]);

  function openTicket(id: string) {
    const ticket = ticketsById.get(id);
    if (ticket) setPreview(ticket);
  }

  if (loadState === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 pb-16">
        <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading dashboard…
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 pb-16">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load dashboard</h3>
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 pb-16">

      {/* ── Section 1: Today ─────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 p-5 shadow-sm shadow-slate-200/40 dark:shadow-black/20 mb-5">
        <div className="flex items-baseline gap-2 mb-4">
          <h1 className="text-[15px] font-semibold text-slate-800 dark:text-zinc-100 tracking-tight leading-none">
            Good morning, {user.name.split(" ")[0]} 👋
          </h1>
          <span className="text-slate-300 dark:text-zinc-700" aria-hidden="true">·</span>
          <p className="text-xs text-slate-400 dark:text-zinc-500">{formatFullDate(todayISO)}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <HeroStat label="Assigned Tickets" value={activeWork.length} />
          <HeroStat label="Weekly Capacity" value={`${weeklyCapacity}h`} />
          <HeroStat label="Logged Today" value={`${loggedTodayHours}h`} />
          <HeroStat label="Due Today" value={dueTodayCount} danger={dueTodayCount > 0} />
        </div>
      </section>

      {/* ── Section 2: Recommended Next (hero) ──────────────────────────────── */}
      <section className={`${HERO_CARD_CLASS} p-6 sm:p-7 mb-5`}>
        <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${HERO_LABEL_CLASS}`}>
          Recommended Next
        </p>

        {recommended ? (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-2.5">
                <StatusBadge status={recommended.status} />
                <PriorityBadge priority={recommended.priority} />
              </div>
              <div className="mb-1">
                <ProjectBadge
                  name={projectsBySlug.get(recommended.projectSlug)?.name ?? recommended.projectSlug}
                  status={projectsBySlug.get(recommended.projectSlug)?.status}
                />
              </div>
              <p className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 mb-1 leading-none">
                <TicketTypeIcon type={recommended.type} />
                {getTicketDisplayKey(recommended)}
              </p>
              <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50 leading-snug">
                {recommended.title}
              </h2>
              <div className="flex items-center gap-4 mt-3 text-sm text-slate-600 dark:text-zinc-400">
                {recommended.hours !== undefined && (
                  <span className="font-medium">{recommended.hours}h remaining</span>
                )}
                {recommended.dueDate && (
                  <span className={isUrgentDue(recommended.dueDate, todayISO) ? "font-semibold text-red-600 dark:text-red-400" : "font-medium"}>
                    Due {recommended.dueDate}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPreview(recommended)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm shadow-brand-500/30 flex-shrink-0"
            >
              Open Ticket
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-zinc-400">
            <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M5 12l5 5L20 7" />
            </svg>
            Nothing assigned right now — check with your Project Lead for what&apos;s next.
          </div>
        )}
      </section>

      {/* ── Two-column main content ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">

        {/* Left: My Active Work + Notifications */}
        <div className="space-y-5 min-w-0">

          {/* Section 3: My Active Work — the main section, spanning every
              project the member is staffed on. */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                My Active Work
              </h2>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
                {activeWork.length}
              </span>
            </div>
            {activeWork.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">You&apos;re all clear — no active tickets.</p>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                {activeWork.map((ticket) => (
                  <TicketListRow
                    key={ticket.id}
                    ticket={ticket}
                    projectBadge={
                      <ProjectBadge
                        name={projectsBySlug.get(ticket.projectSlug)?.name ?? ticket.projectSlug}
                        status={projectsBySlug.get(ticket.projectSlug)?.status}
                      />
                    }
                    onTicketClick={setPreview}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Section 5: Needs Your Attention */}
          <Card title="Needs Your Attention" count={attentionItems.length}>
            {attentionItems.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing needs your attention right now.</p>
            ) : (
              <div className="space-y-0.5">
                {attentionItems.map((item) => (
                  <AttentionRow
                    key={item.id}
                    item={item}
                    ticket={item.ticketId ? ticketsById.get(item.ticketId) : undefined}
                    onOpen={openTicket}
                  />
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* Right: Time Today + Upcoming Work */}
        <div className="space-y-5">

          {/* Section 4: Time Today — summary first, project breakdown below. */}
          <Card title="Time Today">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">Logged Today</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">{loggedTodayHours}h</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">Weekly Capacity</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums leading-none">{weeklyCapacity}h</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">Remaining This Week</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums leading-none">
                  {remainingThisWeekHours}h
                </p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${weekProgressPct}%` }}
              />
            </div>
            <div className="h-px bg-slate-100 dark:bg-zinc-800 my-3" />
            <div className="space-y-1.5">
              {loggedTodayByProject.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-zinc-500 py-1">No time logged yet today.</p>
              ) : (
                loggedTodayByProject.map((p) => (
                  <div key={p.slug} className="flex items-center justify-between gap-2">
                    <ProjectBadge name={p.name} status={p.status} />
                    <span className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 tabular-nums flex-shrink-0">{p.hours}h</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Section 6: Upcoming Work — every project, sorted by due date only. */}
          <Card title="Upcoming Work">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing else on the horizon.</p>
            ) : (
              <div className="space-y-1">
                {upcoming.map((ticket) => (
                  <ActiveTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    projectBadge={
                      <ProjectBadge
                        name={projectsBySlug.get(ticket.projectSlug)?.name ?? ticket.projectSlug}
                        status={projectsBySlug.get(ticket.projectSlug)?.status}
                      />
                    }
                    onOpen={setPreview}
                  />
                ))}
              </div>
            )}
          </Card>

        </div>
      </div>

      {/* ── Ticket preview panel ────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={preview.projectSlug}
          onClose={() => setPreview(null)}
        />
      )}

    </div>
  );
}
