"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { statusMeta } from "@/components/status-badge";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { mainNavForRole, projectNavForRole } from "@/lib/nav-config";
import type { MainNavKey } from "@/lib/nav-config";
import { CreateProjectModal } from "@/components/create-project-modal";
import { useMemberProfile } from "@/components/member-profile";
import { searchGlobal } from "@/lib/search";
import type { GlobalSearchProject, GlobalSearchResults, GlobalSearchTicket, GlobalSearchUser } from "@/lib/search";

// Main nav link content, keyed so `mainNavForRole`'s order (per role) drives
// what renders where — the sidebar no longer hardcodes link order itself.
const NAV_LINK: Record<MainNavKey, { href: string; label: string; icon: ReactNode }> = {
  dashboard: {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  projects: {
    href: "/projects",
    label: "Projects",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 7l4-4h6l4 4" />
        <rect x="3" y="7" width="18" height="13" rx="2" />
      </svg>
    ),
  },
  "my-work": {
    href: "/my-work",
    label: "My Work",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
  reports: {
    href: "/reports",
    label: "Reports",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M4 19V9M12 19V5M20 19v-7" />
      </svg>
    ),
  },
  "time-tracking": {
    href: "/time-tracking",
    label: "Time Tracking",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  users: {
    href: "/users",
    label: "Users",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  settings: {
    href: "/settings/general",
    label: "Settings",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
};

// "Projects" has no dedicated `activePage` value of its own — it's the
// fallback highlight whenever none of the other explicit pages match
// (e.g. while browsing a project's overview/tickets/notes/team/reports).
const EXPLICIT_NAV_PAGES: MainNavKey[] = ["dashboard", "my-work", "reports", "settings", "time-tracking", "users"];

function isNavActive(key: MainNavKey, activePage?: string): boolean {
  if (key === "projects") return !EXPLICIT_NAV_PAGES.some((page) => page === activePage);
  return activePage === key;
}

// ── Global Search popover ────────────────────────────────────────────────
// Data-layer-only for now (see lib/search.ts) — this is just the results
// popover under the existing Search field. No navigation on select, no
// Enter/arrow-key handling, and no ⌘K shortcut yet (the badge stays purely
// decorative, same as before).

const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_SEARCH_RESULTS: GlobalSearchResults = { projects: [], tickets: [], users: [] };

function SearchResultGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-1 py-1.5">
      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// One flattened, ordered result — Projects, then Tickets, then Users,
// matching the popover's own rendering order — so ArrowUp/ArrowDown/Enter
// can walk "all visible results" as a single sequence without caring which
// group a given index falls in.
type FlatSearchResult =
  | { type: "project"; value: GlobalSearchProject }
  | { type: "ticket"; value: GlobalSearchTicket }
  | { type: "user"; value: GlobalSearchUser };

function flattenSearchResults(results: GlobalSearchResults): FlatSearchResult[] {
  return [
    ...results.projects.map((value): FlatSearchResult => ({ type: "project", value })),
    ...results.tickets.map((value): FlatSearchResult => ({ type: "ticket", value })),
    ...results.users.map((value): FlatSearchResult => ({ type: "user", value })),
  ];
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

// Same background the rows already use on hover — the keyboard-selected row
// reuses it rather than introducing a new color, per "discreet, compatible
// with existing styles."
const SEARCH_RESULT_ROW_CLASS =
  "w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors";
const SEARCH_RESULT_ROW_SELECTED_CLASS = "bg-slate-50 dark:bg-zinc-800/50";

export function Sidebar({
  activeSlug,
  activeSection = "overview",
  activePage,
}: {
  activeSlug?: string;
  activeSection?: "overview" | "tickets" | "notes" | "team" | "reports" | "settings";
  activePage?: string;
}) {
  const { user, organization, userId, isDevFallback } = useCurrentUser();
  const { projects } = useOrganizationProjects();
  const { openMemberProfile } = useMemberProfile();
  const router = useRouter();
  const mainNav     = mainNavForRole(user.role);
  const projectNav  = projectNavForRole(user.role);
  const pinnedProjects = projects.filter((project) => project.status !== "archived").slice(0, 3);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ── Global Search ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoadState, setSearchLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GlobalSearchResults>(EMPTY_SEARCH_RESULTS);
  // Index into flattenSearchResults(searchResults) — null means "nothing
  // keyboard-selected yet" (Enter then defaults to the first result).
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced real search — never queries for an empty (post-trim) term,
  // and clears results the instant the term goes empty rather than leaving
  // the previous term's results on screen. The keyboard selection resets
  // here too, on every term change, safely before any debounced query even
  // starts (the arrow/Enter handler below is itself guarded to only act
  // once a fresh result set is actually "ready", so a stale selection can
  // never be activated mid-debounce).
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term || isDevFallback || !organization || !userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clears stale results/loading state the instant the query goes empty, before any debounce
      setSearchLoadState("idle");
      setSearchResults(EMPTY_SEARCH_RESULTS);
      setSelectedIndex(null);
      return;
    }

    setSearchLoadState("loading");
    setSelectedIndex(null);
    let cancelled = false;
    const timer = setTimeout(() => {
      searchGlobal(organization.id, user.role, userId, term).then((result) => {
        if (cancelled) return;
        if (result.status === "error") {
          setSearchLoadState("error");
          setSearchErrorMessage(result.message);
          return;
        }
        setSearchResults(result.results);
        setSearchLoadState("ready");
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, isDevFallback, organization, userId, user.role]);

  // Close on outside click — same pattern already used by
  // tickets/filter-dropdown.tsx's own popover.
  useEffect(() => {
    if (!searchOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (searchRootRef.current && !searchRootRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSelectedIndex(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [searchOpen]);

  // Global ⌘K / Ctrl+K — focuses Search and opens the popover from
  // anywhere in the app. Registered once for the component's lifetime (no
  // reactive dependencies: setSearchOpen and the refs are stable), removed
  // on unmount, so there's never more than one listener alive at a time.
  // Ignored while the user is typing in some other real input/textarea/
  // contenteditable — except when focus is already in Search itself, where
  // it should keep working normally.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isShortcut) return;

      const active = document.activeElement;
      if (active !== searchInputRef.current && isEditableElement(active)) return;

      e.preventDefault();
      setSearchOpen(true);
      searchInputRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The popover only actually renders once there's a real term to show
  // results for — focusing the field alone marks it "open" (so typing
  // immediately reveals results) without floating an empty box over the nav.
  const showSearchPopover = searchOpen && searchQuery.trim() !== "";
  const hasSearchResults =
    searchResults.projects.length > 0 || searchResults.tickets.length > 0 || searchResults.users.length > 0;
  const flatSearchResults = flattenSearchResults(searchResults);

  // ArrowUp/ArrowDown/Enter — only act once a real, up-to-date result set is
  // actually showing (never mid-debounce/"loading", so a stale index from
  // the previous term can never be activated). No wrap-around: the first
  // press in either direction lands on the first result.
  function handleSearchInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSearchPopover || searchLoadState !== "ready") return;

    if (e.key === "ArrowDown") {
      if (flatSearchResults.length === 0) return;
      e.preventDefault();
      setSelectedIndex((prev) => (prev === null ? 0 : Math.min(prev + 1, flatSearchResults.length - 1)));
    } else if (e.key === "ArrowUp") {
      if (flatSearchResults.length === 0) return;
      e.preventDefault();
      setSelectedIndex((prev) => (prev === null ? 0 : Math.max(prev - 1, 0)));
    } else if (e.key === "Enter") {
      const target = selectedIndex !== null ? flatSearchResults[selectedIndex] : flatSearchResults[0];
      if (!target) return;
      e.preventDefault();
      selectFlatSearchResult(target);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSearchOpen(false);
      setSelectedIndex(null);
    }
  }

  // Same reset after every kind of result selection — close the popover,
  // drop the typed term, drop the results, and drop the keyboard selection,
  // so reopening Search always starts clean rather than showing the
  // previous query's matches.
  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults(EMPTY_SEARCH_RESULTS);
    setSearchLoadState("idle");
    setSelectedIndex(null);
  }

  function selectSearchProject(project: GlobalSearchProject) {
    closeSearch();
    router.push(`/projects/${project.slug}`);
  }

  function selectSearchTicket(ticket: GlobalSearchTicket) {
    closeSearch();
    router.push(`/projects/${ticket.projectSlug}/tickets/${ticket.key}`);
  }

  // Same real profile mechanism every other "click a person" affordance in
  // this app already uses (MemberTrigger/openMemberProfile) — passing the
  // real profileId makes resolveTeamMember use it authoritatively instead
  // of guessing by name match, and it's already role-agnostic (no branching
  // needed for Admin/Project Lead/Member here).
  function selectSearchUser(result: GlobalSearchUser) {
    closeSearch();
    openMemberProfile({
      name: result.fullName,
      avatar: result.avatarUrl,
      role: result.role,
      profileId: result.id,
    });
  }

  // Enter reuses these exact same three functions, whichever type the
  // selected (or, absent a selection, first) flattened result happens to
  // be — never a second/parallel navigation path from what click already uses.
  function selectFlatSearchResult(result: FlatSearchResult) {
    if (result.type === "project") selectSearchProject(result.value);
    else if (result.type === "ticket") selectSearchTicket(result.value);
    else selectSearchUser(result.value);
  }

  return (
    <>
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

      <div className="px-3 pt-3 relative" ref={searchRootRef}>
        <div className="w-full flex items-center gap-2 text-sm text-slate-400 bg-slate-100 rounded-md px-2.5 py-1.5 transition-colors dark:text-zinc-500 dark:bg-zinc-900 focus-within:bg-slate-200/70 dark:focus-within:bg-zinc-800 hover:bg-slate-200/70 dark:hover:bg-zinc-800">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchInputKeyDown}
            placeholder="Search"
            className="flex-1 min-w-0 bg-transparent outline-none text-slate-700 placeholder:text-slate-400 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          />
          <span className="ml-auto flex-shrink-0 text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded px-1 py-0.5 dark:text-zinc-500 dark:bg-zinc-800 dark:border-zinc-700">
            ⌘K
          </span>
        </div>

        {showSearchPopover && (
          <div
            role="dialog"
            aria-label="Search results"
            className="absolute left-3 right-3 top-full mt-1.5 z-50 rounded-xl border border-slate-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 shadow-lg shadow-black/10 dark:shadow-black/40 max-h-[70vh] overflow-y-auto"
          >
            {searchLoadState === "loading" && (
              <p className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center">Searching…</p>
            )}

            {searchLoadState === "error" && (
              <p className="px-3 py-4 text-xs text-red-500 dark:text-red-400 text-center">
                {searchErrorMessage ?? "Something went wrong."}
              </p>
            )}

            {searchLoadState === "ready" && !hasSearchResults && (
              <p className="px-3 py-4 text-xs text-slate-400 dark:text-zinc-500 text-center">No results found.</p>
            )}

            {searchLoadState === "ready" && hasSearchResults && (
              <div className="py-1 divide-y divide-slate-100 dark:divide-zinc-800">
                {searchResults.projects.length > 0 && (
                  <SearchResultGroup label="Projects">
                    {searchResults.projects.map((project, i) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => selectSearchProject(project)}
                        className={[
                          SEARCH_RESULT_ROW_CLASS,
                          i === selectedIndex ? SEARCH_RESULT_ROW_SELECTED_CLASS : "",
                        ].join(" ")}
                      >
                        <p className="text-[13px] text-slate-700 dark:text-zinc-200 truncate">{project.name}</p>
                        {(project.key || project.category || project.status) && (
                          <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">
                            {project.key ?? project.category ?? project.status}
                          </p>
                        )}
                      </button>
                    ))}
                  </SearchResultGroup>
                )}

                {searchResults.tickets.length > 0 && (
                  <SearchResultGroup label="Tickets">
                    {searchResults.tickets.map((ticket, i) => {
                      const index = searchResults.projects.length + i;
                      return (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => selectSearchTicket(ticket)}
                          className={[
                            SEARCH_RESULT_ROW_CLASS,
                            index === selectedIndex ? SEARCH_RESULT_ROW_SELECTED_CLASS : "",
                          ].join(" ")}
                        >
                          <p className="flex items-baseline gap-1.5 min-w-0">
                            <span className="text-[11px] font-mono font-medium text-slate-400 dark:text-zinc-500 flex-shrink-0">
                              {ticket.key}
                            </span>
                            <span className="text-[13px] text-slate-700 dark:text-zinc-200 truncate">{ticket.title}</span>
                          </p>
                          <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">{ticket.projectName}</p>
                        </button>
                      );
                    })}
                  </SearchResultGroup>
                )}

                {searchResults.users.length > 0 && (
                  <SearchResultGroup label="Users">
                    {searchResults.users.map((result, i) => {
                      const index = searchResults.projects.length + searchResults.tickets.length + i;
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => selectSearchUser(result)}
                          className={[
                            SEARCH_RESULT_ROW_CLASS,
                            "flex items-center gap-2",
                            index === selectedIndex ? SEARCH_RESULT_ROW_SELECTED_CLASS : "",
                          ].join(" ")}
                        >
                          {result.avatarUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={result.avatarUrl} alt={result.fullName} className="w-6 h-6 rounded-full flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[13px] text-slate-700 dark:text-zinc-200 truncate">{result.fullName}</p>
                            {(result.email || result.role) && (
                              <p className="text-xs text-slate-400 dark:text-zinc-500 truncate">
                                {result.email || result.role}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </SearchResultGroup>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="px-2 pt-4 space-y-0.5 text-sm">
        {[...mainNav].map((key) => {
          const { href, label, icon } = NAV_LINK[key];
          const active = isNavActive(key, activePage);
          return (
            <Link
              key={key}
              href={href}
              className={[
                "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md",
                active
                  ? "bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/10 dark:text-brand-400"
                  : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
              ].join(" ")}
            >
              {icon}
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 px-3">
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Projects</span>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            aria-label="Create Project"
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
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
                  {projectNav.has("settings") && (
                    <Link
                      href={`/projects/${project.slug}/settings`}
                      className={
                        activeSection === "settings"
                          ? "block px-2 py-1 rounded-md bg-white text-brand-700 font-semibold text-[13px] shadow-sm shadow-slate-100 dark:bg-zinc-800 dark:text-brand-400"
                          : "block px-2 py-1 rounded-md text-slate-500 hover:bg-white text-[13px] dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                      }
                    >
                      Settings
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
    {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
    </>
  );
}
