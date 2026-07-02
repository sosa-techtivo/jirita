> Last Updated: July 2, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, a role-based UX layer (Admin / Project Lead / Member), projects listing, role-specific project overviews, a five-view Tickets experience with Task/Bug ticket types, Quick Ticket Preview, Full Ticket Detail with Time Tracking, role-specific Dashboards, role-specific Projects/Reports/Time Tracking screens, a personal My Work workspace, an editable Notes experience, a Settings section, and a single shared Member Profile Modal used everywhere a person is referenced. All implemented screens are navigable and connected using mock data.

The current objective is to complete the remaining frontend experience before integrating a real backend.

---

# Repository Structure

```
/product/       — Next.js application (the actual codebase)
/docs/          — Product documentation
/prototypes/    — Standalone HTML prototype files
```

---

# Current Sprint

## Completed

### Role-Based UX

Completed.

A mock identity layer (`src/lib/current-user.ts`) defines three roles — **Admin**, **Project Lead**, and **Member** — each with its own name/avatar/discipline. No real auth or permissions exist yet; this only drives what renders.

- `CurrentUserProvider` (`src/components/current-user-provider.tsx`) holds the active role in React context
- A dev-only `RoleSwitcher` in the header bar lets any tester swap roles live to see the app reshape itself
- `src/lib/nav-config.ts` centralizes which main-nav and per-project-nav items each role sees, and in what order (sidebar renders in array order, not a hardcoded sequence)
- `canManage(role)` gates workspace/project management actions (New Project, New Ticket, Add Member, etc.) to Admin and Project Lead
- Dashboard, Projects, and Reports each render a **different, purpose-built screen per role** rather than a permissions-filtered version of one shared screen (see below)
- Settings and per-project Team are Admin/Project Lead only; Member's sidebar omits them
- MVP terminology pass: "Sprint / Milestone / Backlog / Story Points" language removed from live UI copy (e.g. Project Reports' "Velocity Snapshot" → "Delivery Snapshot") in favor of Delivery / Capacity / Hours vocabulary. Story Points is dropped from the ticket sidebar, preview panel, and filters.

### Application Foundation

- Next.js application configured (in `/product/`)
- Light Mode
- Dark Mode
- Global layout (`AppShell` component)
- Responsive navigation (`Sidebar` component)
- Design system foundation

### Projects

Completed. Route: `/projects`. `ProjectsListScreen` now branches by role rather than showing a permissions-filtered version of one table.

#### Admin

- Full workspace projects table
- Search input (UI only, not wired)
- Filter chips (UI only, not wired)
- Project cards / rows, empty states
- Navigation into Project Details

#### Project Lead

- Scoped to the Lead's own owned projects (`LEAD_PROJECT_SLUGS`), block-organized instead of a flat table
- Team and health context surfaced per project
- Quick actions (`+ New Ticket` instead of `+ Create Project`)
- Archived status excluded from the status filter set

#### Member — `member-projects-screen.tsx` (new)

A dedicated "My Projects" screen, not a filtered Admin/Lead table.

- Shows only projects the Member is staffed on
- Surfaces who leads each project
- Surfaces what's assigned to the Member within each project

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

### Tickets — All Five Views

Completed.

The Tickets experience at `/projects/[slug]/tickets` supports five views with an instant client-side toggle. Board is the default.

#### Ticket Types (Task / Bug)

Every ticket has a `type: "TASK" | "BUG"`. A shared `TicketTypeIcon` renders immediately before the ticket ID on every screen that shows one (ticket cards, Ticket Detail, Ticket Preview Panel, Calendar, Timeline, Insights, Dashboard/Reports activity rows) — one component, so the glyph and its color stay identical everywhere. A custom `TicketTypeSelect` dropdown (not a native `<select>`) is used in the New Ticket form and Ticket Detail sidebar so the picker itself can render the icon inside each option.

#### View Switcher

A segmented tab control switches between all five views: **List**, **Board**, **Calendar**, **Timeline**, and **Insights**. All tabs are active.

#### Filter Bar

- Search input (widened)
- Dropdown filters: Assigned, Priority, Milestone, Status (visual only, not wired)
- Quick toggle chips: Mine, Blocked, High Priority, Due Soon, Recently Updated (visual only, not wired)
- "Add Filter" affordance for future expansion

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
- Cards link to `/projects/[slug]/tickets/[ticketId]`

Each board card:

- Blocked indicator (if applicable)
- Title (2 lines max)
- Due date (if present)
- Priority indicator (high only), milestone, assignee avatar

#### List View

Tickets grouped by the same status sections. Each section has a labeled header with a count and a horizontal rule. Rows show title, blocked indicator, priority (if high), milestone, due date, and assignee avatar.

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

#### Full Ticket Detail Page

The route `/projects/[slug]/tickets/[ticketId]` renders a complete ticket workspace.

- **← Back to Tickets** button at the top uses `router.back()`, preserving browser history
- Two-column layout: main content left, metadata sidebar right
- Main content: issue key, title, status badge, description, comments (3), activity timeline
- Sidebar: editable status, priority, assignee, milestone, story points, due date, labels, Estimated hours

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

Time Tracking is also integrated into the Ticket Detail page for logging against a specific ticket.

Includes:

- **`TimeTrackingSection`** (collapsible, expanded by default) below the Development section
  - Compact summary line: `Xh logged / Yh estimated`
  - Conditional variance text: `+Zh over estimate` in amber, shown only when over
  - Smart 2-segment 4px progress bar: brand fills estimated portion, amber fills overage
  - `View N entries →` link opens `TimeHistoryModal`
- **`LogTimeModal`**: hours + minutes inputs, date picker, comment textarea; submit appends a `TimeEntry` and fires `addActivity()`
- **`TimeHistoryModal`**: full entry list with summary stats (Logged / Estimated / Remaining), scrollable timeline-dot entry list
- Ticket header stats row: Estimated / Logged / Remaining (shown when `ticket.hours` is set)
- Sidebar "Estimated" field (renamed from "Hours")
- Mock initial entries: 11h total (2h today, 3h yesterday, 6h Jun 27)

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

Routes: `/settings` (redirects to `/settings/general`) and `/settings/[section]` for 7 sections.

Sections:

- **General**: Workspace name, logo, timezone, language, working days (day picker)
- **People**: Team member list with role badges, invite button, default role and capacity fields
- **Projects**: Chip pickers for statuses, priorities, labels, and ticket types (+ Add buttons)
- **Time Tracking**: Hours per day, weekly capacity, estimation defaults, rounding preferences
- **Notifications**: Email, desktop, and digest toggles with per-channel granularity
- **Integrations**: GitHub (connected, 3 repos), Slack and Google Calendar (Connect buttons), Jira Import (Coming Soon)
- **Danger Zone**: Archive Workspace (amber) and Delete Workspace (red) actions with warning messaging

Navigation:
- Left sub-nav lists all 7 sections; active section highlighted
- Breadcrumb: `Settings / Section Name`
- `/settings` redirects server-side to `/settings/general`
- Sidebar Settings link goes directly to `/settings/general`

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

---

# In Progress

Nothing currently in progress.

---

# Not Implemented

The following features are documented as planned but do not exist in the codebase yet.

### Authentication

- Login screen
- Register screen
- Forgot Password screen
- Session persistence

### Sidebar Navigation

No known dead links remain. Milestones was removed from the UI entirely for MVP. Per-project Notes, Team, and Reports are real, functional routes (`/projects/[slug]/notes`, `/team`, `/reports`), gated per role via `nav-config.ts` rather than hardcoded.

All top-level navigation items (Dashboard, My Work, Projects, Reports, Settings) are functional, and each renders a role-specific screen where applicable (Dashboard, Projects, Reports).

---

# Next Recommended Feature

Authentication.

A login screen at `/login` that allows users to sign in. Since the app uses mock data, this can be a mock authentication flow with hardcoded credentials, setting the foundation for real auth later.

Alternatively: Ticket editing — inline status, assignee, and priority changes directly in the ticket detail page.

---

# Planned Features

## Project Management

- Backlog
- Sprint Planning
- Releases
- Milestones
- Versions
- Components

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

Current architecture follows a frontend-first approach.

Current stack:

- Next.js 16.2.9
- React 19
- TypeScript
- TailwindCSS v4

Not installed:

- shadcn/ui (referenced in earlier documentation but not present in `package.json`)

Current data source:

- Mock data only (`/product/src/lib/mock-projects.ts`, `/product/src/lib/mock-tickets.ts`, module-level constants in screen components)

Backend integration will happen after the UI reaches MVP completeness.

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
- `/projects/[slug]/tickets/[ticketId]`
- `/projects/[slug]/notes`
- `/projects/[slug]/team`
- `/projects/[slug]/reports`
- `/projects/[slug]/settings` — Admin/Project Lead only (per-project General/Billing/Danger Zone)
- `/reports` — role-specific (Admin company-wide / Project Lead scoped Delivery+Team / Member: no access)
- `/time-tracking` — role-specific (Admin Billing/Finance / Project Lead delivery-focused / Member: no access, folded into My Work instead)
- `/settings` → redirects to `/settings/general`
- `/settings/general`
- `/settings/people`
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
- Filter chips and search inputs on the Tickets page are UI-only; chips toggle visually but do not filter the ticket list.
- Ticket Detail page fields are mostly read-only; no inline editing is implemented beyond status transitions.
- `kanban-board.tsx`, `kanban-column.tsx`, `kanban-card.tsx` are dead code (superseded by the `tickets/` component set).
- `settings-screen.tsx` (`SettingsScreen` hub component) is retained but no longer rendered — `/settings` redirects directly to `/settings/general`.
- Settings toggles and fields are visual only; no state persists between page loads.
- Role-based UX (`current-user.ts`, `nav-config.ts`) is a mock identity layer only — no real auth or server-side permission enforcement exists. The `RoleSwitcher` in the header is a dev-only affordance and should be removed or gated before any real backend integration.
- Note "Duplicate" and "Delete" menu actions in `NoteDetailModal` are visual stubs with no effect.

Planned future work:

- Backend integration
- Authentication
- Database
- API layer
- Real drag & drop (Kanban)
- Real-time updates
- Notifications
- File uploads

---

# Files Frequently Modified

Expected high-change areas:

- `product/src/app/`
- `product/src/components/`
- `product/src/lib/`

---

# Current MVP Goal

Complete every major screen required for a usable project management platform before connecting real services.

Remaining priority order:

1. Authentication
2. Ticket editing (inline status, assignee, priority changes)
3. Backlog / Sprint Planning
4. Per-project Reports, Milestones, Notes, Team pages

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
