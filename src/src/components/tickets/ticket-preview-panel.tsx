"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
import {
  StatusBadge,
  PriorityBadge,
  TicketTypeIcon,
  getMockComments,
  getMockActivity,
} from "@/components/tickets/ticket-ui";
import { MemberTrigger } from "@/components/member-profile";

const FIELD_LABEL = "text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1";
const FIELD_VALUE = "text-[12px] font-medium text-slate-800 dark:text-zinc-200";

// ── Main component ────────────────────────────────────────────────────────────

export function TicketPreviewPanel({
  ticket,
  slug,
  onClose,
  onBeforeNavigate,
}: {
  ticket: Ticket;
  slug: string;
  onClose: () => void;
  onBeforeNavigate?: () => void;
}) {
  // Panel open/close animation
  const [visible, setVisible] = useState(false);

  // Content cross-fade state when switching between tickets
  const [displayedTicket, setDisplayedTicket] = useState(ticket);
  const [contentFaded, setContentFaded] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entrance animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Cross-fade when a different ticket is selected while the panel is open
  useEffect(() => {
    if (ticket.id === displayedTicket.id) return;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setContentFaded(true);
    fadeTimerRef.current = setTimeout(() => {
      setDisplayedTicket(ticket);
      setContentFaded(false);
      fadeTimerRef.current = null;
    }, 150);
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // ESC key to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  const t = displayedTicket;
  const comments = getMockComments(t);
  const activity = getMockActivity(t);

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className={[
          "fixed inset-0 z-40 bg-black/20 dark:bg-black/40",
          "transition-opacity duration-[250ms]",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={handleClose}
      />

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Ticket preview: ${getTicketDisplayKey(t)}`}
        className={[
          "fixed inset-y-0 right-0 z-50",
          "w-[520px] max-w-[calc(100vw-3rem)]",
          "flex flex-col",
          "bg-white dark:bg-zinc-950",
          "border-l border-slate-200 dark:border-zinc-800",
          "shadow-2xl shadow-black/10 dark:shadow-black/50",
          "transition-transform duration-[250ms] ease-out",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* ── Header (always visible, updates immediately) ─────────────────── */}
        <div className="flex-shrink-0 px-5 pt-4 pb-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-widest text-slate-400 dark:text-zinc-500">
              <TicketTypeIcon type={t.type} />
              {getTicketDisplayKey(t)}
            </span>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close preview"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-zinc-50 leading-snug">
            {t.title}
          </h2>

          {/* Status badge directly below the title */}
          <div className="mt-2.5">
            <StatusBadge status={t.status} />
          </div>
        </div>

        {/* ── Scrollable body (cross-fades when ticket changes) ─────────────── */}
        <div
          className={[
            "flex-1 overflow-y-auto",
            "transition-opacity duration-[150ms]",
            contentFaded ? "opacity-0" : "opacity-100",
          ].join(" ")}
        >
          {/* ── Compact two-column metadata grid ────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 grid grid-cols-2 gap-x-6 gap-y-4">

            <div>
              <p className={FIELD_LABEL}>Priority</p>
              <div className={FIELD_VALUE}>
                <PriorityBadge priority={t.priority} />
              </div>
            </div>

            <div className="min-w-0">
              <p className={FIELD_LABEL}>Assignee</p>
              <div className={FIELD_VALUE}>
                <MemberTrigger
                  name={t.assignee.name}
                  avatar={t.assignee.avatar}
                  projectSlug={t.projectSlug}
                  className="flex items-center gap-1.5 min-w-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.assignee.avatar}
                    alt={t.assignee.name}
                    className="w-4 h-4 rounded-full flex-shrink-0"
                  />
                  <span className="truncate">{t.assignee.name}</span>
                </MemberTrigger>
              </div>
            </div>

            {t.hours !== undefined && (
              <div>
                <p className={FIELD_LABEL}>Hours</p>
                <p className={FIELD_VALUE}>{t.hours} h</p>
              </div>
            )}

            {t.dueDate && (
              <div>
                <p className={FIELD_LABEL}>Due date</p>
                <div className={`${FIELD_VALUE} flex items-center gap-1`}>
                  <svg
                    className="w-3 h-3 text-slate-400 dark:text-zinc-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {t.dueDate}
                </div>
              </div>
            )}

            {t.labels.length > 0 && (
              <div>
                <p className={FIELD_LABEL}>Labels</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {t.labels.map((l) => (
                    <span
                      key={l}
                      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-medium text-slate-600 dark:text-zinc-400"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ── Description ──────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-2.5`}>Description</p>
            <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
              {t.description}
            </p>
          </div>

          {/* ── Comments ─────────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-5 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-3`}>
              Comments
              {t.commentCount !== undefined && t.commentCount > 2 && (
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                  · {t.commentCount} total
                </span>
              )}
            </p>

            <div className="space-y-4">
              {comments.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <MemberTrigger
                    name={c.name}
                    avatar={c.avatar}
                    projectSlug={t.projectSlug}
                    className="flex-shrink-0 mt-0.5 rounded-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-white dark:ring-zinc-900"
                    />
                  </MemberTrigger>
                  <div className="flex-1 min-w-0">
                    {/* Author · timestamp on one line */}
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
                      <MemberTrigger name={c.name} avatar={c.avatar} projectSlug={t.projectSlug} className="hover:underline">
                        {c.name}
                      </MemberTrigger>
                      <span className="ml-1.5 font-normal text-slate-400 dark:text-zinc-600">
                        · {c.timeAgo}
                      </span>
                    </p>
                    <p className="text-[12px] text-slate-600 dark:text-zinc-400 leading-relaxed mt-1">
                      {c.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Activity (vertical timeline) ─────────────────────────────────── */}
          <div className="px-5 pt-4 pb-6 border-t border-slate-100 dark:border-zinc-800">
            <p className={`${FIELD_LABEL} mb-3`}>Activity</p>

            <div>
              {activity.map((a, i) => {
                const isLast = i === activity.length - 1;
                return (
                  <div key={i} className="flex gap-3">
                    {/* Timeline track: dot + connecting line */}
                    <div className="flex flex-col items-center w-4 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ring-white dark:ring-zinc-950" />
                      {!isLast && (
                        <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[16px]" />
                      )}
                    </div>

                    {/* Event label + timestamp */}
                    <div className={`flex-1 min-w-0 ${isLast ? "pb-1" : "pb-3.5"}`}>
                      <p className="text-[12px] text-slate-700 dark:text-zinc-300 leading-snug">
                        {a.label}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-600 mt-0.5">
                        {a.timeAgo}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Footer: always visible, outside scroll container ─────────────── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <Link
            href={`/projects/${slug}/tickets/${ticket.id}`}
            onClick={onBeforeNavigate}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 text-white text-sm font-semibold shadow-sm shadow-brand-600/20 dark:shadow-brand-500/20 transition-colors"
          >
            Expand
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M3 8h18M3 16h18" />
            </svg>
          </Link>
        </div>
      </aside>
    </>
  );
}
