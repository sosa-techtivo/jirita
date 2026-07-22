"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { useRefreshOnFocusAndVisibility } from "@/components/member-profile-modal";
import { formatRelativeTime } from "@/lib/tickets";
import { FALLBACK_AVATAR } from "@/lib/current-user";
import {
  loadNotificationsPage,
  loadUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  onNotificationCreated,
  type AppNotification,
} from "@/lib/notifications";

// The full, real, server-side-paginated notifications listing behind the
// bell's "View all" — same "?page= in the URL, 20/page, Previous/Next" real
// pagination shape as Work History / the Activity History pages
// (organization-activity-history-screen.tsx), just over notifications.

const PAGE_SIZE = 20;

function readPageParam(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function notificationHref(n: AppNotification): string | null {
  if (n.ticket && n.project) return `/projects/${n.project.slug}/tickets/${n.ticket.code}`;
  if (n.project) return `/projects/${n.project.slug}`;
  return null;
}

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0">
      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
        <div className="h-2.5 w-1/3 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
      </div>
      <div className="h-2.5 w-16 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
    </div>
  );
}

export function NotificationsScreen() {
  const { userId, isDevFallback } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPage = readPageParam(searchParams.get("page"));

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const hasLoadedOnce = notifications.length > 0 || status !== "loading";

  const hasRealUser = Boolean(userId) && !isDevFallback;

  const refreshUnreadCount = useCallback(() => {
    if (!hasRealUser || !userId) {
      setUnreadCount(0);
      return;
    }
    loadUnreadNotificationCount(userId).then((result) => {
      if (result.status === "ready") setUnreadCount(result.count);
    });
  }, [hasRealUser, userId]);

  const load = useCallback(() => {
    if (!hasRealUser || !userId) {
      setNotifications([]);
      setTotalCount(0);
      setStatus("ready");
      return;
    }
    // Only the true first load (and an explicit page change) shows the
    // skeleton — a background focus/visibility refresh of the same page
    // never blanks already-real rows back to a loading state.
    setStatus((prev) => (prev === "ready" ? prev : "loading"));

    loadNotificationsPage(userId, requestedPage, PAGE_SIZE).then((result) => {
      if (result.status === "error") {
        setStatus("error");
        setErrorMessage(result.message);
        return;
      }

      const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
      if (requestedPage > totalPages) {
        router.replace(`/notifications?page=${totalPages}`);
        return;
      }

      setNotifications(result.notifications);
      setTotalCount(result.totalCount);
      setStatus("ready");
    });
  }, [hasRealUser, userId, requestedPage, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: real initial load (and reload on ?page= change), same pattern every other real-data screen in this app uses
    load();
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: real initial load on mount
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  useRefreshOnFocusAndVisibility(
    useCallback(() => {
      load();
      refreshUnreadCount();
    }, [load, refreshUnreadCount])
  );

  useEffect(() => {
    if (!userId) return undefined;
    return onNotificationCreated((recipientProfileId) => {
      if (recipientProfileId === userId) {
        load();
        refreshUnreadCount();
      }
    });
  }, [userId, load, refreshUnreadCount]);

  async function handleMarkAllRead() {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    const result = await markAllNotificationsRead(userId);
    if (result.status === "error") refreshUnreadCount();
  }

  async function handleSelect(n: AppNotification) {
    if (!n.readAt) {
      setNotifications((prev) => prev.map((p) => (p.id === n.id ? { ...p, readAt: new Date().toISOString() } : p)));
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationRead(n.id).then((result) => {
        if (result.status === "error") refreshUnreadCount();
      });
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  function goToPage(page: number) {
    router.push(`/notifications?page=${page}`);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 align-middle text-[12px] font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 rounded-full px-2 py-0.5">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 dark:text-zinc-400">
            Real activity that concerns you — assignments, comments, status changes, and project membership.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex-shrink-0 text-sm font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 px-3 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/5 transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {status === "error" && (
        <div className="flex flex-col items-center justify-center text-center px-4 py-20">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">Couldn&apos;t load notifications</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
            {errorMessage ?? "Something went wrong."}
          </p>
        </div>
      )}

      {status !== "error" && (
        <>
          <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20 overflow-hidden">
            {!hasLoadedOnce ? (
              <div>
                {[0, 1, 2, 3, 4].map((i) => (
                  <RowSkeleton key={i} />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-10 text-center">No notifications yet</p>
            ) : (
              <div>
                {notifications.map((n) => {
                  const isUnread = !n.readAt;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleSelect(n)}
                      className={[
                        "w-full flex items-start gap-3 px-5 py-4 border-b border-slate-100 dark:border-zinc-800 last:border-0 text-left transition-colors",
                        isUnread
                          ? "bg-brand-50/50 hover:bg-brand-50 dark:bg-brand-500/[0.05] dark:hover:bg-brand-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-zinc-800/50",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={n.actor?.avatar ?? FALLBACK_AVATAR}
                        alt={n.actor?.name ?? ""}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={[
                            "text-[13px] leading-snug",
                            isUnread ? "font-medium text-slate-800 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-400",
                          ].join(" ")}
                        >
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-[12px] text-slate-400 dark:text-zinc-500 mt-0.5 truncate">{n.message}</p>
                        )}
                        {(n.ticket || n.project) && (
                          <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-1">
                            {n.ticket ? `${n.ticket.code} · ${n.ticket.title}` : n.project?.name}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-[11px] text-slate-400 dark:text-zinc-600 whitespace-nowrap">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                        {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
                      </div>
                    </button>
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
                Page {requestedPage} of {totalPages} · {totalCount} {totalCount === 1 ? "notification" : "notifications"}
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
