"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { tickets as ALL_MOCK_TICKETS } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";

const MOCK_ESTIMATED_HOURS = ALL_MOCK_TICKETS.reduce((sum, t) => sum + (t.hours ?? 0), 0);

type MilestoneStatus = "on-track" | "at-risk" | "not-started";

interface Milestone {
  id: string;
  name: string;
  dueDate: string;
  status: MilestoneStatus;
  statusLabel: string;
  ticketsDone: number;
  ticketsTotal: number;
}

interface Assignee {
  name: string;
  avatar: string;
}

interface BlockedTicket {
  id: string;
  title: string;
  blockedFor: string;
  assignee: Assignee;
}

interface ActiveTicket {
  id: string;
  title: string;
  assignee: Assignee;
}

interface ActivityEntry {
  id: string;
  avatar: string;
  name: string;
  message: ReactNode;
  time: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

const milestoneStyles: Record<
  MilestoneStatus,
  { bar: string; label: string; due: string }
> = {
  "on-track": { bar: "bg-emerald-500", label: "text-emerald-600 dark:text-emerald-400", due: "text-slate-400 dark:text-zinc-500" },
  "at-risk": { bar: "bg-red-500", label: "text-red-600 dark:text-red-400", due: "text-red-500 dark:text-red-400 font-medium" },
  "not-started": { bar: "bg-slate-400 dark:bg-zinc-600", label: "text-slate-400 dark:text-zinc-500", due: "text-slate-400 dark:text-zinc-500" },
};

const INITIAL_MILESTONES: Milestone[] = [
  {
    id: "beta-release",
    name: "Beta Release",
    dueDate: "Due Jul 15",
    status: "on-track",
    statusLabel: "On track",
    ticketsDone: 8,
    ticketsTotal: 12,
  },
  {
    id: "security-audit-fixes",
    name: "Security Audit Fixes",
    dueDate: "Due Jun 25",
    status: "at-risk",
    statusLabel: "At risk",
    ticketsDone: 3,
    ticketsTotal: 10,
  },
  {
    id: "app-store-submission",
    name: "App Store Submission",
    dueDate: "Due Aug 1",
    status: "not-started",
    statusLabel: "Not started",
    ticketsDone: 1,
    ticketsTotal: 6,
  },
];

const INITIAL_BLOCKED_TICKETS: BlockedTicket[] = [
  {
    id: "blocked-pci",
    title: "Resolve PCI compliance gap in card storage",
    blockedFor: "4 days",
    assignee: { name: "Priya Patel", avatar: avatar(33) },
  },
  {
    id: "blocked-kyc",
    title: "Third-party KYC vendor API outage",
    blockedFor: "6 days",
    assignee: { name: "David Kim", avatar: avatar(22) },
  },
];

const INITIAL_IN_PROGRESS: ActiveTicket[] = [
  {
    id: "active-pagination",
    title: "Implement transaction history pagination",
    assignee: { name: "Sarah Chen", avatar: avatar(47) },
  },
  {
    id: "active-push",
    title: "Push notification setup",
    assignee: { name: "David Kim", avatar: avatar(22) },
  },
  {
    id: "active-settings",
    title: "Redesign account settings screen",
    assignee: { name: "Elena Rossi", avatar: avatar(5) },
  },
  {
    id: "active-mfa",
    title: "Add multi-factor authentication step",
    assignee: { name: "Marcus Lee", avatar: avatar(12) },
  },
];

const INITIAL_ACTIVITY: ActivityEntry[] = [
  {
    id: "activity-1",
    avatar: avatar(12),
    name: "Marcus Lee",
    message: (
      <>
        moved <span className="font-medium">&quot;Fix biometric login crash&quot;</span> to{" "}
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Done</span>
      </>
    ),
    time: "12 minutes ago",
  },
  {
    id: "activity-2",
    avatar: avatar(47),
    name: "Sarah Chen",
    message: (
      <>
        commented on{" "}
        <span className="font-medium">&quot;Implement transaction history pagination&quot;</span>
      </>
    ),
    time: "1 hour ago",
  },
  {
    id: "activity-3",
    avatar: avatar(33),
    name: "Priya Patel",
    message: (
      <>
        moved <span className="font-medium">&quot;API rate limiting&quot;</span> to{" "}
        <span className="text-violet-600 dark:text-violet-400 font-medium">Review</span>
      </>
    ),
    time: "3 hours ago",
  },
  {
    id: "activity-4",
    avatar: avatar(22),
    name: "David Kim",
    message: (
      <>
        logged <span className="font-medium">2h</span> on{" "}
        <span className="font-medium">&quot;Push notification setup&quot;</span>
      </>
    ),
    time: "5 hours ago",
  },
  {
    id: "activity-5",
    avatar: avatar(47),
    name: "Sarah Chen",
    message: (
      <>
        created milestone <span className="font-medium">&quot;App Store Submission&quot;</span>
      </>
    ),
    time: "Yesterday",
  },
];

const team: TeamMember[] = [
  { id: "team-sarah", name: "Sarah Chen", role: "Project Lead", avatar: avatar(47) },
  { id: "team-marcus", name: "Marcus Lee", role: "Engineer", avatar: avatar(12) },
  { id: "team-priya", name: "Priya Patel", role: "Engineer", avatar: avatar(33) },
  { id: "team-david", name: "David Kim", role: "QA Engineer", avatar: avatar(22) },
  { id: "team-elena", name: "Elena Rossi", role: "Designer", avatar: avatar(5) },
];

export function ProjectOverview({ slug = "mobile-banking-app" }: { slug?: string }) {
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>(INITIAL_MILESTONES);
  const [inProgressTickets, setInProgressTickets] = useState<ActiveTicket[]>(INITIAL_IN_PROGRESS);
  const [activity, setActivity] = useState<ActivityEntry[]>(INITIAL_ACTIVITY);
  const [openCount, setOpenCount] = useState(29);

  function handleTicketCreated(ticket: Ticket) {
    setShowNewTicket(false);

    // Update milestone ticket total if the ticket has a matching milestone
    if (ticket.milestone) {
      setMilestones((prev) =>
        prev.map((m) =>
          m.name === ticket.milestone ? { ...m, ticketsTotal: m.ticketsTotal + 1 } : m
        )
      );
    }

    // Add to in-progress list if the status warrants it
    if (ticket.status === "in-progress") {
      setInProgressTickets((prev) => [
        { id: ticket.id, title: ticket.title, assignee: ticket.assignee },
        ...prev,
      ]);
    }

    // Increment open count for any non-done ticket
    if (ticket.status !== "done") {
      setOpenCount((n) => n + 1);
    }

    // Prepend activity entry
    setActivity((prev) => [
      {
        id: `activity-new-${ticket.id}`,
        avatar: "https://i.pravatar.cc/64?img=1",
        name: "You",
        message: (
          <>
            created ticket <span className="font-medium">&quot;{ticket.title}&quot;</span>
          </>
        ),
        time: "Just now",
      },
      ...prev,
    ]);
  }

  function handlePreviewDuplicate(_ticket: Ticket) {
    setShowNewTicket(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* ===== Project Header ===== */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            MB
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Mobile Banking App</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-xl dark:text-zinc-400">
              iOS and Android banking experience for Meridian Bank — redesign of onboarding, transfers, and
              biometric authentication.
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 dark:text-zinc-500">
              <span>
                Owned by <span className="text-slate-600 font-medium dark:text-zinc-300">Sarah Chen</span>
              </span>
              <span className="text-slate-300 dark:text-zinc-700">·</span>
              <span>Started Mar 3, 2026</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3.5 py-2 transition-colors dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-900">
            + Milestone
          </button>
          <button
            onClick={() => setShowNewTicket(true)}
            className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
          >
            + New Ticket
          </button>
        </div>
      </div>

      {/* ===== Slim attention line (not a hero) ===== */}
      <div className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 rounded-md px-3 py-2 dark:text-amber-300 dark:bg-amber-500/10">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
        <p className="flex-1">
          <span className="font-medium">Security Audit Fixes</span> due in 3 days at 30% complete
          <span className="text-amber-400 dark:text-amber-600 mx-1.5">·</span>
          2 tickets blocked 4+ days
        </p>
        <a href="#" className="text-xs font-medium text-amber-700 hover:text-amber-900 flex-shrink-0 dark:text-amber-400 dark:hover:text-amber-200">
          Review →
        </a>
      </div>

      {/* ===== KPI strip ===== */}
      <div className="mt-6 flex items-stretch divide-x divide-slate-100 dark:divide-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 shadow-sm shadow-slate-200/40 dark:shadow-black/20 overflow-hidden">
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Open Tickets</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-1 leading-none">{openCount}</p>
        </div>
        <div className="flex-1 px-5 py-4 bg-brand-50/30 dark:bg-brand-950/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 dark:text-brand-400">Estimated Hours</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300 mt-1 leading-none">
            {MOCK_ESTIMATED_HOURS}
            <span className="text-base font-medium text-brand-400 dark:text-brand-500 ml-0.5">h</span>
          </p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Blocked</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1 leading-none">2</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">Closed</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 leading-none">
            23
            <span className="text-xs font-normal text-slate-400 dark:text-zinc-500 ml-1">this mo.</span>
          </p>
        </div>
      </div>

      {/* ===== Milestones — the main character ===== */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Milestones</h2>
          <a href="#" className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300">
            View all →
          </a>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          {milestones.map((milestone) => {
            const style = milestoneStyles[milestone.status];
            const progress = Math.round((milestone.ticketsDone / milestone.ticketsTotal) * 100);
            return (
              <div key={milestone.id} className="py-4 flex items-center gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">{milestone.name}</h3>
                    <span className={`text-xs font-medium ${style.label}`}>{milestone.statusLabel}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 max-w-xs h-1.5 rounded-full bg-slate-100 overflow-hidden dark:bg-zinc-800">
                      <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 dark:text-zinc-500">
                      {milestone.ticketsDone} of {milestone.ticketsTotal} tickets
                    </span>
                  </div>
                </div>
                <span className={`text-sm flex-shrink-0 ${style.due}`}>{milestone.dueDate}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Active Work + Team, Recent Activity + Quick Links ===== */}
      <div className="mt-10 grid grid-cols-3 gap-8 items-start">
        {/* Left column: primary content */}
        <div className="col-span-2 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Active Work</h2>
              <Link
                href={`/projects/${slug}/tickets`}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                View all {openCount} tickets →
              </Link>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium text-red-500 mb-1.5 dark:text-red-400">Blocked</p>
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {INITIAL_BLOCKED_TICKETS.map((ticket) => (
                  <div key={ticket.id} className="py-2.5 flex items-center justify-between">
                    <p className="text-sm text-slate-800 dark:text-zinc-200">{ticket.title}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-slate-400 dark:text-zinc-500">{ticket.blockedFor}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ticket.assignee.avatar}
                        alt={ticket.assignee.name}
                        className="w-6 h-6 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium text-slate-400 mb-1.5 dark:text-zinc-500">In Progress</p>
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {inProgressTickets.map((ticket) => (
                  <div key={ticket.id} className="py-2.5 flex items-center justify-between">
                    <p className="text-sm text-slate-800 dark:text-zinc-200">{ticket.title}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ticket.assignee.avatar}
                      alt={ticket.assignee.name}
                      className="w-6 h-6 rounded-full flex-shrink-0"
                    />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-4 dark:text-zinc-500">{openCount} open · 23 closed this month</p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 dark:text-zinc-400">Recent Activity</h2>
            <ul className="space-y-4">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.avatar} alt={entry.name} className="w-6 h-6 rounded-full mt-0.5" />
                  <div className="text-sm leading-snug">
                    <p className="text-slate-700 dark:text-zinc-300">
                      <span className="font-medium text-slate-900 dark:text-zinc-100">{entry.name}</span> {entry.message}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 dark:text-zinc-500">{entry.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right column: secondary content, kept above the fold */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 dark:text-zinc-400">Team</h2>
            <ul className="space-y-3">
              {team.map((member) => (
                <li key={member.id} className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={member.avatar} alt={member.name} className="w-7 h-7 rounded-full" />
                  <div className="text-sm leading-tight flex-1">
                    <p className="font-medium text-slate-800 dark:text-zinc-200">{member.name}</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500">{member.role}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 dark:text-zinc-400">Quick Links</h2>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link
                  href={`/projects/${slug}/notes`}
                  className="text-slate-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400"
                >
                  Notes &amp; Documentation
                </Link>
              </li>
              <li>
                <a href="#" className="text-slate-600 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400">
                  Project Reports
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>

      {showNewTicket && (
        <NewTicketModal
          slug={slug}
          onClose={() => setShowNewTicket(false)}
          onCreated={handleTicketCreated}
          onPreviewDuplicate={handlePreviewDuplicate}
        />
      )}
    </div>
  );
}
