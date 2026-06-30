> Last Updated: June 30, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, projects listing, project overview, a five-view Tickets experience, Quick Ticket Preview, Full Ticket Detail with Time Tracking, a cross-project Dashboard, a personal My Work workspace, a Reports module, and a Settings section. All implemented screens are navigable and connected using mock data.

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

### Application Foundation

- Next.js application configured (in `/product/`)
- Light Mode
- Dark Mode
- Global layout (`AppShell` component)
- Responsive navigation (`Sidebar` component)
- Design system foundation

### Projects

Completed.

Includes:

- Project listing
- Search input (UI only, not wired)
- Filter chips (UI only, not wired)
- Project cards
- Empty states
- Navigation into Project Details

### Project Details

Completed, with a known limitation.

Includes:

- Header
- Project information
- Milestones section
- Active Work (blocked + in-progress tickets)
- Recent Activity
- Team members
- Quick Links
- Navigation to Tickets

Known limitation: Project data is currently hardcoded to "Mobile Banking App" regardless of the active slug. The slug is passed correctly but the component does not use it to load different data.

### Tickets — All Five Views

Completed.

The Tickets experience at `/projects/[slug]/tickets` supports five views with an instant client-side toggle. Board is the default.

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

Completed.

Time Tracking is integrated into the Ticket Detail page.

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

Completed.

Route: `/` (root). The root no longer redirects to `/projects`.

Includes:

- Header: "Good morning, Marcus 👋" + date
- Quick actions: `+ New Ticket`, `Projects`, `Reports`
- 4 KPI cards: Assigned (14), Hours Burn (212/320h with progress bar), Blocked (11, red), Due Today (3)
- Insights band: 4 items with level-coded icons (critical / warning / ok)
- Two-column layout (`xl:grid-cols-[1fr_320px]`):
  - Left: My Active Work (5 tickets, click-to-preview) + Recent Activity
  - Right: Projects at Risk + Team Workload (progress bars) + Upcoming Deadlines
- Ticket quick-preview panel on row click (reuses `TicketPreviewPanel`)

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

Completed.

Route: `/reports`.

Includes:

- KPI summary row: Projects, Active Tickets, Estimated Hours, Completed Hours, Blocked, Completed This Month, Overdue
- Hours by Person: horizontal bar chart with avatars
- Project Health table: status badges, progress bars, ticket counts
- Team Workload: capacity bars per member
- Insights band reused from `ReportStatusBar`

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

### Sidebar Navigation (Remaining Dead Links)

The following sidebar items are visible but point to `href="#"` (dead links):

- Milestones (per-project)
- Notes (per-project)
- Reports (per-project)
- Team (per-project)

All top-level navigation items (Dashboard, My Work, Projects, Reports, Settings) are now functional.

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

- `/` → redirects to `/` (Dashboard)
- `/my-work`
- `/projects`
- `/projects/[slug]`
- `/projects/[slug]/tickets`
- `/projects/[slug]/tickets/[ticketId]`
- `/reports`
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

- `ProjectOverview` component has hardcoded "Mobile Banking App" data; it does not dynamically load project data based on slug.
- Filter chips and search inputs on the Tickets page are UI-only; chips toggle visually but do not filter the ticket list.
- Ticket Detail page fields are mostly read-only; no inline editing is implemented beyond status transitions.
- `kanban-board.tsx`, `kanban-column.tsx`, `kanban-card.tsx` are dead code (superseded by the `tickets/` component set).
- `settings-screen.tsx` (`SettingsScreen` hub component) is retained but no longer rendered — `/settings` redirects directly to `/settings/general`.
- Settings toggles and fields are visual only; no state persists between page loads.
- Per-project sidebar links (Milestones, Notes, Reports, Team) use `href="#"` and are non-functional.

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
