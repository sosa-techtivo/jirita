"use client";

import Link from "next/link";
import { useState } from "react";
import { tickets } from "@/lib/mock-tickets";
import { TicketStatusBadge } from "@/components/ticket-status-badge";
import { FilterChips } from "@/components/filter-chips";

type TicketFilter = "all" | "to-do" | "in-progress" | "review" | "blocked" | "done" | "high-priority" | "mine";

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "to-do", label: "To Do" },
  { value: "in-progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "high-priority", label: "High Priority" },
  { value: "mine", label: "Mine" },
];

const openTickets = tickets.filter((ticket) => ticket.status !== "done").length;
const blockedTickets = tickets.filter((ticket) => ticket.status === "blocked").length;
const completedThisWeek = tickets.filter((ticket) => ticket.status === "done").length;

export function TicketsScreen({ slug, projectName }: { slug: string; projectName: string }) {
  const [filter, setFilter] = useState<TicketFilter>("all");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">
            {projectName}
          </p>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5 dark:text-zinc-50">Tickets</h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
            Manage all work items for this project.
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors flex-shrink-0 dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
        >
          + New Ticket
        </button>
      </div>

      <div className="mt-6">
        <label className="relative block sm:max-w-xs">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search tickets..."
            className="w-full text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>

        <div className="mt-3">
          <FilterChips options={FILTERS} active={filter} onChange={setFilter} />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="divide-y divide-slate-100 dark:divide-zinc-800 px-2 sm:px-3">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/projects/${slug}/tickets/${ticket.id}`}
                  className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">
                        {ticket.title}
                      </h3>
                      <TicketStatusBadge status={ticket.status} />
                      {ticket.priority === "high" && (
                        <span className="text-xs font-medium text-red-600 dark:text-red-400 flex-shrink-0">
                          High Priority
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-zinc-400 truncate mt-0.5">{ticket.description}</p>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-zinc-500 flex-shrink-0">
                    <span className="hidden md:inline-flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ticket.assignee.avatar} alt={ticket.assignee.name} className="w-5 h-5 rounded-full" />
                      <span className="text-slate-600 dark:text-zinc-300">{ticket.assignee.name}</span>
                    </span>
                    <span className="hidden lg:inline">{ticket.milestone}</span>
                    <span className="hidden sm:inline">{ticket.updatedAt}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <div className="hidden lg:flex flex-col gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-zinc-700/70 dark:bg-zinc-900 dark:shadow-black/20">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 dark:text-zinc-400">
              Overview
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-zinc-400">Open tickets</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100">{openTickets}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-zinc-400">Completed this week</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100">{completedThisWeek}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-zinc-400">Blocked</dt>
                <dd className="font-medium text-red-600 dark:text-red-400">{blockedTickets}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-zinc-400 flex-shrink-0">Upcoming milestone</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100 text-right">App Store Submission</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
