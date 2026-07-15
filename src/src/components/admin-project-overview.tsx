"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import { TicketTypeIcon, getTodayISO, parseDisplayDate } from "@/components/tickets/ticket-ui";
import { MemberTrigger, useMemberProfile } from "@/components/member-profile";
import { useCurrentUser } from "@/components/current-user-provider";
import { canManage } from "@/lib/current-user";
import { ProjectCategoryBadge, StatusBadge } from "@/components/status-badge";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { presetTicketsFilter } from "@/components/tickets-screen";
import { loadProjectDetail, loadProjectTeam } from "@/lib/projects";
import type { ProjectDetail, ProjectTeamMember } from "@/lib/projects";
import {
  loadProjectTickets,
  loadOrganizationActivity,
  loadOrganizationLoggedTimeForRange,
} from "@/lib/tickets";
import type { OrganizationActivityEvent, OrganizationTimeEntry } from "@/lib/tickets";
import {
  buildHoursByPersonRows,
  buildProjectHealthRows,
  buildDeliveryKpiSummary,
  buildDeliveryStatusItems,
} from "@/components/reports-screen";
import type { PersonRow, ProjectRow as DeliveryProjectRow } from "@/components/reports-screen";

// Project Activity card is capped at this many items (never paginated in
// place) — "View all activity →" links to the dedicated, fully paginated
// /projects/[slug]/activity page (project-activity-history-screen.tsx) for
// the complete real history.
const PROJECT_ACTIVITY_PREVIEW_LIMIT = 10;

// The Admin Project Overview is an executive read of one project — health,
// risk, and overall progress — not a personal work queue. It intentionally
// carries no financial/billing figures (those live in Reports → Finance).
// Every KPI, the Alert Banner, and Project Health below are computed from
// real tickets/team/time-entries scoped to this one project — Alert Banner
// and Project Health explicitly reuse Delivery Reports' own real
// buildDeliveryStatusItems/buildProjectHealthRows (imported above, not
// duplicated) so this page can never disagree with Reports about what
// counts as "at risk."

interface ActivityEntry {
  id: string;
  avatar: string;
  name: string;
  /** The action fragment only — the ticket title never appears here; when
   *  `ticket` is set it renders on its own clickable line instead. */
  message: ReactNode;
  time: string;
  ticket?: Ticket;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

// ── Project Health card ──────────────────────────────────────────────────────
// Reuses the app's existing dot + colored-label status vocabulary (see
// StatusBadge/HealthBadge in status-badge.tsx) rather than inventing a new
// one — "On Track" / "Needs Attention" / "At Risk" instead of a numeric score.

type HealthStatus = "on-track" | "needs-attention" | "at-risk";

const HEALTH_STATUS_META: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  "on-track": {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "On Track",
  },
  "needs-attention": {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    label: "Needs Attention",
  },
  "at-risk": {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    label: "At Risk",
  },
};

interface HealthRow {
  id: string;
  label: string;
  status: HealthStatus;
  note: string;
}

const HEALTH_ROW_CLASS =
  "block w-full text-left py-2.5 -mx-2 px-2 rounded-lg border-b border-slate-100 dark:border-zinc-800/70 last:border-0 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50";

function HealthRowContent({ row }: { row: HealthRow }) {
  const meta = HEALTH_STATUS_META[row.status];
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">{row.label}</p>
      <p className={`inline-flex items-center gap-1.5 text-[13px] font-semibold mt-1 ${meta.text}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
        {meta.label}
      </p>
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{row.note}</p>
    </>
  );
}

// Each health row drills into the existing screen/modal that explains it,
// instead of just stating a status — Schedule is a real navigation (renders
// as a <Link>, matching the attention banner above), while Capacity opens in
// place via the shared member-profile mechanism every other "click a
// person" affordance already uses. Scope has no real signal anywhere in
// this schema (no scope-change tracking exists), so it stays a plain,
// non-fabricated navigation rather than a fake "no changes" claim.
function ProjectHealthRow({
  row,
  slug,
  onOpenMember,
  canOpenMember,
}: {
  row: HealthRow;
  slug: string;
  onOpenMember: () => void;
  canOpenMember: boolean;
}) {
  if (row.id === "schedule") {
    return (
      <Link
        href={`/projects/${slug}/tickets`}
        onClick={() => presetTicketsFilter(slug, ["Blocked"])}
        className={HEALTH_ROW_CLASS}
      >
        <HealthRowContent row={row} />
      </Link>
    );
  }

  if (row.id === "capacity" && canOpenMember) {
    return (
      <button type="button" onClick={onOpenMember} className={HEALTH_ROW_CLASS}>
        <HealthRowContent row={row} />
      </button>
    );
  }

  // Capacity with no real over-capacity member, Scope, and Risks (no
  // dedicated overdue-tickets view exists) all fall back to the project's
  // own Tickets page rather than inventing a view that doesn't exist yet.
  return (
    <Link href={`/projects/${slug}/tickets`} className={HEALTH_ROW_CLASS}>
      <HealthRowContent row={row} />
    </Link>
  );
}

// ── Active Work: grouped by status ───────────────────────────────────────────

function TicketRow({
  ticket,
  projectCode,
  slug,
  onOpen,
}: {
  ticket: Ticket;
  projectCode: string;
  slug: string;
  onOpen: (t: Ticket) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className="w-full py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 -mx-2 px-2 rounded-lg transition-colors"
    >
      <span className="min-w-0 flex items-baseline gap-1.5">
        <TicketTypeIcon type={ticket.type} />
        <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
          {projectCode}-{ticket.ticketNumber}
        </span>
        <span className="text-sm text-slate-800 dark:text-zinc-200 truncate">{ticket.title}</span>
      </span>
      <MemberTrigger
        name={ticket.assignee.name}
        avatar={ticket.assignee.avatar}
        projectSlug={slug}
        nested
        className="flex-shrink-0 rounded-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ticket.assignee.avatar}
          alt={ticket.assignee.name}
          className="w-6 h-6 rounded-full flex-shrink-0"
        />
      </MemberTrigger>
    </button>
  );
}

function TicketGroup({
  label,
  labelClass,
  tickets,
  projectCode,
  slug,
  onOpen,
}: {
  label: string;
  labelClass: string;
  tickets: Ticket[];
  projectCode: string;
  slug: string;
  onOpen: (t: Ticket) => void;
}) {
  if (tickets.length === 0) return null;
  return (
    <div className="mt-4 first:mt-0">
      <p className={`text-xs font-medium mb-1.5 ${labelClass}`}>{label} ({tickets.length})</p>
      <div className="divide-y divide-slate-100 dark:divide-zinc-800">
        {tickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} projectCode={projectCode} slug={slug} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// Converts a real ticket_activity event (loadOrganizationActivity — the same
// real source of truth the Admin/Project Lead Dashboards' own Recent
// Activity widgets already use) into this section's own message shape.
// Only the 5 event types loadOrganizationActivity already categorizes
// (blocked/completed/hours/assigned/priority) ever appear here — comments,
// attachments, and time entries are genuinely real too, just not one of
// this widget's existing categories, same precedent as the dashboards.
function activityEventToEntry(event: OrganizationActivityEvent, ticket: Ticket | undefined): ActivityEntry {
  const base = {
    id: event.id,
    avatar: event.actorAvatar,
    name: event.actorName ?? "Someone",
    time: event.time,
    ticket,
  };

  if (event.type === "blocked") {
    return { ...base, message: <>marked <span className="text-red-600 dark:text-red-400 font-medium">Blocked</span></> };
  }
  if (event.type === "completed") {
    return { ...base, message: <>moved to <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span></> };
  }
  if (event.type === "hours") {
    return {
      ...base,
      message: <>updated the estimate to <span className="font-medium">{event.newHours}h</span> on</>,
    };
  }
  if (event.type === "assigned") {
    return { ...base, message: <>reassigned <span className="font-medium">{event.newAssigneeName}</span> to</> };
  }
  return {
    ...base,
    message: (
      <>
        {event.priorityRaised ? "raised" : "lowered"} priority to{" "}
        <span className="font-medium">{event.newPriorityLabel}</span> on
      </>
    ),
  };
}

// Project Header's description — clamps to 2 lines and only shows a
// View more/less toggle when the text actually overflows that clamp
// (measured via scrollHeight vs. clientHeight, not a character count, so it
// stays correct across font sizes/widths). Re-measured on resize since the
// same text can wrap to more or fewer lines at different viewport widths.
function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;

    function measure() {
      if (el) setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded]);

  return (
    <div className="max-w-xl">
      <p
        ref={ref}
        className={`text-sm text-slate-500 mt-1 dark:text-zinc-400 ${expanded ? "" : "line-clamp-2"}`}
      >
        {text}
      </p>
      {isTruncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs font-medium text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
        >
          {expanded ? "View less" : "View more"}
        </button>
      )}
    </div>
  );
}

export function AdminProjectOverview({ slug = "mobile-banking-app" }: { slug?: string }) {
  const { user, organization, isDevFallback } = useCurrentUser();
  const canManageProject = canManage(user.role);
  const { openMemberProfile } = useMemberProfile();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>([]);
  const [activityEvents, setActivityEvents] = useState<OrganizationActivityEvent[]>([]);
  const [timeEntries, setTimeEntries] = useState<OrganizationTimeEntry[]>([]);
  const [requestId, setRequestId] = useState(0);

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [preview, setPreview] = useState<Ticket | null>(null);

  const runFetch = useCallback(() => setRequestId((id) => id + 1), []);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;

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

      const [teamResult, activityResult, timeResult] = await Promise.all([
        loadProjectTeam(organization.id, slug),
        // One more than the card actually shows (PROJECT_ACTIVITY_PREVIEW_LIMIT)
        // — the only way to know whether an 11th+ real event exists, so
        // "View all activity →" only shows when there's real more history
        // to see, without paginating inside this card.
        loadOrganizationActivity(ticketIds, PROJECT_ACTIVITY_PREVIEW_LIMIT + 1),
        loadOrganizationLoggedTimeForRange(ticketIds, projectResult.project.createdAtISO.slice(0, 10), getTodayISO()),
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
      if (timeResult.status === "error") {
        setLoadState("error");
        setLoadErrorMessage(timeResult.message);
        return;
      }

      setProject(projectResult.project);
      setTickets(projectTickets);
      setTeamMembers(teamResult.members);
      setActivityEvents(activityResult.events);
      setTimeEntries(timeResult.entries);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [organization, isDevFallback, slug, requestId]);

  function handleTicketCreated() {
    setShowNewTicket(false);
    runFetch();
  }

  function handlePreviewDuplicate(_ticket: Ticket) {
    setShowNewTicket(false);
  }

  if (loadState === "loading") {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading project…
        </div>
      </div>
    );
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

  const projectCode = project.projectCode;
  const todayISO = getTodayISO();
  const monthPrefix = todayISO.slice(0, 7);

  const openTickets = tickets.filter((t) => t.status !== "done");
  const blocked = tickets.filter((t) => t.status === "blocked");
  const inProgress = tickets.filter((t) => t.status === "in-progress");
  const inReview = tickets.filter((t) => t.status === "review");
  const doneTickets = tickets.filter((t) => t.status === "done");
  // No completed_at column exists — same real signal the Admin Dashboard and
  // Delivery Reports' own KPI already use: a "done" ticket's own updated_at
  // falling in the real current calendar month.
  const closedThisMonth = doneTickets.filter((t) => t.updatedAtISO?.slice(0, 7) === monthPrefix).length;
  // Ticket-count completion, not the hours-based "Hours Burn" Delivery
  // Reports shows — same formula the Admin Dashboard's own "Projects at
  // Risk" widget and the Project Lead Dashboard's "Delivery Progress" KPI
  // already use (completed/total over every ticket, guarded against 0).
  const progressPct = tickets.length > 0 ? Math.round((doneTickets.length / tickets.length) * 100) : 0;

  const ticketsById = new Map(tickets.map((t) => [t.id, t]));
  const overdueTickets = tickets.filter(
    (t) => t.status !== "done" && t.dueDate && parseDisplayDate(t.dueDate) < todayISO
  );
  const overdueOpenCount = overdueTickets.length;

  const team: TeamMember[] = teamMembers.map((m) => ({ id: m.id, name: m.name, role: m.title, avatar: m.avatar }));

  // ── Alert Banner + Project Health: both reuse Delivery Reports' own real
  //    functions (imported above), scoped to this one project's data —
  //    never a second, parallel health calculation.
  const capacities = teamMembers.map((m) => ({ profileId: m.id, weeklyCapacity: m.weeklyCapacity }));
  const membersForRows = teamMembers.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar }));
  const personRows: PersonRow[] = buildHoursByPersonRows(tickets, membersForRows, capacities, timeEntries);
  const kpiSummary = buildDeliveryKpiSummary(tickets, [{ status: project.status }], timeEntries, todayISO);
  const statusItems = buildDeliveryStatusItems(personRows, kpiSummary);
  const alertItems = statusItems.filter((item) => item.level !== "ok");

  // Alert Banner action target — covers EVERY actionable alert type
  // currently shown (never just the first/primary one), so a ticket is
  // never picked arbitrarily when more than one alert or ticket is present.
  // "overloaded" (and the "completed"/"none" ok-level entries, already
  // excluded from alertItems above) has no ticket association in this
  // schema, so it never contributes here.
  const actionableAlertTypes = alertItems
    .map((item) => item.id)
    .filter((id): id is "overdue" | "blocked" => id === "overdue" || id === "blocked");
  const ticketsByAlertType: Record<"overdue" | "blocked", Ticket[]> = { overdue: overdueTickets, blocked };

  // De-duplicated union — a ticket that's simultaneously overdue and
  // blocked (both alert types shown at once) must still only ever count
  // once, never navigate/list it twice.
  const actionableTicketsById = new Map<string, Ticket>();
  for (const type of actionableAlertTypes) {
    for (const t of ticketsByAlertType[type]) actionableTicketsById.set(t.id, t);
  }
  const actionableTickets = Array.from(actionableTicketsById.values());

  // Exactly one alert type, resolving to exactly one ticket → straight to
  // that ticket. Every other actionable case (multiple alert types, or one
  // type with more than one ticket) hands off to the Tickets page with
  // every actionable type carried in the URL's own `alerts` query param
  // (tickets-screen.tsx ORs across them) — a real query-state handoff, so
  // it survives refresh/back-forward the same way Work History's `?page=`
  // already does, unlike the sessionStorage-based presetTicketsFilter used
  // elsewhere on this page (still used as-is for Project Health's Schedule
  // row below, unrelated to this fix).
  let alertActionHref: string | null = null;
  if (actionableAlertTypes.length === 1 && actionableTickets.length === 1) {
    alertActionHref = `/projects/${slug}/tickets/${getTicketDisplayKey(actionableTickets[0])}`;
  } else if (actionableTickets.length > 0) {
    alertActionHref = `/projects/${slug}/tickets?alerts=${actionableAlertTypes.join(",")}`;
  }

  const healthRows: DeliveryProjectRow[] = buildProjectHealthRows(
    [{ slug: project.slug, name: project.name, projectCode: project.projectCode }],
    tickets,
    timeEntries,
    todayISO
  );
  const healthRow = healthRows[0];

  const overCapacityMember = [...personRows].sort((a, b) => b.capacity - a.capacity).find((p) => p.capacity > 100);
  const overCapacityTeamMember = overCapacityMember
    ? teamMembers.find((m) => m.id === overCapacityMember.id)
    : undefined;

  const scheduleStatus: HealthStatus =
    healthRow?.risk === "blocked" ? "at-risk" : healthRow?.risk === "at-risk" ? "needs-attention" : "on-track";
  const scheduleNote =
    blocked.length > 0
      ? `${blocked.length} ticket${blocked.length === 1 ? "" : "s"} blocked`
      : overdueOpenCount > 0
      ? `${overdueOpenCount} ticket${overdueOpenCount === 1 ? "" : "s"} overdue`
      : "No blocked or overdue tickets";

  const projectHealth: HealthRow[] = [
    { id: "schedule", label: "Schedule", status: scheduleStatus, note: scheduleNote },
    {
      id: "capacity",
      label: "Capacity",
      status: overCapacityTeamMember ? "needs-attention" : "on-track",
      note: overCapacityTeamMember ? `${overCapacityTeamMember.name} is over capacity` : "No capacity issues",
    },
    { id: "scope", label: "Scope", status: "on-track", note: "No scope tracking available yet" },
    {
      id: "risks",
      label: "Risks",
      status: overdueOpenCount > 0 ? "at-risk" : "on-track",
      note: overdueOpenCount > 0 ? `${overdueOpenCount} overdue ticket${overdueOpenCount === 1 ? "" : "s"}` : "No overdue tickets",
    },
  ];

  const activity: ActivityEntry[] = activityEvents.map((event) =>
    activityEventToEntry(event, ticketsById.get(event.ticketId))
  );
  // Card shows at most PROJECT_ACTIVITY_PREVIEW_LIMIT items — the 11th (if
  // fetched) only exists to prove there's real more history, never rendered
  // here itself.
  const hasMoreActivity = activity.length > PROJECT_ACTIVITY_PREVIEW_LIMIT;
  const visibleActivity = activity.slice(0, PROJECT_ACTIVITY_PREVIEW_LIMIT);

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
        {canManageProject && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowNewTicket(true)}
              className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
            >
              + New Ticket
            </button>
          </div>
        )}
      </div>

      {/* ===== Slim attention line (not a hero) — real Health Alerts, same
          source of truth as Delivery Reports; hidden when there's nothing
          real to flag. The action link itself is only shown when there's a
          real ticket (or tickets) it can navigate to — see alertActionHref
          above ===== */}
      {alertItems.length > 0 && (alertActionHref ? (
        <Link
          href={alertActionHref}
          className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 hover:bg-amber-100/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <p className="flex-1">
            {alertItems.map((item, i) => (
              <span key={item.id}>
                {i > 0 && <span className="mx-1.5 text-amber-400 dark:text-amber-600" aria-hidden="true">·</span>}
                {item.text}
              </span>
            ))}
          </p>
          <span className="text-xs font-medium text-amber-700 flex-shrink-0 dark:text-amber-400">
            Review →
          </span>
        </Link>
      ) : (
        <div className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
          <p className="flex-1">
            {alertItems.map((item, i) => (
              <span key={item.id}>
                {i > 0 && <span className="mx-1.5 text-amber-400 dark:text-amber-600" aria-hidden="true">·</span>}
                {item.text}
              </span>
            ))}
          </p>
        </div>
      ))}

      {/* ===== KPI strip ===== */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Open Tickets</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{openTickets.length}</p>
        </div>
        <div className="flex-1 px-5 py-4 bg-brand-50/30 dark:bg-brand-950/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">Progress</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300 mt-1 leading-none">
            {progressPct}
            <span className="text-base font-medium text-brand-400 dark:text-brand-500 ml-0.5">%</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-brand-100/60 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Blocked</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1 leading-none">{blocked.length}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Closed This Month</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 leading-none">
            {closedThisMonth}
          </p>
        </div>
      </div>

      {/* ===== Active Work + Team, Recent Activity + Project Health ===== */}
      <div className="mt-10 grid grid-cols-3 gap-8 items-start">
        {/* Left column: primary content */}
        <div className="col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Active Work</h2>
              <Link
                href={`/projects/${slug}/tickets`}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                View all {openTickets.length} tickets →
              </Link>
            </div>

            <TicketGroup
              label="Blocked"
              labelClass="text-red-500 dark:text-red-400"
              tickets={blocked}
              projectCode={projectCode}
              slug={slug}
              onOpen={setPreview}
            />
            <TicketGroup
              label="In Progress"
              labelClass="text-amber-500 dark:text-amber-400"
              tickets={inProgress}
              projectCode={projectCode}
              slug={slug}
              onOpen={setPreview}
            />
            <TicketGroup
              label="In Review"
              labelClass="text-violet-500 dark:text-violet-400"
              tickets={inReview}
              projectCode={projectCode}
              slug={slug}
              onOpen={setPreview}
            />

            {blocked.length === 0 && inProgress.length === 0 && inReview.length === 0 && (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing blocked, in progress, or in review right now.</p>
            )}

            <p className="text-xs text-slate-400 mt-4 dark:text-zinc-500">{openTickets.length} open · {closedThisMonth} closed this month</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 dark:text-zinc-400">Project Activity</h2>
            {visibleActivity.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No recent activity on this project yet.</p>
            ) : (
              <ul className="space-y-4">
                {visibleActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <MemberTrigger name={entry.name} avatar={entry.avatar} projectSlug={slug} className="flex-shrink-0 mt-0.5 rounded-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={entry.avatar} alt={entry.name} className="w-6 h-6 rounded-full" />
                    </MemberTrigger>
                    <div className="text-sm leading-snug min-w-0 flex-1">
                      <p className="text-slate-700 dark:text-zinc-300">
                        <MemberTrigger name={entry.name} avatar={entry.avatar} projectSlug={slug} className="font-medium text-slate-900 dark:text-zinc-100 hover:underline">
                          {entry.name}
                        </MemberTrigger> {entry.message}
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
            {hasMoreActivity && (
              <Link
                href={`/projects/${slug}/activity`}
                className="mt-4 inline-block text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                View all activity →
              </Link>
            )}
          </section>
        </div>

        {/* Right column: secondary content, kept above the fold */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Team</h2>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{team.length} active members</p>
              </div>
              {canManageProject && (
                <Link
                  href={`/projects/${slug}/team`}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 flex-shrink-0"
                >
                  View all →
                </Link>
              )}
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
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1 dark:text-zinc-400">Project Health</h2>
            <div>
              {projectHealth.map((row) => (
                <ProjectHealthRow
                  key={row.id}
                  row={row}
                  slug={slug}
                  canOpenMember={Boolean(overCapacityTeamMember)}
                  onOpenMember={() =>
                    overCapacityTeamMember &&
                    openMemberProfile({
                      name: overCapacityTeamMember.name,
                      avatar: overCapacityTeamMember.avatar,
                      role: overCapacityTeamMember.title,
                      projectSlug: slug,
                    })
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {showNewTicket && (
        <NewTicketModal
          slug={slug}
          tickets={tickets}
          members={[]}
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
          onPreviewDuplicate={handlePreviewDuplicate}
        />
      )}

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
