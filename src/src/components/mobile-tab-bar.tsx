"use client";

import { useEffect, useState, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINK, isNavActive } from "@/components/sidebar";
import { MobileMoreSheet } from "@/components/mobile-more-sheet";
import { useCurrentUser } from "@/components/current-user-provider";
import { useOrganizationProjects } from "@/components/organization-projects-provider";
import { loadLeadProjects } from "@/lib/projects";
import type { LeadProject } from "@/lib/projects";
import { statusMeta } from "@/components/status-badge";

type MainTabKey = "dashboard" | "projects" | "my-work" | "reports" | "time-tracking" | "users";

// Exact required order per role — approved for Admin, reused verbatim for
// Project Lead and Member. Each entry reuses the desktop Sidebar's own
// NAV_LINK (href/label/icon) untouched — same routes/behavior. "Time
// Tracking" gets the same short mobile-only label approved for Admin; the
// section itself is still called "Time Tracking" everywhere else in the app.
const ADMIN_TABS: { key: MainTabKey; shortLabel?: string }[] = [
  { key: "reports" },
  { key: "time-tracking", shortLabel: "Time" },
  { key: "dashboard" },
  { key: "projects" },
  { key: "users" },
];

const PROJECT_LEAD_TABS: { key: MainTabKey; shortLabel?: string }[] = [
  { key: "my-work" },
  { key: "projects" },
  { key: "dashboard" },
  { key: "reports" },
  { key: "time-tracking", shortLabel: "Time" },
];

// Member has no NAV_LINK entry left over for a "leftover" More link (all
// three of their main-nav keys are already direct tabs below) — Profile is
// the one extra position their tab bar needs, rendered as its own cell
// (not part of this generic NAV_LINK-backed list) since Profile isn't a
// MainNavKey/sidebar main-nav item at all — it lives only in AccountMenu
// today, same icon glyph reused here.
const MEMBER_TABS: { key: MainTabKey; shortLabel?: string }[] = [
  { key: "my-work" },
  { key: "projects" },
  { key: "dashboard" },
];

// Same "person" glyph AccountMenu's own "My Profile" row already uses.
function ProfileIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

// Dashboard reuses its existing icon glyph, just rendered a touch larger —
// the one deliberate size override already approved for Admin, reused
// as-is here — gives it "ligeramente mayor" hierarchy as the tab bar's
// central/default destination without a floating button or new shape/color.
function withSize(icon: ReactNode, className: string): ReactNode {
  return isValidElement(icon) ? cloneElement(icon as ReactElement<{ className?: string }>, { className }) : icon;
}

function MoreIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

const TAB_CLASS =
  "flex flex-col items-center justify-center gap-0.5 min-h-[52px] py-1.5 px-0.5 text-[9px] leading-tight";

// Fixed bottom tab bar — Admin, Project Lead, and Member only (see
// app-shell.tsx, the one place that decides who gets it), and only ever
// visible below the `md` breakpoint (the same one the desktop Sidebar's
// own `hidden md:flex` already uses), so Desktop is entirely unaffected.
export function MobileTabBar({ activePage }: { activePage?: string }) {
  const { user, organization, userId, isDevFallback } = useCurrentUser();
  const pathname = usePathname();
  const { projects } = useOrganizationProjects();
  const [moreOpen, setMoreOpen] = useState(false);
  const [leadProjects, setLeadProjects] = useState<LeadProject[]>([]);

  const isAdmin = user.role === "ADMIN";
  const isProjectLead = user.role === "PROJECT_LEAD";
  const isMember = user.role === "MEMBER";

  // Project Lead's own accessible projects — the exact same real,
  // RLS-scoped source (project_memberships.project_role = 'lead', active
  // projects only) the Project Lead Dashboard's own Current Project
  // selector already uses (project-lead-dashboard.tsx). Never fetched for
  // Admin/Member — a no-op effect otherwise.
  useEffect(() => {
    if (!isProjectLead || isDevFallback || !organization || !userId) return;
    let cancelled = false;
    loadLeadProjects(organization.id, userId).then((result) => {
      if (cancelled || result.status !== "ready") return;
      setLeadProjects(result.projects);
    });
    return () => {
      cancelled = true;
    };
  }, [isProjectLead, isDevFallback, organization, userId]);

  if (!isAdmin && !isProjectLead && !isMember) return null;

  const tabs = isAdmin ? ADMIN_TABS : isProjectLead ? PROJECT_LEAD_TABS : MEMBER_TABS;
  const gridColsClass = isMember ? "grid-cols-5" : "grid-cols-6";

  // Admin's one leftover main-nav item (My Work — the only one of their six
  // not already a direct tab) plus the same pinned Projects list the
  // desktop Sidebar shows. Project Lead and Member have no leftover
  // main-nav item at all (every one of theirs is already a direct tab
  // above), so their own More only ever holds their own projects list.
  //
  // Member's own projects come from `useOrganizationProjects()` — same
  // hook Admin's list above already uses, already RLS-scoped so a Member
  // only ever sees projects they have an active membership on (confirmed
  // in member-projects-screen.tsx) — the exact same source their own
  // Desktop Sidebar PROJECTS section already reads from, capped the same
  // "first 3, non-archived" way that section already is for every role.
  const extraLinks = isAdmin ? [NAV_LINK["my-work"]] : [];
  const orgScopedProjectLinks = projects
    .filter((p) => p.status !== "archived")
    .slice(0, 3)
    .map((p) => ({ slug: p.slug, name: p.name, dotClassName: statusMeta[p.status].dot }));
  const projectLinks = isAdmin
    ? orgScopedProjectLinks
    : isProjectLead
      ? leadProjects.map((p) => ({ slug: p.slug, name: p.name, dotClassName: statusMeta.active.dot }))
      : isMember
        ? orgScopedProjectLinks
        : [];

  // ── Last slot (5th for Member, 6th for Admin/Project Lead) ─────────────
  // Admin: always "More" (unchanged from the approved implementation).
  // Project Lead/Member: the project's own real name when they have access
  // to exactly one (direct link, no menu, ellipsis via `truncate` + a
  // `title` tooltip on hover-capable devices — same pattern already used
  // for e.g. ticket assignee names), "More" when they have several, and
  // "More" again as a safe fallback (never a fabricated project/route)
  // when they have none.
  const accessibleProjects = isProjectLead ? leadProjects : isMember ? orgScopedProjectLinks : [];
  const singleAccessibleProject = !isAdmin && accessibleProjects.length === 1 ? accessibleProjects[0] : null;
  const lastSlotShowsMore = isAdmin || !singleAccessibleProject;

  // On the Profile page (Member only — no `activePage` value of its own,
  // same as every route without one), "Projects"'s existing fallback
  // (`isNavActive`'s catch-all, unchanged) would otherwise also read as
  // active there, which would violate "no marcar simultáneamente dos
  // opciones activas" against the new Profile tab. Scoped to Member only —
  // Admin/Project Lead have no Profile tab, so this never applies to them.
  const onProfilePage = isMember && pathname === "/profile";

  // Neither Project Lead/Member's single-project link nor their "More" is
  // ever rendered as "active": every route it could represent already
  // belongs to a project, which the unchanged "Projects" tab above already
  // highlights via its own existing `isNavActive` catch-all — highlighting
  // the last slot too would duplicate that, which is exactly what "no
  // marcar simultáneamente dos opciones activas" forbids. Admin's own
  // "More" keeps its existing (already-approved) active behavior.
  const moreActive = isAdmin ? isNavActive("my-work", activePage) || isNavActive("projects", activePage) : false;

  return (
    <>
      <nav
        aria-label="Primary"
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#e4e1ff] border-t border-slate-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]`}
      >
        <div className={`grid ${gridColsClass}`}>
          {tabs.map(({ key, shortLabel }) => {
            const { href, label, icon } = NAV_LINK[key];
            const active =
              key === "projects" ? isNavActive(key, activePage) && !onProfilePage : isNavActive(key, activePage);
            const isDashboard = key === "dashboard";
            return (
              <Link
                key={key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  TAB_CLASS,
                  active ? "text-brand-600 dark:text-brand-400" : "text-slate-500 dark:text-zinc-400",
                  isDashboard ? "font-semibold" : active ? "font-medium" : "font-normal",
                ].join(" ")}
              >
                {isDashboard ? withSize(icon, "w-5 h-5") : icon}
                <span className="truncate max-w-full">{shortLabel ?? label}</span>
              </Link>
            );
          })}

          {isMember && (
            <Link
              href="/profile"
              aria-current={onProfilePage ? "page" : undefined}
              className={[
                TAB_CLASS,
                onProfilePage ? "text-brand-600 dark:text-brand-400 font-medium" : "text-slate-500 dark:text-zinc-400 font-normal",
              ].join(" ")}
            >
              <ProfileIcon />
              Profile
            </Link>
          )}

          {lastSlotShowsMore ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={[
                TAB_CLASS,
                moreActive ? "text-brand-600 dark:text-brand-400 font-medium" : "text-slate-500 dark:text-zinc-400",
              ].join(" ")}
            >
              <MoreIcon />
              More
            </button>
          ) : (
            <Link
              href={`/projects/${singleAccessibleProject!.slug}`}
              title={singleAccessibleProject!.name}
              className={[TAB_CLASS, "text-slate-500 dark:text-zinc-400 font-normal"].join(" ")}
            >
              {NAV_LINK.projects.icon}
              <span className="truncate max-w-full">{singleAccessibleProject!.name}</span>
            </Link>
          )}
        </div>
      </nav>

      {moreOpen && (
        <MobileMoreSheet onClose={() => setMoreOpen(false)} extraLinks={extraLinks} projectLinks={projectLinks} />
      )}
    </>
  );
}
