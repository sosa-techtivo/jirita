> Last Updated: August 20, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, a role-based UX layer (Admin / Project Lead / Member), projects listing, role-specific project overviews, a five-view Tickets experience with Task/Bug ticket types and real search/filters, an editable Quick Ticket Preview, Full Ticket Detail with Time Tracking, real Related Tickets, and a real Attachments flow (upload/rename/delete/download/Preview), role-specific Dashboards, role-specific Projects/Reports/Time Tracking screens, a personal My Work workspace, an editable Notes experience, a Settings section, a per-project Settings screen, a per-project Team screen with a dedicated Work History page, a dedicated Admin-only Users management module, a real Supabase Auth flow (Login/Logout/Forgot/Reset/Change Password) with a Profile page that saves real data, and a single shared Member Profile Modal (now with real per-project ticket metrics, real Activity/Security tabs in user mode, and real project-membership actions in project mode) used everywhere a person is referenced. Auth/Profile, Projects (Sidebar, the `/projects` list, and per-project Settings — whose General section no longer has its own "Project Lead" field, since Team's `project_memberships.project_role` is the only real place a project's lead is set), Tickets (all five list views with real filtering, New Ticket creation, the full Ticket Detail page, Related Tickets, and the editable Quick Ticket Preview), Project → Team (roster, project-scoped Lead/Member role, Make Project Lead, auto-membership on contribution, Add/Remove Member, paginated Work History), Project Notes (list, search, create, edit, Duplicate, delete), the Dashboard for the Admin, Project Lead, and Member roles (Admin's now also with a real "View all activity →" action and a new, dedicated org-wide Activity History page), company-wide Reports for the Admin role (`/reports` — both the Delivery and Finance tabs, with real filters, Health Alerts, and Export), the **Admin** role's Project Overview (`/projects/[slug]` — real header/Health Alerts/KPIs/Active Work/Team/Project Health, plus a new dedicated, paginated Project Activity history page), per-project Reports (`/projects/[slug]/reports`, every role), and Time Tracking for the Admin and Member roles (`/time-tracking` — real KPIs, filters, Timesheets, Hours Missing/"Members Missing Hours", Weekly Utilization, and Billing by Client) are confirmed backed by a live Supabase project end-to-end. Users (list, Invite by email/link, Disable/Enable, Edit, Reset Password link, Activity/Security tabs) is also fully wired to the same Supabase schema, but not yet confirmed against a live project or in a browser — see Architecture Status; the same "implemented and type/build-clean, not yet clicked through live" status now also applies to the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new org-wide Activity History page just described. Every other screen (the Project Lead's and Member's own Project Overview, the Project Lead's own scoped Reports view, the Project Lead's own scoped Time Tracking view, and the rest of Settings) is still navigable and connected using mock data — see Architecture Status.

The current objective is to complete the remaining frontend experience while continuing backend integration. Auth, profile/organization-membership data, avatar upload, and change password are confirmed working end-to-end against a live Supabase project. Projects has followed the same path: Sidebar, the `/projects` list, and `/projects/[slug]/settings` now read and write real project rows (create, edit, archive/restore, and per-project Settings' General/Billing fields, including a minimal real Clients roster). Tickets has now followed the same path too and gone further: the five list views (with real search, Assigned/Priority/Status filters, quick-filter chips, and the "Add Filter" menu — Labels/Due Date/Reporter/Created Date/Updated Date — all combining with AND), New Ticket creation, the full Ticket Detail page (inline edits, Labels, Acceptance Criteria, Attachments including rename/delete/download/Preview, Time Tracking, Comments, Related Tickets, and a real trigger-driven Activity Log), and the Quick Ticket Preview panel (now editable when opened from the Tickets board) all read and write real ticket rows. Ticket priority is a 4-value scale (Highest/High/Medium/Low) — the old "Normal" value was fully migrated and removed from the database, not just hidden in the UI. Every Ticket write path now surfaces failures to the user (a shared error toast) instead of only logging to the console, and rolls back optimistic edits that didn't actually save. Users and Project → Team followed the same real-data path — Users' list, Invite (email or generated link), Disable/Enable, Edit, a generated Reset Password link, and the Member Profile Modal's Activity/Security tabs all read/write real Supabase data via Server Actions (`organization_memberships` has no direct `authenticated` grant, so every privileged write goes through a service-role Server Action that re-verifies the caller server-side); Team's roster, project-scoped Lead/Member role (`project_memberships.project_role`, with a Make Project Lead action), auto-membership-on-contribution, Add/Remove Member (with a database-level history guard), and a server-side-paginated Work History page do the same — Team has since been clicked through against a live project and is confirmed; Users has not and is still "should work, not yet verified." Project Notes (list, search, create, edit, Duplicate, delete), the Admin, Project Lead, and Member Dashboards (every KPI, list, and quick action), and company-wide Reports for the Admin role (both the Delivery and Finance tabs — KPIs, Health Alerts, Project Health, Hours by Person, Workload, Hours Distribution, Recent Changes, filters, and Export) have also since been built and confirmed live, reusing the same query/RLS/Server-Action patterns established above rather than inventing new ones. The **Admin** Project Overview and per-project Reports (all roles) have since followed the same path too, both explicitly reusing Delivery Reports' own real health/KPI calculations rather than a second one, and Project Overview gained a new, fully paginated Project Activity history page. Tickets also gained a real, URL-persisted status/alert filter (`?alerts=...`), shared by both the Project Overview Health Alert banner and Project Reports' Delivery Progress cards, and survives a refresh or browser back/forward since it's real query-state, not the older sessionStorage handoff. Time Tracking for the Admin and Member roles has since followed the same path too: real KPIs, real Member/Project/Client/Billing/Date-Range filters (URL-persisted, same `?alerts=`-style precedent as Tickets), and a real Timesheets table, explicitly reusing Reports → Finance's own billing-calculation functions (exported for this reuse) rather than a second implementation, with capacity-based metrics (Hours Missing — relabeled "Members Missing Hours" since it counts members, not hours — Weekly Utilization, Capacity %, Status) kept structurally independent of the Billing filter so they always reflect total logged hours. The Dashboard's Recent Activity widget gained a real "View all activity →" action (same cap-plus-probe pattern Project Overview's own Project Activity widget already used) pointing at a new, dedicated, real, server-side-paginated org-wide Activity History page — the org-wide sibling of the existing per-project one, reusing its exact query/pagination shape. Project Settings' General section had its "Project Lead" picker removed outright — it was the only writer of the older `projects.owner_profile_id`, unrelated to Team's own real `project_memberships.project_role`, which remains the sole source of truth for a project's lead. The Project Lead's and Member's own Project Overview, the Project Lead's own scoped Reports view and own scoped Time Tracking view (both separate components from the now-real company-wide ones), and the rest of Settings are still mock data — see Architecture Status.

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

A dedicated "My Projects" screen, not a filtered Admin/Lead table.

- Shows only projects the Member is staffed on
- Surfaces who leads each project
- Surfaces what's assigned to the Member within each project

#### Create, Edit, Archive, Restore

- **Create**: `create-project-modal.tsx` — name + optional description; status starts `active`; slug/project code auto-derived from the name
- **Edit**: the same modal, `editingProject` prop pre-fills name/description
- **Archive**: `archive-project-modal.tsx` — confirmation modal (project hidden from the active list; tickets/comments/activity/time tracking untouched; restorable later), reused unchanged by both the Projects list row menu and Project Settings' Danger Zone
- **Restore**: no confirmation — a direct action from the row menu / Danger Zone
- Sidebar's pinned project list and the `/projects` page share one `OrganizationProjectsProvider` (`src/components/organization-projects-provider.tsx`), so any create/edit/archive/restore is reflected in both immediately

#### Project Settings — `project-settings-screen.tsx`

Route: `/projects/[slug]/settings`, Admin/Project Lead only. Previously a fully mock, non-interactive page (uncontrolled inputs, no Save button at all); now reads and writes the real project.

- **General**: Project Name, Description, Project Code, Status (excludes `archived` — that transition only ever happens via the reused Archive/Restore flow, never a parallel path here)
- **Billing**: Project Category (Client/Internal toggle), Client (a real per-organization roster — see "+ Add new client" below), Billing Rate. The Billable/Non-Billable-by-default note stays derived from Category, not a stored field
- A single **Save Changes** button (didn't exist before) persists only the fields this screen manages; the breadcrumb (`ProjectSettingsBreadcrumb`) reads the live project name from the same shared provider Sidebar/`/projects` use, so a rename shows up there immediately too
- **+ Add new client** (`add-client-modal.tsx`): minimal name-only creation, backed by a new `clients` table (see Architecture Status) — created immediately and selected in the form; persisted to the project on the next Save like any other field. Basic per-organization duplicate names are rejected.
- Danger Zone's Archive/Restore reuses `archive-project-modal.tsx`/`restoreProject` exactly as on the Projects list — no separate implementation
- **Removed**: General's "Project Lead" picker (and the `loadOrganizationMembers` fetch that only existed to populate it) — it read/wrote the older `projects.owner_profile_id`, which is not the same field as Team's real `project_memberships.project_role` (see Team below, and Technical Debt for the resulting `owner_profile_id` boundary this leaves around `ProjectSummary.owner`, still used by the `/projects` list's Lead column/filter and Member's "My Projects"). Project Lead is now set exclusively via Team's "Make Project Lead" action.

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

All data is correctly scoped to the active `slug` (tickets, team, activity) — only the header's title/description text is still fixed to "Mobile Banking App" regardless of slug, matching the Admin and Project Lead variants.

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

Still fully mock — a delivery-focused rebuild with no revenue, invoicing, hourly-rate, or billing-by-client concepts: delivery-labeled KPIs, a **Capacity Risk** card (who's over/near capacity) in place of "Team Capacity", the same Hours Missing reminder, and a Timesheets table scoped to the Lead's own team. Unaffected by the Admin/Member screen becoming real; still imports `mock-time-tracking.ts` directly, and reuses three now-mock-only exports (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) kept alive in `time-tracking-screen.tsx` specifically for this one remaining consumer.

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

Completed. Route: `/` (root). The root no longer redirects to `/projects`. `DashboardScreen` now branches by role — Admin, Project Lead, and Member each see a distinct, purpose-built dashboard rather than a filtered version of one screen. Shared building blocks (KPI card, hero card styles, section container, `RecentActivityList`, `ActiveTicketRow`) live in `dashboard-shared.tsx`. **All three dashboards — Admin, Project Lead, and Member — are now backed by real Supabase data end-to-end — confirmed working against a live Supabase project.**

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
- **Current Delivery** hero card — Delivery Progress, Completed Tickets, Remaining Hours (estimated hours of active tickets minus real logged minutes, floored at 0), Blocked Tickets — all real
- **Target Date** — the nearest due date among the project's own active tickets (previously read an unrelated Project Settings field)
- **Attention Required** — Blocked Tickets, Due Today, Over Capacity, Awaiting Review — all real
- **Team Capacity** — the real project roster with real assigned hours/utilization, sorted by utilization descending, real empty state
- **Project Work** (renamed from "My Active Work" once it stopped being scoped to just the signed-in lead) — every active ticket in the project regardless of assignee, sorted blocked-first/priority/due date
- **Recent Activity** — real, from any project member, not just the signed-in lead
- **Upcoming Deadlines** — real, from any assignee, with real overdue styling
- Quick actions: **Add Member** opens `AddTeamMemberModal` directly against the selected project (no detour through the Team page); **New Note** opens `NewNoteModal`; **New Ticket** opens `NewTicketModal` (with real Possible Duplicates) — all three reuse the exact modals/services Team/Notes/Tickets already use

#### Member — `member-dashboard.tsx`

A personal cross-project work-queue rather than a project-management view. **Now backed by real Supabase data end-to-end — confirmed working against a live Supabase project**, following the same real-load-state/Retry convention as every other real screen.

- Header: real greeting + real current date (previously the hardcoded string "Tuesday, June 30")
- 4 hero stats — Assigned Tickets, Weekly Capacity (renamed from a hardcoded "Planned Today"), Logged Today, Due Today — all real
- Recommended Next (hero card) — real, sorted by the same Blocked → Due Today → High Priority → In Progress → Ready to Start → In Review tiering, now driven by the real current local date instead of a fixed mock date/label set
- My Active Work — real tickets assigned to the signed-in member (excluding Done), priority-first, reuses ticket/status components
- Time Today — real, with a real per-project breakdown of today's logged time, plus Logged Today / Weekly Capacity / Remaining This Week
- Needs Your Attention — real, actionable-only events (blocked, reassigned to you, moved to review, estimate changed) sourced from `ticket_activity`; the mock "mention" category has no real source in this schema (comments aren't parsed for @mentions) and simply never populates, never fabricated
- Upcoming Work — real
- Real empty states throughout ("You're all clear," "Nothing needs your attention right now," "No time logged yet today," "Nothing else on the horizon")
- `TicketListRow` / `ActiveTicketRow` gained an optional `projectBadge` slot so multi-project rows can show which project a ticket belongs to
- `MEMBER_WORK`/`WorkItem` (the old mock array) stay defined/exported in this same file only because `member-projects-screen.tsx` ("My Projects") still reads them directly — out of scope for this pass, see Technical Debt

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

- The Project Lead's and Member's own Project Overview (`project-lead-project-overview.tsx`/`project-overview.tsx`) — still import `src/lib/mock-projects.ts`/`mock-team.ts` directly and still create/view tickets against local mock state, even though the **Admin** variant is now real
- The Project Lead's own scoped Reports view (`project-lead-reports-screen.tsx`) — a separate component from the now-real company-wide Reports and per-project Reports, still fully mock
- The Project Lead's own scoped Time Tracking view (`project-lead-time-tracking-screen.tsx`) — a separate component from the now-real Admin/Member `time-tracking-screen.tsx`, still fully mock
- `member-projects-screen.tsx` ("My Projects") — still reads `MEMBER_WORK` mock data directly, unaffected by the Member Dashboard becoming real; also still surfaces a project's lead via `ProjectSummary.owner` (`projects.owner_profile_id`), not Team's real `project_memberships.project_role`
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

Current architecture follows a frontend-first approach, with Auth/Profile, Projects, Tickets, Team, Project Notes, the Admin/Project Lead/Member Dashboards, company-wide Reports (Admin role), the **Admin** Project Overview, per-project Reports, Time Tracking (Admin/Member), and Users as real exceptions — see below. Auth/Profile through company-wide Reports are confirmed live; the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), the Dashboard's new org-wide Activity History page, and Users are all implemented against the same schema but not yet confirmed live (see the two backend-integration lists below).

Current stack:

- Next.js 16.2.9
- React 19
- TypeScript
- TailwindCSS v4
- `@supabase/supabase-js` — used by `src/lib/auth.ts`, `src/lib/membership.ts`, `src/lib/avatar-upload.ts`, `src/lib/projects.ts`, `src/lib/tickets.ts`, `src/lib/notes.ts`, and `src/lib/users.ts`, plus the service-role admin client each file under `src/lib/server/*.ts` builds for its own Server Action

Not installed:

- shadcn/ui (referenced in earlier documentation but not present in `package.json`)

Current data source:

- **Real Supabase, confirmed live**: authentication/session, `profiles`, `organization_memberships` (read path, plus the Dashboards' and Reports' org-wide reads), `organizations`, the `avatars` Storage bucket, `projects`, `clients`, `tickets`, `ticket_comments`, `ticket_activity`, `labels`, `ticket_attachments` (+ the `ticket-attachments` Storage bucket), `ticket_time_entries`, `ticket_relations`, `project_memberships` (roster reads, `project_role`, Add/Remove Member, the auto-membership trigger, the history guard, and the Work History RPCs — backing `/projects/[slug]/team` and the Project Lead Dashboard's Team Capacity), `project_notes`, and `project_note_activity` (written by triggers, not yet read by any UI). Real coverage of `projects` is scoped to the Sidebar, the `/projects` list, `/projects/[slug]/settings` (whose General section no longer has a "Project Lead" field/picker — see Current Sprint → Completed → Projects → Project Settings), the **Admin** Project Overview, and per-project Reports — the Project Lead's and Member's own Project Overview still read `mock-projects.ts` directly. Real coverage of `tickets` is scoped to the five list views (with real filtering, plus a real URL-persisted status/alert filter), New Ticket creation, the full Ticket Detail page, Related Tickets, the editable Quick Ticket Preview, all three Dashboards (org-wide/per-project/per-member scoped), company-wide Reports (org-wide, Admin role), the Admin Project Overview (including its new paginated Project Activity history page), per-project Reports, and Time Tracking for the Admin/Member roles — the Project Lead's own Project Overview still creates/views tickets against local mock state instead, and the Project Lead's own scoped Reports view and own scoped Time Tracking view are still mock.
- **Real Supabase, implemented but not yet confirmed live**: the write side of `organization_memberships` (Disable/Enable/Edit/invite acceptance, all via Server Actions using the service-role key) backing `/users`; the read-side queries backing the **Admin** Project Overview and per-project Reports; Time Tracking for the Admin/Member roles (`time-tracking-screen.tsx` — real KPIs/filters/Timesheets/Billing by Client, reusing Reports → Finance's own billing functions); and the Dashboard's new org-wide Activity History page (`/activity`) behind Recent Activity's "View all activity →" action (all of these reuse already-confirmed-live tables/functions, but haven't themselves been clicked through in a browser). See the second backend-integration list below.
- **Mock data** (everything else): `src/lib/mock-projects.ts` (still the source for the Project Lead's/Member's own Project Overview), `src/lib/mock-tickets.ts` (still supplies the `Ticket` type/`getTicketDisplayKey` helper the real Tickets/Dashboard/Reports/Project-Overview/Project-Reports/Time-Tracking code builds on, and remains the actual data source for the Project Lead's Project Overview's local ticket state), `src/lib/mock-team.ts` (still the source everywhere *except* `/projects/[slug]/team`, the Project Lead Dashboard's Team Capacity, and per-project Reports — see above), `src/lib/mock-notes.ts` (kept as a type-only module now, no data source role left), `src/lib/mock-time-tracking.ts` (kept only for the still-mock Project Lead Time Tracking view — see Current Sprint → Completed → Hours & Time Tracking), `member-dashboard.tsx`'s own `MEMBER_WORK` array (kept only because `member-projects-screen.tsx` still reads it directly), and the other `src/lib/mock-*.ts` files; module-level constants in screen components.

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

Everything except Auth/Profile/Avatar, Projects (Sidebar/`/projects`/Project Settings), Tickets (five list views/New Ticket/Ticket Detail/Related Tickets/editable Preview/the real status filter), Team, Project Notes, the Admin/Project Lead/Member Dashboards, company-wide Reports (Admin role), the **Admin** Project Overview, per-project Reports, Time Tracking (Admin/Member), and Users still runs entirely on mock data — the Project Lead's and Member's own Project Overview, the Project Lead's own scoped Reports view, the Project Lead's own scoped Time Tracking view, `member-projects-screen.tsx` ("My Projects"), and the rest of Settings are not connected. Users, the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new Activity History page are all implemented against the real schema but not yet confirmed against a live project — see the list above. Note also that Projects' own real rows still don't populate `openTickets`/`blockedTickets`/`overdueTickets`/`awaitingReviewTickets`/`dueThisWeekTickets`/`activeMilestones` — those are derived from `tickets` by design and default to 0 on the Projects list/Project Settings screens even though Tickets itself is now real, since nothing yet re-aggregates those derived fields back onto the `projects` rows (see `docs/SUPABASE_MVP_SCHEMA.md`); the Admin Project Overview and per-project Reports both work around this by computing Progress/KPIs directly from real tickets at read time instead of relying on those stored-but-unpopulated fields. Also note that Project Settings' removed "Project Lead" field leaves `projects.owner_profile_id` with no remaining writer anywhere in the app — `ProjectSummary.owner` (still `owner_profile_id`-backed) is what the `/projects` list's own Lead column/filter and Member's "My Projects" display, and neither was migrated to Team's real `project_memberships.project_role` as part of this change — see Technical Debt.

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
- `/projects/[slug]` — Admin variant real end-to-end; Project Lead/Member variants still mock
- `/projects/[slug]/tickets`
- `/projects/[slug]/tickets/[ticketCode]`
- `/projects/[slug]/notes`
- `/projects/[slug]/team` — Admin/Project Lead only (real roster, Add/Remove Member)
- `/projects/[slug]/team/[userId]/work-history` — dedicated, server-side-paginated Work History page
- `/projects/[slug]/activity` — dedicated, server-side-paginated Project Activity history page (new)
- `/projects/[slug]/reports` — real end-to-end, every role
- `/projects/[slug]/settings` — Admin/Project Lead only (per-project General/Billing/Danger Zone)
- `/reports` — role-specific (Admin company-wide / Project Lead scoped Delivery+Team / Member: no access)
- `/time-tracking` — role-specific (Admin/Member Billing/Finance view now real end-to-end / Project Lead delivery-focused view still mock / Member: no sidebar link, folded into My Work instead)
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

- `ProjectOverview`'s Member-role variant (the original, unmodified page) has hardcoded "Mobile Banking App" data; it does not dynamically load project data based on slug. The Admin and Project Lead rebuilds (`admin-project-overview.tsx`, `project-lead-project-overview.tsx`) correctly key off `slug`.
- **Resolved**: Assigned/Priority/Status filter dropdowns and the 5 quick-filter chips on the Tickets page, plus the "Add Filter" menu (Labels/Due Date/Reporter/Created Date/Updated Date), all now really filter the ticket list, combined with AND — see Current Sprint → Completed → Tickets → Filter Bar.
- New Ticket's "More Options" fields (Type, Status, Priority, Labels, Due Date) always write fixed defaults (`backlog`/`medium`/`task`/none — Status changed from `to_do` to `backlog`, matching the database column's own default), never the value picked in the form.
- **Resolved for rename/delete**: Ticket Attachment rename and delete are now real and persisted (Storage + metadata row). "Replace File" was removed from the menu entirely rather than left as a mock stub. Editing or deleting a *Comment* is still local-only — not persisted to Supabase.
- Milestone and Story Points fields on Ticket Detail's sidebar are dead code — defined in `ticket-detail-screen.tsx` but never rendered.
- **Resolved for the Admin role**: the Admin Project Overview now creates/views real tickets against the same real Tickets data as everywhere else. The Project Lead's own Project Overview still creates/views tickets via `NewTicketModal`/`TicketDetailScreen` against local mock ticket state.
- `settings-screen.tsx` (`SettingsScreen` hub component) is retained but no longer rendered — `/settings` redirects directly to `/settings/general`.
- Org-wide Settings (`/settings/*`) toggles and fields are visual only; no state persists between page loads. (Project Settings — `/projects/[slug]/settings` — is the one exception: it's real and persists, see Current Sprint → Completed → Project Settings.)
- Role now comes from a real `organization_membership` when one exists; `current-user.ts`'s mock identities are a dev-only fallback (never in production) rather than the only source of truth. **Resolved**: the `RoleSwitcher` is now gated behind `isDevFallback` (only renders, with a visible "Dev fallback" badge, when there's no real membership) instead of always showing. No real server-side permission enforcement is wired into the UI yet for projects/tickets/etc. — the RLS policies in `supabase/migrations/20260708000000_mvp_schema.sql` are applied and enforce tenant isolation at the DB layer, but the UI doesn't call any of those tables yet.
- **Resolved**: Note "Duplicate" and "Delete" menu actions in `NoteDetailModal` are now real (`duplicateNote`/`deleteNote`), no longer visual stubs — see Current Sprint → Completed → Project Notes.
- In dev fallback only (no real organization membership — never in production): the Projects list no longer filters by the old `LEAD_PROJECT_SLUGS` array (removed since real data is scoped by RLS instead), so a Project Lead testing without a seeded Supabase project now sees the full mock projects list rather than just their 3 owned slugs, while the summary cells (Blocked Tickets, Due This Week, Team Members Over Capacity) still compute against the `LEAD_PROJECT_SLUGS`-scoped team aggregation — a minor mismatch specific to unauthenticated/dev-fallback local testing, not the real-org path.
- Projects' real rows don't populate ticket-derived fields (`openTickets`, `blockedTickets`, `overdueTickets`, `awaitingReviewTickets`, `dueThisWeekTickets`, `progress`, `activeMilestones`) — by schema design these are derived from `tickets` and default to 0, and nothing yet re-aggregates them back onto the `projects` rows even though Tickets itself is now real (see `docs/SUPABASE_MVP_SCHEMA.md`), so the Projects list currently shows 0/empty progress bars for real projects on those specific fields.
- **Users is implemented and passes `tsc`/`eslint`/`next build`, but has never been run against a live Supabase project or clicked through in a browser** — treat as "should work, not yet verified" until that verification pass happens (Team carried this same caveat as of the last update; it's since been confirmed live — see Architecture Status).
- The Users list's inline Weekly Capacity cell (`CapacityCell`) still calls `updateOrganizationMember`, a direct client write — the same "permission denied for table organization_memberships" every other Users write used to hit before it got its own Server Action. Intentionally left as-is; it has no Server Action yet.
- Resend Invitation (Users row menu) is still toast-only — no real resend path exists.
- Editing a user's email — the Edit User form still shows the field but never persists a change to it; only first/last name, role, and weekly capacity are real writes.
- `browser`/`os`/`device` on the Security tab have no real source and simply don't render.
- Per-person availability `status` (Available/Busy/Away) on Team has no real source anywhere in the app — every real member shows a fixed "Available".
- The Notes Tag field is fully interactive in the UI but never persisted — no `project_notes` column exists for it, same "still mock" precedent as New Ticket's "More Options" fields.
- `project_note_activity` is written by real database triggers on every note create/update/delete, but no screen reads it yet — there is no Notes Activity view.
- The Member Dashboard's "Needs Your Attention" mock "mention" event category has no real source in this schema — comments aren't parsed for @mentions — so it stays a defined type but is never populated, the same "kept but unreachable until real data exists" precedent as the Notes Tag field above.
- `member-projects-screen.tsx` ("My Projects," Member role) still reads `MEMBER_WORK` mock data directly from `member-dashboard.tsx`, unaffected by the Member Dashboard itself becoming real.
- `project-lead-reports-screen.tsx` (the Project Lead's own scoped Reports view) is a separate component from `reports-screen.tsx` and remains fully mock, unaffected by company-wide Reports becoming real.
- `project-lead-time-tracking-screen.tsx` (the Project Lead's own scoped Time Tracking view) is a separate component from `time-tracking-screen.tsx` and remains fully mock, unaffected by the Admin/Member screen becoming real — it keeps three exports (`MEMBER_GROUPS`/`PROJECT_GROUPS`/`CLIENT_GROUPS`) alive in the now-real file solely for this one remaining consumer.
- **New**: Project Settings' "Project Lead" field/picker was removed outright (it read/wrote `projects.owner_profile_id`). This is a targeted removal, not a full migration off that column: `ProjectSummary.owner` (still `owner_profile_id`-backed) is what the `/projects` list's own Lead column/filter and `member-projects-screen.tsx`'s ("My Projects") "who leads this project" display still read — neither was touched, so `owner_profile_id` now has no remaining writer anywhere in the app, while Team's real `project_memberships.project_role` (set via "Make Project Lead") has its own separate writer and is what Project Overview/Team/the Dashboards already show. Reconciling `ProjectSummary.owner` onto the real `project_role` instead of the legacy column is unresolved.
- **New**: the Admin Dashboard's Recent Activity "View all activity →" action and its new org-wide `/activity` page, and Time Tracking's Admin/Member screen becoming real, haven't themselves been clicked through in a live browser yet — same "should work, not yet verified" caveat as Users/the Admin Project Overview/per-project Reports.

Planned future work:

- Live verification of Users, the **Admin** Project Overview (including its new Project Activity history page), per-project Reports, Time Tracking (Admin/Member), and the Dashboard's new Activity History page against a real Supabase project (click through each in a browser) — the immediate next step, ahead of any new backend seam
- Backend integration for the Project Lead's own Project Overview, the Member's own Project Overview, the Project Lead's own scoped Reports view, the Project Lead's own scoped Time Tracking view, `member-projects-screen.tsx`, and Settings (Auth/Profile/Avatar, Projects' Sidebar/`/projects`/Settings, Tickets, Team, Project Notes, all three Dashboards, company-wide Reports, the Admin Project Overview, per-project Reports, Time Tracking (Admin/Member), and Users are done — see Architecture Status; schema for the rest is designed in `docs/SUPABASE_MVP_SCHEMA.md` and applied via the migrations in `supabase/migrations/`, just not queried by the UI yet)
- Reconciling `ProjectSummary.owner`/`projects.owner_profile_id` (still read by `/projects` and "My Projects") onto Team's real `project_memberships.project_role`, now that Project Settings no longer writes the former at all
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
2. Live-verification pass for Users, the Admin Project Overview, and per-project Reports

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
