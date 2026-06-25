> Last Updated: June 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The project includes the application shell, projects listing, project overview, and a fully featured Tickets experience with five views: Board, List, Calendar, Timeline, and Insights. All implemented screens are navigable and connected using mock data.

The current objective is to complete the entire frontend experience before integrating a real backend.

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

Each column:

- Color-coded dot accent, count badge, last-activity subtitle
- Cards link to `/projects/[slug]/tickets/[ticketId]`

Each board card:

- Blocked indicator (if applicable)
- Title (2 lines max)
- Due date (if present)
- Priority indicator (high only), milestone, assignee avatar

#### List View

Tickets grouped by the same 5 status sections. Each section has a labeled header with a count and a horizontal rule. Rows show title, blocked indicator, priority (if high), milestone, due date, and assignee avatar.

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

#### UX

- Cards hover with elevation lift and micro-translate (`hover:-translate-y-px`)
- Smooth 150ms transitions
- Full Dark Mode and Light Mode support across all views
- Horizontal scroll in Board and Timeline; vertical scroll in List, Calendar, Insights
- Board columns fill viewport height; each scrolls independently

#### Future Drag & Drop Readiness

- Cards carry `data-ticket-id` and `data-ticket-status` attributes
- Column wrappers carry `data-column-id` and `data-droppable-id` attributes

#### Component Architecture

Components in `src/components/tickets/`:

- `view-switcher.tsx` — exports `ViewMode` type (`"list" | "board" | "calendar" | "timeline" | "insights"`)
- `filter-bar.tsx` — search + filter dropdowns + quick chips
- `filter-chip.tsx` — standalone toggleable chip
- `ticket-card.tsx` — exports `TicketBoardCard` and `TicketListRow`
- `board-column.tsx` — exports `BoardColumn` and `ColumnDefinition`
- `board-view.tsx` — groups tickets into columns, handles horizontal layout
- `list-view.tsx` — groups tickets by status section, handles vertical scroll
- `calendar-view.tsx` — month grid, day panel, ticket detail panel
- `timeline-view.tsx` — horizontal Gantt-style view, milestone grouping, sticky columns
- `insights-view.tsx` — KPI cards, charts, and lists dashboard

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

### Dashboard

No dashboard page exists. The root route (`/`) currently redirects directly to `/projects`.

### Ticket Detail

The route `/projects/[slug]/tickets/[ticketId]` exists but renders a placeholder ("Ticket Detail — Coming Next"). No real content is implemented.

### Sidebar Navigation (Placeholder Links)

The following sidebar items are visible but point to `href="#"` (dead links):

- Dashboard
- My Work
- Reports
- Settings
- Milestones (per-project)
- Notes (per-project)
- Reports (per-project)
- Team (per-project)

Only **Projects** and the per-project **Overview** and **Tickets** links are functional.

---

# Next Recommended Feature

Ticket Detail page.

This screen will become the central workspace of the application.

It should include:

- Description
- Status (editable)
- Assignee (editable)
- Labels
- Comments
- Time Entries
- Activity History
- Right sidebar with editable fields

The route already exists as a placeholder at `/projects/[slug]/tickets/[ticketId]`.

---

# Planned Features

## Project Management

- Ticket Detail
- Backlog
- Sprint Planning
- Releases
- Milestones
- Versions
- Components

## Collaboration

- Comments
- Mentions
- Activity Timeline
- Notifications

## Reporting

- Reports
- Velocity
- Burndown
- Cycle Time
- Workload

## Administration

- Teams
- Members
- Roles
- Permissions
- Organization Settings

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

- Mock data only (`/product/src/lib/mock-projects.ts`, `/product/src/lib/mock-tickets.ts`)

Backend integration will happen after the UI reaches MVP completeness.

---

# Navigation Status

All completed screens must remain accessible.

Important rule:

No newly implemented screen may replace an existing one.

Every new feature must be integrated into the application's navigation so that all completed screens remain reachable.

Current working routes:

- `/projects`
- `/projects/[slug]`
- `/projects/[slug]/tickets`
- `/projects/[slug]/tickets/[ticketId]` (placeholder)

---

# Design Decisions

## UI Inspiration

Primary inspiration:

- Jira

Secondary inspiration:

- Linear
- GitHub

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
- Sidebar navigation links for Dashboard, My Work, Reports, Settings, Milestones, Notes, Team use `href="#"` and are non-functional.
- Filter chips and search inputs are UI-only; no filtering logic is wired up.
- `kanban-board.tsx`, `kanban-column.tsx`, `kanban-card.tsx` are dead code (superseded by the `tickets/` component set).

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

Priority order:

1. Ticket Detail
2. Dashboard
3. Authentication
4. Backlog / Sprint Planning
5. Reports
6. Teams
7. Settings

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
