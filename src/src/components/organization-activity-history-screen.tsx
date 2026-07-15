"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { loadOrganizationActivityPage } from "@/lib/tickets";
import type { OrganizationActivityEntry } from "@/lib/tickets";

// The full org-wide Activity History behind Dashboard's "View all activity →"
// action (dashboard-screen.tsx) — the org-wide sibling of
// ProjectActivityHistoryScreen (project-activity-history-screen.tsx), which
// this screen mirrors field-for-field: same real, comprehensive event
// coverage (loadOrganizationActivityPage, not the Dashboard's own narrower
// curated feed), same "?page= in the URL, 20/page, Previous/Next" real
// pagination shape. The one addition is a per-entry project name, since
// entries here can come from any project rather than one already-known one.

const PAGE_SIZE = 20;

function readPageParam(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function OrganizationActivityHistoryScreen() {
  const { organization, isDevFallback } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPage = readPageParam(searchParams.get("page"));

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<OrganizationActivityEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (isDevFallback || !organization) return;
    let cancelled = false;

    loadOrganizationActivityPage(organization.id, requestedPage, PAGE_SIZE).then((result) => {
      if (cancelled) return;
      if (result.status === "error") {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }

      const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
      if (requestedPage > totalPages) {
        // Never render a page past the end as if it were legitimately
        // empty — resolve to the last real page instead (or page 1, which
        // is also the last page when there's no activity at all).
        router.replace(`/activity?page=${totalPages}`);
        return;
      }

      setEntries(result.entries);
      setTotalCount(result.totalCount);
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, isDevFallback, requestedPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function goToPage(page: number) {
    router.push(`/activity?page=${page}`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Activity</h1>
        <p className="text-sm text-slate-500 mt-0.5 dark:text-zinc-400">
          The complete real activity history across your organization.
        </p>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center text-sm text-slate-400 dark:text-zinc-500 py-20">
          Loading activity…
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load activity</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {errorMessage ?? "Something went wrong."}
          </p>
        </div>
      )}

      {status === "ready" && (
        <>
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            {entries.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">No activity yet.</p>
            ) : (
              <div className="pb-2">
                {entries.map((entry, i) => {
                  const isLast = i === entries.length - 1;
                  return (
                    <div key={entry.id} className="flex gap-3.5">
                      <div className="flex flex-col items-center w-4 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ring-white dark:ring-zinc-950" />
                        {!isLast && (
                          <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[24px]" />
                        )}
                      </div>
                      <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                        <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-snug">
                          {entry.label}
                        </p>
                        <Link
                          href={`/projects/${entry.projectSlug}/tickets/${entry.ticketKey}`}
                          className="mt-1 flex items-baseline gap-1.5 min-w-0 max-w-full text-left hover:underline"
                        >
                          <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-zinc-400 flex-shrink-0">
                            {entry.ticketKey}
                          </span>
                          <span className="text-[13px] text-slate-600 dark:text-zinc-400 truncate">
                            {entry.ticketTitle}
                          </span>
                        </Link>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">
                          {entry.projectName} · {entry.timeAgo}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {totalCount > 0 && (
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
                Page {requestedPage} of {totalPages} · {totalCount} {totalCount === 1 ? "activity" : "activities"}
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
