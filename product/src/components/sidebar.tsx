"use client";

import Image from "next/image";
import Link from "next/link";
import { projects } from "@/lib/mock-projects";
import { statusMeta } from "@/components/status-badge";
import { useCurrentUser } from "@/components/current-user-provider";
import { mainNavForRole, projectNavForRole } from "@/lib/nav-config";

const pinnedProjects = projects.slice(0, 3);

export function Sidebar({
  activeSlug,
  activeSection = "overview",
  activePage,
}: {
  activeSlug?: string;
  activeSection?: "overview" | "tickets" | "notes" | "team" | "reports";
  activePage?: string;
}) {
  const { user } = useCurrentUser();
  const mainNav     = mainNavForRole(user.role);
  const projectNav  = projectNavForRole(user.role);

  const isDashboard   = activePage === "dashboard";
  const isMyWork      = activePage === "my-work";
  const isReports     = activePage === "reports";
  const isSettings    = activePage === "settings";
  const isTimeTracking = activePage === "time-tracking";
  const isProjects    = !isDashboard && !isMyWork && !isReports && !isSettings && !isTimeTracking;
  return (
    <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-slate-200 bg-white flex-col dark:border-zinc-700/60 dark:bg-zinc-950">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800">
        <Image
          src="/img/jirita-logo.png"
          alt="Techtivo"
          width={217}
          height={47}
          className="h-5 w-auto"
          priority
        />
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600/70 leading-none dark:text-brand-400/80">
          Jirita
        </p>
      </div>

      <div className="px-3 pt-3">
        <button className="w-full flex items-center gap-2 text-sm text-slate-400 bg-slate-100 hover:bg-slate-200/70 rounded-md px-2.5 py-1.5 transition-colors dark:text-zinc-500 dark:bg-zinc-900 dark:hover:bg-zinc-800">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span>Search</span>
          <span className="ml-auto text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded px-1 py-0.5 dark:text-zinc-500 dark:bg-zinc-800 dark:border-zinc-700">
            ⌘K
          </span>
        </button>
      </div>

      <nav className="px-2 pt-4 space-y-0.5 text-sm">
        {mainNav.has("dashboard") && (
          <Link
            href="/"
            className={[
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
              isDashboard
                ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            Dashboard
          </Link>
        )}
        {mainNav.has("projects") && (
          <Link
            href="/projects"
            className={[
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
              isProjects
                ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 7l4-4h6l4 4" />
              <rect x="3" y="7" width="18" height="13" rx="2" />
            </svg>
            Projects
          </Link>
        )}
        {mainNav.has("my-work") && (
          <Link
            href="/my-work"
            className={[
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
              isMyWork
                ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
            My Work
          </Link>
        )}
        {mainNav.has("reports") && (
          <Link
            href="/reports"
            className={[
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
              isReports
                ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 19V9M12 19V5M20 19v-7" />
            </svg>
            Reports
          </Link>
        )}
        {mainNav.has("time-tracking") && (
          <Link
            href="/settings/time-tracking"
            className={[
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
              isTimeTracking
                ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            Time Tracking
          </Link>
        )}
        {mainNav.has("settings") && (
          <Link
            href="/settings/general"
            className={[
              "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
              isSettings
                ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
            ].join(" ")}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </Link>
        )}
      </nav>

      <div className="mt-5 px-3">
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Projects</span>
          <button className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <div className="space-y-0.5 text-sm">
          {pinnedProjects.map((project) => {
            const dot = statusMeta[project.status].dot;
            return project.slug === activeSlug ? (
              <div key={project.slug} className="rounded-md bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-100 dark:ring-brand-500/20">
                <Link href={`/projects/${project.slug}`} className="flex items-center gap-2 px-2 py-1.5 text-brand-700 font-semibold dark:text-brand-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
                  {project.name}
                </Link>
                <div className="pl-6 pb-1 space-y-0.5">
                  <Link
                    href={`/projects/${project.slug}`}
                    className={
                      activeSection === "overview"
                        ? "block px-2 py-1 rounded-md bg-white text-brand-700 font-semibold text-[13px] shadow-sm shadow-slate-100 dark:bg-zinc-800 dark:text-brand-400"
                        : "block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px] dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                    }
                  >
                    Overview
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/tickets`}
                    className={
                      activeSection === "tickets"
                        ? "block px-2 py-1 rounded-md bg-white text-brand-700 font-semibold text-[13px] shadow-sm shadow-slate-100 dark:bg-zinc-800 dark:text-brand-400"
                        : "block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px] dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                    }
                  >
                    Tickets
                  </Link>
                  <Link
                    href={`/projects/${project.slug}/notes`}
                    className={
                      activeSection === "notes"
                        ? "block px-2 py-1 rounded-md bg-white text-brand-700 font-semibold text-[13px] shadow-sm shadow-slate-100 dark:bg-zinc-800 dark:text-brand-400"
                        : "block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px] dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                    }
                  >
                    Notes
                  </Link>
                  {projectNav.has("team") && (
                    <Link
                      href={`/projects/${project.slug}/team`}
                      className={
                        activeSection === "team"
                          ? "block px-2 py-1 rounded-md bg-white text-brand-700 font-semibold text-[13px] shadow-sm shadow-slate-100 dark:bg-zinc-800 dark:text-brand-400"
                          : "block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px] dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                      }
                    >
                      Team
                    </Link>
                  )}
                  {projectNav.has("reports") && (
                    <Link
                      href={`/projects/${project.slug}/reports`}
                      className={
                        activeSection === "reports"
                          ? "block px-2 py-1 rounded-md bg-white text-brand-700 font-semibold text-[13px] shadow-sm shadow-slate-100 dark:bg-zinc-800 dark:text-brand-400"
                          : "block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px] dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                      }
                    >
                      Reports
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <Link
                key={project.slug}
                href={`/projects/${project.slug}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
                {project.name}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-auto border-t border-slate-100 px-3 py-3 flex items-center gap-2 dark:border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
        <div className="text-sm leading-tight">
          <p className="font-medium text-slate-800 dark:text-zinc-200">{user.name}</p>
          <p className="text-xs text-slate-400 dark:text-zinc-500">{user.discipline}</p>
        </div>
      </div>
    </aside>
  );
}
