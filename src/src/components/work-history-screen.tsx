"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { loadProjectTeam } from "@/lib/projects";
import {
  loadProjectMemberWorkHistorySummary,
  loadProjectMemberWorkHistoryPage,
} from "@/lib/tickets";
import type { ProjectMemberWorkHistorySummary, ProjectMemberWorkHistoryEntry } from "@/lib/tickets";
import { StatusBadge as TicketStatusBadge, PriorityBadge } from "@/components/tickets/ticket-ui";
import { FALLBACK_AVATAR } from "@/lib/current-user";

// Real replacement for the "View Work History" modal (member-profile-modal.tsx,
// now removed) — the same "which tickets has this person worked on in this
// project" question, but as its own page so a history that grows into the
// hundreds/thousands of tickets is paginated server-side instead of loaded
// whole into a modal. See src/lib/tickets.ts's loadProjectMemberWorkHistorySummary/
// loadProjectMemberWorkHistoryPage for the actual data — this screen only
// renders it and manages the ?page= URL param.

const PAGE_SIZE = 20;

function readPageParam(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function WorkHistoryBreadcrumb({ slug, userId }: { slug: string; userId: string }) {
  const { projects } = useOrganizationProjects();
  const projectName = projects.find((p) => p.slug === slug)?.name ?? slug;
  const { organization, isDevFallback } = useCurrentUser();
  const [memberName, setMemberName] = useState<string | null>(null);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;
    loadProjectTeam(organization.id, slug).then((result) => {
      if (cancelled) return;
      if (result.status === "ready") {
        setMemberName(result.members.find((m) => m.id === userId)?.name ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [organization, isDevFallback, slug, userId]);

  return (
    <>
      <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
        Projects
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <Link
        href={`/projects/${slug}`}
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        {projectName}
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <Link
        href={`/projects/${slug}/team`}
        className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        Team
      </Link>
      <span className="text-slate-300 dark:text-zinc-700">/</span>
      <span className="text-slate-800 font-medium dark:text-zinc-200">
        {memberName ? `${memberName} · Work History` : "Work History"}
      </span>
    </>
  );
}

export function WorkHistoryScreen({ slug, userId }: { slug: string; userId: string }) {
  const { organization, isDevFallback } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPage = readPageParam(searchParams.get("page"));

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [member, setMember] = useState<{ name: string; avatar: string } | null>(null);
  const [summary, setSummary] = useState<ProjectMemberWorkHistorySummary>({
    ticketCount: 0,
    totalHours: 0,
    lastActivityLabel: null,
  });
  const [entries, setEntries] = useState<ProjectMemberWorkHistoryEntry[]>([]);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;

    Promise.all([
      loadProjectTeam(organization.id, slug),
      loadProjectMemberWorkHistorySummary(organization.id, slug, userId),
    ]).then(([teamResult, summaryResult]) => {
      if (cancelled) return;

      if (teamResult.status === "ready") {
        const found = teamResult.members.find((m) => m.id === userId);
        setMember(found ? { name: found.name, avatar: found.avatar } : null);
      }

      if (summaryResult.status === "error") {
        setStatus("error");
        setErrorMessage(summaryResult.message);
        return;
      }
      setSummary(summaryResult.summary);

      const totalPages = Math.max(1, Math.ceil(summaryResult.summary.ticketCount / PAGE_SIZE));
      if (requestedPage > totalPages) {
        // Never render a page past the end as if it were legitimately
        // empty — resolve to the last real page instead (or page 1, which
        // is also the last page when there's no history at all).
        router.replace(`/projects/${slug}/team/${userId}/work-history?page=${totalPages}`);
        return;
      }

      loadProjectMemberWorkHistoryPage(organization.id, slug, userId, requestedPage, PAGE_SIZE).then((pageResult) => {
        if (cancelled) return;
        if (pageResult.status === "error") {
          setStatus("error");
          setErrorMessage(pageResult.message);
          return;
        }
        setEntries(pageResult.entries);
        setStatus("ready");
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, isDevFallback, slug, userId, requestedPage]);

  const totalPages = Math.max(1, Math.ceil(summary.ticketCount / PAGE_SIZE));

  function goToPage(page: number) {
    router.push(`/projects/${slug}/team/${userId}/work-history?page=${page}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={member?.avatar ?? FALLBACK_AVATAR}
          alt={member?.name ?? "Team member"}
          className="w-10 h-10 rounded-full flex-shrink-0"
        />
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Work History</h1>
          <p className="text-sm text-slate-500 mt-0.5 dark:text-zinc-400">
            {member?.name ?? "Team member"} · which tickets they&apos;ve worked on in this project.
          </p>
        </div>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading work history…
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load work history</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {errorMessage ?? "Something went wrong."}
          </p>
        </div>
      )}

      {status === "ready" && (
        <>
          <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
            <div className="flex-1 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Tickets Worked On</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{summary.ticketCount}</p>
            </div>
            <div className="flex-1 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Hours Logged</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{summary.totalHours}h</p>
            </div>
            <div className="flex-1 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Last Activity</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">
                {summary.lastActivityLabel ?? "—"}
              </p>
            </div>
          </div>

          <div className="mt-6">
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No work history yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900">
                {entries.map((entry) => (
                  <Link
                    key={entry.ticketId}
                    href={`/projects/${slug}/tickets/${entry.ticketKey}`}
                    className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 flex-shrink-0 w-16">
                        {entry.ticketKey}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-zinc-300 truncate">
                        {entry.title}
                      </span>
                      <PriorityBadge priority={entry.priority} />
                      <TicketStatusBadge status={entry.status} />
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 pl-[4.75rem]">
                      {entry.hours}h logged · {entry.activityCount} {entry.activityCount === 1 ? "activity" : "activities"} · Last activity {entry.lastActivityLabel}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {summary.ticketCount > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goToPage(requestedPage - 1)}
                disabled={requestedPage <= 1}
                className="text-sm font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 rounded-lg px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                Previous
              </button>
              <p className="text-[13px] text-slate-400 dark:text-zinc-500">
                Page {requestedPage} of {totalPages} · {summary.ticketCount} ticket{summary.ticketCount === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={() => goToPage(requestedPage + 1)}
                disabled={requestedPage >= totalPages}
                className="text-sm font-medium text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 rounded-lg px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
