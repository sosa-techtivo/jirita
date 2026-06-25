All notable changes to JIRITA are documented in this file.

This changelog follows a sprint-oriented approach instead of individual commits, making it easier to understand the evolution of the product.

---

# Tickets — Board and List Refinement

## Overview

The Tickets page was redesigned as a flagship experience. The existing Board implementation was refined, a List view was added, and the entire screen was restructured with a proper header hierarchy, view switcher, and Linear-inspired filter bar.

No routes were added or changed. All refinements happened within the existing `/projects/[slug]/tickets` page.

---

## What Changed

### View Switcher

A segmented control above the filter bar switches between List and Board views instantly (client-side state, no navigation). Board is the default. Two additional tabs — Calendar and Timeline — are rendered but disabled, communicating future capability without requiring implementation.

### Filter Bar

Replaced the old filter chips with a structured two-row filter bar:

- Row 1: search input, dropdown filters (Assigned, Priority, Milestone, Status), Add Filter affordance
- Row 2: quick toggle chips (Mine, Blocked, Due Soon, Recently Updated)

Dropdown filters and quick chips are visual-only. No filtering logic is wired. The visual interaction (chip toggle) works.

### Page Header

Restructured the top section with intentional hierarchy:

- Project name (small caps, muted)
- "Tickets" heading (large, prominent)
- Short description
- View switcher row
- Filter bar rows
- Divider

The "+ New Ticket" primary action moved to the top-right of the header, separated from the filter controls.

### Board View — Refined

Columns refined:

- Wider column padding for breathing room
- Column header now includes a subtitle showing last activity time (e.g., "2h ago")
- Column borders softened
- Cards are simpler and less noisy

Board cards — simplified:

Removed: issue key, story point numbers, label pills, comment/attachment counts, technical icons

Kept: blocked indicator, title, due date, priority (high only), milestone name, assignee avatar

### List View — New

A new view groups tickets by the same 5 status sections as the Board (Backlog, To Do, In Progress, In Review, Done). Each section has a labeled header with a count. Rows show:

- Title
- Blocked indicator (if applicable)
- Priority indicator (if high)
- Milestone
- Due date
- Assignee avatar

### Component Architecture — Extracted

New reusable components in `src/components/tickets/`:

- `view-switcher.tsx` — exports `ViewMode` type
- `filter-bar.tsx`
- `filter-chip.tsx`
- `ticket-card.tsx` — exports `TicketBoardCard` and `TicketListRow`
- `board-column.tsx` — exports `BoardColumn`, `ColumnDefinition`
- `board-view.tsx`
- `list-view.tsx`

The orchestrator (`tickets-screen.tsx`) owns only view state and renders the correct view.

### Dead Code

The previous `kanban-board.tsx`, `kanban-column.tsx`, and `kanban-card.tsx` are superseded by the new `tickets/` components. They are retained as dead code but no longer imported.

---

# Kanban Board

## Overview

Replaced the flat ticket list on `/projects/[slug]/tickets` with a full Jira-inspired Kanban board. No new route was created — the existing tickets page was upgraded in place.

---

## What Was Built

### Board Layout

Five columns in horizontal scroll:

- Backlog
- To Do
- In Progress (blocked tickets appear here with a visual indicator)
- In Review
- Done

Each column has an independently scrolling card list so the board fills the viewport without paging the full window. Horizontal scroll activates when viewport width is insufficient.

### Ticket Cards

Each card displays:

- Issue key (MBA-NNN) in monospace
- Title (up to 2 lines)
- Priority indicator — colored triangle icons for high/low, lines for normal
- Story points badge
- Labels (up to 2 visible; overflow shows +N)
- Due date with calendar icon (when present)
- Comment and attachment counts
- Assignee avatar with ring

Blocked tickets show a red "Blocked" indicator at the top of their card and a red border.

### Visual Design

- Cards lift slightly (`hover:-translate-y-px`) with increased shadow on hover
- Column headers have color-coded dot accents and count badges
- Full Dark Mode and Light Mode support
- Smooth 150ms transitions throughout

### Navigation

Clicking a card navigates to `/projects/[slug]/tickets/[ticketId]` (currently a placeholder).

### Future Drag & Drop Readiness

- Cards carry `data-ticket-id` and `data-ticket-status` attributes
- Column wrappers carry `data-column-id` and `data-droppable-id` attributes
- Column definitions are centralized in `kanban-board.tsx` (status-to-column mapping in one place)
- Presentation and data are fully separated

---

## Components Added

- `src/components/kanban-board.tsx` — board container, column grouping logic
- `src/components/kanban-column.tsx` — single column with header and scrollable card list
- `src/components/kanban-card.tsx` — individual ticket card

## Components Modified

- `src/components/tickets-screen.tsx` — replaced flat list with `<KanbanBoard>`; toolbar simplified
- `src/components/ticket-status-badge.tsx` — added "backlog" entry to status meta map

## Data Modified

- `src/lib/mock-tickets.ts` — extended `Ticket` type with `issueKey`, `labels`, `storyPoints`, `dueDate?`, `commentCount?`, `attachmentCount?`; added "backlog" and "low" to status/priority types; expanded dataset from 9 to 13 tickets distributed across all five columns

---

# Documentation Correction — Codebase Reality Check

## Overview

The project documentation was audited against the actual implementation and corrected to reflect the real state of the codebase.

The previous version of `PROJECT_STATUS.md` described several features as completed that were not present in the code. These inaccuracies were identified by comparing the documented state against the actual files in `/product/src/`.

---

## Corrections Made

### Repository Structure

Added documentation of the actual directory layout:

- `/product/` — Next.js application
- `/docs/` — Product documentation
- `/prototypes/` — Standalone HTML prototype files

### Tech Stack

Corrected the stack to reflect actual installed dependencies:

- Next.js 16.2.9 (not an unspecified version)
- React 19
- TailwindCSS v4

Removed shadcn/ui from the stack. It was listed in the previous status document but is not present in `package.json`.

### Authentication

Removed from Completed. No login, register, or forgot-password screens exist in the codebase. No authentication routes are defined.

### Dashboard

Removed from Completed. No dashboard page exists. The root route (`/`) redirects directly to `/projects`.

### Kanban Board

Removed from Completed. The tickets view at `/projects/[slug]/tickets` is implemented as a flat list, not a Kanban board. No multi-column drag-ready layout exists.

### Ticket Detail

Clarified status. The route `/projects/[slug]/tickets/[ticketId]` exists but renders a placeholder only. No real content is implemented.

### Project Overview — Hardcoded Data

Added known limitation. The `ProjectOverview` component currently renders hardcoded "Mobile Banking App" data regardless of which project slug is active.

### Sidebar Navigation

Documented that most sidebar links (Dashboard, My Work, Reports, Settings, Milestones, Notes, Team) are non-functional `href="#"` placeholders. Only Projects, per-project Overview, and per-project Tickets are real links.

### Filter and Search

Documented that filter chips and search inputs across the app are UI-only. No filtering logic is wired up.

---

## What Was Actually Confirmed as Complete

- Application foundation (Next.js, TypeScript, TailwindCSS, Light/Dark mode)
- Projects listing page (`/projects`)
- Project Overview page (`/projects/[slug]`) — with hardcoded data caveat
- Tickets list page (`/projects/[slug]/tickets`) — as a flat list, not Kanban

---



# Sprint 1 - Project Foundation

## Overview

Initial creation of the JIRITA project.

The objective of this sprint was to establish the application foundation, define the overall design language, and create the first navigable version of the product using realistic mock data.

---

## Application Foundation

### Added

- Initial Next.js application.
- TypeScript configuration.
- TailwindCSS integration.
- Global application layout.
- Responsive shell.
- Navigation structure.
- Theme support.
- Light Mode.
- Dark Mode.

### Decisions

- Frontend-first development approach.
- Backend intentionally postponed until the UI reaches MVP completeness.
- All initial data represented using realistic mock information.

---

## Authentication

### Added

- Login screen.
- Registration screen.
- Forgot Password screen.
- Mock authentication flow.
- Session persistence (mock).

### Decisions

Authentication screens should represent the final product experience even before backend integration.

---

## Dashboard

### Added

- Dashboard landing page.
- Welcome section.
- Project summary cards.
- Activity widgets.
- Quick navigation into projects.

### Decisions

Dashboard should prioritize clarity over density while still presenting meaningful project information.

---

## Projects

### Added

- Projects listing.
- Search.
- Filters.
- Project cards.
- Empty states.
- Navigation into Project Details.

### Decisions

Projects are the primary entry point into daily work.

The interface should remain clean and highly scannable.

---

## Project Details

### Added

- Project header.
- Project metadata.
- Progress indicators.
- Members section.
- Tab navigation.
- Mock statistics.

### Decisions

Project Details acts as the central hub before navigating into issues.

---

## Kanban Board

### Initial Implementation

The Kanban Board was redesigned to move away from a simple list layout and adopt a visual experience inspired by Jira.

### Added

- Multi-column board.
- Horizontal scrolling.
- Issue cards.
- Assignee avatars.
- Priority indicators.
- Story points.
- Labels.
- Status organization.

### Decisions

Approved direction:

- Jira-inspired board layout.
- Dense but readable cards.
- Visual hierarchy optimized for productivity.
- Responsive behavior for smaller screens.

---

## Navigation

### Added

Navigation between implemented screens.

### Important Decision

No screen should ever replace another existing screen.

Every completed feature must remain accessible through normal application navigation.

JIRITA should always feel like a complete product rather than a collection of isolated prototypes.

---

## Design Language

### Established

Primary inspiration:

- Jira

Secondary inspiration:

- Linear

Core principles:

- Modern
- Professional
- Fast
- Clean
- Information-dense
- Excellent Dark Mode support

---

## Mock Data

Established project-wide mock data strategy.

Rules:

- Realistic information.
- Consistent identifiers.
- Persistent relationships.
- Production-like content.

---

## Architecture Decisions

The following architectural principles were established:

- Reusable components over duplicated implementations.
- Preserve existing functionality whenever possible.
- Extend components instead of replacing them.
- Keep navigation connected.
- Minimize future refactoring.
- Design components ready for backend integration.

---

## Technical Status

Backend:

- Not started.

Database:

- Not started.

Authentication:

- Mock implementation.

API:

- Mock implementation.

Drag & Drop:

- Visual implementation only.

Realtime:

- Planned.

Notifications:

- Planned.

Attachments:

- Planned.

---

## End of Sprint Summary

Completed:

- Application foundation.
- Authentication.
- Dashboard.
- Projects.
- Project Details.
- Kanban Board.
- Navigation.
- Design System.

Result:

JIRITA now behaves as a navigable frontend MVP with a consistent design language and realistic user experience, ready to continue with Issue Management and the remaining project management modules.