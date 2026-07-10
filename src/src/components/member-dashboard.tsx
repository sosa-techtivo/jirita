"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/components/current-user-provider";
import { TicketListRow } from "@/components/tickets/ticket-card";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import { StatusBadge, PriorityBadge, TicketTypeIcon } from "@/components/tickets/ticket-ui";
import { getProjectBySlug } from "@/lib/mock-projects";
import { statusMeta } from "@/components/status-badge";
import type { Ticket } from "@/lib/mock-tickets";
import { getTicketDisplayKey } from "@/lib/mock-tickets";
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

// Same "urgent window" convention the rest of the dashboards use for red
// due-date styling — today plus the two days right before it.
const URGENT_LABELS = new Set(["Jun 28", "Jun 29", "Jun 30"]);
const TODAY_LABEL = "Jun 30";

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

// Every project always renders with the same accent color everywhere in the
// app — that color already exists as the status dot next to this project in
// the sidebar (see sidebar.tsx / status-badge.tsx), so it's reused here
// rather than inventing a separate per-project color scheme.
function ProjectBadge({ project }: { project: Project }) {
  const status = getProjectBySlug(project.slug)?.status;
  const meta = status ? statusMeta[status] : undefined;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 ${meta?.text ?? "text-slate-400 dark:text-zinc-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta?.dot ?? "bg-slate-300 dark:bg-zinc-600"}`} />
      {project.shortLabel}
    </span>
  );
}

export interface WorkItem {
  ticket: Ticket;
  project: Project;
}

// ── Data (David Kim, QA Engineer — the mock MEMBER user, staffed across
//    three projects at once) ───────────────────────────────────────────────
// Exported so other Member-scoped views (e.g. the Projects list) can derive
// "what am I staffed on / what's assigned to me per project" from the same
// source instead of re-deriving it.

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

const WORK_BY_TICKET_ID = new Map(MEMBER_WORK.map((w) => [w.ticket.id, w]));

// No real time-tracking source exists yet — mirrors the approximation
// approach already used for "logged hours" on the Reports pages.
const LOGGED_TODAY_BY_PROJECT: { project: Project; hours: number }[] = [
  { project: PROJECTS.mba, hours: 3 },
  { project: PROJECTS.cwd, hours: 2 },
  { project: PROJECTS.ipm, hours: 1 },
];
const LOGGED_TODAY = LOGGED_TODAY_BY_PROJECT.reduce((sum, p) => sum + p.hours, 0);
const PLANNED_TODAY = 7;

// Only actionable, ticket-specific events belong here — never general
// project activity. If it doesn't ask the member to do something (review,
// pick up reassigned work, respond to a mention, notice a changed estimate,
// or notice a new blocker), it doesn't qualify.
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

// Every item here traces back to one of the member's own tickets — never
// unrelated project-wide activity.
const ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: "n1", type: "mention", time: "1h ago", ticketId: "dk-kyc-outage",
    verb: <><span className="font-medium">Sarah Chen</span> mentioned you in a comment</>,
  },
  {
    id: "n2", type: "review", time: "3h ago", ticketId: "dk-homepage-review",
    verb: <><span className="font-medium">Elena Rossi</span> requested your review</>,
  },
  {
    id: "n3", type: "blocked", time: "5h ago", ticketId: "dk-regression-ios",
    verb: <><span className="font-medium">Marcus Lee</span> marked</>,
  },
  {
    id: "n4", type: "reassigned", time: "Yesterday", ticketId: "dk-regression-ios",
    verb: <><span className="font-medium">Marcus Lee</span> reassigned</>,
    detail: "to you",
  },
  {
    id: "n5", type: "estimate", time: "Yesterday", ticketId: "dk-a11y-audit",
    verb: "Estimate changed",
    detail: <span className="font-medium">8h → 6h</span>,
  },
];

// ── Sort: Blocked → Due Today → High Priority → In Progress → Ready to
//    Start → In Review. Also drives "Recommended Next" (its top result). ──

function tierOf(item: WorkItem): number {
  const { ticket } = item;
  if (ticket.status === "blocked") return 0;
  if (ticket.dueDate && URGENT_LABELS.has(ticket.dueDate)) return 1;
  if (ticket.priority === "high") return 2;
  if (ticket.status === "in-progress") return 3;
  if (ticket.status === "to-do") return 4;
  if (ticket.status === "review") return 5;
  return 6;
}

function parseDue(d?: string): number {
  return d ? new Date(`${d}, 2026`).getTime() : Infinity;
}

function compareWork(a: WorkItem, b: WorkItem): number {
  const diff = tierOf(a) - tierOf(b);
  return diff !== 0 ? diff : parseDue(a.ticket.dueDate) - parseDue(b.ticket.dueDate);
}

function isFuture(dueDate?: string): boolean {
  return dueDate !== undefined && !URGENT_LABELS.has(dueDate);
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

function AttentionRow({ item, onOpen }: { item: AttentionItem; onOpen: (id: string) => void }) {
  const meta = ATTENTION_META[item.type];
  const ticket = item.ticketId ? WORK_BY_TICKET_ID.get(item.ticketId)?.ticket : undefined;

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
  const { user } = useCurrentUser();
  const [preview, setPreview] = useState<WorkItem | null>(null);

  const activeWork = MEMBER_WORK.filter((w) => w.ticket.status !== "done").sort(compareWork);
  const recommended = activeWork[0] ?? null;
  const dueTodayCount = activeWork.filter((w) => w.ticket.dueDate === TODAY_LABEL).length;

  const upcoming = activeWork
    .filter((w) => isFuture(w.ticket.dueDate))
    .sort((a, b) => parseDue(a.ticket.dueDate) - parseDue(b.ticket.dueDate));

  function openTicket(id: string) {
    const item = WORK_BY_TICKET_ID.get(id);
    if (item) setPreview(item);
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
          <p className="text-xs text-slate-400 dark:text-zinc-500">Tuesday, June 30</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <HeroStat label="Assigned Tickets" value={activeWork.length} />
          <HeroStat label="Planned Today" value={`${PLANNED_TODAY}h`} />
          <HeroStat label="Logged Today" value={`${LOGGED_TODAY}h`} />
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
                <StatusBadge status={recommended.ticket.status} />
                <PriorityBadge priority={recommended.ticket.priority} />
              </div>
              <div className="mb-1">
                <ProjectBadge project={recommended.project} />
              </div>
              <p className="flex items-center gap-1 text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 mb-1 leading-none">
                <TicketTypeIcon type={recommended.ticket.type} />
                {getTicketDisplayKey(recommended.ticket)}
              </p>
              <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50 leading-snug">
                {recommended.ticket.title}
              </h2>
              <div className="flex items-center gap-4 mt-3 text-sm text-slate-600 dark:text-zinc-400">
                {recommended.ticket.hours !== undefined && (
                  <span className="font-medium">{recommended.ticket.hours}h remaining</span>
                )}
                {recommended.ticket.dueDate && (
                  <span className={URGENT_LABELS.has(recommended.ticket.dueDate) ? "font-semibold text-red-600 dark:text-red-400" : "font-medium"}>
                    Due {recommended.ticket.dueDate}
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
                {activeWork.map((w) => (
                  <TicketListRow
                    key={w.ticket.id}
                    ticket={w.ticket}
                    projectBadge={<ProjectBadge project={w.project} />}
                    onTicketClick={() => setPreview(w)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Section 5: Needs Your Attention */}
          <Card title="Needs Your Attention" count={ATTENTION_ITEMS.length}>
            <div className="space-y-0.5">
              {ATTENTION_ITEMS.map((item) => (
                <AttentionRow key={item.id} item={item} onOpen={openTicket} />
              ))}
            </div>
          </Card>

        </div>

        {/* Right: Time Today + Upcoming Work */}
        <div className="space-y-5">

          {/* Section 4: Time Today — summary first, project breakdown below. */}
          <Card title="Time Today">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">Logged Today</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">{LOGGED_TODAY}h</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">Planned Today</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums leading-none">{PLANNED_TODAY}h</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1">Remaining Today</p>
                <p className="text-lg font-bold text-slate-900 dark:text-zinc-50 tabular-nums leading-none">
                  {Math.max(PLANNED_TODAY - LOGGED_TODAY, 0)}h
                </p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((LOGGED_TODAY / PLANNED_TODAY) * 100))}%` }}
              />
            </div>
            <div className="h-px bg-slate-100 dark:bg-zinc-800 my-3" />
            <div className="space-y-1.5">
              {LOGGED_TODAY_BY_PROJECT.map((p) => (
                <div key={p.project.slug} className="flex items-center justify-between gap-2">
                  <ProjectBadge project={p.project} />
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-zinc-300 tabular-nums flex-shrink-0">{p.hours}h</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Section 6: Upcoming Work — every project, sorted by due date only. */}
          <Card title="Upcoming Work">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 py-2">Nothing else on the horizon.</p>
            ) : (
              <div className="space-y-1">
                {upcoming.map((w) => (
                  <ActiveTicketRow
                    key={w.ticket.id}
                    ticket={w.ticket}
                    projectBadge={<ProjectBadge project={w.project} />}
                    onOpen={() => setPreview(w)}
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
          ticket={preview.ticket}
          slug={preview.project.slug}
          onClose={() => setPreview(null)}
        />
      )}

    </div>
  );
}
