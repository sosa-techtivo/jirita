> Last Updated: August 22, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, a role-based UX layer (Admin / Project Lead / Member), projects listing, role-specific project overviews, a five-view Tickets experience with Task/Bug ticket types and real search/filters, an editable Quick Ticket Preview, Full Ticket Detail with Time Tracking, real Related Tickets, and a real Attachments flow (upload/rename/delete/download/Preview), role-specific Dashboards, role-specific Projects/Reports/Time Tracking screens, a personal My Work workspace, an editable Notes experience, a Settings section, a per-project Settings screen, a per-project Team screen with a dedicated Work History page, a dedicated Admin-only Users management module, a real Supabase Auth flow (Login/Logout/Forgot/Reset/Change Password) with a Profile page that saves real data, and a single shared Member Profile Modal (now with real per-project ticket metrics, real Activity/Security tabs in user mode, and real project-membership actions in project mode) used everywhere a person is referenced. Auth/Profile, Projects (Sidebar, the `/projects` list, and per-project Settings — whose General section no longer has its own "Project Lead" field, since Team's `project_memberships.project_role` is the only real place a project's lead is set), Tickets (all five list views with real filtering, New Ticket creation, the full Ticket Detail page, Related Tickets, and the editable Quick Ticket Preview), Project → Team (roster, project-scoped Lead/Member role, Make Project Lead, auto-membership on contribution, Add/Remove Member, paginated Work History), Project Notes (list, search, create, edit, Duplicate, delete), the Dashboard for the Admin, Project Lead, and Member roles (Admin's now also with a real "View all activity →" action and a new, dedicated org-wide Activity History page), company-wide Reports for the Admin role (`/reports` — both the Delivery and Finance tabs, with real filters, Health Alerts, and Export), the **Admin** role's Project Overview (`/projects/[slug]` — real header/Health Alerts/KPIs/Active Work/Team/Project Health, plus a new dedicated, paginated Project Activity history page), per-project Reports (`/projects/[slug]/reports`, every role), and Time Tracking for the Admin and Member roles (`/time-tracking` — real KPIs, filters, Timesheets, Hours Missing/"Members Missing Hours", Weekly Utilization, and Billing by Client) are confirmed backed by a live Supabase project end-to-end. Users (list, Invite by email/link, Disable/Enable, Edit, Reset Password link, Activity/Security tabs) is also fully wired to the same Supabase schema, but not yet confirmed against a live project or in a browser — see Architecture Status; the same "implemented and type/build-clean, not yet clicked through live" status now also applies to the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new org-wide Activity History page just described. Since then, the same not-yet-confirmed status was reached by the Project Lead's and Member's own Project Overview (both now real, no longer mock — see Current Sprint → Completed → Project Overview), a project scope selector on all three Dashboards, My Work (Member role, fully real), ticket-assignment restriction to a project's own active members, the Member's own `/projects` ("My Projects," fully real, plus a real avatar-`src` bug fix), and JIRITA's global Search (real data layer, results popover, navigation, and keyboard shortcuts). Every other screen (the Project Lead's own scoped Reports view, the Project Lead's own scoped Time Tracking view, and the rest of Settings) is still navigable and connected using mock data — see Architecture Status.

The current objective is to complete the remaining frontend experience while continuing backend integration. Auth, profile/organization-membership data, avatar upload, and change password are confirmed working end-to-end against a live Supabase project. Projects has followed the same path: Sidebar, the `/projects` list, and `/projects/[slug]/settings` now read and write real project rows (create, edit, archive/restore, and per-project Settings' General/Billing fields, including a minimal real Clients roster). Tickets has now followed the same path too and gone further: the five list views (with real search, Assigned/Priority/Status filters, quick-filter chips, and the "Add Filter" menu — Labels/Due Date/Reporter/Created Date/Updated Date — all combining with AND), New Ticket creation, the full Ticket Detail page (inline edits, Labels, Acceptance Criteria, Attachments including rename/delete/download/Preview, Time Tracking, Comments, Related Tickets, and a real trigger-driven Activity Log), and the Quick Ticket Preview panel (now editable when opened from the Tickets board) all read and write real ticket rows. Ticket priority is a 4-value scale (Highest/High/Medium/Low) — the old "Normal" value was fully migrated and removed from the database, not just hidden in the UI. Every Ticket write path now surfaces failures to the user (a shared error toast) instead of only logging to the console, and rolls back optimistic edits that didn't actually save. Users and Project → Team followed the same real-data path — Users' list, Invite (email or generated link), Disable/Enable, Edit, a generated Reset Password link, and the Member Profile Modal's Activity/Security tabs all read/write real Supabase data via Server Actions (`organization_memberships` has no direct `authenticated` grant, so every privileged write goes through a service-role Server Action that re-verifies the caller server-side); Team's roster, project-scoped Lead/Member role (`project_memberships.project_role`, with a Make Project Lead action), auto-membership-on-contribution, Add/Remove Member (with a database-level history guard), and a server-side-paginated Work History page do the same — Team has since been clicked through against a live project and is confirmed; Users has not and is still "should work, not yet verified." Project Notes (list, search, create, edit, Duplicate, delete), the Admin, Project Lead, and Member Dashboards (every KPI, list, and quick action), and company-wide Reports for the Admin role (both the Delivery and Finance tabs — KPIs, Health Alerts, Project Health, Hours by Person, Workload, Hours Distribution, Recent Changes, filters, and Export) have also since been built and confirmed live, reusing the same query/RLS/Server-Action patterns established above rather than inventing new ones. The **Admin** Project Overview and per-project Reports (all roles) have since followed the same path too, both explicitly reusing Delivery Reports' own real health/KPI calculations rather than a second one, and Project Overview gained a new, fully paginated Project Activity history page. Tickets also gained a real, URL-persisted status/alert filter (`?alerts=...`), shared by both the Project Overview Health Alert banner and Project Reports' Delivery Progress cards, and survives a refresh or browser back/forward since it's real query-state, not the older sessionStorage handoff. Time Tracking for the Admin and Member roles has since followed the same path too: real KPIs, real Member/Project/Client/Billing/Date-Range filters (URL-persisted, same `?alerts=`-style precedent as Tickets), and a real Timesheets table, explicitly reusing Reports → Finance's own billing-calculation functions (exported for this reuse) rather than a second implementation, with capacity-based metrics (Hours Missing — relabeled "Members Missing Hours" since it counts members, not hours — Weekly Utilization, Capacity %, Status) kept structurally independent of the Billing filter so they always reflect total logged hours. The Dashboard's Recent Activity widget gained a real "View all activity →" action (same cap-plus-probe pattern Project Overview's own Project Activity widget already used) pointing at a new, dedicated, real, server-side-paginated org-wide Activity History page — the org-wide sibling of the existing per-project one, reusing its exact query/pagination shape. Project Settings' General section had its "Project Lead" picker removed outright — it was the only writer of the older `projects.owner_profile_id`, unrelated to Team's own real `project_memberships.project_role`, which remains the sole source of truth for a project's lead. The Project Lead's own scoped Reports view and own scoped Time Tracking view (both separate components from the now-real company-wide ones), and the rest of Settings are still mock data — see Architecture Status.

Since that pass, all three Dashboards (Admin/Project Lead/Member) gained a real `?project=<slug>`-driven project scope selector (Admin's defaults to "All Projects" org-wide; the Project Lead's and Member's only render when that role is actually scoped to more than one project, auto-scoping silently otherwise), the Project Lead's and Member's own Project Overview are now real end-to-end — reusing the exact data loading, KPI/health formulas, and building-block components the **Admin** Project Overview already established rather than a second implementation — My Work (Member role) lost every remaining mock array, ticket Assignee selection is now restricted (both in the UI and, independently, at the write layer) to a project's own real active members, the Member's own `/projects` ("My Projects") screen is fully real (and a real `<img src="">` bug — an empty avatar `src` whenever a project had no lead — was fixed along the way), and JIRITA's global Search (the Sidebar's Search field) gained a real, permission-scoped Supabase data layer, a results popover, click-to-navigate, and full keyboard navigation including a global `⌘K`/`Ctrl+K` shortcut. All of this is implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass), not yet clicked through in a live browser — same "should work, not yet verified" status as Users/the Admin Project Overview/per-project Reports/Time Tracking (Admin/Member) below. See Current Sprint → Completed for each feature's own detail.

After that, the Admin Dashboard's own KPI cards (Assigned Tickets, Hours Burn, Blocked, Due Today), its Organization Health insight band, and its Projects at Risk rows all became real, independent click targets — each navigating to a destination showing exactly the same real ticket/hour set the card itself already displays, reusing the existing `?alerts=` ticket-filter query-state and Time Tracking's own Custom Range params rather than a second filtering mechanism. This required one genuinely new surface: a real, org-wide "all projects" Tickets view at `/tickets` (reusing the same `TicketsScreen` component every per-project Tickets page already renders, just with its `slug` prop made optional), since the existing Tickets page can only ever show one project — it also gained its own Project filter, and the global `?alerts=` mechanism gained two new pseudo-types (`due-today`, `completed-this-month`). The Projects list similarly gained a real `?blocked=<slug,...>` filter for the "projects currently blocked" insight. Alongside this, a real, pre-existing bug in the shared Member Profile Modal was found and fixed for two entry points (Team Workload and Recent Activity, both Admin Dashboard): it had never resolved real data for anyone without a mock-roster name match, showing zeroed Assigned Hours/Utilization/Active Tickets and building `unknown-*` Work History URLs. The modal now fetches its own real data from a real `profileId` + optional project scope — but this fix is intentionally scoped to those two entry points, not the rest of the app's `MemberTrigger` callers (Project Overview, Reports, ticket assignees/comments/attachments, Time Tracking, My Work); see Architecture Status → Member Profile Modal and Technical Debt for the exact boundary and what's left. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

After that, the Project Lead's own scoped Time Tracking view (`project-lead-time-tracking-screen.tsx`) became real — the last remaining fully-mock Time Tracking surface — scoped strictly to the projects this profile leads and reusing the Admin/Member screen's own real calculations/loaders (exported for this reuse) rather than a second implementation; see Current Sprint → Completed → Hours & Time Tracking → Project Lead. Separately, the Project Lead Dashboard's Current Delivery card (Completed Tickets, Remaining Work (renamed from "Remaining Hours"), Blocked Tickets) and its Attention Required cards (Blocked Tickets, Due Today, Over Capacity, Awaiting Review) all became real, independent click targets, following the same "0 → not clickable, 1 → open the Ticket Preview panel / Member Profile Modal directly, more than 1 → navigate to a filtered Tickets/Team view" pattern established by the Admin Dashboard's own KPI cards above — each reusing its own already-real source of truth, never a second query. A real, pre-existing bug was also found and fixed along the way: the Current Delivery card's "Target Date" had never actually read the real `projects.target_date` column (already being fetched, silently discarded) — it showed the nearest due date among the project's own open tickets instead, a different real field with a superficially similar value. `projects.target_date` is now also directly editable, via a new optional Target Date field on Project Settings' General section. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Most recently, the Member Dashboard's own Assigned Tickets and Due Today hero stats became real, independent click targets too, following the exact same "0 → not clickable, 1 → open the Ticket Preview panel directly, more than 1 → navigate to a filtered Tickets view" pattern already established above — reusing `activeWork`/the existing due-today filter, plus a real `?assignee=me` URL-driven initializer newly added to Tickets' own pre-existing "Assigned" filter (`tickets-screen.tsx`, previously FilterBar-only). Two real, pre-existing bugs in the shared Member Profile Modal were found and fixed along the way: `TicketListRow`'s assignee avatar (rendered by Member Dashboard's own "My Active Work" list, among others) never passed a real `profileId`, so a member's own active-work tickets resolved through the mock-name-matching fallback and showed 0 Active Tickets/Assigned Hours/Utilization instead of their real numbers — now fixed with the same real `profileId`-keyed fetch every other confirmed-real trigger already uses; separately, clicking "Expand" on a ticket opened *from inside* the Member Profile Modal navigated to the real Ticket Detail page but left both that inner ticket preview and the Member Profile Modal itself open on top of it (the modal's provider is mounted above the router and survives client-side navigation) — now closes both via its own already-existing local close callbacks. All three dashboards' loading states also gained a structural skeleton (a new shared `SkeletonBlock` primitive in `dashboard-shared.tsx`) in place of the old plain "Loading dashboard…" text, and a real bug found along the way — the Admin Dashboard's own data-loading effect never visibly reset to "loading" on a background refetch (e.g. after returning to a backgrounded browser tab, via `current-user-provider.tsx`'s existing focus-regain revalidation), unlike Project Lead's and Member's own effects — was fixed by applying that same existing reset there too. All of the above is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

Separately, the `/projects` list (Admin/Project Lead) had its own real Project Lead column/filter wired up — `ProjectSummary.lead` is now sourced from `project_memberships.project_role = 'lead'` (the same authoritative signal Team/the Dashboards already key off), not the older `owner_profile_id`-backed `ProjectSummary.owner` — reconciling a gap this file had been carrying since Project Settings' own "Project Lead" picker was removed. Most recently, a four-part pass unified the rest of that same list's remaining stale metrics onto real per-ticket data, then added a real tab-regain refresh for them: (1) the Health badge/filter and the "At Risk" KPI now read `buildProjectHealthRows`'s (`reports-screen.tsx`) real `risk`, never the stale, never-updated `projects.health` column, and the Admin Dashboard's own "Projects at Risk"/blocked-projects insight now reuses that exact same function instead of a second, duplicated blocked/overdue classification; (2) each row's progress bar/percentage reuses a new `computeProjectProgressPct` (also exported from `reports-screen.tsx`) — the same real done/total ticket-count formula Project Overview's own progress bar already used — instead of the always-`0` persisted `progress` field; (3) each row's Open/Blocked/Overdue counters read straight off that same `buildProjectHealthRows` result (extended with new `open`/`overdueOpen` fields alongside the pre-existing `blocked`) instead of the always-`0` persisted `openTickets`/`blockedTickets`/`overdueTickets` fields; (4) the list now refreshes all of the above on returning to a backgrounded browser tab, reusing the exact same mechanism the three Dashboards already rely on (`current-user-provider.tsx`'s existing window-focus-regain revalidation hands back a new `organization` reference, which this screen's own ticket-metrics effect already depended on — no new listener/polling added), and shows the same kind of `SkeletonBlock`-built structural skeleton the Dashboards already use (replacing the old plain "Loading projects…" text) both on first load and on every tab return. All of this is implemented and type/build-clean, not yet clicked through in a live browser — same "should work, not yet verified" status as everything else in this list.

---

# Repository Structure

```
/src/           — Next.js application (the active codebase — all development happens here)
/product/       — Read-only reference copy of a prior implementation snapshot
/prototypes/    — Read-only standalone HTML prototype files
```

`/src/docs/` holds implementation-facing documentation for backend work
(`SUPABASE_MVP_SCHEMA.md`, `SUPABASE_SETUP.md`, `UNFUDDLE_IMPORT_SPECIFICATION.md`)
— distinct from this file, which lives at the `/src` root.

---

# Current Sprint

## Completed

### Role-Based UX

Completed.

Role comes from a real Supabase `organization_membership` when the signed-in user has one (Admin / Project Lead / Member, per `docs/SUPABASE_MVP_SCHEMA.md`'s `org_role` enum). `src/lib/current-user.ts`'s three mock identities now serve only as a dev-only fallback — used automatically outside production builds when no real profile/membership exists yet, so local dev isn't blocked on seeded data. No real server-side permission enforcement (RLS on `projects`/`tickets`/etc.) is wired into the UI yet; role only drives what renders.

- `CurrentUserProvider` (`src/components/current-user-provider.tsx`) holds the active `CurrentUser` (real or dev-fallback) in React context, refetched from Supabase after every profile save
- A dev-only `RoleSwitcher` in the header bar (now only rendered alongside a visible "Dev fallback" badge, and only when no real membership is loaded) lets a tester swap roles live to see the app reshape itself
- `src/lib/nav-config.ts` centralizes which main-nav and per-project-nav items each role sees, and in what order (sidebar renders in array order, not a hardcoded sequence)
- `canManage(role)` gates workspace/project management actions (New Project, New Ticket, Add Member, etc.) to Admin and Project Lead
- Dashboard, Projects, and Reports each render a **different, purpose-built screen per role** rather than a permissions-filtered version of one shared screen (see below)
- Settings and per-project Team are Admin/Project Lead only; Member's sidebar omits them
- MVP terminology pass: "Sprint / Milestone / Backlog / Story Points" language removed from live UI copy (e.g. Project Reports' "Velocity Snapshot" → "Delivery Snapshot") in favor of Delivery / Capacity / Hours vocabulary. Story Points is dropped from the ticket sidebar, preview panel, and filters.

### Application Foundation

- Next.js application configured (in `/src/`)
- Light Mode
- Dark Mode
- Global layout (`AppShell` component)
- Responsive navigation (`Sidebar` component)
- Design system foundation

### Projects

Completed, and now backed by real Supabase data (Sidebar + `/projects` list — see Architecture Status for the full read/write/RLS breakdown). `ProjectsListScreen` still branches by role rather than showing a permissions-filtered version of one table.

#### Admin

- Full workspace projects table, sourced from the real `projects` table for the signed-in user's organization
- Search input (UI only, not wired)
- Filter chips (UI only, not wired) — Status filter now doubles as the only way to bring archived projects back into view (see Archive/Restore below)
- Project cards / rows, empty states
- **+ Create Project** opens a real modal (`create-project-modal.tsx`); the row **⋯** menu's **Edit** opens the same modal pre-filled (`editingProject` prop); **Archive**/**Restore** swap based on the project's real status
- Navigation into Project Details

#### Project Lead

- Real projects scoped by RLS (`project_memberships`) rather than the old client-side `LEAD_PROJECT_SLUGS` filter — the list itself now only ever contains what the query returns, no additional filtering in the component. `LEAD_PROJECT_SLUGS` still exists and is used by `project-lead-dashboard.tsx`/`project-lead-reports-screen.tsx` (still mock, unaffected) and by this screen's own team-capacity summary-cell math — see Technical Debt for the resulting dev-fallback mismatch.
- Block-organized instead of a flat table; team and health context surfaced per project
- Quick actions (`+ New Ticket` instead of `+ Create Project`)
- Archived status excluded from the status filter set — Project Leads never see archived projects at all, by design

#### Member — `member-projects-screen.tsx`

A dedicated "My Projects" screen, not a filtered Admin/Lead table. **Now backed by real Supabase data end-to-end — implemented and type/build-clean, not yet clicked through in a live browser** (same "should work, not yet verified" caveat as Users/the Admin Project Overview).

- Shows only projects the Member is staffed on — the card list now comes from `useOrganizationProjects()` (already real, already RLS-scoped to this Member's own active `project_memberships`), one card per project regardless of whether the Member currently has any tickets there
- Surfaces who leads each project — real, via `loadProjectTeam`'s `projectRole === "lead"` member (never the older `ProjectSummary.owner`), falling back to "Lead: Unassigned" when none exists
- Surfaces what's assigned to the Member within each project — real Assigned/Due-This-Week ticket counts from `loadProjectTickets`, filtered to this member's own `assigneeProfileId`
- **Real bug fixed**: the lead avatar `<img>` could previously render with `src=""` whenever a project had no lead; `leadAvatar` now always resolves to a real URL or `FALLBACK_AVATAR`, with a defensive guard on top so the `<img>` never renders at all without a real `src`

#### Create, Edit, Archive, Restore

- **Create**: `create-project-modal.tsx` — name + optional description; status starts `active`; slug/project code auto-derived from the name
- **Edit**: the same modal, `editingProject` prop pre-fills name/description
- **Archive**: `archive-project-modal.tsx` — confirmation modal (project hidden from the active list; tickets/comments/activity/time tracking untouched; restorable later), reused unchanged by both the Projects list row menu and Project Settings' Danger Zone
- **Restore**: no confirmation — a direct action from the row menu / Danger Zone
- Sidebar's pinned project list and the `/projects` page share one `OrganizationProjectsProvider` (`src/components/organization-projects-provider.tsx`), so any create/edit/archive/restore is reflected in both immediately

#### Project Settings — `project-settings-screen.tsx`

Route: `/projects/[slug]/settings`, Admin/Project Lead only. Previously a fully mock, non-interactive page (uncontrolled inputs, no Save button at all); now reads and writes the real project.

- **General**: Project Name, Description, Project Code, Status (excludes `archived` — that transition only ever happens via the reused Archive/Restore flow, never a parallel path here), and (**new**) **Target Date** — an optional `<input type="date">` writing the real `projects.target_date` column directly (the same column the Project Lead Dashboard's own "Target Date" reads, see Dashboard above); `ProjectDetail` gained a raw-ISO `targetDateISO` field alongside its existing formatted `targetDate` display string specifically so this input can round-trip `yyyy-mm-dd` without reusing the "Jul 16"-formatted value or guessing a year back out of it
- **Billing**: Project Category (Client/Internal toggle), Client (a real per-organization roster — see "+ Add new client" below), Billing Rate. The Billable/Non-Billable-by-default note stays derived from Category, not a stored field
- A single **Save Changes** button (didn't exist before) persists only the fields this screen manages; the breadcrumb (`ProjectSettingsBreadcrumb`) reads the live project name from the same shared provider Sidebar/`/projects` use, so a rename shows up there immediately too
- **+ Add new client** (`add-client-modal.tsx`): minimal name-only creation, backed by a new `clients` table (see Architecture Status) — created immediately and selected in the form; persisted to the project on the next Save like any other field. Basic per-organization duplicate names are rejected.
- Danger Zone's Archive/Restore reuses `archive-project-modal.tsx`/`restoreProject` exactly as on the Projects list — no separate implementation
- **Removed**: General's "Project Lead" picker (and the `loadOrganizationMembers` fetch that only existed to populate it) — it read/wrote the older `projects.owner_profile_id`, which is not the same field as Team's real `project_memberships.project_role` (see Team below). Project Lead is now set exclusively via Team's "Make Project Lead" action. **Resolved**: the `/projects` list's own Lead column/filter has since been reconciled onto `project_memberships.project_role` too (see the new subsection below) — `ProjectSummary.owner`/`owner_profile_id` no longer has any Lead-column reader anywhere in the app (Member's "My Projects" was already on `project_role`; see Architecture Status → Projects).

#### Health, Progress, Ticket Counters & Tab-Regain Refresh (real, Admin/Project Lead) — `projects-list-screen.tsx`

The `/projects` list (`ManagedProjectsScreen`, Admin/Project Lead) previously showed several real-looking numbers that were actually always stale or `0` for real projects: the Health badge read the persisted `projects.health` column (never updated from the UI), the "At Risk" KPI duplicated its own blocked/overdue classification rather than reusing the one already established for the Admin Dashboard, and Progress/Open/Blocked/Overdue all read `ProjectSummary` fields (`progress`/`openTickets`/`blockedTickets`/`overdueTickets`) that the schema derives from `tickets` but nothing re-aggregates back onto `projects` rows — always `0`/`healthy` for a real project regardless of its actual tickets. A four-part pass fixed all of it, then added a real refresh so it can't go stale again on an open tab:

- **Health/At Risk/Progress/Lead are now one real per-project computation**, reused everywhere they're shown on this screen (badge, Health filter, "At Risk" KPI) rather than parallel/duplicated rules:
  - `buildProjectHealthRows` (`reports-screen.tsx`, already the Admin Dashboard's/per-project Reports'/Project Overview's own real health function) is called once per fetch, over every project's real tickets, and its `risk` (`"on-track"`/`"at-risk"`/`"blocked"`) is mapped onto the existing `ProjectHealth` badge vocabulary (`healthy`/`needs-attention`/`critical`). A project with no real tickets yet (the function's own "nothing to show" case) defaults to `healthy`, never a fabricated risk state.
  - The Admin Dashboard's own "Projects at Risk" widget and its blocked-projects health insight (`dashboard-screen.tsx`) were refactored to call this exact same function too, replacing a second, locally-duplicated blocked-then-overdue classification — the two screens can no longer disagree about what counts as "at risk." (Each still separately computes its own row's `progressPct`/`affected`-ticket count for display, since those are presentation details `buildProjectHealthRows` doesn't return — not part of the classification rule itself.)
  - `ProjectSummary.lead` (added ahead of this pass) is now sourced from `project_memberships.project_role = 'lead'` — the same real signal Team/the Dashboards already use — via a new batched query in `loadOrganizationProjects`, replacing the older `owner_profile_id`-backed Lead column/filter entirely.
- **Progress reuses a new, exported `computeProjectProgressPct(tickets)`** (`reports-screen.tsx`) — the exact same real done/total ticket-count formula (rounded, `0%` with no tickets) Project Overview's own progress bar already used, so a project showing e.g. 17% on its own Project Overview shows the same 17% on this list, never a second/different calculation and never the always-`0` persisted `progress` column.
- **Open/Blocked/Overdue reuse the same `buildProjectHealthRows` result** computed for Health above — the function gained two additional real fields, `open` (ticket count where `status !== "done"`, the same "open" definition Project Overview uses) and `overdueOpen` (open tickets whose due date is already past `todayISO`, the same clause the function already used internally for its own `risk`), alongside the pre-existing `blocked`. The list reads all three straight off that one result per project — no second pass over tickets, no more always-`0` `openTickets`/`blockedTickets`/`overdueTickets` fields.
- **Real refresh on returning to the browser tab, with skeleton loaders** — `ManagedProjectsScreen` gained a `metricsStatus` state that resets to `"loading"` synchronously every time its ticket-fetch effect re-runs (same "reset before the async fetch resolves" pattern the Dashboards' own main effects already use). That effect already depended on `organization` (from `useCurrentUser()`), so it already re-fires whenever `current-user-provider.tsx`'s existing window `focus` listener revalidates the session on tab-regain and hands back a new `organization` reference — no new listener, no polling, nothing added while the tab stays hidden. While `metricsStatus` is `"loading"` (first load, and again on every tab return), the whole screen renders a new `ProjectsLoadingSkeleton` — built entirely from `dashboard-shared.tsx`'s existing `SkeletonBlock` primitive, matching the real header/Create Project button, KPI strip, search/filters, and row layout (both the Admin grid row and the Project Lead's stacked-block row) at approximately their real dimensions — replacing the old plain "Loading projects…" text loading state entirely.
- Deliberately out of scope, unchanged: `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` (still `0`/unpopulated for real projects — the Project Lead's own info chips/summary cells still read them), and the base project list itself (name/status/category/lead/target date, from `useOrganizationProjects()`) — its own provider-level refetch-on-focus already existed and is unaffected; only this screen's own ticket-derived metrics gained the visible loading/skeleton treatment.

### Project Overview

Completed. Route: `/projects/[slug]`. `ProjectOverview` now branches by role rather than showing one page to everyone — Admin, Project Lead, and Member each get a purpose-built rebuild.

#### Admin — `admin-project-overview.tsx`

An executive dashboard, **now backed by real Supabase data end-to-end — implemented and type/build-clean, not yet clicked through in a live browser** (same "should work, not yet verified" caveat as Users — see Architecture Status). Real replacement for the previous mock-only version described below; the section names (Active Work, Project Activity, Team, Project Health) are unchanged.

- **Header** — real project name, description, status badge, category badge, and creation date ("Started …", from the real `projects.created_at` column). The initials badge shows the project's own real short name instead of a hardcoded "MB". The description is expandable/collapsible (clamped to 2 lines, measured by actual overflow rather than a character count, with a "View more"/"View less" toggle shown only when needed). The "Owned by" field was removed outright (not replaced).
- **Breadcrumb** — real project name, same pattern as Project Settings'/Ticket Detail's own breadcrumbs, replacing the page's old server-side mock lookup.
- **Alert Banner (Health Alerts)** — reuses company-wide Reports' own real health-alert calculation, scoped to this one project, rather than a second one. The Review action now targets every actionable alert type currently shown (never just one, and never an arbitrary ticket when more than one alert or ticket is present): exactly one alert type resolving to exactly one real ticket links straight to that ticket; every other actionable combination hands off to the Tickets page with the matching status filter(s) already applied and visible as removable chips; no actionable ticket hides the action link, and the banner itself is hidden when there's nothing real to flag.
- **KPIs** — Open Tickets, Progress (real done/total ticket-count percentage, the same formula already used by the Admin Dashboard's "Projects at Risk" widget and the Project Lead Dashboard's "Delivery Progress" KPI), Blocked, and Closed This Month (the same real signal Reports/Admin Dashboard already use for "completed this month").
- **Active Work** — real Blocked/In Progress/In Review ticket groups, with the existing empty state.
- **Project Activity** — capped at the 10 most recent real events, newest first, with a "View all activity →" link (shown only when more than 10 exist) to a brand-new, dedicated, fully paginated `/projects/[slug]/activity` page — the real, comprehensive activity trail (every event type, not just the curated few this card shows), with the same real `?page=`, 20-per-page, Previous/Next pagination pattern as Work History.
- **Team** — real roster, with the existing "View all →" link.
- **Project Health** — reuses company-wide Reports' own real per-project risk calculation for the verdict, rather than a second one. The existing Schedule/Capacity/Scope/Risks layout is unchanged; Schedule and Risks are driven by real blocked/overdue signals, Capacity by the real over-capacity team member, and Scope — which has no real signal anywhere in this schema — shows an honest "not tracked" note instead of a fabricated one.

No new database tables or columns were needed — pure application-layer query/rendering work on top of already-real `projects`/`tickets`/`ticket_activity`/`ticket_time_entries`/`project_memberships` tables.

#### Project Lead — `project-lead-project-overview.tsx`

An execution-focused rebuild, not a filtered Admin view: same KPI/Active-Work/Team baseline, but Project Health shows only the reasons (no status labels) — with the same clickable drill-downs as the Admin variant — plus a "Needs Your Attention" card — a prioritized, actionable ticket list derived from real ticket data (blocked first, then overdue review, then overdue, then due-today) — and a multi-alert banner.

#### Member — `project-overview.tsx`

Rebuilt as a personal workspace inside the project — "what do I need to work on here today?" — not a scaled-down Admin/Project Lead view. Project-wide health, capacity, and org metrics are intentionally absent.

- **KPI strip** — My Open Tickets, Due This Week, My Blocked Tickets, Completed This Month (scoped to the current member's own tickets in this project)
- **Alert banner** — member-specific only (tickets due today, review requests, mentions, blocked tickets), deep-links into Tickets pre-filtered to `Mine`/`Blocked` via `presetTicketsFilter`
- **My Project Work** — the member's own tickets in this project, with a **List**/**Board** view toggle (last-selected view persisted per project via `localStorage`); List groups by status (Blocked/In Progress/In Review/To Do/Backlog, empty groups hidden), Board reuses the same Kanban `BoardView` as Tickets/My Work; both are capped preview lists (most urgent tickets first) with a "View all project tickets →" link into Tickets pre-filtered to `Mine`
- **My Activity** — only events where the member participates (their own actions, or actions directed at them — assigned, commented on, mentioned), never general project activity
- **Needs My Attention** — personalized: blocked/overdue/due-today tickets plus review-request/mention notifications, positioned above Team since actionable content leads informational content
- **Team card** — real per-project roster via `getTeamByProjectSlug`, every avatar/name opens the Member Profile Modal
- **Quick Links** — Notes & Documentation

All data is correctly scoped to the active `slug` (tickets, team, activity) — **resolved**: the header's title/description now also come from the real project record instead of a fixed "Mobile Banking App" string, matching the Admin and Project Lead variants (see Architecture Status → Project Overview).

A cross-project "My Work" equivalent already exists (`my-work-screen.tsx`); this Member Project Overview is its single-project counterpart and deliberately does not offer a Focus view — scope is already limited to one project, and Needs My Attention already covers prioritization. Focus remains exclusive to My Work.

### Team

Completed, and now backed by real Supabase data end-to-end — **confirmed working against a live Supabase project** (see Architecture Status). Route: `/projects/[slug]/team`, Admin/Project Lead only. Real replacement for `mock-team.ts`'s `getTeamByProjectSlug` on this screen only — the Member Profile Modal's per-project single-view mode, `resolveTeamMember`, and ticket assignees/comment authors/activity-feed actors elsewhere in the app are untouched.

- **Team membership is now (mostly) automatic.** A database trigger creates a real `project_memberships` row the first time someone creates a ticket, edits one, comments, logs time, uploads an attachment, or links a ticket — never merely by viewing. It's the only way a plain Member (who has no direct `INSERT` grant on `project_memberships`) ends up staffed on a project; a backfill covers contributions that predate the trigger.
- `src/components/team-screen.tsx` — real roster (name/email/avatar/title/weekly capacity) plus real KPIs (Team Members, Weekly Capacity, Assigned Hours, Team Utilization) all derived live from the same member list, never stored/stale. "+ Add Member" opens `add-team-member-modal.tsx`, a picker over real org members not already on the team.
- **Project-scoped role (Lead vs. Member) is now a real column**, `project_memberships.project_role` — distinct from `projects.owner_profile_id` (an older, unrelated field) and from the org-wide `organization_memberships.role`. A "Project Lead" badge now shows on the real lead's card. A real bug was fixed alongside this: every member used to display `project_memberships.title` ("Member") as their role regardless of their actual org role — the roster now shows each member's real org role (Admin/Project Lead/Member) instead.
- **Make Project Lead** — an Admin-only action in the Member Profile Modal's project-mode menu, gated to members whose real org role is itself Admin or Project Lead. Promoting a new lead demotes the previous one in the same write (only one lead per project, enforced by a database unique index) and is picked up by the Team screen immediately via the same `window` `CustomEvent` pattern member removal already uses.
- **"Remove from Project" is conditional and DB-enforced.** It's only offered when the member has no real history on the project (created/assigned/commented/logged time/uploaded/related a ticket) — never rendered disabled, simply omitted — and a `BEFORE DELETE` database trigger independently blocks the delete outright if history exists, regardless of how the delete is invoked. "Send Message" was removed from the member menu (no messaging system exists).
- Removing a member from the globally-mounted Member Profile Modal is picked up by this screen immediately, without a manual reload or polling — a `window` `CustomEvent` dispatched only after the server confirms the delete, which both filters the member out of local state right away and triggers a real refetch (avoiding a stale in-flight fetch resurrecting the removed member).
- **"View Work History" is now a dedicated page**, not a modal: `/projects/[slug]/team/[userId]/work-history` — "which tickets has this person worked on in this project," with real **server-side** pagination (20/page, `?page=` in the URL, Previous/Next) via two Postgres RPCs, so a history that grows into the hundreds/thousands of tickets is never fetched whole into a modal. A requested page past the end resolves to the last real page. Clicking a ticket opens the real Ticket Detail route directly.
- Fixed a `NaN%`/`Infinity%` utilization bug: a 0-capacity member's utilization/capacity-bar math now normalizes to finite, non-negative numbers first, so it always shows `0%` instead of `NaN%`/`Infinity%` (over-100% allocation is still shown as-is in text).
- **Weekly Capacity now falls back to the member's real organization-level capacity** when the project-level value is unset — a real bug where a member added via "+ Add Member" (which never wrote a project-level capacity) displayed 0h despite having a real, configured org-level weekly capacity. An explicit 0 is never overridden, only a genuinely unset value falls back. This is the same query the Project Lead Dashboard's Team Capacity widget reads, so both stay consistent automatically (see Dashboard below).
- Per-person availability `status` (Available/Busy/Away) has no real source yet — every real member shows a fixed "Available".
- During this work, a validation script accidentally deleted every real `project_memberships` row in the live database; it was fully diagnosed and repaired (re-derived from still-intact source data, plus one hardcoded restore for a row with no derivable source, approved by the user) — see Architecture Status for the corrective migrations. No other data was affected.

---

### Tickets — All Five Views

Completed.

The Tickets experience at `/projects/[slug]/tickets` supports five views with an instant client-side toggle. Board is the default.

#### Ticket Types (Task / Bug)

Every ticket has a `type: "TASK" | "BUG"`. A shared `TicketTypeIcon` renders immediately before the ticket ID on every screen that shows one (ticket cards, Ticket Detail, Ticket Preview Panel, Calendar, Timeline, Insights, Dashboard/Reports activity rows) — one component, so the glyph and its color stay identical everywhere. A custom `TicketTypeSelect` dropdown (not a native `<select>`) is used in the New Ticket form and Ticket Detail sidebar so the picker itself can render the icon inside each option.

#### View Switcher

A segmented tab control switches between all five views: **List**, **Board**, **Calendar**, **Timeline**, and **Insights**. All tabs are active.

#### Filter Bar

Fully real and wired — every control below combines with every other one (AND) into a single filtered ticket list shared by all five views and the header's Tickets/Estimated/Blocked counters; nothing is duplicated per view.

- Search input — matches ticket title or visible key
- Dropdown filters: Assigned (Anyone/Me/Unassigned + real org roster), Priority (Highest/High/Medium/Low), Status
- Quick toggle chips: Mine, Blocked, High Priority (Highest or High), Due Soon (active tickets due within the next 7 days, never overdue), Recently Updated (last 7 days)
- "Add Filter" menu adds a real filter chip to the bar: Labels (multi-select from the real per-org catalog), Due Date / Created Date / Updated Date (from/to range), Reporter (who created the ticket, by real user id — multi-select). Clearing a chip's value removes it from the bar; re-adding it from the menu is how it comes back.
- "Mine" and Reporter match the signed-in user's real `profiles.id`, never the display name

#### Board View

Five independently scrolling columns:

- Backlog
- To Do
- In Progress (includes blocked tickets)
- In Review
- Done
- Blocked (dedicated column for blocked tickets)

Each column:

- Color-coded dot accent, count badge, last-activity subtitle
- Cards link to `/projects/[slug]/tickets/[ticketCode]`

Each board card:

- Blocked indicator (if applicable)
- Title (2 lines max)
- Due date (if present)
- Priority indicator (Highest/High only), milestone, assignee avatar

#### List View

Tickets grouped by the same status sections. Each section has a labeled header with a count and a horizontal rule. Rows show title, blocked indicator, priority (Highest/High only), milestone, due date, and assignee avatar.

#### Calendar View

Month-grid calendar showing tickets on their due dates.

- 6 × 7 cell grid (42 cells), starting on Sunday
- Up to 3 ticket pills per cell; overflow shows "+N more"
- Today's date highlighted with a brand-coloured circle
- Clicking a day opens a right-side panel listing that day's tickets
- Clicking a ticket in the day panel opens a ticket detail sub-panel
- Month navigation via chevron buttons

#### Timeline View

Horizontal planning view grouped by milestone. Inspired by Linear Roadmap.

- Tickets rendered as horizontal bars, colour-coded by status
- Bar width derived from `dueDate − max(3, storyPoints × 1.5)` days (no new schema fields)
- Milestones rendered as collapsible section headers with ticket counts
- Ticket rows indented under their milestone header
- Frozen left label column during horizontal scroll
- Vertical "Today" indicator in brand colour with header badge
- Smooth scroll on mount to position Today at ~1/3 from the left edge
- Clicking a bar navigates to the ticket detail route

#### Insights View

Project-level analytics dashboard computed from the existing ticket dataset.

- **KPI cards**: Open Tickets, Completed, Blocked, Overdue
- **Tickets by Status**: SVG multi-segment donut chart with legend
- **Workload by Assignee**: horizontal bar chart with avatars
- **Priority Distribution**: horizontal bar chart with percentage labels
- **Milestone Progress**: progress bars per milestone, colour-coded by completion
- **Upcoming Due Dates**: top 6 non-done tickets sorted by due date, with relative countdown
- **Recently Completed**: done tickets with assignee avatar and timestamp

No external chart libraries. All charts are pure SVG or CSS.

#### Quick Ticket Preview

Clicking a ticket card opens a slide-in preview panel from the right (520px wide) without leaving the current view.

- Panel slides in with a 250ms ease-out animation; backdrop dims the board
- Header: issue key, title, status badge
- Body: priority, assignee, milestone, story points, due date, labels, description, comments (2), activity timeline
- Content cross-fades when switching between tickets while the panel is open
- Footer: **Expand** button navigates to the Full Detail route
- ESC key and backdrop click close the panel
- State is fully preserved while the panel is open (view, filters, scroll)
- **Editable, when opened from the Tickets board**: Title, Status, Priority, Assignee, Estimated, Due Date, and Labels can all be edited inline, right from the panel — same persistence (`updateTicket`) and same real Activity Log as the full Ticket Detail page, so an edit here and an edit there always agree. Description and Acceptance Criteria stay read-only. This is opt-in per caller (an `editable` prop) — every other place this same panel is used (Dashboard, company-wide Reports, the Project Lead's/Member's own Project Overview, etc., all still on mock data) is unaffected and remains read-only exactly as before. The **Admin** Project Overview's own preview panel now shows real ticket data (same as the rest of that screen) but hasn't been opted into `editable` either, so it stays read-only there too.

#### Full Ticket Detail Page

The route `/projects/[slug]/tickets/[ticketCode]` renders a complete ticket workspace, backed by real Supabase data — see Backend Integration below.

- **← Back to Tickets** button at the top uses `router.back()`, preserving browser history
- Two-column layout: main content left, metadata sidebar right
- Main content: issue key, title, status badge, description, Acceptance Criteria, Attachments (upload, rename, delete, download, and Preview for images/PDF — all real), Time Tracking, comments, activity timeline
- Sidebar: editable status, type, priority, assignee, due date, labels, Estimated hours, Related Tickets (real — link/search/remove, with the correct inverse relation kept automatically on the other ticket). Milestone and Story Points fields exist in code but are dead — defined, never rendered
- Every save on this page (fields, comments, time entries, attachments, related tickets) now shows a real error toast on failure instead of only logging to the console, and a failed inline edit reverts to its previous value rather than leaving an unsaved change on screen

#### Backend Integration

Tickets is now backed by real Supabase data — the second major mock-to-real seam after Projects (see Architecture Status for the full read/write/RLS breakdown).

- `src/lib/tickets.ts` — the single module for every real Tickets read/write: `loadProjectTickets` (all five list views, scoped by `project_id`), `loadTicketByCode` (Ticket Detail's data source, resolved by the visible ticket code, e.g. `JIR-1` — the internal uuid is never exposed in a URL), `createTicket` (New Ticket modal — Type/Status/Priority/Labels/Due Date in "More Options" still write fixed defaults, not the value picked in the form), `updateTicket` (every Ticket Detail *and* Quick Ticket Preview inline edit: Title, Description, Status, Type, Priority, Assignee, Estimated Hours, Due Date, Labels, and each Acceptance Criterion's checked state), `loadTicketComments`/`createTicketComment`, `loadTicketActivity`, `loadOrganizationLabels`/`createOrganizationLabel`, `loadTicketAttachments`/`uploadTicketAttachment`/`downloadTicketAttachment`/`getTicketAttachmentPreviewUrl`/`renameTicketAttachment`/`deleteTicketAttachment` (all real — Storage + metadata row; "Replace File" was removed from the menu rather than wired up), `loadTicketTimeEntries`/`logTicketTime` (minutes as the canonical stored unit), and `loadTicketRelations`/`createTicketRelation`/`deleteTicketRelation` (Related Tickets)
- The ticket detail route was renamed from `/projects/[slug]/tickets/[ticketId]` to `/projects/[slug]/tickets/[ticketCode]` — a real bug is fixed here: the route used to navigate on the internal uuid and could 404 when a stale dev-server route table lagged the rename; the ticket code is now the only thing that ever appears in a ticket URL
- **Activity Log is real and comprehensive**, built almost entirely with database triggers rather than client code, so ticket creation, every field change, attachment uploads/renames/deletes, time entries, and related-ticket add/remove (logged on *both* tickets involved) are all logged automatically with the real authenticated actor
- Tickets list filtering is fully real — search, Assigned (real roster)/Priority/Status dropdowns, the 5 quick-filter chips, and the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date) all combine into one filtered list every view and the header counters share; nothing is unwired or duplicated per view anymore
- **Related Tickets is real**: search is scoped to the current project's own real tickets and excludes the current ticket and anything already linked; only 3 canonical relation kinds are ever stored in the database (a single row per relation), with the 2 inverse UI labels ("Is blocked by"/"Is duplicated by") derived per-perspective — this is what keeps the inverse relation correct automatically and makes duplicate-relation prevention a plain database constraint
- Ticket priority is a 4-value scale — Highest/High/Medium/Low — the old "Normal" value was migrated to Medium and removed from the database enum entirely, not just hidden client-side
- Every write path (fields, comments, time entries, attachments, related tickets) now shows a real error toast on failure and never leaves an unpersisted optimistic change on screen; Ticket Detail's own load failure has a Retry button, same as the ticket list
- New Ticket's Possible Duplicates check now runs against the current project's own real tickets, never another project's or the old mock array
- The **Admin** Project Overview now creates/views real tickets against the same real Tickets data as everywhere else (see Project Overview above); the Project Lead's own Project Overview still uses `NewTicketModal`/`TicketDetailScreen` against local mock ticket state
- New tickets now default to Backlog status, not To Do — the fixed default the database column itself already had, previously overridden by the application layer
- Ticket Description is now inline-editable on Ticket Detail with explicit Save/Cancel actions and a placeholder when empty (previously saved but could silently fall back to the old value instead of allowing an empty description, and a failed save discarded the typed draft instead of keeping it on screen)
- Tickets now supports a real, URL-persisted status/alert filter (`?alerts=overdue,blocked,done,in-progress`, etc.) — shown as real, removable filter chips using the same chip style/labels as the existing quick filters, survives a refresh or browser back/forward (real query-state, unlike the pre-existing sessionStorage-based filter handoff, which is unchanged and still used for its own existing callers). This is what backs both the Project Overview Health Alert banner and Project Reports' Delivery Progress cards — see their own sections

#### Navigation & State Restoration

When clicking **Expand** from the preview panel, the tickets screen state is saved to sessionStorage before navigating. On return (back button), the screen restores: active view, filter chips, search query, scroll position, and the same preview ticket reopened.

### Hours & Time Tracking

Completed. Route: `/time-tracking`, branches by role. Personal time logging always happens the same way regardless of role — the "Log Time" button on a ticket in Ticket Detail. **The Admin/Member view is now backed by real Supabase data — implemented and type/build-clean, not yet clicked through in a live browser this session, same "should work, not yet verified" caveat as Users/Admin Project Overview/per-project Reports.**

#### Admin/Member — `time-tracking-screen.tsx`

Full Billing/Finance view, now real: period selector (Today/This Week/This Month/Custom Range) plus real Member/Project/Client/Billing filters, all round-tripped through the URL so they survive a refresh (same `?alerts=`-style query-state precedent as Tickets). Overview KPIs (Billable Hours, Non-Billable Hours, Members Missing Hours, Weekly Utilization, Projected Billing), the real Timesheets table (real active org members, real logged hours per period, real Capacity %/Status), a Members Missing Hours panel (renamed from "Hours Missing" — the value counts affected members, not hours), and a Billing by Client table are all real. Billable/Non-Billable figures and Billing by Client reuse Reports → Finance's own `buildFinanceKpiSummary`/`buildBillingOverviewRows`/`buildBillableHoursByMemberRows` (exported for this reuse) rather than a second billing calculation; capacity-based figures (Members Missing Hours, Weekly Utilization, Capacity %, Status) are kept structurally independent of the Billing filter — they always reflect a member's total logged hours against their real Weekly Capacity (the same org-then-project fallback Team/Reports already use), regardless of billable/non-billable, via two separately-scoped ticket-id sets rather than one shared scope. There is no "Billing by Member" table in this screen.

#### Project Lead — `project-lead-time-tracking-screen.tsx`

Now real, scoped to exactly the projects this profile leads (`project_memberships.project_role = 'lead'`, via `loadLeadProjects` — the same authoritative definition the Project Lead Dashboard's own project scope selector uses, never `loadOrganizationProjects`/`loadOrganizationTickets`/`loadOrganizationUsers`'s broader "staffed on" or org-wide scope). Tickets/team roster come from `loadProjectTickets`/`loadProjectTeam` per led project (merged and deduped client-side, summing `weeklyCapacity` for anyone staffed on more than one led project), and time entries reuse `loadOrganizationLoggedTimeForRange` verbatim, fed a ticket-id set already narrowed to led projects only. Every calculation (`scopeEntries`, `hoursByMember`, `expectedHoursForPeriod`, `getCurrentWeekRange`/`getCurrentMonthRange`, `round1`, `parseListParam`) is imported from `time-tracking-screen.tsx` (now exported for this reuse) rather than reimplemented, and Logged/Internal Hours reuse `buildFinanceKpiSummary` verbatim (same billable/non-billable split as Admin/Member, just delivery-labeled — no dollar amounts shown anywhere on this page). Still a delivery-focused layout with no revenue/invoicing/billing-by-client concepts: delivery-labeled KPIs (Logged Hours, Internal Hours, Hours Missing, Weekly Utilization, a **Capacity Risk** card), a Hours Missing reminder, a real Hours by Project breakdown (new — no real equivalent existed in the Admin/Member screen to reuse), and a Timesheets table scoped to the Lead's own led-project team. Member/Project/Client filters are now real and functional (the mock version's filter state was never wired to any actual data narrowing); `?projects=<slug>` is read on load and kept round-tripped through the URL, same convention Admin/Member's own Time Tracking screen already uses — a slug outside the signed-in lead's own led projects can only narrow the (already led-project-scoped) ticket set to nothing, never broaden access. No longer imports `mock-time-tracking.ts` data (only its `TimePeriod`/`CustomRange`/`TimesheetStatus` types and `periodDisplayLabel`, same type/helper reuse convention Admin/Member's screen already established). The three mock-only exports it used to import (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) have been deleted from `time-tracking-screen.tsx` — they had no other consumer. Implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass); not yet clicked through in a live browser against a real Supabase project.

#### Member — no dedicated nav item, but the same real screen as Admin

Members have no Time Tracking sidebar link. A compact "My Time" summary row plus a "View Timesheet" link (`personal-timesheet-panel.tsx`) live inside My Work instead, unaffected by this work.

Time Tracking is also integrated into the Ticket Detail page for logging against a specific ticket. This ticket-level piece is backed by real Supabase data (`loadTicketTimeEntries`/`logTicketTime` in `src/lib/tickets.ts`, minutes as the canonical stored unit) — see Tickets → Backend Integration, unaffected by this work.

Includes:

- **`TimeTrackingSection`** (collapsible, expanded by default) below the Development section
  - Compact summary line: `Xh logged / Yh estimated`
  - Conditional variance text: `+Zh over estimate` in amber, shown only when over
  - Smart 2-segment 4px progress bar: brand fills estimated portion, amber fills overage
  - `View N entries →` link opens `TimeHistoryModal`
- **`LogTimeModal`**: hours + minutes inputs, date picker, comment textarea; submit persists a real time entry and the Activity Log picks it up via a database trigger
- **`TimeHistoryModal`**: full entry list with summary stats (Logged / Estimated / Remaining), scrollable timeline-dot entry list
- Ticket header stats row: Estimated / Logged / Remaining (shown when `ticket.hours` is set)
- Sidebar "Estimated" field (renamed from "Hours")

### Dashboard

Completed. Route: `/` (root). The root no longer redirects to `/projects`. `DashboardScreen` now branches by role — Admin, Project Lead, and Member each see a distinct, purpose-built dashboard rather than a filtered version of one screen. Shared building blocks (KPI card, hero card styles, section container, `RecentActivityList`, `ActiveTicketRow`, and — **new** — `SkeletonBlock`, a single pulsing placeholder primitive) live in `dashboard-shared.tsx`. **All three dashboards — Admin, Project Lead, and Member — are now backed by real Supabase data end-to-end — confirmed working against a live Supabase project.**

**New**: all three dashboards' loading states now render a structural skeleton (matching each dashboard's own real header/KPI-grid/section layout, built from the shared `SkeletonBlock`) instead of a plain "Loading dashboard…" text block — same real load-state gating as before (`loadState`/`deliveryLoadState`), only the visual for that state changed. Along the way, a real (if minor) bug was found and fixed on the **Admin** dashboard: its main data-loading effect never reset `loadState` back to `"loading"` on a re-run (e.g. the real `window` `focus`-regain revalidation `current-user-provider.tsx` already does — see that file's own real refetch-on-focus/route-change effects), so a background refetch after returning to the tab replaced the on-screen data with no visible loading indicator at all, unlike Project Lead's and Member's own effects (which already reset to `"loading"` on every re-run). Admin's effect now does the same reset — same existing mechanism, not a new one; Project Lead's and Member's own refresh behavior is unchanged.

#### Admin (default company-wide view) — `dashboard-screen.tsx`'s `AdminDashboard()`

- Header: real greeting + real current date
- Quick actions: **New Project** and **Add Member** open `CreateProjectModal`/`InviteUserModal` directly from the Dashboard (same modals Projects/Users already use); `+ New Ticket` was removed from Quick Actions entirely
- 4 KPI cards — Assigned Tickets, Hours Burn, Blocked, Due Today — all real
- Organization Health insight band — real, computed from blocked projects, over-capacity members, hours burn, and tickets completed this month
- Two-column layout (`xl:grid-cols-[1fr_320px]`):
  - Left: My Active Work (real, click-to-preview) + Recent Activity (real, via the real `ticket_activity` feed)
  - Right: Projects at Risk (real) + Team Workload (real, progress bars) + Upcoming Deadlines (real)
- Ticket quick-preview panel on row click (reuses `TicketPreviewPanel`)
- No mock data remains on this screen (only the shared `Ticket` type/`getTicketDisplayKey` helper are still imported from `mock-tickets.ts`, same as every other real screen)
- **New**: Recent Activity now shows a real "View all activity →" action when more than 10 real events exist, same cap-plus-probe pattern (`loadOrganizationActivity` fetched one past the display limit, purely to detect "more exists") the Admin Project Overview's own Project Activity widget already used — `RecentActivityList`'s own rendering is unchanged, no second implementation of activity rendering. The link opens a new, dedicated, org-wide Activity History page (`organization-activity-history-screen.tsx`, route `/activity`, not on the Sidebar's main nav — reached only via this link, same "link-only" precedent as Work History) — the org-wide sibling of the existing per-project `/projects/[slug]/activity` page, backed by a new `loadOrganizationActivityPage` in `lib/tickets.ts` that mirrors `loadProjectActivityPage`'s query/pagination shape verbatim. This addition hasn't itself been clicked through in a live browser this session — same "should work, not yet verified" caveat as Users/Admin Project Overview/per-project Reports/Time Tracking (Admin/Member), even though the rest of this Dashboard was previously confirmed live.

#### Project Lead — `project-lead-dashboard.tsx`'s `ProjectLeadDashboard()`

Built from first principles, not a filtered Admin view. Every section is now real.

- **Current Project selector** — every active project this profile leads (`project_memberships.project_role = 'lead'`); switching projects refetches everything below it immediately
- **Current Delivery** hero card — Delivery Progress, Completed Tickets, **Remaining Work (Open Tickets)** (renamed from "Remaining Hours"/"Estimated Hours Remaining" for clarity; same formula, unchanged: sum of each open ticket's own `hours − logged minutes ⁄ 60`, floored at 0 per ticket, then summed for the project), Blocked Tickets — all real. **New**: all three KPIs are now independent click targets, each reusing its own already-real source of truth (never a second query/filter):
  - **Completed Tickets** / **Blocked Tickets**: 0 → not clickable; exactly 1 → opens that ticket's real Ticket Preview panel directly (never Ticket Detail); more than 1 → navigates to this project's Tickets view with the real `?alerts=done` / `?alerts=blocked` filter applied and visible (same query-state convention Tickets already uses elsewhere).
  - **Remaining Work (Open Tickets)**: "contributing" tickets are determined by the *per-ticket* remaining formula above (a ticket only counts if its own remaining is `> 0` — this can diverge from the displayed aggregate, which is floored only once at the end, not per ticket), independent of whether the KPI's own displayed value is 0. 0 contributing tickets → not clickable; exactly 1 → opens its Ticket Preview; more than 1 → navigates to Tickets filtered to the union of those tickets' own statuses. (This KPI briefly linked to Time Tracking during development — that was wrong and has been reverted; it never opens Ticket Detail or Time Tracking.)
- **Target Date** — now the project's own real `projects.target_date` (via `loadLeadProjects`), shown/edited on Project Settings' General section (see Projects below). **Fixed a real bug**: this previously showed the nearest due date among the project's own open tickets — a different, unrelated real field with a similar-looking value — never the actual Target Date column, which was already being fetched but silently discarded.
- **Attention Required** — Blocked Tickets, Due Today, Over Capacity, Awaiting Review — all real, and **all four are now actionable** (same real source of truth each KPI already used, no new queries/filters):
  - **Blocked Tickets / Due Today / Awaiting Review**: 0 → unchanged empty state (Blocked Tickets keeps its pre-existing always-clickable-to-the-unfiltered-Tickets-view behavior at 0, by design; Due Today/Awaiting Review are not clickable at 0); exactly 1 → the card stops showing a bare count and instead shows that ticket's real ID + title, plus a small contextual label (`BLOCKED TICKET` / `DUE TODAY` / `AWAITING REVIEW`, same secondary-label typography used elsewhere on this dashboard) — clicking opens its Ticket Preview panel directly; more than 1 → unchanged count-based card, now navigating with the real `?alerts=blocked` / `?alerts=due-today` / `?alerts=review` filter applied and visible (previously navigated to an unfiltered Tickets view).
  - **Over Capacity**: 0 → not clickable; exactly 1 → shows that member's name (unchanged) and opens the real Member Profile Modal via `openMemberProfile({ profileId: member.id, ... })` — the same real `profileId`-keyed mechanism `TeamCapacityRow` already uses on this same dashboard, never a name/avatar match and never `mock-team.ts`; more than 1 → unchanged, navigates to this project's Team page.
- **Team Capacity** — the real project roster with real assigned hours/utilization, sorted by utilization descending, real empty state
- **Project Work** (renamed from "My Active Work" once it stopped being scoped to just the signed-in lead) — every active ticket in the project regardless of assignee, sorted blocked-first/priority/due date
- **Recent Activity** — real, from any project member, not just the signed-in lead
- **Upcoming Deadlines** — real, from any assignee, with real overdue styling
- Quick actions: **Add Member** opens `AddTeamMemberModal` directly against the selected project (no detour through the Team page); **New Note** opens `NewNoteModal`; **New Ticket** opens `NewTicketModal` (with real Possible Duplicates) — all three reuse the exact modals/services Team/Notes/Tickets already use

#### Member — `member-dashboard.tsx`

A personal cross-project work-queue rather than a project-management view. **Now backed by real Supabase data end-to-end — confirmed working against a live Supabase project**, following the same real-load-state/Retry convention as every other real screen.

- Header: real greeting + real current date (previously the hardcoded string "Tuesday, June 30")
- 4 hero stats — Assigned Tickets, Weekly Capacity (renamed from a hardcoded "Planned Today"), Logged Today, Due Today — all real. **New**: Assigned Tickets and Due Today are now independent click targets, reusing `activeWork`/the same due-today filter already driving each KPI's own count (no second query): 0 → not clickable; exactly 1 → opens that ticket's real Ticket Preview panel directly (Due Today also swaps its bare count for that ticket's real ID + title first); more than 1 → navigates to this project's Tickets view with the real `?assignee=me` filter applied and visible (a real, URL-driven initializer added to Tickets' own existing "Assigned" filter, `tickets-screen.tsx` — previously `assigned` was FilterBar-only, never read from the URL) — Due Today additionally combines it with the existing `?alerts=due-today` filter Admin/Project Lead already use for their own "Due Today" KPIs.
- Recommended Next (hero card) — real, sorted by the same Blocked → Due Today → High Priority → In Progress → Ready to Start → In Review tiering, now driven by the real current local date instead of a fixed mock date/label set
- My Active Work — real tickets assigned to the signed-in member (excluding Done), priority-first, reuses ticket/status components
- Time Today — real, with a real per-project breakdown of today's logged time, plus Logged Today / Weekly Capacity / Remaining This Week
- Needs Your Attention — real, actionable-only events (blocked, reassigned to you, moved to review, estimate changed) sourced from `ticket_activity`; the mock "mention" category has no real source in this schema (comments aren't parsed for @mentions) and simply never populates, never fabricated
- Upcoming Work — real
- Real empty states throughout ("You're all clear," "Nothing needs your attention right now," "No time logged yet today," "Nothing else on the horizon")
- `TicketListRow` / `ActiveTicketRow` gained an optional `projectBadge` slot so multi-project rows can show which project a ticket belongs to
- `MEMBER_WORK`/`WorkItem` (the old mock array) stay defined/exported in this same file, but are now fully unused anywhere in the app — **resolved**: `member-projects-screen.tsx` ("My Projects") was later made real and no longer reads them (see Architecture Status → Projects)

Along the way, fixed a dark-mode bug where the Project Lead's and Member's hero cards (and the Admin "Hours Burn" KPI card) referenced `brand-300/400/900/950` shades that don't exist in the theme, silently falling back to the light gradient in dark mode.

### My Work

Completed.

Route: `/my-work`. Personal home screen for every team member.

Includes:

- Greeting header with user avatar
- KPI cards: Open tickets, Due today, Hours logged, Blocked
- Focus Mode toggle: collapses non-focus tickets for distraction-free view
- Active tickets list with inline status, priority, and due date
- Recent activity feed
- Ticket quick-preview panel on row click

### Reports

Completed. Route: `/reports`, branches by role. Shared primitives (KPI card, section, status bar, progress bar) extracted into `reports-shared.tsx` so role-specific screens reuse the same building blocks without importing from each other.

#### Admin — `reports-screen.tsx`

Company-wide Delivery/Finance view. **Now backed by real Supabase data end-to-end — confirmed working against a live Supabase project.** (Also the screen the Member role sees when visiting `/reports` — the Finance tab itself stays Admin-only, gated inside the component; Project Lead gets its own separate, still-mock screen — see below.)

- **Shared filters and period** — Project/Assignee/Client/Date filters plus a Period selector (This Week/This Month/This Quarter/Custom) all combine (AND) into one filtered ticket set every KPI, table, and chip on both tabs reads from a single shared fetch, rather than a separate query per widget. Filter option lists never show a real org member/project/client with zero real tickets.
- **Delivery tab**: real KPI row (Projects, Active Tickets, Hours Burn, Blocked, Done This Month, Overdue), a real Health Alerts banner (critical/informational thresholds derived from the same real KPI numbers, never a parallel computation), Hours by Person and Project Health tables, Workload (real assigned hours/capacity/utilization plus a real "change this week" delta from the Activity Log), Hours Distribution (real hours bucketed by ticket status), and Recent Changes (real, deduped, date-grouped ticket activity).
- **Finance tab** (Admin only): real KPI row (Billable/Non-Billable Hours, Utilization, Estimated Revenue), Billing Overview (real per-client weighted-average billing rate), and Billable Hours by Member (real per-member revenue) — all three cross-checked to match each other and the KPI card to the dollar/hour, computed per-project-then-summed rather than re-derived from already-rounded display values.
- **Export** — CSV/Excel/PDF for both tabs, built from the exact same in-memory state every widget already reads (no extra queries): Delivery exports 7 sections, Finance keeps every section un-mixed in CSV and in its own worksheet in Excel, and PDF preserves on-screen order. The Export menu was simplified down to only these 3 real options.
- **Header date** — the page header's date (previously the hardcoded string "Monday, June 30, 2026") is now the real current local date, updating automatically each day.

#### Project Lead — `project-lead-reports-screen.tsx` (new)

A purpose-built Reports screen scoped to only the Lead's own projects and team — not the Admin's company-wide view. **Still mock** — a separate component from `reports-screen.tsx` above, unaffected by it becoming real.

- **Delivery** tab
- **Team** tab

### Project Reports (per-project)

Route: `/projects/[slug]/reports`, every role. A separate component (`project-reports-screen.tsx`) from both `reports-screen.tsx` (company-wide, Admin) and `project-lead-reports-screen.tsx` (Project Lead's own scoped view) above. **Now backed by real Supabase data end-to-end — implemented and type/build-clean, not yet clicked through in a live browser** (same "should work, not yet verified" caveat as Users/Admin Project Overview).

- **Project Health KPI** — reuses company-wide Reports' own real per-project risk calculation, rather than a second one. Real bug fixed here: this card previously showed the project's lifecycle status (Planning/Active/…) mislabeled as "Project Health" — it now shows a real computed health verdict instead.
- **Weekly Capacity / Assigned Hours / Team Utilization** — the exact same real per-member roster/formula Team already uses (`0%` when capacity is `0`).
- **Estimated vs Logged Hours** — Estimated = real ticket estimates summed; Logged = real time entries summed (all-time); Remaining = `max(estimated - logged, 0)`; percentage = `0` when estimated is `0`.
- **Team Workload** — real roster, with the existing empty state when the project has no active members.
- **Delivery Progress** — real ticket-status counts and completion percentage (`0%` with no tickets). The Completed/In Progress/Blocked cards now navigate contextually instead of the old, non-functional status query param (never actually read anywhere): zero matching tickets never navigates; exactly one links straight to that ticket; more than one hands off to Tickets with the matching status filter applied and visible, via the same real filter mechanism the Project Overview Health Alert banner uses. Total Tickets is unchanged — always the plain, unfiltered Tickets page.
- **Delivery Snapshot** — a real current-month reporting period (first of the month through today, displayed with the app's existing date formatting). Completed Tickets/Hours are now based on real ticket status-change history within that period, not a ticket's own last-updated timestamp, so a ticket touched by an unrelated later edit is never miscounted as "completed this month." Remaining Hours reuses the same number as the Estimated vs Logged card above.
- **Breadcrumb** — real project name, same pattern as the other real breadcrumbs.

No new database tables or columns were needed — pure application-layer query/rendering work on top of already-real `projects`/`tickets`/`ticket_activity`/`ticket_time_entries`/`project_memberships` tables.

### Settings

Completed.

Routes: `/settings` (redirects to `/settings/general`) and `/settings/[section]` for 6 sections.

Sections:

- **General**: Workspace name, logo, timezone, language, working days (day picker), and Defaults (default role + default capacity applied when inviting a user from `/users`)
- **Projects**: Chip pickers for statuses, priorities, labels, and ticket types (+ Add buttons)
- **Time Tracking**: Hours per day, weekly capacity, estimation defaults, rounding preferences
- **Notifications**: Email, desktop, and digest toggles with per-channel granularity
- **Integrations**: GitHub (connected, 3 repos), Slack and Google Calendar (Connect buttons), Jira Import (Coming Soon)
- **Danger Zone**: Archive Workspace (amber) and Delete Workspace (red) actions with warning messaging

People (formerly a Settings section) is now the dedicated **Users** module — see below.

Navigation:
- Left sub-nav lists all 6 sections; active section highlighted
- Breadcrumb: `Settings / Section Name`
- `/settings` redirects server-side to `/settings/general`
- Sidebar Settings link goes directly to `/settings/general`

---

### Users

Completed, and now backed by real Supabase data end-to-end — **implemented and build/type-checked, but not yet confirmed against a live Supabase project or in a browser** (see Architecture Status). Route: `/users`, Admin only — hidden from the sidebar for Project Lead/Member (same nav-hiding convention as Settings), and the page itself also renders an "Admins only" message if visited directly by a non-Admin.

A dedicated top-level management module, replacing the old Settings → People page. `src/lib/users.ts` is now the real data source (`loadOrganizationUsers`, reading `organization_memberships` + `profiles` plus a real `lastLogin`), replacing `mock-users.ts` entirely for this screen; `mock-team.ts`'s `TeamMember` (one row per person *per project*) remains the separate, still-relevant type used everywhere else a project member is referenced.

- **Header**: "Users" title, "Manage user accounts, access and permissions." subtitle, "+ Invite User" button
- **Filters**: Search, Role, Status, Project (multi-select dropdowns, same `FilterDropdown` component used across Tickets/Team/Time Tracking)
- **Table columns**: Avatar + Name, Email, Role, Status (Active/Invited/Disabled), Projects (count, clickable — opens the Projects tab), Weekly Capacity, Last Login (real, via the Auth Admin API), Actions
- **Row actions (⋯)**: View Profile, Edit User (real), Reset Password (real — generates a link, see below), Resend Invitation (Invited only — still mock, toast-only), Disable/Enable User (real), Delete User (confirmation modal required, still visual-only)
- **Invite User modal** (`invite-user-modal.tsx`): a pill toggle between **Send by email** (real, via the Auth Admin API) and **Generate invite link** (mints a single-use link and shows a Copy Link success view instead of closing) — both share one underlying validation/write path so they can't drift. First/Last Name, Email, Role, Weekly Capacity, Assign Projects (checkbox list). The same component also powers **Edit User** via an `editingUser` prop (pre-filled, no invite toggle, "Save Changes" — real: first/last name, role, and weekly capacity persist; the email field still doesn't)
- **Reset Password**: generates a single-use link (`reset-password-link-modal.tsx`, shared with the Member Profile Modal's Security tab below) instead of sending an email — no email is sent by this action
- **Disable/Enable User**: real — flips `organization_memberships.status` only, never touches `profiles`/`auth.users`; a disabled user's own open session is signed out immediately if they're still logged in, and a re-enabled user can log back in correctly (a real bug — stale client-side auth state surviving the disable/enable cycle — was fixed here)
- Every privileged write above (Invite, Disable/Enable, Edit, Reset Password link) goes through its own Server Action (`src/lib/server/*.ts`) using the Supabase service-role key, because `organization_memberships` has no direct `UPDATE`/`INSERT` grant for the `authenticated` role — RLS alone was never the gate, Postgres checks table privileges first — and because each write re-verifies the caller server-side (active org admin, same organization) rather than trusting the browser

The existing Member Profile Modal (`member-profile-modal.tsx`) is reused rather than building a new one — it now supports two modes: the original single-view (unchanged, still used everywhere a `TeamMember` is clicked) and a tabbed mode (Profile / Projects / Permissions / Security / Activity) that activates when opened with a `user` (org-wide `User`) instead of a `member`. In user mode:

- **Activity tab** — real, and **summarized rather than a detailed log**: reuses `ticket_activity` (`loadUserActivity`), grouping every non-milestone action on the same ticket into one "Working on `JIR-x` · N updates" entry, capped at the 10 most recent after grouping; `ticket_created` and "Joined the workspace" stay as their own entries. The old mock events ("Logged in", "Invitation email sent", "User disabled", etc.) were removed rather than kept alongside real data.
- **Security tab** — real Last Login, and a "Generate Reset Link" button (renamed from "Send Reset Email") that reuses the same link-generation flow as the Users list's Reset Password action. `browser`/`os`/`device` have no real source yet and simply don't render.
- **`src/app/accept-invite/`** — the real "set your password" landing page both invite-delivery methods (email link and generated link) resolve to.

---

### Project Notes

Completed, and now backed by real Supabase data end-to-end — **confirmed working against a live Supabase project** (see Architecture Status). Route: `/projects/[slug]/notes`. Real replacement for `src/lib/mock-notes.ts`'s hardcoded array; `mock-notes.ts` itself is kept only as a type-only module (`ProjectNote`).

- `src/lib/notes.ts` — the real data source: `loadProjectNotes` (real list, newest-updated-first), `createNote`, `updateNote`, `duplicateNote` (real "(Copy)"/"(Copy 2)"/... duplication, deduped against every title that currently exists in the project, not just what's loaded client-side), and `deleteNote`. Activity logging (create/update/delete) is handled entirely by database triggers into a new `project_note_activity` table — not yet surfaced in any UI.
- `src/components/notes-screen.tsx` — real list + search (title/body); "+ New Note" (`NewNoteModal`, now exported so the Project Lead Dashboard's Quick Actions can reuse it directly — see Dashboard above) creates a real note.
- `NoteDetailModal` (`src/components/note-detail-modal.tsx`) opened by clicking a note card:
  - **View mode**: full title, author, updated timestamp, tag badge, full body text
  - **Edit mode**: editable title, tag picker, body textarea; entered via a per-note "⋯" menu (Edit / Duplicate / Delete — **all three are now real**, previously Duplicate and Delete were visual-only stubs)
  - Save persists via `updateNote` and only returns to view mode on real success
  - Shared primitives (`TAG_OPTIONS`, `TagBadge`, `INPUT`, `FIELD_LABEL`) extracted into `notes-shared.tsx` so the modal and the notes list use identical tag styling
  - Modal animation: fade + scale-in backdrop, ESC-to-close, `overflow: hidden` on `document.body` while open
- **Tag stays local-only, deliberately unwired** — same "still mock" precedent as New Ticket's "More Options" fields: fully interactive in the UI, but no `project_notes` column exists for it and it's never sent to or read from Supabase.

---

### Member Profile Modal — Standardized Everywhere

Completed.

The existing Member Profile Modal (previously wired independently into three screens) is now the single, standard way to inspect any user across the entire application. Every avatar or member name — Dashboard widgets, Project Overview, ticket cards (Kanban/List/Calendar/Insights), Ticket Detail (assignee, comments, related tickets, PR/commit authors, file uploaders), Reports tables, and Time Tracking tables — is clickable and opens the same modal.

- `src/components/member-profile.tsx` — `MemberProfileProvider` (mounted once in `layout.tsx`), `useMemberProfile()`, and `MemberTrigger` (the shared clickable wrapper; supports a `nested` mode for avatars sitting inside another clickable element, e.g. a ticket row or card `<Link>`, so the two actions don't both fire)
- `src/components/member-profile-modal.tsx` — the modal itself, extracted from the old `team-screen.tsx`
- `resolveTeamMember()` in `src/lib/mock-team.ts` — resolves any `{name, avatar, projectSlug?}` identity to a full `TeamMember`, falling back to a synthesized minimal record for names that only exist as free text (e.g. mock PR authors), so the modal always has something to render
- Standard UX rule going forward: clicking a ticket (card, title, or ID) opens Ticket Detail; clicking a member (avatar or name) opens the Member Profile Modal
- Form controls that list member names (assignee filter dropdown, New Ticket/Ticket Detail assignee picker) are intentionally left as plain selects — those are data-entry controls, not member-viewing surfaces
- **Real metrics, per project**: Active Tickets, Assigned Hours, Utilization, and Current Workload on the card are now computed from real tickets in that project (`loadProjectTickets`) instead of the old `mock-team.ts` roster, which showed 0 for any real user not in that mock array. Weekly Capacity is intentionally left as-is (no real per-member capacity source exists yet).
- **Unassigned no longer opens a fake profile**: clicking the "Unassigned" avatar/name anywhere (Board, List, Preview, Ticket Detail) is now a plain, non-interactive label — no click, no hover state, no pointer cursor — instead of opening a Member Profile Modal for a "team member" named Unassigned. Fixed once in `MemberTrigger` itself, so it applies everywhere consistently.
- **New — real bug fixed**: the assignee avatar in `TicketListRow` (`tickets/ticket-card.tsx` — the row Member Dashboard's own "My Active Work" section, `my-work-screen.tsx`, and `project-overview.tsx` all render) opened the modal with only `name`/`avatar`, never a real `profileId`. For a member's own active-work list (assignee = the signed-in member), this fell through to `resolveTeamMember`'s name-matching against the mock roster, found no match, and synthesized an `unknown-*` profile showing 0 Active Tickets/Assigned Hours/Utilization even though the real ticket was right there. Now passes `profileId={ticket.assigneeProfileId ?? undefined}` (already real, already on every `Ticket`) — same real `profileId`-keyed fetch path every other confirmed-real trigger already uses, no new query.
- **New — real bug fixed**: opening a ticket from *inside* the Member Profile Modal (its own local ticket preview, `selectedTicket` state) and clicking "Expand" navigated to the real Ticket Detail page underneath, but left both the inner ticket preview and the Member Profile Modal itself open on top of it — `MemberProfileProvider` is mounted above the router's own `children` (root `layout.tsx`), so it survives client-side navigation unless explicitly closed. Its inner `TicketPreviewPanel` now passes `onBeforeNavigate={() => { setSelectedTicket(null); handleClose(); }}` — both already-existing local close mechanisms, no new state, no change to any other `TicketPreviewPanel` render site (Tickets board, Ticket Detail's own related-ticket preview, etc.).

---

### Authentication & Profile

Completed, and backed by real Supabase Auth end-to-end (confirmed working against a live project — not just implemented). Routes: `/login`, `/forgot-password`, `/reset-password`, `/change-password`, `/profile`.

Gated by `AuthGuard` (`src/components/auth-guard.tsx`), which redirects every `AppShell`-wrapped route to `/login` when no real Supabase session exists, and shows a dedicated `MembershipErrorScreen` (not the app shell) if a signed-in user has no organization membership in production.

- **Login** (`login-screen.tsx`): email/password form with inline validation and "Remember me", authenticating via `src/lib/auth.ts`'s `login()` (`supabase.auth.signInWithPassword`). The old "Use demo account" shortcut/mock credentials box is gone — there's no seeded demo account against the real backend.
- **Logout**: `src/lib/auth.ts`'s `logout()` (`supabase.auth.signOut`), wired from the account menu.
- **Forgot Password** (`forgot-password-screen.tsx`) → **Reset Password** (`reset-password-screen.tsx`): real `supabase.auth.resetPasswordForEmail()` / `updateUser()`, still always resolves successfully on the request step (mirrors a real backend never revealing whether an email has an account); the reset screen includes a live password-strength meter.
- **Change Password** (`change-password-screen.tsx`): real current-password verification via `src/lib/auth.ts`'s `changePassword()` — re-authenticates with `signInWithPassword` against the real signed-in user's email (never a manual string comparison), then calls `supabase.auth.updateUser()`. Reachable from the Profile page's Security section.
- **Profile** (`profile-screen.tsx`): Profile Information (name, email — read-only, role — read-only, weekly capacity) all load from and save to the real `profiles` + `organization_memberships` rows (`src/lib/membership.ts`); Preferences (Theme, Default Ticket View) unchanged/local; Account (Member Since, Last Login) now reflects real Supabase data; Security (Change Password link).
- **Avatar**: click-to-upload or drag & drop on the Profile avatar (`AvatarPicker` in `profile-screen.tsx`) — validates type/size, center-crops and resizes to a square JPEG via Canvas, uploads to the `avatars` Supabase Storage bucket (`src/lib/avatar-upload.ts`), and saves the storage *path* (never a URL) to `profiles.avatar_url`. Sidebar and Header pick up the new photo automatically via the shared `CurrentUserProvider` context — no per-component wiring needed.
- **Dev-only fallback**: if no real profile/membership exists (or the lookup errors), and only outside a production build, the app falls back to the old mock identity so local dev isn't blocked — visibly flagged with a "Dev fallback" badge in the header. Never engages in production.
- Shared building blocks in `src/components/auth/` (`AuthCard`, `AuthTextField`, `AuthPasswordField`, `AuthSubmitButton`, `PasswordStrengthMeter`) so all auth screens share identical field/button styling.

See Architecture Status for the full list of applied migrations.

---

# In Progress

Nothing currently in progress. Auth/profile/avatar, Projects (Sidebar, `/projects`, per-project Settings — now without a "Project Lead" field, see Current Sprint → Completed → Projects → Project Settings), Tickets (five list views with real filtering, New Ticket, full Ticket Detail, Related Tickets, the editable Quick Ticket Preview, real write-path error handling, a real URL-persisted status/alert filter, the Backlog creation default, and inline Description editing), Team (roster, project-scoped Lead/Member role, Make Project Lead, Add/Remove Member, Work History), Project Notes (list, search, create, edit, Duplicate, delete), the Admin + Project Lead + Member Dashboards, and company-wide Reports (Admin role, Delivery and Finance tabs) backend integration are all done and confirmed working against a live Supabase project — see Current Sprint → Completed → Authentication & Profile / Projects / Project Settings / Tickets / Team / Project Notes / Dashboard / Reports. The **Admin** Project Overview (including its new Project Activity history page), per-project Reports (see Current Sprint → Completed → Project Overview / Project Reports), Time Tracking for the Admin/Member roles (real KPIs/filters/Timesheets/Billing by Client, plus the "Members Missing Hours" rename — see Current Sprint → Completed → Hours & Time Tracking), and the Dashboard's new "View all activity →" action and org-wide Activity History page (see Current Sprint → Completed → Dashboard) are also now implemented and build/type-checked, along with Users backend integration (see Current Sprint → Completed → Users) — all of these still need to be exercised against a live Supabase project and clicked through in a browser before they can be called confirmed; that verification pass is the immediate next step, ahead of any new feature. After that, the next candidate is one of the remaining mock-to-real seams — see Next Recommended Feature. The Unfuddle → Jirita import is specified (`docs/UNFUDDLE_IMPORT_SPECIFICATION.md`) but no importer code exists yet.

---

# Not Implemented

The following features are documented as planned but do not exist in the codebase yet.

### Authentication

- Register / Sign Up screen (no self-service account creation — accounts are provisioned directly in Supabase; see `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` for the eventual bulk-provisioning path)

Login, Logout, Forgot Password, Reset Password, Change Password, and real server-verified session persistence (a real Supabase session, not a mock `localStorage` flag) are implemented — see Current Sprint → Completed → Authentication & Profile. Invitations (inviting a new user to an organization, by email or by generated link) are also implemented, from `/users` — see Current Sprint → Completed → Users — though like the rest of that module, not yet confirmed against a live project.

### Sidebar Navigation

No known dead links remain. Milestones was removed from the UI entirely for MVP. Per-project Notes, Team, and Reports are real, functional routes (`/projects/[slug]/notes`, `/team`, `/reports`), gated per role via `nav-config.ts` rather than hardcoded. Team and Project Notes are now both backed by real Supabase data — see Current Sprint → Completed → Team / Project Notes.

All top-level navigation items (Dashboard, My Work, Projects, Reports, Settings) are functional, and each renders a role-specific screen where applicable (Dashboard, Projects, Reports).

---

# Next Recommended Feature

First priority: confirm Users, the **Admin** Project Overview (including its new Project Activity history page), per-project Reports, Time Tracking for the Admin/Member roles, and the Dashboard's new org-wide Activity History page against a real, live Supabase project (click through each in a browser) — all of these are implemented and type-checked but unverified, see Current Sprint → Completed → Users / Project Overview / Project Reports / Hours & Time Tracking / Dashboard and Architecture Status. (Team carried the same caveat as of an earlier update; it has since been confirmed live, along with Project Notes, all three Dashboards, and company-wide Reports.)

After that, continue the Supabase backend work already underway, following the same pattern established for profiles/organization_memberships, Projects, Tickets, Team, Project Notes, the Dashboards, Reports, the Admin Project Overview, per-project Reports, and Time Tracking (real query + minimum-privilege grants/Server Actions + RLS, with a dev-only mock fallback until fully connected). (Authentication, Ticket editing, Tickets' filters/Related Tickets/editable Preview, real write-path error handling, Team, Project Notes, all three Dashboards, company-wide Reports, the Admin Project Overview, per-project Reports, and Time Tracking (Admin/Member), previously recommended here, are now all complete — only their live-verification passes remain.)

The natural next mock-to-real seams:

- **Resolved**: the Project Lead's and Member's own Project Overview (`project-lead-project-overview.tsx`/`project-overview.tsx`) are now real too, reusing the **Admin** variant's own data loading/building blocks (see Architecture Status → Project Overview)
- The Project Lead's own scoped Reports view (`project-lead-reports-screen.tsx`) — a separate component from the now-real company-wide Reports and per-project Reports, still fully mock
- **Resolved**: the Project Lead's own scoped Time Tracking view (`project-lead-time-tracking-screen.tsx`) is now real too, scoped to exactly this profile's led projects and reusing the Admin/Member `time-tracking-screen.tsx`'s own real calculations/loaders rather than a second implementation (see Hours & Time Tracking → Project Lead)
- **Resolved**: `member-projects-screen.tsx` ("My Projects") is now real — no longer reads `MEMBER_WORK`, and now surfaces a project's lead via Team's real `project_memberships.project_role` (via `loadProjectTeam`), not `ProjectSummary.owner`/`owner_profile_id` (see Architecture Status → Projects)
- The rest of Settings (`/settings/*`) — still visual-only, no state persists

See Architecture Status.

---

# Planned Features

## Project Management

- Backlog
- Sprint Planning
- Releases

Milestones, Versions, and Components were evaluated and explicitly decided against as first-class Jirita entities — see `docs/SUPABASE_MVP_SCHEMA.md` and `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` for the reasoning. Milestone-equivalent grouping stays a free-text field on tickets, not a table.

## Collaboration

- Comments (editable)
- Mentions
- Real-time Activity Timeline
- Notifications

## Reporting

- Velocity
- Burndown
- Cycle Time

## Administration

- Teams
- Roles
- Permissions

---

# Architecture Status

Current architecture follows a frontend-first approach. Nearly every screen is now real — Auth/Profile, Projects (Sidebar/`/projects`/Settings/Member's "My Projects"), Tickets, Team, Project Notes, the Admin/Project Lead/Member Dashboards (including their project scope selectors), company-wide Reports (Admin role), Project Overview (all three roles), per-project Reports, Time Tracking (Admin/Member/Project Lead), My Work (Member), ticket-assignment restriction, Users, and global Search. Only the Project Lead's own scoped Reports view and the rest of Settings (`/settings/*`) remain mock. Auth/Profile through company-wide Reports (Admin) are confirmed live; everything from the Admin Project Overview onward in the list above is implemented and type/build-clean but not yet clicked through in a live browser — see the detailed breakdown below.

Current stack:

- Next.js 16.2.9
- React 19
- TypeScript
- TailwindCSS v4
- `@supabase/supabase-js` — used by `src/lib/auth.ts`, `src/lib/membership.ts`, `src/lib/avatar-upload.ts`, `src/lib/projects.ts`, `src/lib/tickets.ts`, `src/lib/notes.ts`, `src/lib/users.ts`, and `src/lib/search.ts`, plus the service-role admin client each file under `src/lib/server/*.ts` builds for its own Server Action

Not installed:

- shadcn/ui (referenced in earlier documentation but not present in `package.json`)

Current data source:

- **Real Supabase, confirmed live**: authentication/session, `profiles`, `organization_memberships`, `organizations`, the `avatars` Storage bucket, `projects`, `clients`, `tickets`, `ticket_comments`, `ticket_activity`, `labels`, `ticket_attachments` (+ Storage bucket), `ticket_time_entries`, `ticket_relations`, `project_memberships` (roster, `project_role`, Add/Remove Member, auto-membership trigger, history guard, Work History RPCs), `project_notes`, `project_note_activity` (written by triggers, not yet read by any UI). Covers the Sidebar, `/projects` (all roles), `/projects/[slug]/settings`, `/projects/[slug]/team` + Work History, `/projects/[slug]/notes`, all five Ticket list views + New Ticket + Ticket Detail + Related Tickets + editable Quick Ticket Preview, all three Dashboards, and company-wide Reports (Admin role).
- **Real Supabase, implemented but not yet confirmed live** (should work, not yet clicked through in a browser): Users (the write side of `organization_memberships` via Server Actions), the **Admin** Project Overview and its paginated Activity history page, per-project Reports (all roles), Time Tracking (Admin/Member/Project Lead), the Dashboard's org-wide Activity History page, the Project Lead's and Member's own Project Overview, all three Dashboards' `?project=` scope selectors, the Project Lead Dashboard's Current Delivery/Attention Required KPI click-throughs and its Target Date fix, Project Settings' new Target Date field, My Work (Member), ticket-assignment restriction to a project's own active members, Member's own `/projects` ("My Projects"), and global Search.
- **Mock data** (everything else): `project-lead-reports-screen.tsx`'s own mock arrays (Project Lead's own Reports view only), the rest of `/settings/*`, and a handful of module-level constants kept alive solely for that one screen (`MY_ACTIVE`/`RECENT_ACTIVITY`, `LEAD_PROJECT_SLUGS`/`PROJECT_TICKETS`/`aggregateTeam`, `MEMBER_WORK`). `src/lib/mock-time-tracking.ts` is now a type-only module (`TimePeriod`/`CustomRange`/`TimesheetStatus`, `periodDisplayLabel`) — no screen reads its data arrays anymore. `mock-tickets.ts`/`mock-team.ts`/`mock-notes.ts`/`mock-projects.ts` are kept only as type-only modules or a dev-only fallback (no real organization/membership), never a data source in production.

The detailed, per-feature breakdown of what's connected and how — every Server Action, migration, and real bug fixed along the way — lives below, organized the same way this section's summary is: confirmed-live features first, then implemented-but-unverified ones, then what's still mock.

Backend integration, connected and confirmed working:

- `src/lib/supabase-client.ts` — the lazy Supabase browser client, now imported by `auth.ts`/`membership.ts`/`avatar-upload.ts`/`projects.ts`/`tickets.ts`/`notes.ts`
- `src/lib/auth.ts` — login, logout, session (`onAuthStateChange`), forgot/reset password, and change password (verified via re-authentication, never a manual password comparison)
- `src/lib/membership.ts` — loads a signed-in user's `profiles` + active `organization_memberships` + `organizations` row, and writes real updates (name, weekly capacity via a security-definer RPC, avatar path)
- `src/lib/avatar-upload.ts` — client-side validate/resize (Canvas, no new dependency)/upload to Supabase Storage
- `src/components/current-user-provider.tsx` / `src/components/auth-guard.tsx` — real membership drives `CurrentUser` and route gating, with a dev-only mock fallback (never in production) so local dev isn't blocked on seeded data
- `src/lib/projects.ts` — all real Projects reads/writes: `loadOrganizationProjects` (org-scoped list, RLS decides who sees what — no client-side role filtering), `createProject`/`updateProject` (Projects list Create/Edit modal: name + description), `archiveProject`/`restoreProject` (status only), `loadProjectDetail`/`updateProjectSettings` (Project Settings' General/Billing fields — status writes here structurally exclude `"archived"`; its optional `ownerProfileId` field still exists but nothing calls it with that key anymore, see Project Settings above), `loadOrganizationClients`/`createOrganizationClient` (Billing → Client roster)
- `src/components/organization-projects-provider.tsx` — `OrganizationProjectsProvider`, mounted in `layout.tsx` next to `CurrentUserProvider`; Sidebar, `/projects`, and the Project Settings breadcrumb all read the same fetched list, so any write anywhere refetches once and every surface updates together. Dev-only mock fallback, same convention as `CurrentUserProvider`.
- `src/components/create-project-modal.tsx` / `archive-project-modal.tsx` / `add-client-modal.tsx` — Create/Edit Project, Archive confirmation (reused unchanged by Project Settings' Danger Zone), and the minimal "+ Add new client" flow, respectively
- `src/lib/tickets.ts` — all real Tickets reads/writes: `loadProjectTickets` (all five list views, scoped by `project_id`, RLS decides visibility same as Projects), `loadTicketByCode` (Ticket Detail's data source, resolved by the visible ticket code — never the internal uuid, which stays database-only), `createTicket` (New Ticket modal: title/description/acceptance criteria/estimated hours/assignee persist; "More Options" fields still write fixed defaults), `updateTicket` (every Ticket Detail *and* Quick Ticket Preview inline edit), `loadTicketComments`/`createTicketComment`, `loadTicketActivity` (turns trigger-logged rows into the existing Activity UI shape), `loadOrganizationLabels`/`createOrganizationLabel`, `loadTicketAttachments`/`uploadTicketAttachment`/`downloadTicketAttachment`/`getTicketAttachmentPreviewUrl`/`renameTicketAttachment`/`deleteTicketAttachment` (all real — Storage + metadata row), `loadTicketTimeEntries`/`logTicketTime` (minutes as the canonical unit), `loadTicketRelations`/`createTicketRelation`/`deleteTicketRelation` (Related Tickets)
- `src/components/tickets-screen.tsx` — real, combined filtering: free-text search, Assigned/Priority/Status dropdowns, the 5 quick-filter chips, and the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date) all AND together into one `filteredTickets` shared by every view and the header counters — no per-view duplication. "Mine"/Reporter match the real `profiles.id` exposed as `userId` on `useCurrentUser()`, never the display name.
- `src/components/tickets/ticket-preview-panel.tsx` — editable (Title/Status/Priority/Assignee/Estimated/Due Date/Labels) when opened with an `editable` prop; only `tickets-screen.tsx` passes it today, every other call site stays read-only unchanged. Uses the same `updateTicket()` Ticket Detail itself uses.
- `src/components/member-profile-modal.tsx` — the per-project Member card's Active Tickets/Assigned Hours/Utilization/Workload are computed from real tickets in that project instead of the old mock team roster.
- Related Tickets is real: a single `ticket_relations` row per relation (3 canonical kinds), with the inverse relation and duplicate-prevention both derived from that one row rather than kept in sync across two.
- Ticket priority is a 4-value scale (`highest`/`high`/`medium`/`low`) — the database enum was migrated in place (existing `normal` rows moved to `medium`) and the old value dropped, not left as a permanent alias.
- A shared `ErrorToast` (`src/components/tickets/ticket-ui.tsx`) now surfaces every Ticket write failure that previously only hit `console.warn`; failed inline edits roll back to their pre-edit value instead of leaving an unpersisted change on screen.
- `src/app/projects/[slug]/tickets/[ticketCode]/page.tsx` (renamed from `[ticketId]`) + `src/components/tickets/ticket-detail-screen.tsx` — the visible ticket code is now the only thing that ever appears in a ticket URL, fixing a real bug where the route navigated on the internal uuid
- Activity Log is real and driven almost entirely by database triggers, so ticket creation, field changes, attachment uploads/renames/deletes, time entries, and related-ticket add/remove are all logged automatically with the real authenticated actor — no existing write path had to change to get this
- Applied migrations, in order: `20260708000000_mvp_schema.sql` (base schema + RLS), `20260708010000_grant_authenticated_membership_read.sql` (SELECT grants — RLS alone doesn't grant table privileges), `20260709000000_profile_self_service_updates.sql` (self-service name/capacity writes), `20260710000000_avatars_storage.sql` + `20260711000000_fix_avatars_storage_policies.sql` (the `avatars` bucket and its RLS policies — first pass had a policy bug blocking uploads, fixed in the second file), `20260712000000_grant_authenticated_projects_read.sql`, `20260713000000_grant_authenticated_projects_insert.sql`, `20260714000000_fix_projects_select_rls_self_reference.sql` (real bug fix — `projects_select`'s helper function re-queried `projects` from within its own policy, which broke `INSERT`/`UPDATE ... RETURNING` specifically because Postgres evaluates the RETURNING-time SELECT check against the row being written in the same command and that self-reference doesn't reliably see it yet; rewritten to check the row's own columns directly), `20260715000000_grant_authenticated_projects_update.sql`, `20260716000000_add_clients_table.sql` (new `clients` table — not a foreign key on `projects`; `client_name` stays free text), `20260717000000_grant_authenticated_tickets_read.sql`, `20260718000000_grant_authenticated_tickets_insert.sql`, `20260719000000_fix_tickets_insert_rls_admin_lead.sql` (real bug fix — the base schema's ticket-related insert policies only allowed a real `project_memberships` row, but that table is still empty since no staffing UI exists yet, so every insert was blocked for everyone; fixed by also allowing an org admin/lead), `20260720000000_grant_authenticated_ticket_comments_activity_read.sql`, `20260721000000_grant_authenticated_tickets_update.sql`, `20260722000000_add_labels_table.sql`, `20260723000000_add_tickets_acceptance_criteria_done.sql` (parallel `boolean[]` aligned by index with `acceptance_criteria`), `20260724000000_add_ticket_attachments.sql` (private `ticket-attachments` Storage bucket), `20260725000000_fix_ticket_attachments_storage_insert_policy.sql` (real bug fix — an unqualified `storage.foldername(name)` reference silently resolved to the *project's* `name` column instead of the uploaded object's own path, blocking every real upload until qualified as `objects.name`), `20260726000000_add_ticket_time_entries.sql`, `20260727000000_enable_real_ticket_comments.sql` (fixes the same `project_memberships`-only gap for comments, adds the first Activity-logging trigger), `20260728000000_real_ticket_activity_log.sql` (`tickets.created_by`, and the creation/field-change/attachment/time-entry Activity triggers), `20260729000000_add_ticket_attachments_rename.sql` (RLS UPDATE policy, column-scoped to `filename` only), `20260730000000_add_ticket_attachments_delete.sql` (RLS DELETE policy on the metadata table and the Storage bucket — no delete permission existed anywhere before this), `20260731000000_log_attachment_rename_delete_activity.sql` (the matching Activity triggers), `20260801000000_unify_ticket_priority_scale.sql` (swaps the `ticket_priority` enum from `high`/`normal`/`low` to `highest`/`high`/`medium`/`low`, migrating existing `normal` rows to `medium` in the same step and dropping the old enum type), `20260802000000_add_ticket_relations.sql` (the `ticket_relations` table, its RLS policies, and the relation-added/removed Activity triggers). See `docs/SUPABASE_SETUP.md` for how to apply migrations to a new project.
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` — how the Techtivo Unfuddle backup will map onto the schema; no importer code exists yet
- `src/lib/projects.ts` — `loadProjectTeam` (real roster: name/email/avatar/real-org-role-title/weekly capacity, falling back to the member's real org-level weekly capacity when the project-level value is unset, never overriding an explicit 0), `addProjectMember`/`removeProjectMember`/`hasProjectMemberHistory` (the real Team roster-write functions), `setProjectLead` (Make Project Lead — clears any existing lead first, since only one is allowed per project), `loadLeadProjects` (the Project Lead Dashboard's real Current Project list, by `project_role = 'lead'`), `loadOrganizationWorkloadMembers` (Admin Dashboard Team Workload)
- `src/components/team-screen.tsx`, `add-team-member-modal.tsx`, `work-history-screen.tsx`, `member-profile-modal.tsx` (project-mode `MemberMenu`) — the real Team screen, its Add Member picker, the dedicated server-side-paginated Work History page, Remove from Project (DB-enforced history guard), and Make Project Lead
- `src/lib/tickets.ts` — `loadUserActivity` (the Users Activity tab's grouped feed), `loadProjectMemberWorkHistorySummary`/`loadProjectMemberWorkHistoryPage` (the two Work History RPC wrappers), `loadOrganizationTickets`/`loadOrganizationLoggedMinutes`/`loadOrganizationActivity` (the org-wide loaders the Admin Dashboard uses, and — scoped to one project — the Project Lead Dashboard reuses for the same widgets)
- A database trigger (`ensure_project_membership`) auto-creates `project_memberships` rows on real contribution (create/edit/comment/log time/upload/link a ticket); a separate `BEFORE DELETE` trigger blocks removing a member with real history at the database level, independent of the UI
- `src/lib/notes.ts` — the real Project Notes module: `loadProjectNotes`/`createNote`/`updateNote`/`duplicateNote`/`deleteNote`, all against `project_notes`; activity (create/update/delete) is logged entirely by database triggers into `project_note_activity`, not yet read by any UI
- `src/components/notes-screen.tsx`/`note-detail-modal.tsx` — real list/search/create/edit/Duplicate/Delete; the Tag field stays local-only, no column exists for it
- `src/components/dashboard-screen.tsx`'s `AdminDashboard()`, `src/components/project-lead-dashboard.tsx`'s `ProjectLeadDashboard()`, and `src/components/member-dashboard.tsx`'s `MemberDashboard()` — every KPI/list/quick-action on all three is now real (see Current Sprint → Completed → Dashboard for the full per-widget breakdown); no new tables were needed, just the loaders above reused/extended
- Migrations, in order (all confirmed against the live project): `20260803000000_add_project_creator_membership.sql`, `20260804000000_grant_authenticated_project_memberships_read.sql`, `20260807000000_grant_authenticated_project_memberships_write.sql`, `20260808000000_auto_project_membership_on_contribution.sql` (`ensure_project_membership` + backfill), `20260809000000_project_membership_history_guard.sql` (the delete guard above), `20260810000000_project_member_work_history_pagination.sql` (the three Work History RPCs), `20260811000000_add_project_notes.sql` (`project_notes` + `project_note_activity`, RLS, and the three logging triggers), `20260812000000_add_project_membership_project_role.sql` (the `project_role` column/constraint/unique-index described above), `20260813000000_restore_project_memberships_after_project_role.sql` + `20260814000000_restore_manually_added_project_membership.sql` (corrective — see Current Sprint → Completed → Team for what happened and how it was repaired)
- `src/lib/tickets.ts` — the Member Dashboard's own reads: `loadProfileLoggedTimeForDate`/`loadProfileLoggedMinutesForRange` (real logged time for one profile, today and over a date range, across every ticket they have access to — not just their own assignments), `loadMemberAttentionEvents` (the real "Needs Your Attention" feed, derived from `ticket_activity`); plus Reports' own reads: `loadOrganizationLoggedTimeForRange`/`loadHoursAndAssigneeActivityForRange`/`loadDeliveryActivityForTickets` (real per-person logged time, weekly hours/assignee-change deltas, and delivery-relevant activity for Hours by Person/Workload/Recent Changes), and `STATUS_FROM_DB`/`formatRelativeTime` (exported for reuse by Reports' Recent Changes)
- `src/lib/projects.ts` — `loadMemberWeeklyCapacity` (a member's real weekly capacity, same org-then-project fallback as `loadProjectTeam`, used by the Member Dashboard) and `loadOrganizationMemberWeeklyCapacities` (the same fallback batched for every org member — Reports' Hours by Person Capacity column)
- `src/components/reports-screen.tsx`'s `AdminReportsScreen()` — every KPI/table/filter/alert/export on both the Delivery and Finance tabs is now real (see Current Sprint → Completed → Reports for the full per-widget breakdown); no new tables were needed
- No new migrations for either the Member Dashboard or company-wide Reports — both are pure application-layer query/rendering work on top of already-real tables

Backend integration, implemented and type-checked, **not yet confirmed against a live Supabase project or in a browser** (Users, the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new Activity History page):

- `src/lib/users.ts` — `loadOrganizationUsers` (real roster + a real `lastLogin` via the Auth Admin API), `disableOrganizationMember`/`enableOrganizationMember`/`editOrganizationMember`/`inviteOrganizationUser`/`generateOrganizationInviteLink`/`generatePasswordResetLink` — every one of these delegates to its own Server Action rather than writing directly, since `organization_memberships` has no `UPDATE`/`INSERT` grant for `authenticated` at all
- `src/lib/server/invite-user-action.ts`, `disable-user-action.ts`, `edit-user-action.ts`, `last-sign-in-action.ts` — the Server Actions themselves: each builds a caller-authenticated client (identity/authorization check under real RLS) and a service-role client (the actual privileged write, only reached after authorization passes)
- `src/components/invite-user-modal.tsx`, `reset-password-link-modal.tsx`, `accept-invite-screen.tsx` — the email-vs-link invite choice, the shared "link generated" success modal, and the "set your password" landing page both invite methods resolve to
- No migrations pending for the Users list above — `20260805000000_accept_own_invitation_rpc.sql` and `20260806000000_grant_service_role_public_schema.sql` (both back the flows above) are pre-existing and already confirmed applied via the login/logout work.
- `src/components/admin-project-overview.tsx` — the real **Admin** Project Overview: reuses `loadProjectDetail`/`loadProjectTickets`/`loadProjectTeam`/`loadOrganizationLoggedTimeForRange`/`loadOrganizationActivity` (all already-confirmed-live functions) plus company-wide Reports' own exported real health/KPI-alert functions (`buildDeliveryStatusItems`/`buildDeliveryKpiSummary`/`buildHoursByPersonRows`/`buildProjectHealthRows`, no second calculation), scoped to one project. Added `ProjectDetail.createdAt`/`createdAtISO` (an existing `projects.created_at` column, no schema change) and a real project-name breadcrumb.
- `src/components/project-activity-history-screen.tsx` + `src/app/projects/[slug]/activity/page.tsx` — the new dedicated, real, server-side-paginated (`?page=`, 20/page) Project Activity history page, reusing the same activity-label-building function Ticket Detail's own Activity Log already uses, resolved across every ticket in the project via a new `loadProjectActivityPage` (`.range()` + `{count:"exact"}`, no new migration)
- `src/components/project-reports-screen.tsx` — the real per-project Reports screen: reuses `loadProjectDetail`/`loadProjectTickets`/`loadProjectTeam`/`loadOrganizationLoggedTimeForRange` and company-wide Reports' own `buildProjectHealthRows`, plus a new `loadTicketsCompletedInRange` (mirroring the shape of the already-real `loadHoursAndAssigneeActivityForRange`) for the Delivery Snapshot's real current-month, status-activity-based "completed this period" signal
- `src/components/tickets-screen.tsx` + `src/components/tickets/filter-bar.tsx` — the real, URL-persisted status/alert filter (`?alerts=...`) shared by the Admin Project Overview's Health Alert banner and per-project Reports' Delivery Progress cards; rendered as real, removable filter chips reusing the app's own existing `STATUS_LABEL` map for the label
- `src/components/time-tracking-screen.tsx` — the real Admin/Member Time Tracking screen: reuses `loadOrganizationUsers` (active members), `loadOrganizationTickets`/`loadOrganizationProjects`, `loadOrganizationMemberWeeklyCapacities` (the same Team/Reports capacity fallback), and `loadOrganizationLoggedTimeForRange` (fetched for four fixed ranges up front, plus Custom Range on demand) for its data; `buildFinanceKpiSummary`/`buildBillingOverviewRows`/`buildBillableHoursByMemberRows` were exported from `reports-screen.tsx` (previously module-local) so Billable/Non-Billable Hours, Projected Billing, Billing by Client, and the Timesheets table's own Billable/Non-Billable columns reuse Finance's billing calculation exactly, never a second one. Capacity-based figures (Members Missing Hours — renamed from "Hours Missing," Weekly Utilization, Capacity %, Status) are computed from a separate, Billing-filter-independent ticket scope (`capacityTicketIds`) than the Finance-reused figures (`billingTicketIds`), so the Billing filter structurally cannot affect them. Filters (Member/Project/Client/Billing/Date Range) are real and round-tripped through the URL, same `?alerts=`-style precedent as Tickets — `app/time-tracking/page.tsx` gained the same `<Suspense>` wrapper that requires.
- `src/components/organization-activity-history-screen.tsx` + `src/app/activity/page.tsx` — the new, org-wide sibling of `project-activity-history-screen.tsx`, backed by a new `loadOrganizationActivityPage` in `lib/tickets.ts` that mirrors `loadProjectActivityPage`'s query/pagination shape verbatim (same `buildActivityLabel`, same real `?page=`/20-per-page pagination), resolved across every project in the organization instead of one, with each entry additionally carrying its own project name/slug. Backs the Admin Dashboard's new "View all activity →" action (shown only when `loadOrganizationActivity`'s own 11-event probe detects a real 11th event past the 10 displayed). Not added to the Sidebar's main nav — reached only via that Dashboard link, same "link-only" precedent as Work History.
- No new migrations for any of this — pure application-layer query/rendering work on top of already-real tables

## Confirmed working (login/logout, profile, avatar, change password)

- `src/lib/auth.ts` — real login/logout/session (`login`, `logout`,
  `onAuthStateChange`, `requestPasswordReset`, `confirmPasswordReset`) and
  real Change Password (`changePassword`): verifies the current password by
  re-authenticating with `signInWithPassword` (never a manual string
  comparison), then calls `supabase.auth.updateUser()`. `mock-auth.ts` no
  longer has any login/session/change-password logic — it only holds
  `AuthError` and the shared password-strength helpers.
- `src/lib/membership.ts` — loads the signed-in user's `profiles` row +
  active `organization_memberships` row + `organizations` row
  (`loadMembership`), and writes real updates: `updateProfileNames`
  (first/last name), `updateOwnWeeklyCapacity` (via a security-definer RPC,
  since org role/status stay admin-managed), `updateProfileAvatarPath`
  (stores a Storage *path*, never a URL — `resolveAvatarUrl` turns it back
  into a public URL for display, with `updated_at` as a cache-busting
  query param).
- `src/lib/avatar-upload.ts` — validates (JPG/PNG/WEBP, ≤8MB), center-crops
  and resizes to a 320×320 JPEG via Canvas (no new dependency), uploads to
  the `avatars` Supabase Storage bucket at `<uid>/avatar.jpg` (upsert).
- `src/components/current-user-provider.tsx` — `CurrentUser` (role,
  name, avatar, weekly capacity, etc.) now comes from the real membership
  when one exists, refetched after every save so Sidebar/Header/Profile
  stay in sync. The old dev-only mock fallback is gone entirely — a
  real signed-in session with no active membership (or a lookup error)
  never renders a fake role/name/avatar in any environment, including
  local dev (`isDevFallback` is now hard-coded `false`; the "Dev fallback"
  badge and `RoleSwitcher` in the header are unreachable dead code, kept
  as-is rather than deleted). Two real-time behaviors on top of the
  original load: (1) if the signed-in user's membership ever resolves to
  "no-membership" — most notably an admin disabling this exact user while
  their tab is still open — the provider signs them out immediately
  (`logout()`), which flips `status` to `"unauthenticated"` and lets
  `AuthGuard`'s existing redirect-to-`/login` effect take over; a first-
  ever "no-membership" (never invited) still renders `MembershipErrorScreen`
  the same way, just no longer ever masked by mock data. (2) the still-open
  session's membership is silently revalidated (reusing `runFetch`, no new
  fetching mechanism) on window focus and on every route change, so a
  membership change made from another tab/session is picked up without a
  manual reload — no polling, no timers. `organization-projects-provider.tsx`
  had the equivalent mock-array fallback removed the same way; see its own
  bullet below.
- `src/lib/auth.ts` — `acceptInvitation` (sets the new password, then calls
  the `accept_own_invitation` RPC to flip the invited user's own
  `organization_memberships` row to `active`) backs both invite delivery
  methods below. `src/components/accept-invite-screen.tsx` and
  `src/components/reset-password-screen.tsx` both establish their session
  two ways: the email flow's Supabase-hosted link lands with the session
  already in the URL fragment (`detectSessionInUrl`, unchanged); a link
  generated via `generateLink` (Invite/Reset Password) instead carries
  `?token_hash=...&type=...` in the query string, which these two screens
  now detect and resolve via `supabase.auth.verifyOtp()` before continuing
  through the exact same "set your password" form either way.
- Applied migrations (all confirmed against the live project):
  `20260708000000_mvp_schema.sql` (base schema — organizations, profiles,
  organization_memberships, projects, project_memberships, tickets, ticket
  comments, ticket activity, RLS policies),
  `20260708010000_grant_authenticated_membership_read.sql` (SELECT grants —
  RLS alone isn't enough, Postgres checks table privileges first),
  `20260709000000_profile_self_service_updates.sql` (column-scoped UPDATE
  grant for first/last name + the weekly-capacity RPC),
  `20260710000000_avatars_storage.sql` + `20260711000000_fix_avatars_storage_policies.sql`
  (the `avatars` Storage bucket and its RLS policies — the first pass had a
  bug that blocked uploads, fixed in the second file),
  `20260805000000_accept_own_invitation_rpc.sql` (the security-definer RPC
  `acceptInvitation` calls above — `organization_memberships_update` is
  admin-only by design, so an invited user can't flip their own row any
  other way),
  `20260806000000_grant_service_role_public_schema.sql` (a missing
  service-role grant that broke the Invite User Server Action's own writes;
  see Users below). See `docs/SUPABASE_SETUP.md` for how to apply
  migrations to a new project.

## Confirmed working (Projects — Sidebar, `/projects` list, Project Settings)

Scoped narrowly: only the Sidebar's pinned project list, the `/projects`
page (both the Admin/Project Lead list and, see its own bullet below, the
Member's own "My Projects" view at that same URL), and
`/projects/[slug]/settings` read/write real data. Notes and per-project
Reports are unaffected — see "Still mock" for what's left. (Team is also
real now, but is unrelated to this one.)

- `src/lib/projects.ts` — all real Projects reads/writes:
  `loadOrganizationProjects` (org-scoped list; RLS alone decides who sees
  what — Admin sees every org project, Project Lead/Member only see
  projects they're staffed on via `project_memberships` — so there's no
  client-side role filtering), `createProject` (name + description only;
  slug/project_code auto-derived from the name), `updateProject` (the
  Projects list's Edit modal: name + description only), `archiveProject` /
  `restoreProject` (status only — nothing is ever deleted), plus, for
  Project Settings specifically: `loadProjectDetail` + `updateProjectSettings`
  (name, description, project code, status, category, client, billing
  rate — `updateProjectSettings`'s status field is typed to exclude
  `"archived"`, so that transition is structurally only reachable through
  `archiveProject`/`restoreProject`, never a parallel path) and
  `loadOrganizationClients` / `createOrganizationClient` (Billing → Client,
  backed by the `clients` table below). `updateProjectSettings`'s optional
  `ownerProfileId` field and the `projects.owner_profile_id` column it
  writes both still exist (no schema change), but nothing calls it with
  that key anymore — see the Project Lead removal note below.
- `src/components/organization-projects-provider.tsx` —
  `OrganizationProjectsProvider`, mounted in `layout.tsx` next to
  `CurrentUserProvider`, holds the org's project list once so Sidebar and
  `/projects` always show the exact same data; every write refetches
  through it afterward, which is also how edits made in Project Settings
  propagate to Sidebar, `/projects`, and the settings page's own
  breadcrumb without any extra wiring. The old dev-only mock-array fallback
  (no real organization → the old mock `projects` array) is gone, same as
  `CurrentUserProvider`'s — `isDevFallback` is always `false` now, so this
  provider (and everything gated on it) only ever renders real data or
  nothing.
- `src/components/create-project-modal.tsx` — Create *and* Edit Project (an
  `editingProject` prop switches modes, mirroring `invite-user-modal.tsx`'s
  `editingUser` pattern).
- `src/components/archive-project-modal.tsx` — the Archive confirmation
  modal, reused as-is by both the Projects list row menu and Project
  Settings' Danger Zone (never duplicated). Restore has no confirmation
  step — the menu item / Danger Zone button call `restoreProject` directly.
- `src/components/project-settings-screen.tsx` — real General (Project
  Name, Description, Project Code, Status) and Billing (Project Category,
  Client, Billing Rate) editing, plus a real "Save Changes" button (none
  existed before this). Also exports `ProjectSettingsBreadcrumb`, a client
  component reading from the shared provider so the breadcrumb never shows
  a stale server-rendered name. **The General section's "Project Lead"
  row was removed outright** (not hidden, not disabled) — it was the only
  UI that read/wrote `projects.owner_profile_id`, and the real,
  authoritative "who leads this project" signal is
  `project_memberships.project_role` (see Team below), set exclusively via
  Team's own "Make Project Lead" action. The `loadOrganizationMembers`
  fetch that only existed to populate this picker's roster was removed
  along with it. **Resolved**: the `/projects` list's own Lead column/filter
  has since been reconciled onto `project_role` too — `ProjectSummary.lead`
  is now populated by a new batched `project_memberships` query in
  `loadOrganizationProjects` (`project_role = 'lead'`, resolving to the same
  `{id, name, avatar}` shape the rest of the app already uses for a person),
  and the list's row/filter read that field instead of the older
  `owner_profile_id`-backed `ProjectSummary.owner`. `owner_profile_id`
  itself, and `updateProjectSettings`'s optional `ownerProfileId` param, are
  both left in place (no schema change, no other caller removed) — they
  simply have no remaining Lead-column reader anywhere in the app now.
- `src/components/settings-ui.tsx` — `SelectField`/`TextField`/
  `NumberField` gained an optional `onChange` (`SelectField` also gained
  `options`) to become real controlled inputs; every existing call site
  that doesn't pass them (the org-wide `/settings/*` pages) keeps its
  original display-only rendering, unchanged.
- `src/components/add-client-modal.tsx` — the minimal "+ Add new client"
  flow from Project Settings' Client selector: name only, created
  immediately in Supabase and selected in the form, persisted to the
  project's `client_name` on the next Save like every other field on that
  screen (no separate/hidden write path).
- **`src/components/member-projects-screen.tsx` ("My Projects," Member
  role, real replacement for its entire mock implementation)** — also
  fixes a real bug on the way: the old `<img src={card.leadAvatar}>` could
  render with `src=""` whenever a project had no owner; `leadAvatar` now
  always resolves to a real URL (`FALLBACK_AVATAR` when there's no lead),
  with a defensive `{leadAvatar && <img .../>}` guard on top. The card list
  itself now comes from `useOrganizationProjects()` (already real, already
  RLS-scoped to this Member's own active `project_memberships` — no
  separate membership query needed), one card per project regardless of
  whether the member currently has any tickets there (previously a project
  only appeared if it had at least one mock `WorkItem`). Project Lead comes
  from `loadProjectTeam`'s real `projectRole === "lead"` member (never the
  older `ProjectSummary.owner`), falling back to the existing "Lead:
  Unassigned" text when none exists. Assigned/Due-This-Week ticket counts
  come from `loadProjectTickets`, filtered to `assigneeProfileId === userId`
  per project. No more free-text "Updated Xh ago" recency parsing — cards
  keep `useOrganizationProjects()`'s own real order (already sorted by
  `updated_at` server-side). No longer reads `member-dashboard.tsx`'s
  `MEMBER_WORK` mock array at all.
- **Real, URL-applied `?blocked=<slug,slug,...>` filter on `ManagedProjectsScreen`
  (`/projects`, Admin/Project Lead)** — backs the Admin Dashboard's own
  "projects currently blocked" health-insight click-through (see the
  Dashboard section above): rather than have the Projects list re-derive
  "which projects are blocked" itself, the Dashboard hands off the exact
  real project slugs it already computed from real tickets, same
  query-state-handoff precedent as Tickets' own `?alerts=`. Shown as a real,
  removable `FilterChip` (reusing `tickets/filter-chip.tsx`, never a new
  chip design) when active; combines via AND with every other existing
  filter. `app/projects/page.tsx` is now wrapped in `<Suspense>` for this
  reason. (This remains a precise slug handoff, not a stand-in for a
  missing count — see the Health/Progress/Counters bullet below for the
  list's own now-real per-row blocked count.)
- **Health, Progress, Open/Blocked/Overdue are now real per-row values on
  `ManagedProjectsScreen`, one shared computation** (previously the Health
  badge/filter read the stale, never-updated `projects.health` column, and
  Progress/Open/Blocked/Overdue all read always-`0` `ProjectSummary` fields
  — see Current Sprint → Completed → Projects → "Health, Progress, Ticket
  Counters & Tab-Regain Refresh" above for the full detail):
  - Health badge, the Health filter, and the "At Risk" KPI all read
    `buildProjectHealthRows`'s (`reports-screen.tsx`) real `risk`, computed
    once per fetch over every project's real tickets — never `projects.health`.
  - The Admin Dashboard's own "Projects at Risk"/blocked-projects insight
    (`dashboard-screen.tsx`) now calls this exact same function too, instead
    of a second, locally-duplicated blocked/overdue classification.
  - Each row's Progress reuses a new, exported `computeProjectProgressPct`
    (`reports-screen.tsx`) — the same real done/total ticket-count formula
    Project Overview's own progress bar already used.
  - Each row's Open/Blocked/Overdue counters read straight off that same
    `buildProjectHealthRows` result (extended with two new fields, `open`
    and `overdueOpen`, alongside the pre-existing `blocked`) — no second
    pass over tickets, no more always-`0` `openTickets`/`blockedTickets`/
    `overdueTickets`.
  - The screen now also refreshes all of the above on returning to a
    backgrounded browser tab (reusing the Dashboards' own existing
    focus-regain mechanism — no new listener/polling) and shows a new
    `SkeletonBlock`-built `ProjectsLoadingSkeleton` in place of the old
    plain "Loading projects…" text, both on first load and on every tab
    return.
  - `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` remain
    out of scope — still always `0`/unpopulated for real projects.
- Migrations (in addition to the ones above, all confirmed against the
  live project): `20260712000000_grant_authenticated_projects_read.sql`,
  `20260713000000_grant_authenticated_projects_insert.sql`,
  `20260714000000_fix_projects_select_rls_self_reference.sql` (real bug
  fix: `projects_select`'s helper function re-queried `projects` from
  within its own policy, which silently broke `INSERT`/`UPDATE ...
  RETURNING` — even for a genuine org admin — because Postgres evaluates
  the RETURNING-time SELECT check against the row being written in the
  same command, and that self-reference doesn't reliably see it yet;
  rewritten to check the row's own columns directly instead),
  `20260715000000_grant_authenticated_projects_update.sql`,
  `20260716000000_add_clients_table.sql` (new `clients` table —
  deliberately not a foreign key on `projects`; `client_name` stays free
  text, this table only supplies a real per-org roster and basic
  duplicate-by-name prevention).

## Confirmed working (Tickets — list views, New Ticket, and Ticket Detail)

Scoped narrowly, like Projects above: only the ticket data itself and the
screens listed here are real as of this original pass — Project Overview,
Notes, and per-project Reports were still mock at the time and are now
real too, each covered by its own section above/below.

- `src/lib/tickets.ts` — the single module for every real Tickets read/write:
  `loadProjectTickets` (all five list views — List/Board/Calendar/Timeline/
  Insights — scoped to one project via `project_id`, RLS decides
  visibility same as Projects), `loadTicketByCode` (Ticket Detail's real
  data source, resolved by the visible ticket code — e.g. `JIR-1` — never
  the internal uuid, which stays a database-only identifier and is never
  exposed in a URL), `createTicket` (New Ticket modal: title, description,
  acceptance criteria, estimated hours, and assignee are persisted;
  Type/Status/Priority/Labels/Due Date in "More Options" are still
  unwired and always write fixed defaults — `backlog`/`medium`/`task`/none —
  matching that sprint's explicit scope), `updateTicket` (every Ticket
  Detail *and* Quick Ticket Preview inline edit: Title, Description,
  Status, Type, Priority, Assignee, Estimated Hours, Due Date, Labels, and
  each Acceptance Criterion's checked state), `loadTicketComments` /
  `createTicketComment` (real comment thread, newest first),
  `loadTicketActivity` (see Activity Log below), `loadOrganizationLabels` /
  `createOrganizationLabel` (the Labels selector's real, per-org,
  case-insensitive-deduped catalog, merged with the static seed categories
  already in `ALL_LABELS`), `loadTicketAttachments` / `uploadTicketAttachment`
  / `downloadTicketAttachment` / `getTicketAttachmentPreviewUrl` (image/PDF
  Preview via a short-lived signed URL — the bucket is private) /
  `renameTicketAttachment` / `deleteTicketAttachment` (all real — Storage +
  metadata row; "Replace File" was removed from the UI entirely rather than
  wired up), `loadTicketTimeEntries` / `logTicketTime` (real time entries,
  minutes as the canonical stored unit to avoid float drift, Date defaults
  to the user's real local today), and `loadTicketRelations` /
  `createTicketRelation` / `deleteTicketRelation` (Related Tickets — see its
  own bullet below). Ticket priority is a 4-value scale —
  `highest`/`high`/`medium`/`low` — `normal` was fully migrated to `medium`
  and removed from the database enum, not just phased out client-side.
- `src/components/tickets-screen.tsx` — the five list views' orchestrator;
  loads real tickets for the currently-open project only, and now actually
  filters them: free-text search (title/key), the Assigned/Priority/Status
  dropdowns, the 5 quick-filter chips (Mine/Blocked/High Priority/Due
  Soon/Recently Updated), and the "Add Filter" menu (Labels, Due Date,
  Reporter, Created Date, Updated Date) all combine with AND into one
  `filteredTickets` that every view and the header counters read from — none
  of this filtering is duplicated per view. "Mine"/Reporter match the
  signed-in user's real `profiles.id` (exposed as `userId` on
  `useCurrentUser()`), never the display name.
- `src/components/tickets/ticket-preview-panel.tsx` — the Quick Ticket
  Preview drawer is now editable (Title, Status, Priority, Assignee,
  Estimated, Due Date, Labels) when opened with `editable` — currently only
  `tickets-screen.tsx` (the Tickets board) passes that; the other ~9 call
  sites (Dashboard, Reports, Project Overview, etc.) render it read-only
  exactly as before. Persists through the same `updateTicket()` Ticket
  Detail itself uses, so both stay in sync.
- `src/components/member-profile-modal.tsx` — the per-project Member card's
  Active Tickets, Assigned Hours, Utilization, and Current Workload are now
  computed from real tickets in that project (via `loadProjectTickets`),
  replacing the old `mock-team.ts` roster numbers that showed 0 for any real
  user not in that mock array. Weekly Capacity is intentionally left as-is
  (no real per-member capacity source exists yet).
- `src/components/tickets/new-ticket-modal.tsx` — Possible Duplicates
  checks only the current project's own real tickets (never another
  project's, never the old mock array).
- `src/app/projects/[slug]/tickets/[ticketCode]/page.tsx` (renamed from
  `[ticketId]`) + `src/components/tickets/ticket-detail-screen.tsx` — real
  bug fixed here: the route used to navigate on the internal uuid and 404
  when a stale dev-server route table lagged the rename; now the ticket
  code is the only thing that ever appears in a ticket URL.
  `TicketDetailBreadcrumb` mirrors `ProjectSettingsBreadcrumb`'s pattern
  (client component reading the shared project list + the real ticket).
  Attachments/Time Tracking/Comments keep their existing collapsible-
  section UI untouched — only their data sources changed. Milestone and
  Story Points fields are dead code (defined, never rendered) and were
  left alone.
- **Related Tickets is real** — the "+ Link" control, relation-kind
  selector, and search all work: search is scoped to the current project's
  own real tickets (reuses `loadProjectTickets`, no separate search
  endpoint), excludes the current ticket and anything already linked. Only
  3 canonical kinds are ever stored (`related_to`/`blocks`/`duplicates`) in
  a single `ticket_relations` row per relation; the 5 kinds the UI shows
  (adding "Is blocked by"/"Is duplicated by") are derived per-perspective
  from that one row depending on which ticket is looking at it — this is
  what keeps the inverse relation correct and duplicate-relation prevention
  a plain unique constraint instead of app-level bookkeeping. Opening the
  related ticket, removing a link, and both tickets' Activity Logs all work.
- **Activity Log is real and comprehensive**, built almost entirely with
  database triggers rather than client code, so "only after the real write
  succeeds, with the real authenticated actor" comes for free and no
  existing write path had to change: ticket creation, every field change
  on `tickets` (one row per column that actually changed — labels and
  acceptance-criteria-done are diffed element by element, so each
  added/removed label or each toggled criterion gets its own readable
  entry), attachment uploads/renames/deletes, time entries, and related-
  ticket add/remove (logged on *both* tickets involved, each with the
  correct label for its own side) are all logged by triggers; comment
  creation was already logged by an earlier trigger. `loadTicketActivity`
  turns `event_type`/`field_name`/`old_value`/`new_value` into the existing
  Activity UI's plain `{label, timeAgo}` shape (e.g. "Alex Sosa changed
  Status from To Do to In Progress"), and synthesizes a single "created
  this ticket" entry for tickets that predate this feature.
- **Error handling is real across every Ticket write path** (create/edit/
  move, comments, time entries, attachments, related tickets): a shared
  `ErrorToast` (`ticket-ui.tsx`) surfaces failures that previously only hit
  `console.warn` with nothing shown to the user; inline field edits
  (`persist()` in `ticket-detail-screen.tsx`) roll back to the pre-edit
  value on failure instead of leaving an unpersisted change on screen;
  attachment rename now waits for the real result before closing its input;
  New Ticket/Comment/Log Time all guard against a stuck spinner on a
  rejected request; Ticket Detail's own load failure now has a Retry
  button, matching the ticket list's.
- **Description is now inline-editable on Ticket Detail** — click-to-edit,
  a textarea prefilled with the current value, explicit Save/Cancel
  actions, and a placeholder when empty. Persists through the same
  `updateTicket()` every other inline edit already uses.
- **New tickets default to Backlog, not To Do** — the real `createTicket()`
  insert and the New Ticket modal's own "More Options" Status field both
  changed; the `tickets.status` database column's own default was already
  `'backlog'`, no migration needed.
- **Real URL-applied ticket filters** (`?alerts=<type,type,...>`, e.g.
  `overdue`, `blocked`, or any canonical `TicketStatus`) — the query-state
  handoff Project Overview's Health Alert action and Project Reports'
  Delivery Progress cards both use. `tickets-screen.tsx` reads it via
  `useSearchParams()` and ORs matching tickets into the existing filter
  pipeline; `filter-bar.tsx` renders each active type as a real, removable
  chip. Removing a chip rewrites the URL via `router.push`, so this filter
  is real URL/browser-history state and survives a refresh or back/forward
  navigation. `app/projects/[slug]/tickets/page.tsx` is wrapped in
  `<Suspense>` for this reason. Two more pseudo-types were added on top of
  the original `overdue` (never real ticket statuses, so each keeps its own
  `filter-bar.tsx` label instead of the shared `STATUS_LABEL` map): **
  `due-today`** (a real due date equal to today, no status exclusion — the
  Admin Dashboard's own "Due Today" KPI definition, deliberately different
  from the "Due Soon" quick chip, which excludes done tickets and covers a
  7-day window) and **`completed-this-month`** (status `done` with a real
  `updatedAtISO` in the current calendar month — the same signal the
  Dashboard's "tickets completed this month" health insight and Project
  Reports' Delivery Snapshot already use). Both back the Dashboard's own
  KPI-card/insight-band click-throughs described in the Dashboard section
  above — same mechanism, no second implementation.
- **This same `?alerts=` mechanism, and the whole screen, now also works
  with no `slug` at all** — see "New global, org-wide Tickets view —
  `/tickets`" in the Dashboard section above for the real org-wide mode
  (`loadOrganizationTickets` instead of `loadProjectTickets`, no
  project-scoped actions) this enables, and its own new Project filter.
- Migrations (all confirmed against the live project, in order):
  `20260717000000_grant_authenticated_tickets_read.sql`,
  `20260718000000_grant_authenticated_tickets_insert.sql`,
  `20260719000000_fix_tickets_insert_rls_admin_lead.sql` (real bug: the
  base schema's insert policies only allowed a real `project_memberships`
  row, but that table was still empty — no staffing UI existed yet — so
  every insert was blocked for everyone; fixed by also allowing an org
  admin/lead, the same fix reused by every ticket-related insert policy
  added afterward), `20260720000000_grant_authenticated_ticket_comments_activity_read.sql`,
  `20260721000000_grant_authenticated_tickets_update.sql`,
  `20260722000000_add_labels_table.sql`,
  `20260723000000_add_tickets_acceptance_criteria_done.sql` (parallel
  `boolean[]` aligned by index with `acceptance_criteria`),
  `20260724000000_add_ticket_attachments.sql` (private `ticket-attachments`
  Storage bucket, path `<ticket_id>/<uuid>-<filename>`),
  `20260725000000_fix_ticket_attachments_storage_insert_policy.sql` (real
  bug: the insert policy joined `projects` to check org admin/lead, and
  since `projects` also has a `name` column, the unqualified
  `storage.foldername(name)` reference silently resolved to the *project's*
  name instead of the uploaded object's own path — every real upload
  failed RLS until this was qualified as `objects.name`),
  `20260726000000_add_ticket_time_entries.sql`,
  `20260727000000_enable_real_ticket_comments.sql` (fixes the same
  `is_project_member`-only bug for comments, adds `default auth.uid()` to
  `author_profile_id`, and adds the first Activity-logging trigger),
  `20260728000000_real_ticket_activity_log.sql` (`tickets.created_by`, new
  `field_name`/`old_value`/`new_value` columns on `ticket_activity`, and the
  creation/field-change/attachment/time-entry triggers),
  `20260729000000_add_ticket_attachments_rename.sql` (RLS UPDATE policy +
  column-scoped `grant update (filename)`),
  `20260730000000_add_ticket_attachments_delete.sql` (RLS DELETE policy on
  both the metadata table and the `ticket-attachments` Storage bucket),
  `20260731000000_log_attachment_rename_delete_activity.sql` (the
  `attachment_renamed`/`attachment_deleted` Activity triggers),
  `20260801000000_unify_ticket_priority_scale.sql` (swaps the
  `ticket_priority` enum from `high`/`normal`/`low` to
  `highest`/`high`/`medium`/`low`, migrating existing `normal` rows to
  `medium` in the same step and dropping the old enum type),
  `20260802000000_add_ticket_relations.sql` (the `ticket_relations` table,
  its RLS policies, and the `relation_added`/`relation_removed` Activity
  triggers).

## Confirmed working (Ticket assignment — restricted to active project members)

A ticket's Assignee can now only ever be a real, active member of that
ticket's own project — enforced both in every Assignee-picking UI and,
independently, at the write layer. No schema change; "active project
member" is the same real, pre-existing definition used everywhere else —
a row exists in `project_memberships` for `(project_id, profile_id)`.

- **UI**: the three real Assignee `<select>` implementations — New Ticket,
  Ticket Detail (`EditableSidebarAssignee`), and the Quick Ticket Preview
  panel (`PreviewAssigneeControl`) — now all list `loadProjectTeam`'s real,
  project-scoped roster instead of `loadOrganizationMembers`'s org-wide
  one. `tickets-screen.tsx` keeps a second, still org-wide `members` state
  exclusively for the Assigned *filter* dropdown and a new, separate
  `assignableMembers` state (via `loadProjectTeam`) feeding only the two
  real assignment UIs it renders. `project-lead-dashboard.tsx`'s own New
  Ticket modal now passes its already-loaded project `team` roster instead
  of its org-wide `orgMembers` (which stays, feeding only Add Member's
  candidate list).
- **Write layer** (`lib/tickets.ts`) — `createTicket` and `updateTicket`
  both reject (real error, no ticket write) an incoming
  `assigneeProfileId` that isn't a real member of the ticket's project,
  checked via a direct `project_memberships` existence query. Clearing an
  assignee (`null`) is never blocked — only setting one is validated.
  Neither function ever auto-adds the new assignee to
  `project_memberships` — membership continues to be managed exclusively
  from Team.
- **No DB-level enforcement existed before this** — `tickets.assignee_profile_id`'s
  own FK only ever validated against `profiles`, never against the
  ticket's own project's membership; this was a pure application-layer gap
  until now.
- **Historical data audited, not modified** — a one-time, read-only check
  against the live project found zero existing tickets assigned to a
  non-member; nothing needed correcting.
- No new migrations — pure application-layer query/validation work on top
  of the already-real `tickets`/`project_memberships` tables.

## Confirmed working (Project Notes — list, search, New Note, Edit, Duplicate, Delete)

Real replacement for `src/lib/mock-notes.ts`'s hardcoded array on
`/projects/[slug]/notes`. Only the Tag field stays local-only — see below.

- `src/lib/notes.ts` — the single module for every real Notes read/write:
  `loadProjectNotes` (real list for one project, newest-`updated_at`-first;
  RLS via `can_view_project` scopes visibility), `createNote`, `updateNote`,
  `duplicateNote` (copies title/content into a new row in the same
  project, appending `(Copy)`/`(Copy 2)`/... checked against every title
  that currently exists in the project via a fresh query; `updated_by` is
  set explicitly to the real authenticated user), and `deleteNote`.
  Activity logging (create/update/delete) is handled entirely by database
  triggers into `project_note_activity` — nothing in the UI reads that
  table yet (logged for a future Notes Activity view).
- `src/components/notes-screen.tsx` — real list + search (title/body), "+
  New Note" (`NewNoteModal`, exported so `project-lead-dashboard.tsx`'s
  Quick Actions can reuse it directly), and the card menu's Edit/Duplicate/
  Delete, all real.
- `src/components/note-detail-modal.tsx` — the detail view's Edit (saves
  via `updateNote`, only leaves edit mode on real success), Duplicate, and
  Delete are all wired to the real functions above.
- `src/lib/mock-notes.ts` — kept as a type-only module (`ProjectNote`); the
  mock array and `getNotesByProjectSlug` are gone.
- **Tag stays local-only, deliberately unwired** — the Tag picker keeps
  working as UI state, but no `project_notes` column exists for it and
  it's never sent to or read from Supabase.
- Migration: `20260811000000_add_project_notes.sql` (`project_notes` +
  `project_note_activity` tables, RLS select/insert/update/delete policies
  and grants, and the three logging triggers).

## Confirmed working (Users — list, Invite, Disable/Enable, Edit, Reset Password link, Activity, Security)

**Implemented and build/type-checked, not yet confirmed against a live
Supabase project or in a browser.** Scoped to `/users` (Admin only) and the
shared Member Profile Modal's user-mode tabs it opens into. Every
privileged write below goes through a Server Action using
`SUPABASE_SERVICE_ROLE_KEY` — never a direct client write — because
`organization_memberships` has no `UPDATE`/`INSERT` grant for the
`authenticated` role at all, and because each write needs to independently
re-verify the caller server-side (active org admin, same organization)
rather than trust anything the browser claims.

- `src/lib/users.ts` — the real data source, replacing `mock-users.ts`
  entirely for this screen: `loadOrganizationUsers` (role/status/weekly
  capacity/joined date + a real `lastLogin`), `disableOrganizationMember`
  / `enableOrganizationMember` (one shared Server Action,
  `setMembershipStatusAction`), `editOrganizationMember` (first/last name +
  role + weekly capacity, atomically as much as two separate writes
  without a real DB transaction can be — an honest partial-failure message
  if the second write fails after the first succeeds), `inviteOrganizationUser`
  (email invite) / `generateOrganizationInviteLink` (single-use link
  instead), and `generatePasswordResetLink`. `updateOrganizationMember`
  (direct client write, pre-existing) is now used **only** by the Users
  list's inline Weekly Capacity cell (`CapacityCell`) — intentionally left
  as-is/still broken, it has no Server Action yet.
- `src/lib/server/invite-user-action.ts` — `inviteUserAction` (real email
  via `inviteUserByEmail`) and `generateInviteLinkAction` /
  `generatePasswordResetLinkAction` (both use `generateLink`, which mints a
  single-use token but never sends mail) share one `prepareInvite` +
  `finalizeInviteRecords` pair. The link handed back to the admin is
  always built from `NEXT_PUBLIC_APP_URL` + the token — never
  `GenerateLinkProperties.action_link`, which points at the Supabase
  project's own domain.
- `src/lib/server/disable-user-action.ts` — `disableUserAction` /
  `enableUserAction`; only ever touches `organization_memberships.status`,
  never `profiles` or `auth.users`.
- `src/lib/server/edit-user-action.ts` — `editUserAction`, the
  authorization pattern (caller-authenticated client for identity + admin
  check, service-role client only after that passes) mirrored by every
  other Server Action in this family.
- `src/lib/server/last-sign-in-action.ts` — `loadLastSignInTimesAction`
  resolves real `last_sign_in_at` per org member via the Auth Admin API
  (`listUsers`, paged).
- `src/components/invite-user-modal.tsx` — a pill toggle between "Send by
  email" and "Generate invite link"; the latter replaces the form with a
  success view (read-only link field, Copy Link, Done). Edit mode now
  genuinely awaits `editOrganizationMember` and only closes on real
  success.
- `src/components/reset-password-link-modal.tsx` — the shared "link
  generated" success modal, used both by the Users row menu's "Reset
  Password" and by the Member Profile Modal's Security tab "Generate Reset
  Link".
- `src/components/users-screen.tsx` — Disable/Enable/Edit/Reset Password
  link are all real now. The shared `Toast` gained a real `variant`
  ("success" | "error"). Resend Invitation stays intentionally mock.
- `src/components/member-profile-modal.tsx` (user-mode tabs) — the
  Activity tab is real and **summarized**: reuses `ticket_activity` (via
  `loadUserActivity`), grouping every non-milestone action on the same
  ticket into one "Working on `JIR-x` · N updates" entry while
  `ticket_created` and "Joined the workspace" stay as their own entries;
  capped at the 10 most recent after grouping. The Security tab shows the
  real `lastLogin` and its "Generate Reset Link" button calls
  `generatePasswordResetLink`.
- `src/app/accept-invite/` + `src/components/accept-invite-screen.tsx` —
  the real "set your password" landing page for both invite methods.
- `.env.example` — `NEXT_PUBLIC_APP_URL`, the app's own public base URL
  used to build every generated link above — never a Supabase URL.
- Migrations: `20260805000000_accept_own_invitation_rpc.sql` and
  `20260806000000_grant_service_role_public_schema.sql` (both pre-existing,
  already confirmed live). No new grants/RLS were needed for
  Disable/Enable/Edit/Reset-Password-link themselves — all four go
  through the service-role client, which bypasses grants/RLS by design
  once the Server Action's own authorization check has already passed.

## Confirmed working (Project → Team)

Scoped to `/projects/[slug]/team` and the Work History page it links to,
plus the project-scoped Lead/Member role and Team Capacity data this
section's own `loadProjectTeam` also backs on the Project Lead Dashboard.
Real replacement for `mock-team.ts`'s `getTeamByProjectSlug` on this
screen only — every other `mock-team.ts` consumer is untouched.

- **Team membership is now (mostly) automatic.** A database trigger
  (`ensure_project_membership`, security-definer) creates a
  `project_memberships` row the first time someone creates a ticket, edits
  one, comments, logs time, uploads an attachment, or links a ticket. A
  backfill covers contributions that already existed before this trigger.
- **Project-scoped role (Lead vs. Member) is now a real, explicit column** —
  `project_memberships.project_role` (`'lead'` | `'member'`, default
  `'member'`, a partial unique index enforces at most one lead per project)
  is the authoritative "who leads this project" signal, distinct from
  `projects.owner_profile_id` and from `organization_memberships.role`.
  `loadProjectTeam`'s `title` field was also fixed to show each member's
  real *org* role label rather than `project_memberships.title`.
- **Make Project Lead** — an Admin-only action in `member-profile-modal.tsx`'s
  `MemberMenu`, gated to members whose real org role is itself Admin or
  Project Lead. `setProjectLead` (`lib/projects.ts`) clears any existing
  lead on the project first, then promotes the new one. A `window`
  `CustomEvent` lets `team-screen.tsx` reflect the change immediately
  without a manual reload.
- **`loadProjectTeam`'s Weekly Capacity now falls back to the member's real
  organization-level capacity** when the project-level value is unset —
  a real bug fix. Only a genuinely unset value falls back; an explicit 0
  is never overridden.
- `src/lib/projects.ts` — `loadProjectTeam`, `addProjectMember`,
  `removeProjectMember` (direct client delete; the real guarantee against
  removing a member with history is a database trigger, not this function
  or the UI), and `hasProjectMemberHistory` (an RPC check deciding whether
  "Remove from Project" even appears).
- **"Remove from Project" can never delete a member with real history, at
  the database level.** A `BEFORE DELETE` trigger on `project_memberships`
  calls the same history check and raises an exception if it's true.
- `src/components/team-screen.tsx` — real roster + real KPIs. "+ Add
  Member" opens `add-team-member-modal.tsx`, a picker over real org
  members not already on the team.
- `src/components/member-profile-modal.tsx` (project-mode `MemberMenu`) —
  "Send Message" was removed outright; "View Ticket History" was renamed
  to "View Work History" and now navigates to its own page instead of
  opening a second modal.
- `src/app/projects/[slug]/team/[userId]/work-history/` +
  `src/components/work-history-screen.tsx` — real, **server-side**
  pagination (20/page, `?page=` in the URL) via two RPCs built on one
  shared inner table function, so the participation rule exists in exactly
  one place. Clicking a ticket reuses the real Ticket Detail route
  directly, never `TicketPreviewPanel`.
- Migrations, in order (all confirmed against the live project):
  `20260803000000_add_project_creator_membership.sql`,
  `20260804000000_grant_authenticated_project_memberships_read.sql`,
  `20260807000000_grant_authenticated_project_memberships_write.sql`,
  `20260808000000_auto_project_membership_on_contribution.sql`,
  `20260809000000_project_membership_history_guard.sql`,
  `20260810000000_project_member_work_history_pagination.sql`,
  `20260812000000_add_project_membership_project_role.sql`,
  `20260813000000_restore_project_memberships_after_project_role.sql` and
  `20260814000000_restore_manually_added_project_membership.sql`
  (corrective — during this work, a validation script accidentally deleted
  every real `project_memberships` row in the live database; these two
  migrations re-derive/restore them from still-intact source data, plus a
  hardcoded restore for the one row with no derivable source, approved by
  the user before applying. Fully verified restored afterward. Live-
  validation scripts against this schema must always scope test-data
  creation/cleanup to freshly-generated, uniquely-stamped slugs/emails —
  never broad/unscoped deletes against any real table).

## Confirmed working (Project Overview — Admin, Project Lead, and Member)

Implemented and type/build-clean (`tsc`/`eslint`/`next build` all pass),
**not yet clicked through in a live browser**. Real for all three roles:
`admin-project-overview.tsx`, `project-lead-project-overview.tsx`, and
`project-overview.tsx` (Member). The Project Lead's and Member's own
Project Overview reuse the Admin file's own building blocks directly
(`ExpandableDescription`, `activityEventToEntry`, `TicketGroup`,
`ProjectHealthRow`, `HealthRowContent`, and the `ActivityEntry`/
`TeamMember`/`HealthRow`/`HealthStatus` types) rather than a second
implementation.

- **Header** — real project name, description, status, category, and
  creation date, all from `loadProjectDetail`. Description is
  expandable/collapsible (measured via `scrollHeight`/`clientHeight`, not a
  character count). The "Owned by" field was removed outright.
- **Alert Banner (Health Alerts)** — reuses Delivery Reports' own
  `buildDeliveryStatusItems`/`buildDeliveryKpiSummary`/
  `buildHoursByPersonRows`, scoped to one project. Exactly one alert type
  resolving to exactly one real ticket links straight to it; every other
  actionable combination hands off to the Tickets page via
  `?alerts=<type,type,...>`.
- **KPIs** — Open Tickets, Progress (real done/total percentage), Blocked,
  and Closed This Month, all from real tickets.
- **Active Work** — real Blocked/In Progress/In Review ticket groups.
- **Project Activity (Admin only)** — capped at the 10 most recent real
  events (`loadOrganizationActivity`), with a "View all activity →" link to
  a new, dedicated, fully paginated `/projects/[slug]/activity` page.
  Project Lead's own view replaces this with **Needs Your Attention**
  (Blocked/Due Today/Awaiting Review, deduped into one ticket list); Member's
  own view has **My Activity**, scoped to this member's own tickets.
- **Team** — real roster from `loadProjectTeam`.
- **Project Health** — reuses Delivery Reports' own `buildProjectHealthRows`
  for the real risk verdict. Admin shows an honest "No scope tracking
  available yet" Scope row; Project Lead's own view omits the Scope row
  outright.
- No new migrations — pure application-layer query/rendering work on top of
  already-real `projects`/`tickets`/`ticket_activity`/`ticket_time_entries`/
  `project_memberships` tables.

## Confirmed working (Dashboard — Admin, Project Lead, and Member)

Real KPIs, lists, and quick actions for all three roles' `/dashboard` — no
mock data remains on any of the three screens themselves (only
`Ticket`/`getTicketDisplayKey` are still imported from `mock-tickets.ts`,
as the shared type/display-key helper every real screen uses the same
way).

- `src/lib/tickets.ts` — `loadOrganizationTickets`, `loadOrganizationLoggedMinutes`,
  `loadOrganizationActivity` (filtered to 5 curated event types —
  `blocked`/`completed`/`hours`/`assigned`/`priority`). `src/lib/projects.ts` —
  `loadOrganizationWorkloadMembers`, `loadLeadProjects` (Project Lead's
  Current Project list, by `project_role = 'lead'` — a real bug was fixed
  here mid-build, it originally filtered by the older, unrelated
  `owner_profile_id`), `loadMemberProjects`/`loadMemberWeeklyCapacity`.
- **Admin** (`AdminDashboard()`) — Assigned Tickets, Hours Burn, Blocked,
  Due Today, My Active Work, Recent Activity, My Upcoming Deadlines, Team
  Workload, Projects at Risk, and Organization Health are all real. Quick
  Actions: New Project and Add Member open their modals directly; New
  Ticket was removed from Quick Actions entirely. Recent Activity has a
  real "View all activity →" action to a new, dedicated, org-wide
  `/activity` page (`OrganizationActivityHistoryScreen`, mirroring the
  per-project Activity page's query/pagination shape verbatim) — not on
  the Sidebar's main nav, link-only.
- **The 4 KPI cards, the Organization Health insight band, and Projects at
  Risk's own rows are all real, independent click targets now** (previously
  static) — each resolves to a real destination built from the exact same
  ticket/hour list the card itself displays, never a second/duplicated
  calculation, and each is a no-op when its own value is 0:
  - **Assigned Tickets** (open, non-`"done"`, tickets in the current
    project scope) — 1 ticket → straight to its own detail page (real
    `projectSlug` + ticket key); 2+ → the current project's own
    `/projects/<slug>/tickets?alerts=<the 5 non-done statuses>` when a
    project is selected, or the new org-wide `/tickets?alerts=...` (see
    below) under "All Projects" — always resolvable regardless of how many
    different projects those tickets span.
  - **Blocked** and **Due Today** follow the identical single-ticket /
    `?alerts=` pattern (`?alerts=blocked`, and a new `?alerts=due-today`
    pseudo-type — see the Tickets section below for both).
  - **Hours Burn** ("logged / estimated · X% · Yh remaining") → real
    logged minutes gate whether it's clickable at all (not the rounded
    display value); when clickable, opens `/time-tracking` filtered to the
    current project (`?projects=<slug>`) or org-wide, with
    `?period=custom&from=2000-01-01&to=<today>` — Time Tracking has no
    "All Time" period of its own, so this reuses its existing Custom Range
    params with a deliberately early lower bound instead of adding a new
    period type. Billable + Non-Billable Hours there sum to the exact same
    total Hours Burn reads from the same `ticket_time_entries` rows.
    Honest limitation, not fabricated: Time Tracking has no "estimated
    hours" or "logged/estimated %" concept anywhere on that screen (its
    only percentage, Weekly Utilization, is pinned to the current calendar
    week against team capacity, independent of the Period selector), so
    that one piece of Hours Burn's own display has no equivalent there —
    nothing was invented to force a match.
  - **Organization Health** insight band — the "N projects currently
    blocked"/"X blocked — N tickets" item links to that project's
    `/projects/<slug>` Overview (1 project) or the real, new
    `/projects?blocked=<slug,slug,...>` filter (2+, see the Projects
    section below); "N tickets completed this month" uses a new
    `?alerts=completed-this-month` pseudo-type (1 ticket → its own detail);
    "Hours burn at X% · Yh remaining" reuses the exact same href the Hours
    Burn KPI card itself computes — no second calculation. The "members
    above capacity" item and the empty-state fallback stay exactly as
    before, not clickable — out of scope.
  - **Projects at Risk** — each row (name, risk badge, progress bar,
    percentage, affected-ticket text) is one single `<Link>` to
    `/projects/<slug>` (the project's own real slug) — no per-element
    links. "Full report →" is unchanged, still `/reports`. **Resolved**:
    this widget's own risk classification (and the blocked-projects health
    insight above it) now reuses `buildProjectHealthRows` (`reports-screen.tsx`,
    via a shared `healthRowsBySlug`) instead of a second, locally-duplicated
    blocked-then-overdue calculation — the same real rule the Projects
    list's own Health badge/filter/"At Risk" KPI now reuse too (see Current
    Sprint → Completed → Projects and the Projects Architecture Status
    entry above). Each row's own `progressPct`/affected-ticket count are
    still computed locally, since those are display details the shared
    function doesn't return.
- **New global, org-wide Tickets view — `/tickets`** (`app/tickets/page.tsx`,
  no route param) — built to give the "All Projects" scope's own multi-project
  click-throughs above a real destination, since `/projects/[slug]/tickets`
  can only ever show one project. Reuses the exact same `TicketsScreen`
  component every per-project Tickets page already renders (`slug` prop now
  optional): with no `slug`, it loads via `loadOrganizationTickets` instead
  of `loadProjectTickets`, hides "+ New Ticket" (no single project to
  create into), and the ticket preview panel resolves each ticket's own real
  `projectSlug` instead of one page-level value. Not on the Sidebar's main
  nav — link-only, same precedent as `/activity`/Work History. A **Project
  filter** was added to this view only (never to the per-project Tickets
  page, where the project is already fixed by the route) — role-scoped
  options (Admin: every active org project; Project Lead:
  `project_role = 'lead'` projects only; Member: any active membership),
  synced to `?project=<slug>`, validated against the loaded option list
  before being trusted (same "ignore a stale/invalid slug" precedent the
  Dashboards' own scope selectors already use).
- **Project Lead** (`ProjectLeadDashboard()`) — Current Project selector
  (`?project=<slug>`, only rendered when leading more than one active
  project), Current Delivery, Target Date (now the nearest due date among
  the project's own active tickets, previously read the unrelated
  `projects.target_date`), Attention Required, Team Capacity, Project Work
  (renamed from "My Active Work"), Recent Activity, Upcoming Deadlines are
  all real. Quick Actions: Add Member/New Note/New Ticket all open their
  real modals directly against the selected project.
- **Member** (`MemberDashboard()`) — Assigned Tickets, Weekly Capacity
  (renamed from "Planned Today"), Logged Today, Due Today, Recommended
  Next, My Active Work, Needs Your Attention, Time Today, and Upcoming Work
  are all real. `MEMBER_WORK`/`WorkItem` stay defined/exported in this file
  but are now fully unused anywhere in the app.
- **Project scope selector on all three** — a `?project=<slug>` selector
  in the header's top-actions row. Admin defaults to "All Projects"
  (org-wide); Project Lead's/Member's only render when scoped to more than
  one project. Every KPI/list re-scopes to that project's own data;
  fast-switching resets to a zero state first so stale numbers never show.
  `app/dashboard/page.tsx` is wrapped in `<Suspense>` for this.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Member Profile Modal — real data source, Team Workload + Recent Activity only)

**Scoped narrowly on purpose — this is not an app-wide migration.** An
investigation (triggered by Team Workload's own numbers looking right while
the modal opened from it showed `Assigned Hours = 0h`/`Utilization = 0%`/
`Active Tickets = 0`/`View Work History` 404ing to a `/projects/team/
unknown-<name>/work-history` URL) found the shared Member Profile Modal
(`member-profile-modal.tsx`, opened via `MemberTrigger`/`openMemberProfile`
in `member-profile.tsx`) had never been real: `resolveTeamMember`
(`mock-team.ts`) only ever matched by **name** against a hardcoded mock
roster, or — for a real org member with no mock entry — synthesized a
`TeamMember` with `id: "unknown-" + slugified-name` and hardcoded
`assignedHours: 0`/`weeklyCapacity: 40`/`activeTicketIds: []`. Every "click
a person" trigger across the app that only had a name/avatar (which was
almost all of them) hit this path.

- **The fix, applied to exactly two entry points**: Team Workload
  (`dashboard-screen.tsx`'s `WorkloadRow`, Admin Dashboard) and Recent
  Activity (`dashboard-shared.tsx`'s `RecentActivityList`, Admin Dashboard).
  Both now pass a real `profileId` (`OrgWorkloadMember.id` for Team
  Workload; the new `OrganizationActivityEvent.actorProfileId` — the raw
  `actor_profile_id` the query already fetched but never exposed, for
  Recent Activity) and a real `projectSlug` (the Dashboard's own current
  `?project=` scope — omitted entirely under "All Projects," never a
  guessed/first project) through `MemberTrigger` into `MemberIdentity`.
- **The modal itself now has exactly one way to get real data, driven only
  by `(realProfileId, slug)`**: with a `slug`, `Promise.all([loadProjectTickets,
  loadProjectTeam])`, filtered by real `assigneeProfileId === realProfileId`
  (never name-matching); with no `slug` ("All Projects"),
  `Promise.all([loadOrganizationTickets, loadOrganizationMemberWeeklyCapacities])`,
  same real id filter, aggregated across every accessible project. Assigned
  Hours/Utilization/Active Tickets/Current Workload/Weekly Capacity are all
  derived from this one fetch — the old per-caller `realActiveTickets`/
  `realWeeklyCapacity` props (a stopgap from the Team Workload-only fix that
  preceded this one) were removed once the modal could fetch its own data,
  rather than kept as a second path. A real, separate bug fixed along the
  way: the "Weekly Capacity" stat tile read the un-overridden `member`
  object instead of the merged `effectiveMember`, so it kept showing the
  40h stub even after Assigned Hours/Utilization were already fixed.
- **View Work History** (`MemberMenu`) now always uses this same real
  `profileId`/`slug` for its route, so it can no longer build an
  `unknown-*` URL. With no real `slug` (All Projects), it's omitted from
  the menu entirely (never shown disabled) — no global/cross-project Work
  History page exists to link to instead. If that leaves the menu with zero
  items (e.g. All Projects, no other action applicable), the "⋯" trigger
  button itself is now omitted rather than opening an empty popover.
- **Every other `MemberTrigger`/`openMemberProfile` call site in the app is
  unchanged** — Project Overview (all three roles), Reports, ticket
  assignees/comments/attachments, Time Tracking, My Work, and Project Lead's
  Dashboard all still resolve through the old name-matching/`unknown-*`
  path. `team-screen.tsx` is the one pre-existing exception (already passed
  a real `profileId`+`projectSlug` before this fix) and now benefits from
  the same real fetch automatically, with no changes of its own needed. A
  broader migration of the remaining call sites was scoped out of this
  pass — see Technical Debt.
- No new migrations — `actorProfileId` on `OrganizationActivityEvent` is a
  purely additive field (the underlying query already selected
  `actor_profile_id`; it just wasn't exposed on the returned object before).

## Confirmed working (My Work — Member)

Real replacement for `my-work-screen.tsx`'s entire mock data set for the
Member role's `/my-work`.

- **Tickets** — `loadOrganizationTickets` filtered to
  `assigneeProfileId === userId`.
- **KPIs** — Assigned Tickets, Active, Estimated Hours, Blocked, and Due
  This Week, computed from the member's full, unfiltered ticket set.
- **My Tickets — filters are now real and functional**: Status/Priority/
  Project/Labels all actually filter the ticket list (previously rendered
  but never applied), composing (AND) with the KPI quick-filters.
- **Recently Updated** reuses `loadOrganizationActivity` scoped to this
  member's own ticket ids. `OrganizationActivityEvent` gained one new
  field, `createdAtISO`, purely additive.
- **My Time (Member only) + Personal Timesheet panel** — Logged Today
  (`loadProfileLoggedTimeForDate`) and Personal Capacity
  (`loadMemberWeeklyCapacity`); Logged This Week/This Month come from
  `loadOrganizationLoggedTimeForRange`. The Timesheet panel's own entry
  list is backed by a new, minimal `loadProfileTimeEntries`.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Reports — Admin, Delivery and Finance tabs)

Real KPIs, tables, filters, alerts, and Export for both tabs of `/reports`
(`AdminReportsScreen`). Project Lead gets a separate, still-mock component
(`ProjectLeadReportsScreen`) instead.

- **Shared filters and period** — Project/Assignee/Client/Date filters
  plus the Period selector all read from one shared fetch; every KPI/
  table/chip derives from the same filtered ticket set via `useMemo`
  chains.
- **Delivery KPIs, Health Alerts, Project Health, Hours by Person** —
  `buildDeliveryKpiSummary`, `buildProjectHealthRows`,
  `buildHoursByPersonRows` compute real rollups from real tickets, logged
  time, and weekly capacity.
- **Workload** — `buildWorkloadRows`: real assigned hours/capacity/
  utilization, plus a real "change this week" delta.
- **Hours Distribution** — `buildHoursDistribution`: real hours bucketed by
  ticket status, excluding backlog.
- **Recent Changes** — `buildRecentChanges` + `loadDeliveryActivityForTickets`:
  real, deduped, date-grouped activity for the current filtered ticket set.
- **Delivery Export** — CSV/Excel/PDF build 7 sections from the exact same
  in-memory state every widget already reads.
- **Finance KPIs, Billing Overview, Billable Hours by Member** — real
  Billable/Non-Billable hours, Utilization, and Estimated Revenue from real
  logged time × each project's real billing rate.
- **Finance Export** — CSV/Excel (per-section worksheets)/PDF, all
  preserving on-screen order.
- No new migrations — pure application-layer query/rendering work on top
  of already-real tables.

## Confirmed working (Reports — Project, per-project)

Implemented and type/build-clean, **not yet clicked through in a live
browser**. Real replacement for `/projects/[slug]/reports`'s
(`project-reports-screen.tsx`) previous org-wide mock ticket list and
`mock-team.ts` roster, for every role that can open it. Project Lead's own,
separate Reports view (`project-lead-reports-screen.tsx`) is untouched and
still mock.

- **Data loading** — `loadProjectDetail`, `loadProjectTickets`,
  `loadProjectTeam`, and `loadOrganizationLoggedTimeForRange`, all scoped
  to the route's own `slug`.
- **Project Health KPI** — now calls Delivery Reports' own
  `buildProjectHealthRows`, scoped to this one project, rather than a
  second calculation — a real bug fixed here (this KPI was previously just
  showing `project.status` mislabeled as "Project Health").
- **Estimated vs Logged Hours, Team Workload, Delivery Progress** — real
  sums/counts from real tickets/time entries/roster. Delivery Progress's
  cards now navigate contextually via the same real `?alerts=<status>`
  mechanism instead of the old, non-functional `?status=` query param.
- **Delivery Snapshot** — a new `loadTicketsCompletedInRange` finds tickets
  with a real `status_changed → done` activity row within the current
  calendar month, rather than trusting `updated_at`.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Time Tracking — Admin, Member, and Project Lead)

Real replacement for `/time-tracking`'s previous fully-mock data source, for
all three roles. Not yet clicked through in a live browser.

### Admin/Member — `time-tracking-screen.tsx`

- **Data load** — real active org users, org-wide tickets/projects, and
  real per-member weekly capacity are all fetched once per organization.
  Real logged time is fetched for four fixed ranges up front (Today/
  Yesterday/This Week/This Month); Custom Range is fetched separately.
- **Billing is reused verbatim from Reports → Finance, never recalculated**
  — `buildFinanceKpiSummary`/`buildBillingOverviewRows`/
  `buildBillableHoursByMemberRows` were exported from `reports-screen.tsx`
  for this reuse.
- **Capacity-based metrics are deliberately independent of the Billing
  filter** — Hours Missing (relabeled "Members Missing Hours"), Weekly
  Utilization, and Timesheets' Capacity %/Status always use a member's
  *total* logged hours; two separate ticket-id scopes are computed
  (`capacityTicketIds` vs. `billingTicketIds`) so the Billing filter has no
  code path into capacity math at all.
- **Filters are real and URL-persisted** — Member/Project/Client/Billing/
  Date Range all filter real data and round-trip through the URL, same
  `<Suspense>` requirement as Tickets' `?alerts=`.
- **Timesheets table** — one real row per active org member, with a real
  "Review →" action navigating to the existing Work History route.
- No new migrations — pure application-layer query/rendering work on top
  of already-real tables.

### Project Lead — `project-lead-time-tracking-screen.tsx` (**resolved**, no longer mock)

Same page layout/copy as the previous mock version (a delivery-focused
build with no revenue/invoicing/billing-by-client concepts) — only the data
source changed, and every calculation is imported and reused verbatim from
the Admin/Member screen above (`scopeEntries`, `hoursByMember`,
`expectedHoursForPeriod`, `getCurrentWeekRange`/`getCurrentMonthRange`,
`round1`, `parseListParam`, all exported from `time-tracking-screen.tsx`
for this reuse) rather than a second implementation.

- **Scoped strictly to led projects** — `loadLeadProjects` (the same
  `project_memberships.project_role = 'lead'` definition the Dashboard's
  own project scope selector uses) determines the project set first; team
  roster and tickets come from `loadProjectTeam`/`loadProjectTickets` per
  led project (merged/deduped client-side, summing `weeklyCapacity` for
  anyone staffed on more than one), never the org-wide
  `loadOrganizationUsers`/`loadOrganizationTickets`/`loadOrganizationProjects`
  Admin/Member use — those would leak every org member/project into a
  Project-Lead-only page.
- **Logged Hours / Internal Hours** KPIs reuse `buildFinanceKpiSummary`
  verbatim (same billable/non-billable split as Admin/Member, just
  delivery-labeled — no dollar amounts shown anywhere on this page).
- **Hours by Project** and **Capacity Risk** have no real equivalent in the
  Admin/Member screen to reuse — both are new, small aggregations over the
  same already-loaded real tickets/time-entries (project-hours breakdown;
  count of members with `capacityPct > 100`), not a second data source.
- **Member/Project/Client filters are now functional** — the previous mock
  version's filter state existed but was never wired into any actual
  narrowing of the displayed data.
- **`?projects=<slug>` is read on load and kept round-tripped through the
  URL**, same convention Admin/Member's own screen already uses. A slug
  outside the signed-in lead's own led projects can't broaden access — the
  underlying ticket set is already scoped server-side to led projects only,
  so an out-of-scope slug can only narrow the result to nothing.
- The three mock-only exports this screen used to import
  (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) were deleted from
  `time-tracking-screen.tsx` — no other consumer.

## Confirmed working (Global Search)

JIRITA's global Search (the Sidebar's own Search field, previously a fully
inert decorative button) now has a real, permission-scoped Supabase data
layer and a working results popover with click and full keyboard
navigation. No new migrations.

- **`src/lib/search.ts` (new) — `searchGlobal(organizationId, role, userId,
  query)`**, the single reusable data-layer function everything below
  consumes. Returns up to 5 deduplicated results each for Projects,
  Tickets, and Users. Permission scoping happens as real query filters,
  never a client-side trim: **Admin** → every project in the organization;
  **Project Lead** → only projects where `project_role = 'lead'`;
  **Member** → any active `project_memberships` row. Search terms are
  escaped before being used in an `ilike` pattern.
- **`src/components/sidebar.tsx`** — the Search field is a real controlled
  `<input>`; a results popover renders below it. Opens on focus, only
  renders once there's a non-empty typed term; debounced ~300ms; real
  loading/error/empty states. Results render grouped (Projects/Tickets/
  Users); clicking navigates to the real detail page/route for each.
  **Keyboard**: global `⌘K`/`Ctrl+K` focuses the field and opens the
  popover from anywhere in the app; `ArrowDown`/`ArrowUp` walk the results
  as one continuous list; `Enter` selects; `Escape` closes.

## Still mock

- The rest of Settings (`/settings/*`) all still reads from
  `src/lib/mock-*.ts`. Everything else listed above is now fully real.
- `src/components/project-lead-reports-screen.tsx` — the Project Lead
  role's own Reports view, a separate component from `AdminReportsScreen`.
  Still reads `PROJECT_TICKETS`/`RECENT_ACTIVITY`/`MY_PROJECT_NAMES` and
  other `mock-*.ts` data untouched by this work.
- Within Tickets/Ticket Detail specifically, still mock/unimplemented on
  purpose: New Ticket's "More Options" fields (Type/Status/Priority/
  Labels/Due Date always write fixed defaults); editing or deleting a
  Comment (local-only); Milestone and Story Points fields on Ticket Detail
  (dead code); GitHub/Development integration (removed entirely, no real
  integration exists).
- Within Users specifically, still mock/unimplemented on purpose: the
  Users list's inline Weekly Capacity cell (`CapacityCell`, no Server
  Action yet); Resend Invitation (toast-only); editing a user's email
  (shown, never persisted); `browser`/`os`/`device` on the Security tab (no
  real source, simply don't render).
- Within Project → Team specifically, still mock/unimplemented on purpose:
  per-person `status` (Available/Busy/Away) — every real member shows a
  fixed "Available".
- Within Project Notes specifically, still mock/unimplemented on purpose:
  the Tag field (interactive, never persisted); `project_note_activity` is
  written by real triggers but no screen reads it yet.
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` defines how Techtivo's Unfuddle
  backup maps onto the schema for the eventual data migration. No importer
  code exists yet.

Note also that Projects' own real rows still don't populate
`openTickets`/`blockedTickets`/`overdueTickets`/`progress`/
`awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` — those are
derived from `tickets` by design and default to `0`/`healthy` on the
`projects` table itself, since nothing re-aggregates those derived fields
back onto the row (see `docs/SUPABASE_MVP_SCHEMA.md`). The Admin Project
Overview, per-project Reports, **and, since this pass, the `/projects` list
itself** all work around this the same way — computing Health/Progress/Open/
Blocked/Overdue directly from real tickets at read time (via
`buildProjectHealthRows`/`computeProjectProgressPct`, see Current Sprint →
Completed → Projects) instead of relying on those stored-but-unpopulated
fields. Only `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones`
remain genuinely unpopulated/`0` anywhere in the app — still read by the
Projects list's own Project Lead info chips/summary cells.

---

# Navigation Status

All completed screens must remain accessible.

Important rule:

No newly implemented screen may replace an existing one.

Every new feature must be integrated into the application's navigation so that all completed screens remain reachable.

Current working routes:

- `/` — Dashboard (role-specific: Admin / Project Lead / Member)
- `/my-work`
- `/projects` — role-specific (Admin full table / Project Lead scoped blocks / Member "My Projects")
- `/projects/[slug]` — real end-to-end for all three roles (Admin/Project Lead/Member)
- `/projects/[slug]/tickets`
- `/projects/[slug]/tickets/[ticketCode]`
- `/tickets` — new org-wide, all-projects Tickets view (no route param); reuses `TicketsScreen` with `slug` omitted; not on the Sidebar's main nav, reached only via the Admin Dashboard's own KPI-card/health-insight click-throughs, same "link-only" precedent as `/activity`/Work History
- `/projects/[slug]/notes`
- `/projects/[slug]/team` — Admin/Project Lead only (real roster, Add/Remove Member)
- `/projects/[slug]/team/[userId]/work-history` — dedicated, server-side-paginated Work History page
- `/projects/[slug]/activity` — dedicated, server-side-paginated Project Activity history page (new)
- `/projects/[slug]/reports` — real end-to-end, every role
- `/projects/[slug]/settings` — Admin/Project Lead only (per-project General/Billing/Danger Zone)
- `/reports` — role-specific (Admin company-wide / Project Lead scoped Delivery+Team / Member: no access)
- `/time-tracking` — role-specific (Admin/Member Billing/Finance view real end-to-end / Project Lead delivery-focused view now real too, scoped to led projects / Member: no sidebar link, folded into My Work instead)
- `/users` — Admin only (workspace-wide user account management, replaces the old `/settings/people`)
- `/activity` — dedicated, server-side-paginated, org-wide Activity History page (new), the org-wide sibling of `/projects/[slug]/activity`; not on the Sidebar's main nav, reached only via the Dashboard's "View all activity →" action, same "link-only" precedent as `/projects/[slug]/team/[userId]/work-history`
- `/settings` → redirects to `/settings/general`
- `/settings/general`
- `/settings/projects`
- `/settings/time-tracking`
- `/settings/notifications`
- `/settings/integrations`
- `/settings/danger-zone`

---

# Design Decisions

## UI Inspiration

Primary inspiration:

- Linear

Secondary inspiration:

- Jira
- GitHub
- Notion

Goals:

- Modern
- Clean
- Dense information
- High productivity
- Excellent dark mode

---

## Navigation

The application should always feel like a complete product.

Avoid isolated prototype screens.

Every implemented page must be linked through normal navigation.

---

## Mock Data

Until backend integration begins:

- Use realistic mock data.
- Keep relationships coherent.
- Maintain consistent IDs.
- Simulate real project activity.

---

# Development Rules

Always preserve existing functionality.

Never remove completed screens.

Never break navigation.

Prefer extending existing components instead of replacing them.

Maintain visual consistency across Light and Dark modes.

Favor reusable components over duplicated implementations.

---

# Technical Debt

Current known items:

- **Resolved**: `ProjectOverview`'s Member-role variant (`project-overview.tsx`) is now real end-to-end and keys off `slug` like the Admin/Project Lead rebuilds — see Architecture Status → Project Overview.
- **Resolved**: Assigned/Priority/Status filter dropdowns and the 5 quick-filter chips on the Tickets page, plus the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date), all now really filter the ticket list, combined with AND — see Current Sprint → Completed → Tickets → Filter Bar.
- New Ticket's "More Options" fields (Type, Status, Priority, Labels, Due Date) always write fixed defaults (`backlog`/`medium`/`task`/none — Status changed from `to_do` to `backlog`, matching the database column's own default), never the value picked in the form.
- **Resolved for rename/delete**: Ticket Attachment rename and delete are now real and persisted (Storage + metadata row). "Replace File" was removed from the menu entirely rather than left as a mock stub. Editing or deleting a *Comment* is still local-only — not persisted to Supabase.
- Milestone and Story Points fields on Ticket Detail's sidebar are dead code — defined in `ticket-detail-screen.tsx` but never rendered.
- **Resolved for all three roles**: Admin, Project Lead, and Member Project Overview all now create/view real tickets against the same real Tickets data — see Architecture Status → Project Overview.
- `settings-screen.tsx` (`SettingsScreen` hub component) is retained but no longer rendered — `/settings` redirects directly to `/settings/general`.
- Org-wide Settings (`/settings/*`) toggles and fields are visual only; no state persists between page loads. (Project Settings — `/projects/[slug]/settings` — is the one exception: it's real and persists, see Current Sprint → Completed → Project Settings.)
- Role now comes from a real `organization_membership` when one exists; `current-user.ts`'s mock identities are a dev-only fallback (never in production) rather than the only source of truth. **Resolved**: the `RoleSwitcher` is now gated behind `isDevFallback` (only renders, with a visible "Dev fallback" badge, when there's no real membership) instead of always showing. No real server-side permission enforcement is wired into the UI yet for projects/tickets/etc. — the RLS policies in `supabase/migrations/20260708000000_mvp_schema.sql` are applied and enforce tenant isolation at the DB layer, but the UI doesn't call any of those tables yet.
- **Resolved**: Note "Duplicate" and "Delete" menu actions in `NoteDetailModal` are now real (`duplicateNote`/`deleteNote`), no longer visual stubs — see Current Sprint → Completed → Project Notes.
- In dev fallback only (no real organization membership — never in production): the Projects list no longer filters by the old `LEAD_PROJECT_SLUGS` array (removed since real data is scoped by RLS instead), so a Project Lead testing without a seeded Supabase project now sees the full mock projects list rather than just their 3 owned slugs, while the summary cells (Blocked Tickets, Due This Week, Team Members Over Capacity) still compute against the `LEAD_PROJECT_SLUGS`-scoped team aggregation — a minor mismatch specific to unauthenticated/dev-fallback local testing, not the real-org path.
- **Resolved for Health/Progress/Open/Blocked/Overdue**: `projects.health`/`ProjectSummary.progress`/`openTickets`/`blockedTickets`/`overdueTickets` are still never re-aggregated onto the `projects` row itself (by schema design — see `docs/SUPABASE_MVP_SCHEMA.md`), but the `/projects` list no longer reads any of them: it now computes all five directly from real tickets at read time (`buildProjectHealthRows`/`computeProjectProgressPct`, `reports-screen.tsx`), the same work-around the Admin Project Overview/per-project Reports already used — see Current Sprint → Completed → Projects. `awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` remain unresolved — still `0`/unpopulated, still read by the Project Lead's own info chips/summary cells on that same screen.
- **Users is implemented and passes `tsc`/`eslint`/`next build`, but has never been run against a live Supabase project or clicked through in a browser** — treat as "should work, not yet verified" until that verification pass happens (Team carried this same caveat as of the last update; it's since been confirmed live — see Architecture Status).
- The Users list's inline Weekly Capacity cell (`CapacityCell`) still calls `updateOrganizationMember`, a direct client write — the same "permission denied for table organization_memberships" every other Users write used to hit before it got its own Server Action. Intentionally left as-is; it has no Server Action yet.
- Resend Invitation (Users row menu) is still toast-only — no real resend path exists.
- Editing a user's email — the Edit User form still shows the field but never persists a change to it; only first/last name, role, and weekly capacity are real writes.
- `browser`/`os`/`device` on the Security tab have no real source and simply don't render.
- Per-person availability `status` (Available/Busy/Away) on Team has no real source anywhere in the app — every real member shows a fixed "Available".
- The Notes Tag field is fully interactive in the UI but never persisted — no `project_notes` column exists for it, same "still mock" precedent as New Ticket's "More Options" fields.
- `project_note_activity` is written by real database triggers on every note create/update/delete, but no screen reads it yet — there is no Notes Activity view.
- The Member Dashboard's "Needs Your Attention" mock "mention" event category has no real source in this schema — comments aren't parsed for @mentions — so it stays a defined type but is never populated, the same "kept but unreachable until real data exists" precedent as the Notes Tag field above.
- **Resolved**: `member-projects-screen.tsx` ("My Projects," Member role) is now real (`useOrganizationProjects()` + `loadProjectTeam`/`loadProjectTickets`), no longer reading `MEMBER_WORK` — see Architecture Status → Projects.
- `project-lead-reports-screen.tsx` (the Project Lead's own scoped Reports view) is a separate component from `reports-screen.tsx` and remains fully mock, unaffected by company-wide Reports becoming real.
- **Resolved**: `project-lead-time-tracking-screen.tsx` (the Project Lead's own scoped Time Tracking view) is now real too, scoped to exactly this profile's led projects and reusing `time-tracking-screen.tsx`'s own real calculations/loaders (exported for this reuse) rather than a second implementation — see Hours & Time Tracking → Project Lead. The three exports it used to import (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) have been deleted from `time-tracking-screen.tsx`, since they had no other consumer.
- **Resolved**: Project Settings' "Project Lead" field/picker was removed outright (it read/wrote `projects.owner_profile_id`). The `/projects` list's own Lead column/filter has since been reconciled onto Team's real `project_memberships.project_role` too (`ProjectSummary.lead`, via a new batched query in `loadOrganizationProjects`) — `owner_profile_id`/`ProjectSummary.owner` no longer has any Lead-column reader anywhere in the app; see Architecture Status → Projects.
- **New**: the Admin Dashboard's Recent Activity "View all activity →" action and its new org-wide `/activity` page, and Time Tracking's Admin/Member/Project Lead screens becoming real, haven't themselves been clicked through in a live browser yet — same "should work, not yet verified" caveat as Users/the Admin Project Overview/per-project Reports.
- **New**: the Member Profile Modal's real-data fetch (see Architecture Status → Member Profile Modal) is wired for exactly two entry points — the Admin Dashboard's Team Workload and Recent Activity — plus `team-screen.tsx`, which already qualified before this fix. Every other `MemberTrigger`/`openMemberProfile` caller (Project Overview's team roster/ticket assignees/activity, Reports' Hours by Person/Workload/Billable Hours/Recent Changes, ticket assignees/comments/attachments across Board/List/Calendar/Insights/Ticket Detail/Quick Ticket Preview, Time Tracking's Timesheets/Members Missing Hours, My Work's Recently Updated) still opens the modal with only a name/avatar, so it still resolves through `resolveTeamMember`'s old name-matching/`unknown-*` fallback and can show stale/zeroed numbers for a real (non-mock-roster) org member. A real `profileId` is already obtainable at almost all of these sites today without any loader changes (`ticket.assigneeProfileId`, `ProjectTeamMember.id`, `PersonRow`/`WorkloadRow`/`MemberBillingRowReal.id`, `TimesheetViewRow.id`) — the remaining work is threading it through, plus three small additive loader fields (`TicketComment.authorProfileId`, `TicketAttachment.uploadedByProfileId`, and restructuring `insights-view.tsx`'s `AssigneeWorkload` map to key by id instead of name) for comment/attachment/insights callers specifically. Deliberately scoped out of this pass rather than attempted as one large migration.

Planned future work:

- Live verification (click through each in a browser against a real Supabase project) of Users, the **Admin** Project Overview (including its new Project Activity history page), per-project Reports, Time Tracking (Admin/Member/Project Lead), the Dashboard's org-wide Activity History page, the Project Lead's and Member's own Project Overview, all three Dashboards' project scope selectors, My Work (Member), ticket-assignment restriction, Member's own `/projects` ("My Projects"), and global Search — the immediate next step, ahead of any new backend seam
- Backend integration for the Project Lead's own scoped Reports view and the rest of Settings (everything else, including the Project Lead's own scoped Time Tracking view, is done — see Architecture Status; schema for the rest is designed in `docs/SUPABASE_MVP_SCHEMA.md` and applied via the migrations in `supabase/migrations/`, just not queried by the UI yet)
- API layer
- Real drag & drop (Kanban)
- Real-time updates
- Notifications
- File uploads
- Unfuddle data import (spec complete — see `docs/UNFUDDLE_IMPORT_SPECIFICATION.md`; importer not yet built)

---

# Files Frequently Modified

Expected high-change areas:

- `src/app/`
- `src/components/`
- `src/lib/`

---

# Current MVP Goal

Complete every major screen required for a usable project management platform before connecting real services.

Remaining priority order:

1. Backlog / Sprint Planning
2. Live-verification pass for Users, the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), the Project Lead's/Member's own Project Overview, the Dashboard project scope selectors, My Work, ticket-assignment restriction, Member's "My Projects", and global Search

(Authentication and Ticket editing, previously first on this list, are now both complete. Per-project Reports, Notes, and Team pages refinements, previously second on this list, are now also complete.)

---

# Definition of Done

A feature is considered complete when:

- UI implemented
- Responsive
- Light Mode supported
- Dark Mode supported
- Connected to application navigation
- Uses realistic mock data
- Matches JIRITA design language
- Does not regress existing functionality

---

# Notes for Future Development

JIRITA should evolve as a polished SaaS product rather than a collection of disconnected screens.

Whenever possible:

- Build reusable components.
- Keep navigation complete.
- Preserve previous work.
- Optimize for future backend integration.
- Minimize refactoring by designing extensible components from the beginning.
