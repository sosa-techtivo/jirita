"use client";

import { useRouter } from "next/navigation";
import { getProjectBySlug } from "@/lib/mock-projects";
import type { ProjectCategory } from "@/lib/mock-projects";
import { ProjectCategoryBadge } from "@/components/status-badge";
import { MEMBER_WORK } from "@/components/member-dashboard";
import type { WorkItem } from "@/components/member-dashboard";

// A Member doesn't manage projects — they work inside them. So this page
// never shows org-wide status/priority/health or ticket-volume metrics; it
// only answers what a Member actually needs: which projects am I on, who
// leads each one, and what's mine to do there. See MemberDashboard for the
// same "no project-picking, work-first" philosophy applied to the homepage.

const TODAY = new Date("Jun 30, 2026").getTime();
const DAY_MS = 1000 * 60 * 60 * 24;

// "Due this week" — due today or within the next 7 days (including anything
// already overdue this week, since that's still pending work).
function isDueThisWeek(dueDate?: string): boolean {
  if (!dueDate) return false;
  const days = (new Date(`${dueDate}, 2026`).getTime() - TODAY) / DAY_MS;
  return days <= 7;
}

// Relative-time labels here ("Updated 3h ago", "Updated yesterday", "Updated
// 6 days ago") are free text, not timestamps — this just ranks them well
// enough to sort projects by recent activity.
function hoursAgo(label: string): number {
  const hours = /(\d+)\s*h\b/i.exec(label);
  if (hours) return Number(hours[1]);
  const days = /(\d+)\s*day/i.exec(label);
  if (days) return Number(days[1]) * 24;
  if (/yesterday/i.test(label)) return 24;
  if (/just now/i.test(label)) return 0;
  return Infinity;
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
  recencyHours: number;
}

function buildMemberProjectCards(work: WorkItem[]): MemberProjectCard[] {
  const bySlug = new Map<string, WorkItem[]>();
  for (const item of work) {
    const list = bySlug.get(item.project.slug) ?? [];
    list.push(item);
    bySlug.set(item.project.slug, list);
  }

  return Array.from(bySlug.entries())
    .map(([slug, items]) => {
      const project = getProjectBySlug(slug);
      return {
        slug,
        name: items[0].project.name,
        description: project?.description ?? "",
        category: project?.category ?? "internal",
        leadName: project?.owner.name ?? "Unassigned",
        leadAvatar: project?.owner.avatar ?? "",
        assignedCount: items.length,
        dueThisWeekCount: items.filter((i) => isDueThisWeek(i.ticket.dueDate)).length,
        recencyHours: Math.min(...items.map((i) => hoursAgo(i.ticket.updatedAt))),
      };
    })
    .sort((a, b) => a.recencyHours - b.recencyHours);
}

export function MemberProjectsScreen() {
  const cards = buildMemberProjectCards(MEMBER_WORK);

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.leadAvatar} alt={card.leadName} className="w-6 h-6 rounded-full flex-shrink-0" />
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
