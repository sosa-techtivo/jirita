> Last Updated: August 10, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, a role-based UX layer (Admin / Project Lead / Member), projects listing, role-specific project overviews, a five-view Tickets experience with Task/Bug ticket types and real search/filters, an editable Quick Ticket Preview, Full Ticket Detail with Time Tracking, real Related Tickets, and a real Attachments flow (upload/rename/delete/download/Preview), role-specific Dashboards, role-specific Projects/Reports/Time Tracking screens, a personal My Work workspace, an editable Notes experience, a Settings section, a per-project Settings screen, a per-project Team screen with a dedicated Work History page, a dedicated Admin-only Users management module, a real Supabase Auth flow (Login/Logout/Forgot/Reset/Change Password) with a Profile page that saves real data, and a single shared Member Profile Modal (now with real per-project ticket metrics, real Activity/Security tabs in user mode, and real project-membership actions in project mode) used everywhere a person is referenced. Auth/Profile, Projects (Sidebar, the `/projects` list, and per-project Settings), and Tickets (all five list views with real filtering, New Ticket creation, the full Ticket Detail page, Related Tickets, and the editable Quick Ticket Preview) are confirmed backed by a live Supabase project end-to-end. Users (list, Invite by email/link, Disable/Enable, Edit, Reset Password link, Activity/Security tabs) and Project → Team (roster, auto-membership on contribution, Add/Remove Member, paginated Work History) are also fully wired to the same Supabase schema, but not yet confirmed against a live project or in a browser — see Architecture Status. Every other screen is still navigable and connected using mock data — see Architecture Status.

The current objective is to complete the remaining frontend experience while continuing backend integration. Auth, profile/organization-membership data, avatar upload, and change password are confirmed working end-to-end against a live Supabase project. Projects has followed the same path: Sidebar, the `/projects` list, and `/projects/[slug]/settings` now read and write real project rows (create, edit, archive/restore, and per-project Settings' General/Billing fields, including a minimal real Clients roster). Tickets has now followed the same path too and gone further: the five list views (with real search, Assigned/Priority/Status filters, quick-filter chips, and the "Add Filter" menu — Labels/Due Date/Reporter/Created Date/Updated Date — all combining with AND), New Ticket creation, the full Ticket Detail page (inline edits, Labels, Acceptance Criteria, Attachments including rename/delete/download/Preview, Time Tracking, Comments, Related Tickets, and a real trigger-driven Activity Log), and the Quick Ticket Preview panel (now editable when opened from the Tickets board) all read and write real ticket rows. Ticket priority is a 4-value scale (Highest/High/Medium/Low) — the old "Normal" value was fully migrated and removed from the database, not just hidden in the UI. Every Ticket write path now surfaces failures to the user (a shared error toast) instead of only logging to the console, and rolls back optimistic edits that didn't actually save. Users and Project → Team have since followed the same real-data path — Users' list, Invite (email or generated link), Disable/Enable, Edit, a generated Reset Password link, and the Member Profile Modal's Activity/Security tabs all read/write real Supabase data via Server Actions (`organization_memberships` has no direct `authenticated` grant, so every privileged write goes through a service-role Server Action that re-verifies the caller server-side); Team's roster, auto-membership-on-contribution, Add/Remove Member (with a database-level history guard), and a new server-side-paginated Work History page do the same. Both are implemented and pass `tsc`/`eslint`/`next build`, but neither has been exercised against a live Supabase project or in a browser yet, and none of their migrations have been applied to a live project — treat them as "should work, not yet verified." Project Overview, Notes, per-project Reports, Dashboard, company-wide Reports, and the rest of Settings are still mock data — see Architecture Status.

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

- **General**: Project Name, Description, Project Code, Status (excludes `archived` — that transition only ever happens via the reused Archive/Restore flow, never a parallel path here), Project Lead (a real picker over the organization's active members)
- **Billing**: Project Category (Client/Internal toggle), Client (a real per-organization roster — see "+ Add new client" below), Billing Rate. The Billable/Non-Billable-by-default note stays derived from Category, not a stored field
- A single **Save Changes** button (didn't exist before) persists only the fields this screen manages; the breadcrumb (`ProjectSettingsBreadcrumb`) reads the live project name from the same shared provider Sidebar/`/projects` use, so a rename shows up there immediately too
- **+ Add new client** (`add-client-modal.tsx`): minimal name-only creation, backed by a new `clients` table (see Architecture Status) — created immediately and selected in the form; persisted to the project on the next Save like any other field. Basic per-organization duplicate names are rejected.
- Danger Zone's Archive/Restore reuses `archive-project-modal.tsx`/`restoreProject` exactly as on the Projects list — no separate implementation

### Project Overview

Completed. Route: `/projects/[slug]`. `ProjectOverview` now branches by role rather than showing one page to everyone — Admin, Project Lead, and Member each get a purpose-built rebuild.

#### Admin — `admin-project-overview.tsx`

An executive dashboard: KPI strip (Open Tickets, Progress with inline bar, Blocked, Closed This Month), Project Health card (Schedule / Capacity / Scope / Risks, each with a status dot and one-line reason — the top alert banner deep-links into Tickets pre-filtered to Blocked), Active Work grouped by status with per-group ticket counts, Team card, and Project Activity feed.

Every Project Health row is a drill-down, not a static status: **Schedule** opens Tickets pre-filtered to Blocked, **Capacity** opens the over-capacity member's Member Profile Modal, **Risks** opens the ticket(s) causing the risk in the Ticket Preview Panel, and **Scope** falls back to the plain Tickets page (no scope-change event data model exists yet). Rows share a hover affordance (light background highlight) and the card's layout is otherwise unchanged.

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

Completed, and now backed by real Supabase data end-to-end — **implemented and build/type-checked, but not yet confirmed against a live Supabase project or in a browser**, and none of this section's migrations have been applied to a live project yet (see Architecture Status). Route: `/projects/[slug]/team`, Admin/Project Lead only. Real replacement for `mock-team.ts`'s `getTeamByProjectSlug` on this screen only — the Member Profile Modal's per-project single-view mode, `resolveTeamMember`, and ticket assignees/comment authors/activity-feed actors elsewhere in the app are untouched.

- **Team membership is now (mostly) automatic.** A database trigger creates a real `project_memberships` row the first time someone creates a ticket, edits one, comments, logs time, uploads an attachment, or links a ticket — never merely by viewing. It's the only way a plain Member (who has no direct `INSERT` grant on `project_memberships`) ends up staffed on a project; a backfill covers contributions that predate the trigger.
- `src/components/team-screen.tsx` — real roster (name/email/avatar/title/weekly capacity) plus real KPIs (Team Members, Weekly Capacity, Assigned Hours, Team Utilization) all derived live from the same member list, never stored/stale. "+ Add Member" opens `add-team-member-modal.tsx`, a picker over real org members not already on the team.
- **"Remove from Project" is conditional and DB-enforced.** It's only offered when the member has no real history on the project (created/assigned/commented/logged time/uploaded/related a ticket) — never rendered disabled, simply omitted — and a `BEFORE DELETE` database trigger independently blocks the delete outright if history exists, regardless of how the delete is invoked. "Send Message" was removed from the member menu (no messaging system exists).
- Removing a member from the globally-mounted Member Profile Modal is picked up by this screen immediately, without a manual reload or polling — a `window` `CustomEvent` dispatched only after the server confirms the delete, which both filters the member out of local state right away and triggers a real refetch (avoiding a stale in-flight fetch resurrecting the removed member).
- **"View Work History" is now a dedicated page**, not a modal: `/projects/[slug]/team/[userId]/work-history` — "which tickets has this person worked on in this project," with real **server-side** pagination (20/page, `?page=` in the URL, Previous/Next) via two Postgres RPCs, so a history that grows into the hundreds/thousands of tickets is never fetched whole into a modal. A requested page past the end resolves to the last real page. Clicking a ticket opens the real Ticket Detail route directly.
- Fixed a `NaN%`/`Infinity%` utilization bug: a 0-capacity member's utilization/capacity-bar math now normalizes to finite, non-negative numbers first, so it always shows `0%` instead of `NaN%`/`Infinity%` (over-100% allocation is still shown as-is in text).
- Per-person availability `status` (Available/Busy/Away) has no real source yet — every real member shows a fixed "Available".

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
- **Editable, when opened from the Tickets board**: Title, Status, Priority, Assignee, Estimated, Due Date, and Labels can all be edited inline, right from the panel — same persistence (`updateTicket`) and same real Activity Log as the full Ticket Detail page, so an edit here and an edit there always agree. Description and Acceptance Criteria stay read-only. This is opt-in per caller (an `editable` prop) — the ~9 other places this same panel is used (Dashboard, Reports, Project Overview, etc., all still on mock data) are unaffected and remain read-only exactly as before.

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
- Admin/Project Lead Project Overview still create/view tickets via `NewTicketModal`/`TicketDetailScreen` against their own local mock ticket state — real Tickets data doesn't reach those two screens yet

#### Navigation & State Restoration

When clicking **Expand** from the preview panel, the tickets screen state is saved to sessionStorage before navigating. On return (back button), the screen restores: active view, filter chips, search query, scroll position, and the same preview ticket reopened.

### Hours & Time Tracking

Completed. Route: `/time-tracking`, branches by role. Personal time logging always happens the same way regardless of role — the "Log Time" button on a ticket in Ticket Detail.

#### Admin — `time-tracking-screen.tsx`

Full Billing/Finance view: period selector (Today/This Week/This Month/Custom Range), overview KPIs, Member/Project/Client/Billing filters, Timesheets table, Hours Missing operational reminder, Billing by Client and Billing by Member tables.

#### Project Lead — `project-lead-time-tracking-screen.tsx` (new)

A delivery-focused rebuild with no revenue, invoicing, hourly-rate, or billing-by-client concepts: delivery-labeled KPIs, a **Capacity Risk** card (who's over/near capacity) in place of "Team Capacity", the same Hours Missing reminder, and a Timesheets table scoped to the Lead's own team.

#### Member — no dedicated module

Members have no Time Tracking nav item. A compact "My Time" summary row plus a "View Timesheet" link (`personal-timesheet-panel.tsx`) live inside My Work instead.

Time Tracking is also integrated into the Ticket Detail page for logging against a specific ticket. This ticket-level piece is now backed by real Supabase data (`loadTicketTimeEntries`/`logTicketTime` in `src/lib/tickets.ts`, minutes as the canonical stored unit) — see Tickets → Backend Integration. The standalone Admin/Project Lead `/time-tracking` screens above are unaffected and still use mock data.

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

Completed. Route: `/` (root). The root no longer redirects to `/projects`. `DashboardScreen` now branches by role — Admin, Project Lead, and Member each see a distinct, purpose-built dashboard rather than a filtered version of one screen. Shared building blocks (KPI card, hero card styles, section container) live in `dashboard-shared.tsx`.

#### Admin (default company-wide view)

- Header: "Good morning, Marcus 👋" + date
- Quick actions: `+ New Ticket`, `Projects`, `Reports`
- 4 KPI cards: Assigned (14), Hours Burn (212/320h with progress bar), Blocked (11, red), Due Today (3)
- Insights band: 4 items with level-coded icons (critical / warning / ok)
- Two-column layout (`xl:grid-cols-[1fr_320px]`):
  - Left: My Active Work (5 tickets, click-to-preview) + Recent Activity
  - Right: Projects at Risk + Team Workload (progress bars) + Upcoming Deadlines
- Ticket quick-preview panel on row click (reuses `TicketPreviewPanel`)

#### Project Lead — `project-lead-dashboard.tsx`

Built from first principles, not a filtered Admin view.

- **Project Context selector**: scope the whole dashboard to one owned project, or aggregate across all owned projects
- Delivery Health hero card
- Attention Required section
- Team Capacity list — clickable, opens the real Team Member modal
- Recent Activity
- Upcoming Deadlines
- Delivery, capacity, activity, and deadlines all merge correctly when scoped to "all projects"

#### Member — `member-dashboard.tsx`

A personal cross-project work-queue rather than a project-management view.

- Recommended Next (hero card)
- Active Work — priority-first, reuses ticket/status components
- Time Today — with per-project breakdown
- Needs Your Attention — actionable-only events (no passive noise)
- Upcoming Work
- `TicketListRow` / `ActiveTicketRow` gained an optional `projectBadge` slot so multi-project rows can show which project a ticket belongs to

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

Company-wide Delivery/Finance view.

- KPI summary row: Projects, Active Tickets, Estimated Hours, Completed Hours, Blocked, Completed This Month, Overdue
- Hours by Person: horizontal bar chart with avatars
- Project Health table: status badges, progress bars, ticket counts
- Team Workload: capacity bars per member
- Insights band reused from `ReportStatusBar`

#### Project Lead — `project-lead-reports-screen.tsx` (new)

A purpose-built Reports screen scoped to only the Lead's own projects and team — not the Admin's company-wide view.

- **Delivery** tab
- **Team** tab

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

### Notes — Detail & Edit Modal

Completed.

Route: `/projects/[slug]/notes`.

Added a `NoteDetailModal` (`src/components/note-detail-modal.tsx`) opened by clicking a note card:

- **View mode**: full title, author, updated timestamp, tag badge, full body text
- **Edit mode**: editable title, tag picker, body textarea; entered via a per-note "⋯" menu (Edit / Duplicate / Delete — Duplicate and Delete are visual-only stubs)
- Save appends `"Just now"` as the updated timestamp and returns to view mode
- Shared primitives (`TAG_OPTIONS`, `TagBadge`, `INPUT`, `FIELD_LABEL`) extracted into `notes-shared.tsx` so the modal and the notes list use identical tag styling
- Modal animation: fade + scale-in backdrop, ESC-to-close, `overflow: hidden` on `document.body` while open

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

Nothing currently in progress. Auth/profile/avatar, Projects (Sidebar, `/projects`, per-project Settings), and Tickets (five list views with real filtering, New Ticket, full Ticket Detail, Related Tickets, the editable Quick Ticket Preview, and real write-path error handling) backend integration are all done and confirmed working — see Current Sprint → Completed → Authentication & Profile / Projects / Project Settings / Tickets. Users and Team backend integration (see Current Sprint → Completed → Users / Team) is also implemented and build/type-checked, but still needs to be exercised against a live Supabase project and clicked through in a browser before it can be called confirmed — that verification pass is the immediate next step, ahead of any new feature. After that, the next candidate is one of the remaining mock-to-real seams — see Next Recommended Feature. The Unfuddle → Jirita import is specified (`docs/UNFUDDLE_IMPORT_SPECIFICATION.md`) but no importer code exists yet.

---

# Not Implemented

The following features are documented as planned but do not exist in the codebase yet.

### Authentication

- Register / Sign Up screen (no self-service account creation — accounts are provisioned directly in Supabase; see `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` for the eventual bulk-provisioning path)

Login, Logout, Forgot Password, Reset Password, Change Password, and real server-verified session persistence (a real Supabase session, not a mock `localStorage` flag) are implemented — see Current Sprint → Completed → Authentication & Profile. Invitations (inviting a new user to an organization, by email or by generated link) are also implemented, from `/users` — see Current Sprint → Completed → Users — though like the rest of that module, not yet confirmed against a live project.

### Sidebar Navigation

No known dead links remain. Milestones was removed from the UI entirely for MVP. Per-project Notes, Team, and Reports are real, functional routes (`/projects/[slug]/notes`, `/team`, `/reports`), gated per role via `nav-config.ts` rather than hardcoded. Team itself is now backed by real Supabase data — see Current Sprint → Completed → Team.

All top-level navigation items (Dashboard, My Work, Projects, Reports, Settings) are functional, and each renders a role-specific screen where applicable (Dashboard, Projects, Reports).

---

# Next Recommended Feature

First priority: confirm Users and Team against a real, live Supabase project (apply the pending migrations, click through both modules in a browser) — they're implemented and type-checked but unverified, see Current Sprint → Completed → Users / Team and Architecture Status.

After that, continue the Supabase backend work already underway, following the same pattern established for profiles/organization_memberships, Projects, Tickets, Users, and Team (real query + minimum-privilege grants/Server Actions + RLS, with a dev-only mock fallback until fully connected). (Authentication, Ticket editing, Tickets' filters/Related Tickets/editable Preview, real write-path error handling, Users, and Team, previously recommended here, are now all complete — Users/Team pending only the live-verification pass above.)

The natural next mock-to-real seams:

- Project Overview, Notes, and per-project Reports — still import `src/lib/mock-projects.ts` directly even though Tickets and Team are now real; wiring these would also let Project Overview/per-project Reports/Dashboard pick up real ticket-derived numbers instead of the `openTickets`/`blockedTickets`/`progress`/etc. fields Projects' own real rows still default to 0 (see Architecture Status)
- Dashboard and company-wide Reports — still fully mock, no real data wired at all yet

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

Current architecture follows a frontend-first approach, with Auth/Profile, Projects, Tickets, Users, and Team as real exceptions — see below. Auth/Profile, Projects, and Tickets are confirmed live; Users and Team are implemented against the same schema but not yet confirmed live (see the two backend-integration lists below).

Current stack:

- Next.js 16.2.9
- React 19
- TypeScript
- TailwindCSS v4
- `@supabase/supabase-js` — used by `src/lib/auth.ts`, `src/lib/membership.ts`, `src/lib/avatar-upload.ts`, `src/lib/projects.ts`, `src/lib/tickets.ts`, and `src/lib/users.ts`, plus the service-role admin client each file under `src/lib/server/*.ts` builds for its own Server Action

Not installed:

- shadcn/ui (referenced in earlier documentation but not present in `package.json`)

Current data source:

- **Real Supabase, confirmed live**: authentication/session, `profiles`, `organization_memberships` (read path), `organizations`, the `avatars` Storage bucket, `projects`, `clients`, `tickets`, `ticket_comments`, `ticket_activity`, `labels`, `ticket_attachments` (+ the `ticket-attachments` Storage bucket), `ticket_time_entries`, and `ticket_relations`. Real coverage of `projects` is scoped to the Sidebar, the `/projects` list, and `/projects/[slug]/settings` only — Project Overview, Notes, and per-project Reports still read `mock-projects.ts` directly. Real coverage of `tickets` is scoped to the five list views (with real filtering), New Ticket creation, the full Ticket Detail page, Related Tickets, and the editable Quick Ticket Preview — Project Overview (Admin/Project Lead variants) still create/view tickets against local mock state instead.
- **Real Supabase, implemented but not yet confirmed live**: the write side of `organization_memberships` (Disable/Enable/Edit/invite acceptance, all via Server Actions using the service-role key) backing `/users`, and `project_memberships` (roster reads, Add/Remove Member, the auto-membership trigger, and the Work History RPCs) backing `/projects/[slug]/team`. See the second backend-integration list below.
- **Mock data** (everything else): `src/lib/mock-projects.ts` (still the source for Project Overview/Notes/per-project Reports), `src/lib/mock-tickets.ts` (still supplies the `Ticket` type/`getTicketDisplayKey` helper the real Tickets code builds on, and remains the actual data source for Project Overview's local ticket state), `src/lib/mock-team.ts` (still the source everywhere *except* `/projects/[slug]/team` itself — see above), and the other `src/lib/mock-*.ts` files; module-level constants in screen components.

Backend integration, connected and confirmed working:

- `src/lib/supabase-client.ts` — the lazy Supabase browser client, now imported by `auth.ts`/`membership.ts`/`avatar-upload.ts`/`projects.ts`/`tickets.ts`
- `src/lib/auth.ts` — login, logout, session (`onAuthStateChange`), forgot/reset password, and change password (verified via re-authentication, never a manual password comparison)
- `src/lib/membership.ts` — loads a signed-in user's `profiles` + active `organization_memberships` + `organizations` row, and writes real updates (name, weekly capacity via a security-definer RPC, avatar path)
- `src/lib/avatar-upload.ts` — client-side validate/resize (Canvas, no new dependency)/upload to Supabase Storage
- `src/components/current-user-provider.tsx` / `src/components/auth-guard.tsx` — real membership drives `CurrentUser` and route gating, with a dev-only mock fallback (never in production) so local dev isn't blocked on seeded data
- `src/lib/projects.ts` — all real Projects reads/writes: `loadOrganizationProjects` (org-scoped list, RLS decides who sees what — no client-side role filtering), `createProject`/`updateProject` (Projects list Create/Edit modal: name + description), `archiveProject`/`restoreProject` (status only), `loadProjectDetail`/`updateProjectSettings` (Project Settings' General/Billing fields — status writes here structurally exclude `"archived"`), `loadOrganizationMembers` (Project Lead picker), `loadOrganizationClients`/`createOrganizationClient` (Billing → Client roster)
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

Backend integration, implemented and type-checked, **not yet confirmed against a live Supabase project or in a browser** (Users, Team):

- `src/lib/users.ts` — `loadOrganizationUsers` (real roster + a real `lastLogin` via the Auth Admin API), `disableOrganizationMember`/`enableOrganizationMember`/`editOrganizationMember`/`inviteOrganizationUser`/`generateOrganizationInviteLink`/`generatePasswordResetLink` — every one of these delegates to its own Server Action rather than writing directly, since `organization_memberships` has no `UPDATE`/`INSERT` grant for `authenticated` at all
- `src/lib/server/invite-user-action.ts`, `disable-user-action.ts`, `edit-user-action.ts`, `last-sign-in-action.ts` — the Server Actions themselves: each builds a caller-authenticated client (identity/authorization check under real RLS) and a service-role client (the actual privileged write, only reached after authorization passes)
- `src/components/invite-user-modal.tsx`, `reset-password-link-modal.tsx`, `accept-invite-screen.tsx` — the email-vs-link invite choice, the shared "link generated" success modal, and the "set your password" landing page both invite methods resolve to
- `src/lib/projects.ts` — `loadProjectTeam`, `addProjectMember`, `removeProjectMember`, `hasProjectMemberHistory` — the real Team roster/roster-write functions
- `src/components/team-screen.tsx`, `add-team-member-modal.tsx`, `work-history-screen.tsx` — the real Team screen, its Add Member picker, and the dedicated server-side-paginated Work History page
- `src/lib/tickets.ts` — `loadUserActivity` (the Users Activity tab's grouped feed), `loadProjectMemberWorkHistorySummary`/`loadProjectMemberWorkHistoryPage` (the two Work History RPC wrappers)
- A database trigger (`ensure_project_membership`) auto-creates `project_memberships` rows on real contribution (create/edit/comment/log time/upload/link a ticket); a separate `BEFORE DELETE` trigger blocks removing a member with real history at the database level, independent of the UI
- Migrations, **none applied to a live project yet**: `20260807000000_grant_authenticated_project_memberships_write.sql`, `20260808000000_auto_project_membership_on_contribution.sql` (the trigger above + backfill), `20260809000000_project_membership_history_guard.sql` (the delete guard above), `20260810000000_project_member_work_history_pagination.sql` (the three Work History RPCs). (`20260803000000_add_project_creator_membership.sql`, `20260804000000_grant_authenticated_project_memberships_read.sql`, `20260805000000_accept_own_invitation_rpc.sql`, and `20260806000000_grant_service_role_public_schema.sql` are pre-existing and presumed already applied, since the behavior they back was already working before this round of work.)

Everything except Auth/Profile/Avatar, Projects (Sidebar/`/projects`/Project Settings), Tickets (five list views/New Ticket/Ticket Detail/Related Tickets/editable Preview), Users, and Team still runs entirely on mock data — Project Overview, Notes, per-project Reports, Dashboard, company-wide Reports, and the rest of Settings are not connected. Users and Team are implemented against the real schema but not yet confirmed against a live project — see the list above. Note also that Projects' own real rows still don't populate `openTickets`/`blockedTickets`/`overdueTickets`/`awaitingReviewTickets`/`dueThisWeekTickets`/`progress`/`activeMilestones` — those are derived from `tickets` by design and default to 0 on the Projects list/Project Settings screens even though Tickets itself is now real, since nothing yet re-aggregates those derived fields back onto the `projects` rows (see `docs/SUPABASE_MVP_SCHEMA.md`).

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
- `/projects/[slug]`
- `/projects/[slug]/tickets`
- `/projects/[slug]/tickets/[ticketCode]`
- `/projects/[slug]/notes`
- `/projects/[slug]/team` — Admin/Project Lead only (real roster, Add/Remove Member)
- `/projects/[slug]/team/[userId]/work-history` — dedicated, server-side-paginated Work History page
- `/projects/[slug]/reports`
- `/projects/[slug]/settings` — Admin/Project Lead only (per-project General/Billing/Danger Zone)
- `/reports` — role-specific (Admin company-wide / Project Lead scoped Delivery+Team / Member: no access)
- `/time-tracking` — role-specific (Admin Billing/Finance / Project Lead delivery-focused / Member: no access, folded into My Work instead)
- `/users` — Admin only (workspace-wide user account management, replaces the old `/settings/people`)
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
- New Ticket's "More Options" fields (Type, Status, Priority, Labels, Due Date) always write fixed defaults (`to_do`/`medium`/`task`/none), never the value picked in the form.
- **Resolved for rename/delete**: Ticket Attachment rename and delete are now real and persisted (Storage + metadata row). "Replace File" was removed from the menu entirely rather than left as a mock stub. Editing or deleting a *Comment* is still local-only — not persisted to Supabase.
- Milestone and Story Points fields on Ticket Detail's sidebar are dead code — defined in `ticket-detail-screen.tsx` but never rendered.
- Admin/Project Lead Project Overview still create/view tickets via `NewTicketModal`/`TicketDetailScreen` against their own local mock ticket state — real Tickets data doesn't reach those two screens yet.
- `settings-screen.tsx` (`SettingsScreen` hub component) is retained but no longer rendered — `/settings` redirects directly to `/settings/general`.
- Org-wide Settings (`/settings/*`) toggles and fields are visual only; no state persists between page loads. (Project Settings — `/projects/[slug]/settings` — is the one exception: it's real and persists, see Current Sprint → Completed → Project Settings.)
- Role now comes from a real `organization_membership` when one exists; `current-user.ts`'s mock identities are a dev-only fallback (never in production) rather than the only source of truth. **Resolved**: the `RoleSwitcher` is now gated behind `isDevFallback` (only renders, with a visible "Dev fallback" badge, when there's no real membership) instead of always showing. No real server-side permission enforcement is wired into the UI yet for projects/tickets/etc. — the RLS policies in `supabase/migrations/20260708000000_mvp_schema.sql` are applied and enforce tenant isolation at the DB layer, but the UI doesn't call any of those tables yet.
- Note "Duplicate" and "Delete" menu actions in `NoteDetailModal` are visual stubs with no effect.
- In dev fallback only (no real organization membership — never in production): the Projects list no longer filters by the old `LEAD_PROJECT_SLUGS` array (removed since real data is scoped by RLS instead), so a Project Lead testing without a seeded Supabase project now sees the full mock projects list rather than just their 3 owned slugs, while the summary cells (Blocked Tickets, Due This Week, Team Members Over Capacity) still compute against the `LEAD_PROJECT_SLUGS`-scoped team aggregation — a minor mismatch specific to unauthenticated/dev-fallback local testing, not the real-org path.
- Projects' real rows don't populate ticket-derived fields (`openTickets`, `blockedTickets`, `overdueTickets`, `awaitingReviewTickets`, `dueThisWeekTickets`, `progress`, `activeMilestones`) — by schema design these are derived from `tickets` and default to 0, and nothing yet re-aggregates them back onto the `projects` rows even though Tickets itself is now real (see `docs/SUPABASE_MVP_SCHEMA.md`), so the Projects list currently shows 0/empty progress bars for real projects on those specific fields.
- **Users and Team are implemented and pass `tsc`/`eslint`/`next build`, but have never been run against a live Supabase project or clicked through in a browser** — treat as "should work, not yet verified" until that verification pass happens (see Architecture Status for the specific migrations still pending).
- The Users list's inline Weekly Capacity cell (`CapacityCell`) still calls `updateOrganizationMember`, a direct client write — the same "permission denied for table organization_memberships" every other Users write used to hit before it got its own Server Action. Intentionally left as-is; it has no Server Action yet.
- Resend Invitation (Users row menu) is still toast-only — no real resend path exists.
- Editing a user's email — the Edit User form still shows the field but never persists a change to it; only first/last name, role, and weekly capacity are real writes.
- `browser`/`os`/`device` on the Security tab have no real source and simply don't render.
- Per-person availability `status` (Available/Busy/Away) on Team has no real source anywhere in the app — every real member shows a fixed "Available".

Planned future work:

- Live verification of Users and Team against a real Supabase project (apply `20260807`–`20260810` migrations, click through both modules) — the immediate next step, ahead of any new backend seam
- Backend integration for Dashboard/company-wide Reports/Settings, and for the still-mock parts of Projects itself (Project Overview, Notes, per-project Reports) (Auth/Profile/Avatar, Projects' Sidebar/`/projects`/Settings, Tickets, Users, and Team are done — see Architecture Status; schema for the rest is designed in `docs/SUPABASE_MVP_SCHEMA.md` and applied via the migrations in `supabase/migrations/`, just not queried by the UI yet)
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
2. Per-project Reports, Notes, Team pages refinements

(Authentication and Ticket editing, previously first on this list, are now both complete.)

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
