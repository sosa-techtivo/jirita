"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { projects as allProjects } from "@/lib/mock-projects";
import type { ProjectStatus, ProjectSummary } from "@/lib/mock-projects";
import { StatusBadge } from "@/components/status-badge";

type FilterValue = "all" | ProjectStatus;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "on-track", label: "On Track" },
  { value: "at-risk", label: "At Risk" },
  { value: "on-hold", label: "On Hold" },
  { value: "archived", label: "Archived" },
];

export function ProjectsListScreen() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const searchId = useId();

  const query = search.trim().toLowerCase();
  const filtered = allProjects.filter((project) => {
    const matchesFilter = filter === "all" || project.status === filter;
    const matchesSearch =
      query === "" ||
      project.name.toLowerCase().includes(query) ||
      project.description.toLowerCase().includes(query) ||
      project.owner.name.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-zinc-50">Projects</h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-zinc-400">
            Every project across your workspace, at a glance.
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3.5 py-2 transition-colors flex-shrink-0 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          + Create Project
        </button>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor={searchId} className="relative w-full sm:w-56 flex-shrink-0">
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
            id={searchId}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects..."
            className="w-full text-sm bg-slate-100 placeholder:text-slate-400 rounded-md pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:text-zinc-100"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((item) => {
            const isActive = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`text-sm px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-slate-100 text-slate-900 font-medium dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <EmptyState hasAnyProjects={allProjects.length > 0} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {filtered.map((project) => (
              <ProjectRow key={project.slug} project={project} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4 px-3 -mx-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{project.name}</h3>
          <StatusBadge status={project.status} />
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400 truncate mt-0.5">{project.description}</p>
        {project.status !== "archived" && (
          <div className="mt-2 max-w-[160px] h-1 rounded-full bg-slate-100 overflow-hidden dark:bg-zinc-800">
            <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${project.progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-5 text-xs text-slate-400 dark:text-zinc-500 flex-shrink-0">
        <span className="hidden md:inline-flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={project.owner.avatar} alt={project.owner.name} className="w-5 h-5 rounded-full" />
          <span className="text-slate-600 dark:text-zinc-300">{project.owner.name}</span>
        </span>
        <span className="hidden lg:inline">{project.openTickets} open</span>
        <span className="hidden sm:inline">{project.updatedAt}</span>
      </div>
    </Link>
  );
}

function EmptyState({ hasAnyProjects }: { hasAnyProjects: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 7l4-4h6l4 4" />
          <rect x="3" y="7" width="18" height="13" rx="2" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
        {hasAnyProjects ? "No matching projects" : "No projects yet"}
      </h3>
      <p className="text-sm text-slate-400 mt-1 max-w-xs dark:text-zinc-500">
        {hasAnyProjects ? "Try adjusting your search or filters." : "Get started by creating your first project."}
      </p>
      <button
        type="button"
        className="mt-5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3.5 py-2 shadow-sm shadow-brand-600/20 transition-colors dark:bg-brand-500 dark:hover:bg-brand-600 dark:shadow-brand-500/20"
      >
        + Create Project
      </button>
    </div>
  );
}
