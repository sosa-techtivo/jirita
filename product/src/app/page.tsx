import type { ReactNode } from "react";

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
  "on-track": { bar: "bg-emerald-500", label: "text-emerald-600", due: "text-slate-400" },
  "at-risk": { bar: "bg-red-500", label: "text-red-600", due: "text-red-500 font-medium" },
  "not-started": { bar: "bg-slate-400", label: "text-slate-400", due: "text-slate-400" },
};

const milestones: Milestone[] = [
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

const blockedTickets: BlockedTicket[] = [
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

const inProgressTickets: ActiveTicket[] = [
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

const activity: ActivityEntry[] = [
  {
    id: "activity-1",
    avatar: avatar(12),
    name: "Marcus Lee",
    message: (
      <>
        moved <span className="font-medium">&quot;Fix biometric login crash&quot;</span> to{" "}
        <span className="text-emerald-600 font-medium">Done</span>
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
        <span className="text-violet-600 font-medium">Review</span>
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

const projects = [
  { id: "mobile-banking", name: "Mobile Banking App", dot: "bg-emerald-500", current: true },
  { id: "client-website", name: "Client Website Redesign", dot: "bg-amber-500", current: false },
  { id: "platform-migration", name: "Internal Platform Migration", dot: "bg-emerald-500", current: false },
];

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
      {/* ============ SIDEBAR ============ */}
      <aside className="w-60 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-slate-100">
          <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
            J
          </div>
          <span className="ml-2 font-semibold text-slate-900 tracking-tight">Jirita</span>
        </div>

        <div className="px-3 pt-3">
          <button className="w-full flex items-center gap-2 text-sm text-slate-400 bg-slate-100 hover:bg-slate-200/70 rounded-md px-2.5 py-1.5 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span>Search</span>
            <span className="ml-auto text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded px-1 py-0.5">
              ⌘K
            </span>
          </button>
        </div>

        <nav className="px-2 pt-4 space-y-0.5 text-sm">
          <a href="#" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            Dashboard
          </a>
          <a href="#" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md bg-brand-50 text-brand-700 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 7l4-4h6l4 4" />
              <rect x="3" y="7" width="18" height="13" rx="2" />
            </svg>
            Projects
          </a>
          <a href="#" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            My Work
          </a>
          <a href="#" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 19V9M12 19V5M20 19v-7" />
            </svg>
            Reports
          </a>
          <a href="#" className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-600 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </a>
        </nav>

        <div className="mt-5 px-3">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Projects</span>
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          <div className="space-y-0.5 text-sm">
            {projects.map((project) =>
              project.current ? (
                <div key={project.id} className="rounded-md bg-brand-50">
                  <a href="#" className="flex items-center gap-2 px-2 py-1.5 text-brand-700 font-medium">
                    <span className={`w-1.5 h-1.5 rounded-full ${project.dot} flex-shrink-0`} />
                    {project.name}
                  </a>
                  <div className="pl-6 pb-1 space-y-0.5">
                    <a href="#" className="block px-2 py-1 rounded-md bg-white text-slate-900 font-medium text-[13px]">
                      Overview
                    </a>
                    <a href="#" className="block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px]">
                      Milestones
                    </a>
                    <a href="#" className="block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px]">
                      Tickets
                    </a>
                    <a href="#" className="block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px]">
                      Notes
                    </a>
                    <a href="#" className="block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px]">
                      Reports
                    </a>
                    <a href="#" className="block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px]">
                      Team
                    </a>
                  </div>
                </div>
              ) : (
                <a
                  key={project.id}
                  href="#"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-600 hover:bg-slate-100"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${project.dot} flex-shrink-0`} />
                  {project.name}
                </a>
              ),
            )}
          </div>
        </div>

        <div className="mt-auto border-t border-slate-100 px-3 py-3 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar(47)} alt="Sarah Chen" className="w-7 h-7 rounded-full" />
          <div className="text-sm leading-tight">
            <p className="font-medium text-slate-800">Sarah Chen</p>
            <p className="text-xs text-slate-400">Techtivo</p>
          </div>
        </div>
      </aside>

      {/* ============ MAIN ============ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-8 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <span className="text-slate-400">Projects</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-medium">Mobile Banking App</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-slate-400 hover:text-slate-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 01-3.4 0" />
              </svg>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar(47)} alt="Sarah Chen" className="w-7 h-7 rounded-full" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-10">
            {/* ===== Project Header ===== */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                  MB
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Mobile Banking App</h1>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 max-w-xl">
                    iOS and Android banking experience for Meridian Bank — redesign of onboarding, transfers, and
                    biometric authentication.
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    <span>
                      Owned by <span className="text-slate-600 font-medium">Sarah Chen</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>Started Mar 3, 2026</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3.5 py-2 transition-colors">
                  + Milestone
                </button>
                <button className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors">
                  + New Ticket
                </button>
              </div>
            </div>

            {/* ===== Slim attention line (not a hero) ===== */}
            <div className="mt-5 flex items-center gap-2.5 text-sm text-amber-800 bg-amber-50/70 rounded-md px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              <p className="flex-1">
                <span className="font-medium">Security Audit Fixes</span> due in 3 days at 30% complete
                <span className="text-amber-400 mx-1.5">·</span>
                2 tickets blocked 4+ days
              </p>
              <a href="#" className="text-xs font-medium text-amber-700 hover:text-amber-900 flex-shrink-0">
                Review →
              </a>
            </div>

            {/* ===== Milestones — the main character ===== */}
            <section className="mt-10">
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Milestones</h2>
                <a href="#" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  View all →
                </a>
              </div>

              <div className="divide-y divide-slate-100">
                {milestones.map((milestone) => {
                  const style = milestoneStyles[milestone.status];
                  const progress = Math.round((milestone.ticketsDone / milestone.ticketsTotal) * 100);
                  return (
                    <div key={milestone.id} className="py-4 flex items-center gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{milestone.name}</h3>
                          <span className={`text-xs font-medium ${style.label}`}>{milestone.statusLabel}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 max-w-xs h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">
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
                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-baseline justify-between mb-1">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active Work</h2>
                    <a href="#" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                      View all 29 tickets →
                    </a>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-red-500 mb-1.5">Blocked</p>
                    <div className="divide-y divide-slate-100">
                      {blockedTickets.map((ticket) => (
                        <div key={ticket.id} className="py-2.5 flex items-center justify-between">
                          <p className="text-sm text-slate-800">{ticket.title}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-slate-400">{ticket.blockedFor}</span>
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
                    <p className="text-xs font-medium text-slate-400 mb-1.5">In Progress</p>
                    <div className="divide-y divide-slate-100">
                      {inProgressTickets.map((ticket) => (
                        <div key={ticket.id} className="py-2.5 flex items-center justify-between">
                          <p className="text-sm text-slate-800">{ticket.title}</p>
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

                  <p className="text-xs text-slate-400 mt-4">29 open · 23 closed this month</p>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Recent Activity</h2>
                  <ul className="space-y-4">
                    {activity.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={entry.avatar} alt={entry.name} className="w-6 h-6 rounded-full mt-0.5" />
                        <div className="text-sm leading-snug">
                          <p className="text-slate-700">
                            <span className="font-medium text-slate-900">{entry.name}</span> {entry.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{entry.time}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {/* Right column: secondary content, kept above the fold */}
              <div className="space-y-6">
                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Team</h2>
                  <ul className="space-y-3">
                    {team.map((member) => (
                      <li key={member.id} className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={member.avatar} alt={member.name} className="w-7 h-7 rounded-full" />
                        <div className="text-sm leading-tight flex-1">
                          <p className="font-medium text-slate-800">{member.name}</p>
                          <p className="text-xs text-slate-400">{member.role}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Quick Links</h2>
                  <ul className="space-y-1.5 text-sm">
                    <li>
                      <a href="#" className="text-slate-600 hover:text-brand-600">
                        Notes &amp; Documentation
                      </a>
                    </li>
                    <li>
                      <a href="#" className="text-slate-600 hover:text-brand-600">
                        Project Reports
                      </a>
                    </li>
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
