"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectCategory } from "@/lib/mock-projects";
import { ProjectCategoryBadge } from "@/components/status-badge";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { useCurrentUser } from "@/components/current-user-provider";
import {
  loadProjectTeam,
  loadBrowsableOrgProjects,
  loadMyProjectAccessRequests,
  requestProjectAccess,
  cancelProjectAccessRequest,
  type BrowsableOrgProject,
  type ProjectAccessRequest,
} from "@/lib/projects";
import { loadProjectTickets } from "@/lib/tickets";
import { getTodayISO, parseDisplayDate } from "@/components/tickets/ticket-ui";
import { ErrorToast } from "@/components/tickets/ticket-ui";
import { FALLBACK_AVATAR } from "@/lib/current-user";
import { Avatar } from "@/components/ui/avatar";

// A Member doesn't manage projects — they work inside them. So this page
// never shows org-wide status/priority/health or ticket-volume metrics; it
// only answers what a Member actually needs: which projects am I on, who
// leads each one, and what's mine to do there. See MemberDashboard for the
// same "no project-picking, work-first" philosophy applied to the homepage.
//
// The project list itself comes from useOrganizationProjects() — already
// real and already RLS-scoped (a Member only ever sees projects they have
// an active project_membership row on, same as everywhere else in this
// app), so no separate membership check is needed here. Lead and per-
// project ticket counts are fetched per project below.

// Monday–Sunday containing todayISO — same "This Week" convention already
// used by My Work/Member Dashboard, duplicated here as page-local glue.
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

interface MemberProjectCard {
  slug: string;
  name: string;
  description: string;
  category: ProjectCategory;
  leadName: string;
  leadAvatar: string;
  assignedCount: number;
  dueThisWeekCount: number;
}

export function MemberProjectsScreen() {
  const { organization, userId, isDevFallback } = useCurrentUser();
  const { projects } = useOrganizationProjects();

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(isDevFallback ? "ready" : "loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [cards, setCards] = useState<MemberProjectCard[]>([]);
  // "Other Projects" — active org projects this Member isn't staffed on yet,
  // plus their own pending request (if any) for each, keyed by project id so
  // each card can look itself up in one step.
  const [otherProjects, setOtherProjects] = useState<BrowsableOrgProject[]>([]);
  const [pendingRequestByProjectId, setPendingRequestByProjectId] = useState<Map<string, ProjectAccessRequest>>(
    new Map()
  );
  const [requestId, setRequestId] = useState(0);
  // Per-project-id in-flight guard for Request/Cancel, so only the one
  // button actually clicked shows a busy state — never the whole section.
  const [actionPendingProjectId, setActionPendingProjectId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runFetch = () => setRequestId((id) => id + 1);

  useEffect(() => {
    if (isDevFallback || !organization || !userId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: same "clear before the async fetch below resolves" pattern used elsewhere in this app (e.g. member-profile-modal.tsx)
    setLoadState("loading");

    (async () => {
      const todayISO = getTodayISO();
      const { start: weekStart, end: weekEnd } = getWeekRangeISO(todayISO);

      const [results, browsableResult, myRequestsResult] = await Promise.all([
        Promise.all(
          projects.map(async (project) => {
            const [teamResult, ticketsResult] = await Promise.all([
              loadProjectTeam(organization.id, project.slug),
              loadProjectTickets(organization.id, project.slug),
            ]);
            return { project, teamResult, ticketsResult };
          })
        ),
        loadBrowsableOrgProjects(organization.id),
        loadMyProjectAccessRequests(userId),
      ]);
      if (cancelled) return;

      const errorResult = results.find(
        (r) => r.teamResult.status === "error" || r.ticketsResult.status === "error"
      );
      if (errorResult) {
        const message =
          errorResult.teamResult.status === "error"
            ? errorResult.teamResult.message
            : errorResult.ticketsResult.status === "error"
            ? errorResult.ticketsResult.message
            : "Something went wrong.";
        setLoadState("error");
        setLoadErrorMessage(message);
        return;
      }

      const nextCards: MemberProjectCard[] = results.map(({ project, teamResult, ticketsResult }) => {
        const lead =
          teamResult.status === "ready" ? teamResult.members.find((m) => m.projectRole === "lead") : undefined;
        const myTickets =
          ticketsResult.status === "ready" ? ticketsResult.tickets.filter((t) => t.assigneeProfileId === userId) : [];
        const dueThisWeekCount = myTickets.filter((t) => {
          if (t.status === "done" || !t.dueDate) return false;
          const iso = parseDisplayDate(t.dueDate);
          return Boolean(iso) && iso >= weekStart && iso <= weekEnd;
        }).length;

        return {
          slug: project.slug,
          name: project.name,
          description: project.description,
          category: project.category,
          leadName: lead?.name ?? "Unassigned",
          leadAvatar: lead?.avatar ?? FALLBACK_AVATAR,
          assignedCount: myTickets.length,
          dueThisWeekCount,
        };
      });

      setCards(nextCards);
      // Best-effort: a failure loading "Other Projects" doesn't sink the
      // whole page — "My Projects" above is the primary content and
      // already has its own real error state.
      setOtherProjects(browsableResult.status === "ready" ? browsableResult.projects : []);
      setPendingRequestByProjectId(
        new Map(
          (myRequestsResult.status === "ready" ? myRequestsResult.requests : [])
            .filter((r) => r.status === "pending")
            .map((r) => [r.projectId, r])
        )
      );
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [isDevFallback, organization, userId, projects, requestId]);

  async function handleRequestAccess(project: BrowsableOrgProject) {
    if (!organization || !userId || actionPendingProjectId) return;
    setActionPendingProjectId(project.id);
    setActionError(null);
    const result = await requestProjectAccess(organization.id, project.id, project.name, userId);
    setActionPendingProjectId(null);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    runFetch();
  }

  async function handleCancelRequest(request: ProjectAccessRequest) {
    if (actionPendingProjectId) return;
    setActionPendingProjectId(request.projectId);
    setActionError(null);
    const result = await cancelProjectAccessRequest(request.id);
    setActionPendingProjectId(null);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    runFetch();
  }

  if (loadState === "loading") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading your projects…
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load your projects</h3>
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
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
      <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">My Projects</h1>
      <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
        The projects you&apos;re staffed on, and what&apos;s yours to do in each.
      </p>

      <div className="mt-6 space-y-3">
        {cards.length === 0 ? (
          <EmptyState />
        ) : (
          cards.map((card) => <MemberProjectCardRow key={card.slug} card={card} />)
        )}
      </div>

      {otherProjects.length > 0 && (
        <div className="mt-10">
          <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-50">Other Projects</h2>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
            Active projects at Techtivo you&apos;re not staffed on yet.
          </p>

          <div className="mt-4 space-y-3">
            {otherProjects.map((project) => (
              <OtherProjectCardRow
                key={project.id}
                project={project}
                pendingRequest={pendingRequestByProjectId.get(project.id) ?? null}
                busy={actionPendingProjectId === project.id}
                onRequestAccess={() => handleRequestAccess(project)}
                onCancelRequest={(request) => handleCancelRequest(request)}
              />
            ))}
          </div>
        </div>
      )}

      {actionError && <ErrorToast message={actionError} onDismiss={() => setActionError(null)} />}
    </div>
  );
}

function MemberProjectCardRow({ card }: { card: MemberProjectCard }) {
  const router = useRouter();

  function openProject() {
    router.push(`/projects/${card.slug}`);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openProject}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openProject();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 p-5 cursor-pointer outline-none hover:border-brand-300 dark:hover:border-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-50 truncate">{card.name}</h3>
            <ProjectCategoryBadge category={card.category} />
          </div>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{card.description}</p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openProject();
          }}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm shadow-brand-500/30 flex-shrink-0"
        >
          Open Project
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          {card.leadAvatar && (
            <Avatar src={card.leadAvatar} name={card.leadName} className="w-6 h-6 rounded-full flex-shrink-0" />
          )}
          <span className="text-sm text-slate-600 dark:text-zinc-300">
            <span className="text-slate-400 dark:text-zinc-500">Lead:</span> {card.leadName}
          </span>
        </div>

        <span className="text-sm text-slate-600 dark:text-zinc-300">
          <span className="font-semibold text-slate-900 dark:text-zinc-50 tabular-nums">{card.assignedCount}</span>{" "}
          ticket{card.assignedCount === 1 ? "" : "s"} assigned to you
        </span>

        {card.dueThisWeekCount > 0 && (
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {card.dueThisWeekCount} due this week
          </span>
        )}
      </div>
    </div>
  );
}

// Same card chrome as MemberProjectCardRow (border/shadow/padding/name/
// category badge/description) so "Other Projects" reads as the same
// visual system, just never clickable/navigable — this project isn't
// yours to open yet — and with a request/cancel action instead of ticket
// counts, since there's no real assignment data to show for it.
function OtherProjectCardRow({
  project,
  pendingRequest,
  busy,
  onRequestAccess,
  onCancelRequest,
}: {
  project: BrowsableOrgProject;
  pendingRequest: ProjectAccessRequest | null;
  busy: boolean;
  onRequestAccess: () => void;
  onCancelRequest: (request: ProjectAccessRequest) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-50 truncate">{project.name}</h3>
            <ProjectCategoryBadge category={project.category} />
          </div>
          {project.description && (
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{project.description}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {pendingRequest ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                Pending access
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onCancelRequest(pendingRequest)}
                className="text-[12px] font-medium text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel request
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onRequestAccess}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Request to be added to the team
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 7l4-4h6l4 4" />
          <rect x="3" y="7" width="18" height="13" rx="2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">No projects yet</h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
        You&apos;re not staffed on any projects right now — check with your Project Lead.
      </p>
    </div>
  );
}
