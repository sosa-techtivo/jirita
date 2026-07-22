"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { useRefreshOnFocusAndVisibility } from "@/components/member-profile-modal";
import { formatRelativeTime } from "@/lib/tickets";
import { FALLBACK_AVATAR } from "@/lib/current-user";
import {
  loadRecentNotifications,
  loadUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  onNotificationCreated,
  type AppNotification,
} from "@/lib/notifications";

const PREVIEW_LIMIT = 5;

// Matches the CSS animation-duration of .notifications-bell-ring below —
// how long the "isRinging" class stays attached before it's cleared again.
const RING_DURATION_MS = 3800;

function badgeLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

// Where clicking a notification goes — a stable route always, never the
// Ticket Preview panel's client-only state, since the bell can be clicked
// from any authenticated page (same reasoning global search's own
// click-to-navigate already uses; see sidebar.tsx's selectSearchTicket/
// selectSearchProject).
function notificationHref(n: AppNotification): string | null {
  if (n.ticket && n.project) return `/projects/${n.project.slug}/tickets/${n.ticket.code}`;
  if (n.project) return `/projects/${n.project.slug}`;
  return null;
}

// Header bell → dropdown popover. Modeled directly on account-menu.tsx's
// own trigger/popover shell (outside-click + Escape to close, absolute
// panel just below the trigger) — same visual language, no new pattern.
export function NotificationBell() {
  const router = useRouter();
  const { userId, isDevFallback } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [preview, setPreview] = useState<AppNotification[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Bell-ring animation: a brief, non-intrusive attention cue, never a
  // continuous one. Only fires when unreadCount genuinely increases after
  // this component is already mounted — never on the first render (even if
  // the page starts with old unread notifications), never just because a
  // page navigation remounted this component (that first post-mount run is
  // still "first run" from this component's own perspective), and never
  // from opening/closing the dropdown or marking something read (neither
  // of those ever increases unreadCount). `ringToken` is bumped on every
  // valid trigger and used as the animated element's `key` — remounting it
  // is what lets a fresh trigger restart the CSS animation cleanly even if
  // the previous run is still playing, instead of the class no-op'ing
  // because it was already applied.
  const [isRinging, setIsRinging] = useState(false);
  const [ringToken, setRingToken] = useState(0);
  const prevUnreadCountRef = useRef(unreadCount);
  const isFirstUnreadRunRef = useRef(true);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = mql.matches;
    function onChange(e: MediaQueryListEvent) {
      prefersReducedMotionRef.current = e.matches;
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const previous = prevUnreadCountRef.current;
    prevUnreadCountRef.current = unreadCount;

    if (isFirstUnreadRunRef.current) {
      isFirstUnreadRunRef.current = false;
      return undefined;
    }

    if (unreadCount > previous && !prefersReducedMotionRef.current) {
      // Clears only a still-pending "turn ringing off" timer from an
      // animation already in flight — never on a plain decrease (e.g.
      // marking something read), which must never cancel/blank a ring
      // that's legitimately still playing.
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      setRingToken((t) => t + 1);
      setIsRinging(true);
      ringTimeoutRef.current = setTimeout(() => setIsRinging(false), RING_DURATION_MS);
    }
  }, [unreadCount]);

  // Unmount-only cleanup — deliberately not returned from the effect above,
  // since that effect re-runs on every unreadCount change (including a
  // decrease) and a cleanup there would wrongly cancel a ring animation
  // that's still legitimately playing.
  useEffect(() => {
    return () => {
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    };
  }, []);

  const hasRealUser = Boolean(userId) && !isDevFallback;

  const refreshCount = useCallback(() => {
    if (!hasRealUser || !userId) {
      setUnreadCount(0);
      return;
    }
    loadUnreadNotificationCount(userId).then((result) => {
      if (result.status === "ready") setUnreadCount(result.count);
      // On error, the last known good count stays on screen — never reset
      // to 0 and never show a fabricated value.
    });
  }, [hasRealUser, userId]);

  const refreshPreview = useCallback(() => {
    if (!hasRealUser || !userId) {
      setPreview([]);
      setPreviewStatus("ready");
      return;
    }
    setPreviewStatus((prev) => (prev === "ready" ? prev : "loading"));
    loadRecentNotifications(userId, PREVIEW_LIMIT).then((result) => {
      if (result.status === "error") {
        setPreviewStatus("error");
        return;
      }
      setPreview(result.notifications);
      setPreviewStatus("ready");
    });
  }, [hasRealUser, userId]);

  // Initial load, and real refresh on window focus / tab-visibility regain
  // — no polling, same shared hook the Users list / Member Profile Modal
  // already use.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: real initial load on mount, same pattern every other real-data screen in this app uses
    refreshCount();
  }, [refreshCount]);
  useRefreshOnFocusAndVisibility(refreshCount);

  // If the bell itself is the recipient of a notification created earlier
  // in this same session (see lib/notifications.ts), refresh immediately
  // rather than waiting for the next focus/visibility regain.
  useEffect(() => {
    if (!userId) return undefined;
    return onNotificationCreated((recipientProfileId) => {
      if (recipientProfileId === userId) {
        refreshCount();
        if (isOpen) refreshPreview();
      }
    });
  }, [userId, isOpen, refreshCount, refreshPreview]);

  // Only fetches the 5-recent preview list once actually opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: loads the preview the moment the panel opens, not before
    if (isOpen) refreshPreview();
  }, [isOpen, refreshPreview]);

  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  async function handleMarkAllRead() {
    if (!userId) return;
    setPreview((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
    const result = await markAllNotificationsRead(userId);
    if (result.status === "error") refreshCount(); // reconcile with the real count on failure
  }

  async function handleSelect(n: AppNotification) {
    setIsOpen(false);
    if (!n.readAt) {
      setPreview((prev) => prev.map((p) => (p.id === n.id ? { ...p, readAt: new Date().toISOString() } : p)));
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationRead(n.id).then((result) => {
        if (result.status === "error") refreshCount();
      });
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  const hasUnread = unreadCount > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        {/* `key` forces this wrapper (and everything inside it) to remount
            on every real trigger, which is what lets the ring/pulse restart
            cleanly even if a previous run is still playing — see the
            unreadCount effect above. Purely a rotate/scale transform on
            elements inside the button, so it never moves the header's own
            layout or displaces the badge's own position. */}
        <span key={ringToken} className="relative inline-flex">
          <svg
            className={`w-5 h-5 ${isRinging ? "notifications-bell-ring" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 01-3.4 0" />
          </svg>
          {hasUnread && (
            <span
              className={`absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center ring-2 ring-white dark:ring-[var(--background)] ${
                isRinging ? "notifications-badge-pulse" : ""
              }`}
            >
              {badgeLabel(unreadCount)}
            </span>
          )}
        </span>
      </button>

      <div
        role="dialog"
        aria-label="Notifications"
        className={[
          "absolute top-full right-0 mt-1.5 z-50 w-80",
          "rounded-xl border bg-white dark:bg-zinc-900",
          "shadow-lg shadow-black/10 dark:shadow-black/40",
          "border-slate-200 dark:border-zinc-700/60",
          "transition-all duration-150 origin-top-right",
          isOpen ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none",
        ].join(" ")}
      >
        <div className="px-3.5 pt-3 pb-2.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">Notifications</p>
          {hasUnread && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="py-1 max-h-96 overflow-y-auto">
          {previewStatus === "loading" && (
            <div className="px-3.5 py-3 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 pt-0.5">
                    <div className="h-2.5 w-4/5 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
                    <div className="h-2.5 w-2/5 rounded bg-slate-100 dark:bg-zinc-800 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {previewStatus === "error" && (
            <p className="px-3.5 py-6 text-center text-[13px] text-slate-400 dark:text-zinc-500">
              Couldn&apos;t load notifications.
            </p>
          )}

          {previewStatus === "ready" && preview.length === 0 && (
            <p className="px-3.5 py-6 text-center text-[13px] text-slate-400 dark:text-zinc-500">No notifications yet</p>
          )}

          {previewStatus === "ready" &&
            preview.map((n) => {
              const isUnread = !n.readAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelect(n)}
                  className={[
                    "w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors",
                    isUnread
                      ? "bg-brand-50/60 hover:bg-brand-50 dark:bg-brand-500/[0.06] dark:hover:bg-brand-500/10"
                      : "hover:bg-slate-50 dark:hover:bg-zinc-800/60",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={n.actor?.avatar ?? FALLBACK_AVATAR}
                    alt={n.actor?.name ?? ""}
                    className="w-7 h-7 rounded-full flex-shrink-0"
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
                      <p className="text-[12px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">{n.message}</p>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">{formatRelativeTime(n.createdAt)}</p>
                  </div>
                  {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />}
                </button>
              );
            })}
        </div>

        <div className="py-1.5 border-t border-slate-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              router.push("/notifications");
            }}
            className="w-full text-center px-3.5 py-1.5 text-[13px] font-medium text-brand-600 dark:text-brand-400 hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
          >
            View all
          </button>
        </div>
      </div>
    </div>
  );
}
