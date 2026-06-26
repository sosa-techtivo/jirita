import type { ReactNode } from "react";
import Link from "next/link";
import type { Ticket } from "@/lib/mock-tickets";
import {
  StatusBadge,
  PriorityBadge,
  LabelTag,
  getMockComments,
  getMockActivity,
} from "@/components/tickets/ticket-ui";
import { BackToTicketsButton } from "@/components/tickets/back-to-tickets-button";

// ── Shared style tokens ───────────────────────────────────────────────────────

const SECTION_LABEL =
  "text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600";

// ── Sidebar field row ─────────────────────────────────────────────────────────

function SidebarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3.5 border-b border-slate-100 dark:border-zinc-800/70 last:border-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5">
        {label}
      </p>
      <div className="text-[13px] font-medium text-slate-800 dark:text-zinc-200">{children}</div>
    </div>
  );
}

// ── Calendar icon (inline SVG reused for due date) ────────────────────────────

function CalendarIcon() {
  return (
    <svg
      className="w-3 h-3 text-slate-400 dark:text-zinc-500 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

// ── Not-found state ───────────────────────────────────────────────────────────

function NotFound({ ticketId, slug }: { ticketId: string; slug: string }) {
  return (
    <div className="min-h-full bg-white dark:bg-zinc-950 flex items-center justify-center">
      <div className="text-center py-24">
        <div className="mx-auto w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
          <svg
            className="w-5 h-5 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-slate-900 dark:text-zinc-50">Ticket not found</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
          No ticket with ID &ldquo;{ticketId}&rdquo; exists.
        </p>
        <Link
          href={`/projects/${slug}/tickets`}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-500 hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to Tickets
        </Link>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function TicketDetailScreen({
  ticket,
  ticketId,
  slug,
}: {
  ticket: Ticket | undefined;
  ticketId: string;
  slug: string;
}) {
  if (!ticket) {
    return <NotFound ticketId={ticketId} slug={slug} />;
  }

  const comments = getMockComments(ticket, 3);
  const activity = getMockActivity(ticket);

  return (
    <div className="min-h-full bg-white dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-10">
        {/* Back navigation — top-left, always visible */}
        <div className="mb-8">
          <BackToTicketsButton />
        </div>

        <div className="flex gap-12 items-start">

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <article className="flex-1 min-w-0">

            {/* Title */}
            <header>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="font-mono text-[12px] font-semibold tracking-wider text-slate-400 dark:text-zinc-500">
                  {ticket.issueKey}
                </span>
                <StatusBadge status={ticket.status} />
              </div>

              <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 leading-snug tracking-tight">
                {ticket.title}
              </h1>

              <p className="text-[12px] text-slate-400 dark:text-zinc-600 mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span>{ticket.updatedAt}</span>
                {ticket.dueDate && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarIcon />
                      Due {ticket.dueDate}
                    </span>
                  </>
                )}
              </p>
            </header>

            {/* Description */}
            <section className="mt-10 pt-8 border-t border-slate-100 dark:border-zinc-800">
              <h2 className={`${SECTION_LABEL} mb-3.5`}>Description</h2>
              <p className="text-[14px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                {ticket.description}
              </p>
            </section>

            {/* Comments */}
            <section className="mt-10 pt-8 border-t border-slate-100 dark:border-zinc-800">
              <h2 className={`${SECTION_LABEL} mb-5`}>
                Comments
                {ticket.commentCount !== undefined && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-300 dark:text-zinc-700">
                    · {ticket.commentCount} total
                  </span>
                )}
              </h2>

              <div className="space-y-6">
                {comments.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 ring-1 ring-slate-200 dark:ring-zinc-700"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 leading-snug">
                        {c.name}
                        <span className="ml-2 font-normal text-slate-400 dark:text-zinc-600">
                          · {c.timeAgo}
                        </span>
                      </p>
                      <div className="mt-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800/80">
                        <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed">
                          {c.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Activity */}
            <section className="mt-10 pt-8 pb-2 border-t border-slate-100 dark:border-zinc-800">
              <h2 className={`${SECTION_LABEL} mb-5`}>Activity</h2>

              <div>
                {activity.map((a, i) => {
                  const isLast = i === activity.length - 1;
                  return (
                    <div key={i} className="flex gap-3.5">
                      <div className="flex flex-col items-center w-4 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600 mt-1.5 flex-shrink-0 ring-2 ring-white dark:ring-zinc-950" />
                        {!isLast && (
                          <div className="w-px flex-1 bg-slate-200 dark:bg-zinc-800 mt-1 min-h-[24px]" />
                        )}
                      </div>
                      <div className={`flex-1 min-w-0 ${isLast ? "pb-0" : "pb-4"}`}>
                        <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-snug">
                          {a.label}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">
                          {a.timeAgo}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

          </article>

          {/* ── Metadata sidebar ─────────────────────────────────────────────── */}
          <aside className="w-56 flex-shrink-0 sticky top-8">
            <SidebarField label="Status">
              <StatusBadge status={ticket.status} />
            </SidebarField>

            <SidebarField label="Priority">
              <PriorityBadge priority={ticket.priority} />
            </SidebarField>

            <SidebarField label="Assignee">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ticket.assignee.avatar}
                  alt={ticket.assignee.name}
                  className="w-5 h-5 rounded-full flex-shrink-0"
                />
                <span className="truncate">{ticket.assignee.name}</span>
              </div>
            </SidebarField>

            <SidebarField label="Milestone">{ticket.milestone}</SidebarField>

            {ticket.storyPoints !== undefined && (
              <SidebarField label="Story points">{ticket.storyPoints} pts</SidebarField>
            )}

            {ticket.dueDate && (
              <SidebarField label="Due date">
                <div className="flex items-center gap-1.5">
                  <CalendarIcon />
                  {ticket.dueDate}
                </div>
              </SidebarField>
            )}

            {ticket.labels.length > 0 && (
              <SidebarField label="Labels">
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {ticket.labels.map((l) => (
                    <LabelTag key={l} label={l} />
                  ))}
                </div>
              </SidebarField>
            )}

          </aside>

        </div>
      </div>
    </div>
  );
}
