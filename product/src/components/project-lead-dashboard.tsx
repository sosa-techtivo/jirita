"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/components/current-user-provider";
import { getTeamByProjectSlug } from "@/lib/mock-team";
import type { TeamMember } from "@/lib/mock-team";
import { projects } from "@/lib/mock-projects";
import { TicketPreviewPanel } from "@/components/tickets/ticket-preview-panel";
import type { Ticket } from "@/lib/mock-tickets";
import { Card, ActiveTicketRow, RecentActivityList, MY_ACTIVE, RECENT_ACTIVITY, av } from "@/components/dashboard-shared";
import {
  utilizationOf,
  capacityTextColor,
  capacityBarColor,
  remainingAvailabilityLabel,
  MemberModal,
} from "@/components/team-screen";

// ── Data ──────────────────────────────────────────────────────────────────────
// This is an operational view scoped to the Project Lead's own projects —
// there is no organization-wide data here at all. The Project Context
// selector below lets the Lead switch which of their projects (or all of
// them at once) the dashboard is currently reporting on.

const ALL_PROJECTS_VALUE = "__all__";
const DEFAULT_PROJECT_SLUG = "mobile-banking-app";

// Projects this Project Lead is responsible for. A real backend would scope
// this by an actual ownership/membership relation — here we just hardcode
// the mock set the Lead manages.
const LEAD_PROJECT_SLUGS = ["mobile-banking-app", "client-website-redesign", "internal-platform-migration"];

interface DeliverySnapshot {
  completedTickets: number;
  totalTickets: number;
  remainingHours: number;
  blockedTickets: number;
  targetDate: string;
}

// Delivery snapshot per project — no Sprint concept in the MVP, so this
// tracks overall ticket/hours progress toward each project's target date.
const DELIVERY_BY_PROJECT: Record<string, DeliverySnapshot> = {
  "mobile-banking-app": { completedTickets: 14, totalTickets: 24, remainingHours: 107, blockedTickets: 3, targetDate: "Jul 5" },
  "client-website-redesign": { completedTickets: 2, totalTickets: 8, remainingHours: 12, blockedTickets: 1, targetDate: "Jul 15" },
  "internal-platform-migration": { completedTickets: 9, totalTickets: 14, remainingHours: 30, blockedTickets: 0, targetDate: "Jul 20" },
};

const DUE_TODAY_BY_PROJECT: Record<string, number> = {
  "mobile-banking-app": 2,
  "client-website-redesign": 1,
  "internal-platform-migration": 1,
};

// Per-project ticket pools that feed "Awaiting Review" and "Upcoming
// Deadlines" — Mobile Banking App reuses the Lead's own active work list
// since that's already scoped to this project.
const PROJECT_TICKETS: Record<string, Ticket[]> = {
  "mobile-banking-app": MY_ACTIVE,
  "client-website-redesign": [
    {
      id: "cwd-homepage-review", issueKey: "CWD-1",
      title: "Homepage redesign review",
      description: "Review the updated homepage layout against brand guidelines before handoff.",
      status: "review", priority: "high",
      assignee: { name: "Elena Rossi", avatar: av(5) },
      milestone: "Homepage Redesign", labels: ["Design"],
      hours: 6, dueDate: "Jul 10", updatedAt: "Updated 1 day ago",
    },
    {
      id: "cwd-cms-audit", issueKey: "CWD-2",
      title: "CMS migration content audit",
      description: "Audit legacy CMS content before migrating to the new platform.",
      status: "to-do", priority: "normal",
      assignee: { name: "Elena Rossi", avatar: av(5) },
      milestone: "CMS Migration", labels: ["Content"],
      hours: 8, dueDate: "Jul 18", updatedAt: "Updated 3 days ago",
    },
  ],
  "internal-platform-migration": [
    {
      id: "ipm-db-export-lead", issueKey: "IPM-1",
      title: "Legacy database export",
      description: "Export the legacy monolith database ahead of platform cutover.",
      status: "in-progress", priority: "high",
      assignee: { name: "Jordan Wu", avatar: av(15) },
      milestone: "Platform Cutover", labels: ["Migration"],
      hours: 16, dueDate: "Jul 5", updatedAt: "Updated 4h ago",
    },
    {
      id: "ipm-cutover-plan-lead", issueKey: "IPM-2",
      title: "Migration cutover plan",
      description: "Finalize the staged cutover plan and rollback runbook.",
      status: "review", priority: "high",
      assignee: { name: "Marcus Lee", avatar: av(12) },
      milestone: "Platform Cutover", labels: ["Planning"],
      hours: 8, dueDate: "Jul 1", updatedAt: "Updated 1 day ago",
    },
    {
      id: "ipm-read-replicas-lead", issueKey: "IPM-3",
      title: "Provision new read replicas",
      description: "Provision read replicas for the new platform's database layer.",
      status: "to-do", priority: "normal",
      assignee: { name: "Jordan Wu", avatar: av(15) },
      milestone: "Platform Cutover", labels: ["Infrastructure"],
      hours: 10, dueDate: "Jul 8", updatedAt: "Updated 2 days ago",
    },
  ],
};

function isEarlierDate(a: string, b: string): boolean {
  return new Date(`${a}, 2026`).getTime() < new Date(`${b}, 2026`).getTime();
}

function sumDelivery(slugs: string[]): DeliverySnapshot {
  return slugs.reduce<DeliverySnapshot>(
    (acc, slug) => {
      const d = DELIVERY_BY_PROJECT[slug];
      if (!d) return acc;
      return {
        completedTickets: acc.completedTickets + d.completedTickets,
        totalTickets: acc.totalTickets + d.totalTickets,
        remainingHours: acc.remainingHours + d.remainingHours,
        blockedTickets: acc.blockedTickets + d.blockedTickets,
        targetDate: acc.targetDate === "" || isEarlierDate(d.targetDate, acc.targetDate) ? d.targetDate : acc.targetDate,
      };
    },
    { completedTickets: 0, totalTickets: 0, remainingHours: 0, blockedTickets: 0, targetDate: "" },
  );
}

// Merge team rosters across projects, summing hours/capacity for anyone
// staffed on more than one of the selected projects.
function aggregateTeam(slugs: string[]): TeamMember[] {
  const merged = new Map<string, TeamMember>();
  for (const slug of slugs) {
    for (const member of getTeamByProjectSlug(slug)) {
      const existing = merged.get(member.name);
      if (existing) {
        merged.set(member.name, {
          ...existing,
          assignedHours: existing.assignedHours + member.assignedHours,
          weeklyCapacity: existing.weeklyCapacity + member.weeklyCapacity,
          activeTicketIds: [...existing.activeTicketIds, ...member.activeTicketIds],
        });
      } else {
        merged.set(member.name, { ...member });
      }
    }
  }
  return Array.from(merged.values());
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

type AttentionTone = "critical" | "warning";

function AttentionCard({
  tone,
  icon,
  count,
  label,
  detail,
  href,
}: {
  tone:    AttentionTone;
  icon:    ReactNode;
  count:   number;
  label:   string;
  detail:  string;
  href:    string;
}) {
  const toneStyles: Record<AttentionTone, string> = {
    critical: "border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10",
    warning:  "border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10",
  };
  const iconTone: Record<AttentionTone, string> = {
    critical: "text-red-500 dark:text-red-400",
    warning:  "text-amber-500 dark:text-amber-400",
  };

  return (
    <Link
      href={href}
      className={`group h-full flex flex-col rounded-xl border p-4 shadow-sm shadow-slate-200/40 dark:shadow-black/20 transition-colors hover:border-brand-300 dark:hover:border-brand-700 ${toneStyles[tone]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={iconTone[tone]}>{icon}</span>
        <svg className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-700 group-hover:text-brand-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" d="M9 18l6-6-6-6" />
        </svg>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 leading-none">{count}</p>
      <p className="text-[13px] font-medium text-slate-700 dark:text-zinc-300 mt-1.5">{label}</p>
      <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5 truncate">{detail}</p>
    </Link>
  );
}

function TeamCapacityRow({ member, onOpen }: { member: TeamMember; onOpen: (m: TeamMember) => void }) {
  const pct    = utilizationOf(member);
  const isOver = member.assignedHours > member.weeklyCapacity;

  return (
    <button
      type="button"
      onClick={() => onOpen(member)}
      className={`w-full flex items-center gap-3 py-2.5 px-2.5 -mx-2.5 rounded-lg text-left transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50 ${isOver ? "bg-red-50/60 dark:bg-red-950/10" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="w-28 flex-shrink-0 min-w-0">
        <p className="text-[13px] font-medium text-slate-800 dark:text-zinc-200 truncate">{member.name}</p>
        <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{member.role}</p>
      </div>
      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${capacityBarColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="w-28 flex-shrink-0 text-right">
        <p className={`text-[12px] font-semibold tabular-nums ${capacityTextColor(pct)}`}>
          {remainingAvailabilityLabel(member)}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums">
          {member.assignedHours}h / {member.weeklyCapacity}h · {pct}%
        </p>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectLeadDashboard() {
  const { user } = useCurrentUser();
  const [preview, setPreview] = useState<Ticket | null>(null);
  const [activeMember, setActiveMember] = useState<TeamMember | null>(null);

  // Projects this Project Lead manages — the Project Context selector below
  // lets them switch between any one of these, or view all of them at once.
  const ownedProjects = projects.filter((p) => LEAD_PROJECT_SLUGS.includes(p.slug));
  const [activeSlug, setActiveSlug] = useState(DEFAULT_PROJECT_SLUG);

  const isAllProjects = activeSlug === ALL_PROJECTS_VALUE;
  const selectedSlugs = isAllProjects ? LEAD_PROJECT_SLUGS : [activeSlug];
  const selectedNames = selectedSlugs
    .map((slug) => ownedProjects.find((p) => p.slug === slug)?.name)
    .filter((name): name is string => name !== undefined);

  const contextTitle = isAllProjects
    ? "All Projects"
    : ownedProjects.find((p) => p.slug === activeSlug)?.name ?? "Project";

  // Links to project-scoped pages have nowhere to go when "All Projects" is
  // selected — future project pages will adopt this same context, but for
  // now those links just fall back to the projects list.
  const linkSlug = isAllProjects ? null : activeSlug;
  function projectHref(path: string): string {
    return linkSlug ? `/projects/${linkSlug}/${path}` : "/projects";
  }

  const delivery = isAllProjects
    ? sumDelivery(selectedSlugs)
    : DELIVERY_BY_PROJECT[activeSlug] ?? DELIVERY_BY_PROJECT[DEFAULT_PROJECT_SLUG];
  const deliveryPct = delivery.totalTickets === 0 ? 0 : Math.round((delivery.completedTickets / delivery.totalTickets) * 100);

  const dueToday = selectedSlugs.reduce((sum, slug) => sum + (DUE_TODAY_BY_PROJECT[slug] ?? 0), 0);

  const team = aggregateTeam(selectedSlugs).sort((a, b) => utilizationOf(b) - utilizationOf(a));
  const overCapacity = team.filter((m) => m.assignedHours > m.weeklyCapacity);

  const projectTickets = selectedSlugs.flatMap((slug) => PROJECT_TICKETS[slug] ?? []);
  const needsReview = projectTickets.filter((t) => t.status === "review" && t.priority === "high");

  const projectActivity = RECENT_ACTIVITY.filter((entry) => selectedNames.includes(entry.project));

  const deadlines = [...projectTickets]
    .filter((t) => t.dueDate)
    .sort((a, b) => {
      const da = new Date(`${a.dueDate}, 2026`).getTime();
      const db = new Date(`${b.dueDate}, 2026`).getTime();
      return da - db;
    });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-2">
            Good morning, {user.name.split(" ")[0]} 👋
          </h1>

          {/* Project Context selector */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-0.5">
            Current Project
          </p>
          <div className="relative inline-flex items-center">
            <select
              value={activeSlug}
              onChange={(event) => setActiveSlug(event.target.value)}
              aria-label="Current project"
              className="appearance-none bg-transparent border-none p-0 pr-5 text-sm font-semibold text-slate-700 dark:text-zinc-200 outline-none cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 focus:ring-2 focus:ring-brand-500/30 rounded"
            >
              <option value={ALL_PROJECTS_VALUE}>All Projects</option>
              {ownedProjects.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-0 w-3 h-3 text-slate-400 dark:text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">Tuesday, June 30</p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={projectHref("team")}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M15 20v-1.5a3.5 3.5 0 00-3.5-3.5h-4A3.5 3.5 0 004 18.5V20" />
              <circle cx="9" cy="7.5" r="3" />
              <path strokeLinecap="round" d="M19 20v-1.5a3.5 3.5 0 00-2.5-3.36M14 4.13a3 3 0 010 5.74" />
            </svg>
            Add Member
          </Link>
          <Link
            href={projectHref("notes")}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6l5 5v11a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2z" />
              <path strokeLinecap="round" d="M9 12h6M9 16h4" />
            </svg>
            New Note
          </Link>
          <Link
            href={projectHref("tickets")}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm shadow-brand-500/30"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            New Ticket
          </Link>
        </div>
      </div>

      {/* ── Section 1: Delivery Health (hero) ───────────────────────────────── */}
      <section className="rounded-2xl border border-brand-100 dark:border-brand-900/40 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/20 dark:to-zinc-900 p-6 sm:p-7 shadow-sm shadow-brand-100/50 dark:shadow-black/20 mb-5">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400 mb-1">
              Current Delivery
            </p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">{contextTitle}</h2>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Target Date</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">{delivery.targetDate}</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex-shrink-0">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-brand-700 dark:text-brand-300 tabular-nums leading-none">
                {deliveryPct}%
              </span>
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">Delivery Progress</span>
            </div>
            <div className="w-full sm:w-56 h-2 rounded-full bg-white/80 dark:bg-zinc-800 border border-brand-100 dark:border-brand-900/40 overflow-hidden mt-3">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                style={{ width: `${deliveryPct}%` }}
              />
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4 lg:pl-6 lg:border-l lg:border-brand-100 dark:lg:border-brand-900/40">
            <HeroStat label="Completed Tickets" value={`${delivery.completedTickets} / ${delivery.totalTickets}`} />
            <HeroStat label="Remaining Hours" value={`${delivery.remainingHours}h`} />
            <HeroStat label="Blocked Tickets" value={delivery.blockedTickets} danger />
          </div>
        </div>
      </section>

      {/* ── Section 2: Attention Required ───────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-2">
        Attention Required
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <AttentionCard
          tone="critical"
          count={delivery.blockedTickets}
          label="Blocked Tickets"
          detail="Needs unblocking"
          href={projectHref("tickets")}
          icon={
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
          }
        />
        <AttentionCard
          tone="warning"
          count={dueToday}
          label="Due Today"
          detail="Jun 30"
          href={projectHref("tickets")}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
          }
        />
        <AttentionCard
          tone="warning"
          count={overCapacity.length}
          label="Over Capacity"
          detail={overCapacity.length > 0 ? overCapacity.map((m) => m.name).join(", ") : "Team is balanced"}
          href={projectHref("team")}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path strokeLinecap="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
        />
        <AttentionCard
          tone="warning"
          count={needsReview.length}
          label="Awaiting Review"
          detail={needsReview[0]?.title ?? "High priority"}
          href={projectHref("tickets")}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-1.5 4L16 12H5" />
            </svg>
          }
        />
      </div>

      {/* ── Section 3: Team Capacity ─────────────────────────────────────────── */}
      <Card
        title="Team Capacity"
        count={team.length}
        action={
          <Link href={projectHref("team")} className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
            View team →
          </Link>
        }
      >
        <div className="space-y-0.5">
          {team.map((member) => (
            <TeamCapacityRow key={member.name} member={member} onOpen={setActiveMember} />
          ))}
        </div>
      </Card>

      <div className="mt-5 space-y-5">

        {/* ── Section 4: My Active Work ───────────────────────────────────────── */}
        <Card
          title="My Active Work"
          count={MY_ACTIVE.length}
          action={
            <Link href="/my-work" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">
              View all →
            </Link>
          }
        >
          <div className="space-y-0.5">
            {MY_ACTIVE.map((t) => (
              <ActiveTicketRow key={t.id} ticket={t} onOpen={setPreview} />
            ))}
          </div>
        </Card>

        {/* ── Section 5: Recent Activity ──────────────────────────────────────── */}
        <Card title="Recent Activity">
          <RecentActivityList items={projectActivity} />
        </Card>

        {/* ── Section 6: Upcoming Deadlines ───────────────────────────────────── */}
        <Card title="Upcoming Deadlines">
          <div className="space-y-1">
            {deadlines.map((t) => {
              const isOverdue =
                t.dueDate === "Jun 28" ||
                t.dueDate === "Jun 29" ||
                t.dueDate === "Jun 30";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPreview(t)}
                  className="w-full flex items-center gap-2.5 py-1.5 px-2.5 -mx-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-400" : "bg-slate-300 dark:bg-zinc-600"}`} />
                  <span className="flex-1 min-w-0 text-[12px] text-slate-700 dark:text-zinc-300 truncate">
                    {t.title}
                  </span>
                  <span className={`text-[11px] font-semibold flex-shrink-0 ${isOverdue ? "text-red-500 dark:text-red-400" : "text-slate-500 dark:text-zinc-400"}`}>
                    {t.dueDate}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

      </div>

      {/* ── Ticket preview panel ─────────────────────────────────────────────── */}
      {preview !== null && (
        <TicketPreviewPanel
          ticket={preview}
          slug={linkSlug ?? DEFAULT_PROJECT_SLUG}
          onClose={() => setPreview(null)}
        />
      )}

      {/* ── Team member modal ─────────────────────────────────────────────────── */}
      {activeMember && (
        <MemberModal
          member={activeMember}
          slug={linkSlug ?? activeMember.projectSlug}
          onClose={() => setActiveMember(null)}
        />
      )}

    </div>
  );
}
