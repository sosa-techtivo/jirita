All notable changes to JIRITA are documented in this file.

This changelog follows a sprint-oriented approach instead of individual commits, making it easier to understand the evolution of the product.

---

# Notes — Detail & Edit Modal

## Overview

Added a full note detail view with inline editing to the per-project Notes page. Also expanded the mock ticket dataset with a new "Internal Platform Migration" workstream used to exercise the Member dashboard's multi-project views.

---

## What Changed

### New: `src/components/note-detail-modal.tsx`

Centered modal (not a side panel) with a view/edit mode toggle.

- **View mode:** title, author avatar + name, updated timestamp, tag badge, full body text, and a "⋯" menu (Edit / Duplicate / Delete — Duplicate and Delete are visual stubs)
- **Edit mode:** editable title (required), tag picker (toggleable chips from `TAG_OPTIONS`), body textarea
- Save sets `updatedAt` to `"Just now"` and returns to view mode; Cancel discards edits
- Entry animation (fade + scale from 98%), ESC-to-close, `document.body.style.overflow = "hidden"` while open

### New: `src/components/notes-shared.tsx`

Extracted `TAG_OPTIONS`, `TAG_CLASS`, `TagBadge`, `INPUT`, and `FIELD_LABEL` out of `notes-screen.tsx` so the new detail modal and the notes list render identical tag styling without duplication.

### Modified: `src/components/notes-screen.tsx`

- Note cards are now clickable (`role="button"`, keyboard-accessible) and open `NoteDetailModal` in view mode
- New `activeNote` / `activeNoteEditMode` state wires the modal open/close and save-back-into-list flow

### Modified: `src/lib/mock-tickets.ts`

Added four tickets (`IPM-1`–`IPM-4`) under a new "Platform Cutover" milestone/workstream (Legacy database export, Provision read replicas, Migration cutover plan, Route admin panels to new platform), assigned across Jordan Wu and Marcus Lee — used to give the Member dashboard's multi-project sections realistic cross-project data.

---

# Role-Based UX — Reports

## Overview

Gave Project Leads a purpose-built Reports screen instead of a permissions-filtered version of the Admin's company-wide Delivery/Finance report.

---

## What Changed

### New: `src/components/project-lead-reports-screen.tsx`

Delivery + Team tabs, scoped entirely to the Lead's own projects and team members — no company-wide data.

### New: `src/components/reports-shared.tsx`

Extracted the shared KPI card, section container, status bar, and progress-bar primitives so `reports-screen.tsx` and `project-lead-reports-screen.tsx` reuse the same building blocks without importing from each other.

### Modified: `src/components/reports-screen.tsx`

- `/reports` now branches on `user.role`: `PROJECT_LEAD` renders `<ProjectLeadReportsScreen />`; `ADMIN` (and default) renders the existing company-wide view
- Reworked internals to consume the new `reports-shared.tsx` primitives instead of local duplicates

### Modified: `src/components/project-lead-dashboard.tsx`

Minor follow-on adjustment after extracting shared reports primitives.

---

# Role-Based UX — Projects

## Overview

Tailored the Projects page to each role's actual responsibilities instead of showing one permissions-filtered table to everyone.

---

## What Changed

### New: `src/components/member-projects-screen.tsx`

Dedicated "My Projects" screen for the Member role — shows only projects the Member is staffed on, who leads each one, and what's assigned to them within it. Not a filtered version of the Admin/Lead table.

### Modified: `src/components/projects-list-screen.tsx`

- `/projects` now branches by role: `MEMBER` renders `<MemberProjectsScreen />`; `PROJECT_LEAD` renders a scoped, block-organized layout (own projects only via `LEAD_PROJECT_SLUGS`, archived status excluded, team/health context per project, `+ New Ticket` in place of `+ Create Project`); `ADMIN` keeps the full workspace table
- `ProjectMenu` gained an `isProjectLead` prop to show a reduced action set for Leads vs. the full Admin action set

### Modified: `src/components/status-badge.tsx`

Expanded to support the additional status/health states needed by the Project Lead's block-organized project view.

### Modified: `src/lib/mock-projects.ts`

Added fields needed for role-scoped project views (ownership/lead mapping used by `LEAD_PROJECT_SLUGS` filtering).

### Modified: `src/components/member-dashboard.tsx`, `src/lib/nav-config.ts`

Minor follow-on adjustments to keep the Member dashboard and nav config consistent with the new Member Projects screen.

---

# Role-Based UX — Member Dashboard

## Overview

Gave the Member role (Engineer / QA / Designer) a personal cross-project work-queue dashboard instead of a filtered project-management view, and fixed a dark-mode bug uncovered while building its hero card.

---

## What Changed

### New: `src/components/member-dashboard.tsx`

A dashboard scoped to the signed-in Member's own ticket queue across all their projects, reusing existing ticket/status components rather than introducing new ones.

- **Recommended Next** — hero card surfacing the single most important next ticket
- **Active Work** — priority-first ticket list
- **Time Today** — hours logged today, broken down per project
- **Needs Your Attention** — actionable-only events (blocked tickets, overdue items, mentions) — filtered to exclude passive/informational activity
- **Upcoming Work** — tickets due soon

### Modified: `src/components/dashboard-shared.tsx`

Extracted shared `HERO_CARD_CLASS` / `HERO_LABEL_CLASS` / etc. so the Project Lead's "Current Delivery" hero card and the Member's "Recommended Next" hero card share one dark-mode-safe treatment.

**Bug fix:** the previous hero card classes referenced `dark:` shades of `brand-300/400/900/950` that don't exist in the Tailwind theme, so dark mode silently fell back to the light gradient. Same root cause fixed on the Admin dashboard's "Hours Burn" KPI card — all four Admin KPI cards now share one correct dark background instead of one looking washed out.

### Modified: `src/components/tickets/ticket-card.tsx`

Added an optional `projectBadge` slot to `TicketListRow` / `ActiveTicketRow` so multi-project ticket rows (used by the Member dashboard) can show which project a ticket belongs to, without affecting other callers that don't pass it.

### Modified: `src/components/sidebar.tsx`, `src/lib/nav-config.ts`

Sidebar now renders each role's main nav links in the exact order returned by `mainNavForRole(role)` (a `Set`, so insertion order is preserved) instead of a single hardcoded sequence. Member's order was changed to Dashboard, My Work, Time Tracking, Projects; Admin and Project Lead order is unchanged.

### Modified: `src/components/dashboard-screen.tsx`, `src/components/project-lead-dashboard.tsx`

Wired the `MEMBER` branch to render `<MemberDashboard />`; minor adjustments to keep the Project Lead dashboard consistent with the shared hero-card classes.

---

# Role-Based UX Foundation

## Overview

Introduced a mock role-based identity layer — Admin, Project Lead, and Member — and rebuilt the Project Lead's dashboard from first principles instead of reusing a filtered Admin view. Also ran an MVP terminology pass to align live UI copy with the product's Delivery/Capacity/Hours vocabulary.

No real authentication or server-side permissions exist yet; this only drives what renders in the UI.

---

## What Changed

### New: `src/lib/current-user.ts`

Defines `Role = "ADMIN" | "PROJECT_LEAD" | "MEMBER"` and `Discipline = "Engineer" | "QA" | "Designer" | "Product" | "DevOps"`. `MOCK_USERS` provides one mock user per role (Priya Patel / Admin, Sarah Chen / Project Lead, David Kim / Member) so switching roles also swaps name/avatar/discipline. `DEFAULT_ROLE = "PROJECT_LEAD"`. `canManage(role)` gates management actions to Admin and Project Lead.

### New: `src/lib/nav-config.ts`

Centralizes which main-nav (`MainNavKey`) and per-project-nav (`ProjectNavKey`) items each role sees, and in what order. `mainNavForRole()` / `projectNavForRole()` return ordered `Set`s consumed by the sidebar.

### New: `src/components/current-user-provider.tsx`

React context provider holding the active mock user/role for the whole app.

### New: `src/components/role-switcher.tsx`

Dev-only control in the header bar to switch the active role live, for testing how the app reshapes itself per role.

### New: `src/components/dashboard-shared.tsx`

Shared KPI card / section / hero-card style primitives factored out ahead of the Project Lead and Member dashboard rebuilds.

### New: `src/components/project-lead-dashboard.tsx`

Rebuilt the Project Lead's dashboard from scratch rather than reusing a filtered Admin view:

- **Project Context selector** — scope the whole dashboard to one owned project or aggregate across all owned projects (delivery, capacity, activity, and deadlines all merge accordingly)
- Delivery Health hero card
- Attention Required section
- Team Capacity list — clickable, opens the real Team Member modal
- Recent Activity
- Upcoming Deadlines

### Modified: `src/components/dashboard-screen.tsx`

Branches on `user.role`: `PROJECT_LEAD` renders `<ProjectLeadDashboard />`; other roles keep the existing dashboard for now (Member gets its own dashboard in the following change).

### Modified: `src/components/sidebar.tsx`, `src/components/header-bar.tsx`, `src/app/layout.tsx`

Sidebar and quick actions across the app (Settings, Team, Tickets, Projects, Dashboard) now gate on the current role via `nav-config.ts` and `canManage()`. Header bar hosts the new `RoleSwitcher`. Layout wraps the app in `CurrentUserProvider`.

### Modified: `src/components/settings-section-screen.tsx`, `src/app/settings/[section]/page.tsx`

Adjusted for role gating (Settings is Admin/Project Lead only).

### MVP Terminology Pass

Removed Sprint / Milestone / Backlog / Story Points language from the live UI in favor of the Delivery / Capacity / Hours vocabulary the product is standardizing on:

- `src/components/project-reports-screen.tsx` — "Velocity Snapshot" → "Delivery Snapshot"
- Story Points dropped from the ticket sidebar (`ticket-detail-screen.tsx`), preview panel (`ticket-preview-panel.tsx`), and filters (`filter-bar.tsx`)

### Modified: `src/components/project-overview.tsx`, `src/components/projects-list-screen.tsx`, `src/components/team-screen.tsx`, `src/components/tickets-screen.tsx`

Adjusted quick actions and visible sections per the current role.

### Modified: `src/lib/mock-notes.ts`, `src/lib/mock-team.ts`

Minor data adjustments to support role-scoped views.

---

# Settings

## Overview

Implemented the Settings section of JIRITA. `/settings` redirects server-side to `/settings/general`. Seven section pages share a consistent two-column layout: a 180px sticky left sub-nav listing all sections, and a right content area with mock settings fields.

---

## What Changed

### New: `src/app/settings/page.tsx`

Server-side redirect to `/settings/general` via `next/navigation`. No UI rendered.

### New: `src/app/settings/[section]/page.tsx`

Dynamic route. Generates static params for all 7 known slugs. Includes `generateMetadata` for per-section page titles. Passes `activePage="settings"` to `AppShell` so the sidebar Settings link remains highlighted across all section pages.

### New: `src/components/settings-section-screen.tsx`

Client component. Two-column layout shared by all section pages.

**Left nav (180px, sticky):** Lists all 7 sections. Active section highlighted in brand colour; Danger Zone uses red accents. Each item shows the section icon.

**Right content area:** Section header (icon + title + description), then section-specific mock content.

**Utility sub-components:** `Toggle` (on/off pill), `SelectField` (visual dropdown), `TextField`, `NumberField`, `SettingRow` (label + optional hint + right-side control), `SettingGroup` (titled bordered card), `Chip` (colored badge).

**Section content:**

- `General` — Workspace name (text input), logo (preview + change link), timezone and language (select fields), working days (interactive day-picker buttons Mon–Sun)
- `People` — Team member list (avatar + name + role badge + more button), invite member link, default role and capacity fields
- `Projects` — Chip pickers for statuses, priorities, labels, and ticket types, each with an `+ Add` affordance
- `Time Tracking` — Hours per day and weekly capacity (number inputs), estimation unit and visibility (select + toggle), rounding increment and round-up default (select + toggle)
- `Notifications` — Per-channel toggles for email (assigned, mentioned, status changes, digest), desktop (enable, mentions-only), and digest scheduling (day + time selects)
- `Integrations` — GitHub shown as connected (3 repos listed, Disconnect link); Slack and Google Calendar as available (Connect buttons); Jira Import as Coming Soon (disabled badge)
- `Danger Zone` — Amber advisory banner, Archive Workspace action (amber button), Delete Workspace action (red button) with permanent-action copy

### New: `src/components/settings-screen.tsx`

Hub component with 7 section cards in a 2-column grid (Danger Zone spans full width). No longer rendered after the redirect change, but retained as a component. Each card shows icon, title, description, and sub-item list.

### Modified: `src/components/sidebar.tsx`

- Settings `<a href="#">` → `<Link href="/settings/general">`
- Added `isSettings = activePage === "settings"` active state
- `isProjects` updated to exclude `isSettings`

---

# Dashboard

## Overview

Implemented the Dashboard landing page at `/`. The root route no longer redirects to `/projects`. The Dashboard surfaces cross-project KPIs, team activity, at-risk projects, workload, and upcoming deadlines in a two-column layout.

---

## What Changed

### New: `src/components/dashboard-screen.tsx`

Client component. Module-level mock data for 5 active tickets, 3 at-risk projects, 5 team workload entries, 4 insights, and 4 recent activity entries.

**Sub-components:** `DashKpiCard` (supports optional progress bar and accent colour), `InsightsBand` (4-item band with level-coded icons), `Card` (section container), `ActiveTicketRow` (clickable ticket row), `RiskBadge`, `WorkloadRow` (progress bar per person).

**Layout:** `xl:grid-cols-[1fr_320px]` two-column grid.

- **Header:** "Good morning, Marcus 👋" + "Tuesday, June 30" + quick action buttons (`+ New Ticket`, `Projects`, `Reports`)
- **KPI row:** Assigned (14) · Hours Burn (212/320h, 66%, accent brand progress bar) · Blocked (11, red) · Due Today (3)
- **Insights band:** 4 items — critical blocked alert, warning overdue alert, ok sprint velocity, warning capacity warning
- **Left column:** My Active Work (5 tickets with status badges + click-to-preview) · Recent Activity feed
- **Right column:** Projects at Risk (3 projects with risk badges) · Team Workload (capacity bars) · Upcoming Deadlines (sorted by date)
- **Ticket preview:** `TicketPreviewPanel` opens on active-work row click

### Modified: `src/app/page.tsx`

Replaced the previous `redirect("/projects")` with a full server page rendering `<DashboardScreen />` inside `<AppShell activePage="dashboard">`.

### Modified: `src/components/sidebar.tsx`

- Dashboard `<a href="#">` → `<Link href="/">` with `isDashboard` active state

---

# My Work

## Overview

Implemented the My Work module — a personal daily workspace for every team member. Focused on the signed-in user's assigned tickets, logged hours, and activity.

---

## What Changed

### New: `src/app/my-work/page.tsx`

Route wrapper. Renders `<MyWorkScreen />` inside `<AppShell activePage="my-work">`.

### New: `src/components/my-work-screen.tsx`

Client component. Persona: Marcus Lee (avatar `pravatar img=12`).

**KPI cards:** Open tickets · Due today · Hours logged this week · Blocked tickets

**Focus Mode:** Toggle button collapses all tickets except those flagged `focus: true`, giving a distraction-free view of the day's priority work. Button label and icon update to reflect state.

**Ticket list (`FocusTicketRow`):** Status badge, priority dot, title, due date chip, and assignee avatar. Clicking a row opens `TicketPreviewPanel`.

**Recent Activity feed:** 5 entries with JSX `ReactNode` action fields for rich formatting.

### Modified: `src/components/sidebar.tsx`

- My Work `<a href="#">` → `<Link href="/my-work">` with `isMyWork` active state

---

# Reports

## Overview

Implemented the Reports module — a cross-project analytics dashboard driven entirely by mock data. No external chart libraries used.

---

## What Changed

### New: `src/app/reports/page.tsx`

Route wrapper. Renders `<ReportsScreen />` inside `<AppShell activePage="reports">`.

### New: `src/components/reports-screen.tsx`

Client component.

**KPI summary row:** Projects · Active Tickets · Estimated Hours · Completed Hours · Blocked Tickets · Completed This Month · Overdue Tickets

**Hours by Person:** Horizontal bar chart with avatars, sorted by logged hours descending. Bar width relative to highest-logged member.

**Project Health table:** One row per project — name, status badge (On Track / At Risk / Blocked), progress bar (completed/total tickets), ticket counts, and due date.

**Team Workload:** Capacity bar per member showing logged vs. maximum hours. Colour-coded (brand → amber → red) based on utilisation percentage.

**`ReportStatusBar` (exported):** Reusable horizontal progress bar component, also used by the Dashboard.

### Modified: `src/components/sidebar.tsx`

- Reports `<a href="#">` → `<Link href="/reports">` with `isReports` active state

---

# Time Tracking

## Overview

Implemented Time Tracking as a first-class feature within the Ticket Detail page. Users can log time against a ticket, view logged history, and track estimated vs. actual hours. Three rounds of UX refinement followed the initial implementation.

---

## What Changed

### New data model (`ticket-detail-screen.tsx`)

```ts
interface TimeEntry {
  id: string;
  hours: number;
  comment: string;
  date: string;
  authorName: string;
  authorAvatar: string;
}
```

Mock initial entries: 11h total — 2h today, 3h yesterday, 6h Jun 27.

### New: `TimeTrackingSection`

Collapsible section (expanded by default) below the Development section in the ticket detail.

**Summary line:** `11h logged / 16h estimated`

**Variance text:** `+Zh over estimate` in amber — rendered only when `totalLogged > estimatedHours`.

**Progress bar (4px, 2-segment):**
- Brand-500 segment fills the estimated portion
- Amber segment (`flex-1`) fills overage when over budget
- When under budget: single brand segment at `pct%` width

**Footer:** `View N entries →` opens `TimeHistoryModal`. `+ Log Time` opens `LogTimeModal`.

### New: `LogTimeModal`

Full-screen backdrop modal.

Fields: hours (number), minutes (number), date (defaults to today, `input[type=date]`), comment (textarea).

On submit: appends a new `TimeEntry` to `loggedEntries` state and calls `addActivity()` with a descriptive log string. ESC key handled via `globalThis.KeyboardEvent` to avoid conflict with React's `KeyboardEvent` type import.

### New: `TimeHistoryModal`

Full-screen backdrop modal listing all entries.

Header stats: Logged / Estimated / Remaining. Entry list with timeline-dot pattern: avatar, author name, date, hours badge, comment text.

### Modified: `TicketDetailScreen`

- State: `loggedEntries`, `totalLogged`, `remaining`, `addEntry`
- Header: added Estimated / Logged / Remaining stat row below the date/due paragraph (conditional on `ticket.hours !== undefined`)
- Sidebar: `EditableSidebarHours` label changed from "Hours" to "Estimated"; removed duplicate Logged / Remaining sidebar fields; `addActivity` text updated to "changed Estimated Hours"

---

# Tickets — Blocked Column & Filter Dropdowns

## Overview

Added a dedicated Blocked column to the Board view and wired the filter bar dropdowns with interactive state. Minor UX improvements to ticket cards and column layouts.

---

## What Changed

### Board View

- Added **Blocked** as a sixth column (red accent), surfacing blocked tickets in their own dedicated space
- Column definitions updated in `board-view.tsx`

### Filter Bar

- Assigned, Priority, Milestone, and Status dropdown buttons now open a simple popover with selectable options (visual state, not wired to ticket data)
- Active filter count badge appears on dropdowns when a selection is made

---

# Tickets — Hours Estimation Field

## Overview

Added an Estimated Hours field to the Ticket metadata sidebar, making hours a visible, editable field in the ticket detail page.

---

## What Changed

### Modified: `src/components/tickets/ticket-detail-screen.tsx`

- Added `EditableSidebarHours` component — click-to-edit number input for the `hours` field
- `Ticket` type extended with optional `hours?: number`
- Mock ticket data updated: selected tickets have pre-set hour estimates

### Modified: `src/lib/mock-tickets.ts`

- `hours` field added to `Ticket` type
- Representative tickets given hour estimates ranging from 4h to 24h

---

# Ticket Detail Page

## Overview

Implemented the full Ticket Detail page at `/projects/[slug]/tickets/[ticketId]`, replacing the previous placeholder. The page is a read-only workspace that reuses components and design language from the Quick Ticket Preview to maintain visual continuity.

---

## What Changed

### New: `src/app/projects/[slug]/tickets/[ticketId]/page.tsx`

The route now renders `<TicketDetailScreen>` instead of a placeholder. `generateStaticParams` covers all project × ticket combinations.

### New: `src/components/tickets/ticket-detail-screen.tsx`

Two-column server component layout:

**Header**

- `← Back to Tickets` button at the top-left (above the two-column layout)

**Main content (left column, flex-1)**

- Issue key + status badge row
- Title (h1)
- Description paragraph
- Comments section — up to 3 comments rendered as speech-bubble cards with avatar, author, timestamp, and body
- Activity timeline — vertical connected timeline of status changes and assignments

**Metadata sidebar (right column, w-56, sticky top-8)**

- Status badge
- Priority badge
- Assignee (avatar + name)
- Milestone
- Story Points
- Due date (with calendar icon)
- Labels (tag pills)

### New: `src/components/tickets/ticket-ui.tsx`

Shared primitives extracted to avoid duplication between the preview panel and the detail screen:

- `StatusBadge` — colored pill per status
- `PriorityBadge` — icon + label per priority
- `LabelTag` — small tag pill
- `getMockComments(ticket, limit)` — generates 1–3 deterministic mock comments per ticket
- `getMockActivity(ticket)` — generates 3–5 deterministic activity events per ticket
- `ActivityTimeline` — vertical connected timeline component

### New: `src/components/tickets/back-to-tickets-button.tsx`

Client component. Calls `router.back()` on click, preserving browser history. Renders as `← Back to Tickets` with a chevron icon.

---

# Quick Ticket Preview

## Overview

Added an inline Quick Ticket Preview panel to the Tickets page. Clicking a ticket card opens a slide-in panel from the right instead of navigating away, allowing users to inspect ticket details without losing their place in the board or list.

---

## What Changed

### New: `src/components/tickets/ticket-preview-panel.tsx`

A fixed right-side panel (520px wide, full viewport height).

**Behaviour**

- Slides in with a 250ms ease-out CSS transform on mount; slides out on close
- Backdrop (z-40) dims the board and closes the panel on click
- ESC key closes the panel
- When a different ticket is selected while the panel is open, content cross-fades (150ms) rather than snapping

**Header (fixed, updates immediately)**

- Issue key in monospace
- Close button (×)
- Title
- Status badge

**Scrollable body**

- Two-column metadata grid: Priority, Assignee, Milestone, Story Points, Due Date, Labels
- Description
- Comments (2)
- Activity timeline

**Footer (fixed)**

- **Expand** button — navigates to `/projects/[slug]/tickets/[ticketId]` (Full Detail route)

### `src/components/tickets-screen.tsx`

- Ticket clicks now open the preview panel instead of navigating
- `FilterBar` made fully controlled: `activeChips`, `onToggleChip`, `searchQuery`, `onSearchChange` lifted to `TicketsScreen`
- `handleBeforeExpand` saves current state (view, filter chips, search, scroll position, open ticket ID) to sessionStorage before navigating to Full Detail
- On mount, `useMemo` reads saved state from sessionStorage synchronously; `useEffect` removes the saved entry and restores scroll position after render
- Restored state reopens the preview panel for the same ticket without additional navigation

### `src/components/tickets/filter-bar.tsx`

Converted from self-managed state to a fully controlled component. Accepts `activeChips: Set<string>`, `onToggleChip`, `searchQuery`, `onSearchChange` props. Internal chip and search state removed.

---

# Insights View

## Overview

Added a fifth tab to the Tickets page — **Insights** — providing a project-level analytics dashboard computed entirely from the existing ticket dataset. No backend integration, no new mock data, no external chart libraries.

---

## What Changed

### New: `src/components/tickets/insights-view.tsx`

A read-only dashboard with seven sections:

**KPI Cards**

Four metric cards across the top row:
- Open Tickets — all non-done tickets
- Completed — done tickets, shown with completion rate
- Blocked — tickets in blocked status, highlighted red when > 0
- Overdue — tickets past their due date, green when 0 (all deadlines on track)

**Tickets by Status — Donut Chart**

Pure SVG multi-segment ring chart. Each status gets a colored arc. Center label shows total ticket count. Legend lists all six statuses with counts. No chart library used — built with `stroke-dasharray` / `stroke-dashoffset` stacking.

**Workload by Assignee — Horizontal Bar Chart**

Each team member shows a proportional bar (relative to the most-loaded member). Avatar and name displayed inline. Sorted by ticket count descending.

**Priority Distribution — Horizontal Bar Chart**

Three bars for High / Normal / Low priorities. Each bar shows percentage and absolute count. Colors match the app's existing priority coding.

**Milestone Progress — Progress Bars**

One progress bar per milestone showing completed / total tickets. Bar colour shifts from brand (< 50%) → amber (≥ 50%) → emerald (100%).

**Upcoming Due Dates — List**

Top 6 non-done tickets sorted by due date ascending. Date label colours: amber for deadlines within 3 days, red for overdue. Countdown shown ("in Nd", "Today", "Nd overdue").

**Recently Completed — List**

All done tickets with assignee avatar and updatedAt timestamp.

### `src/components/tickets/view-switcher.tsx`

- `ViewMode` type extended: `"list" | "board" | "calendar" | "timeline" | "insights"`
- Insights tab added to `VIEWS` array with a bar-chart SVG icon

### `src/components/tickets-screen.tsx`

- `InsightsView` imported and wired into the `view === "insights"` branch

---

# Timeline View UX Refinements

## Overview

A focused UX pass on the Timeline view to improve density, readability, and navigability without changing layout or interactions.

---

## What Changed

### Collapsible Milestone Groups

Milestone headers are now interactive. Clicking a header collapses or expands the tickets below it. Collapsed state is managed via `useState<Set<string>>`. A chevron icon rotates 90° to indicate state.

### Milestone Headers

Changed from repeating the milestone name on every ticket row to rendering it as a section header. Format: `Milestone Name (n)` where n is the ticket count in that group.

### Ticket Row Indentation

Ticket label cells inside each group use `pl-7 pr-4` indentation to create visual hierarchy under the milestone header.

### Denser Layout

Row height reduced from 42 → 36px. Bar height reduced from 26 → 22px. Achieves more information density with less scrolling.

### Issue Key in Bar

Bar content now shows `{issueKey} · {title}` instead of title alone. The issue key renders in a slightly muted style (opacity-70, text-[10px], font-semibold).

### More Prominent Today Indicator

The vertical Today line was upgraded to `w-0.5` (from 1px), `bg-brand-600/80 dark:bg-brand-500/80` with a header badge label above the timeline grid.

### Horizontal Scroll Behaviour

- Smooth scroll on mount: positions Today at roughly 1/3 from the left edge of the visible area
- `overscroll-x-contain` on the scroll container to prevent scroll chaining with the page

---

# Timeline View

## Overview

Added a fourth tab to the Tickets page — **Timeline** — a Linear Roadmap-inspired horizontal planning view. No new route. No drag-and-drop. No editing.

---

## What Changed

### New: `src/components/tickets/timeline-view.tsx`

A read-only horizontal timeline grouped by milestone.

**Layout constants:**
- `LABEL_W = 192` — frozen left column (ticket/milestone labels)
- `ROW_H = 36` — ticket row height
- `GH_H = 34` — group header height
- `HDR_H = 50` — time axis header height
- `BAR_H = 22` — bar height within each row
- `PX_PER_DAY = 9` — horizontal pixels per calendar day

**Time axis:**
Spans a fixed window around the earliest and latest dates in the dataset. Week markers and month markers rendered as vertical grid lines. Month names shown as sticky column headers.

**Bars:**
Each ticket renders as a horizontal pill bar. Bar start date is derived as `dueDate − max(3, storyPoints × 1.5)` days (no additional schema fields required). Bars are colour-coded by status using the same hex palette as the rest of the app.

**Today indicator:**
A vertical line spanning the full height of the canvas marks the current date.

**Sticky columns and headers:**
The label column uses `position: sticky; left: 0` with a solid background, so ticket names remain visible during horizontal scroll. The time axis header uses `position: sticky; top: 0`.

**Milestone grouping:**
Tickets are grouped into their respective milestones. Groups are sorted by earliest bar start date.

**Navigation:**
Clicking a bar navigates to `/projects/[slug]/tickets/[ticketId]` via `router.push`.

### `src/components/tickets/view-switcher.tsx`

- `ViewMode` extended to include `"timeline"`
- Timeline tab added to `VIEWS` array

### `src/components/tickets-screen.tsx`

- `TimelineView` imported and rendered for `view === "timeline"`

### `src/lib/mock-tickets.ts`

- `dueDate` added to all 13 tickets (previously only 2 had it)
- Due dates distributed across Jun 18 – Aug 3, 2026

---

# Calendar View

## Overview

Added a third tab to the Tickets page — **Calendar** — a month-grid view showing tickets on their due dates. No new route. No editing via calendar.

---

## What Changed

### New: `src/components/tickets/calendar-view.tsx`

A month-grid calendar with a collapsible day detail panel.

**Grid:**
6 rows × 7 columns (42 cells). Grid starts on the Sunday before the first of the month. Each cell shows the day number and up to 3 ticket pills. Overflow is indicated as "+N more".

**Today highlight:**
The current date number is shown with a brand-coloured filled circle.

**Selected day:**
Clicking a day selects it and opens the day detail panel. The selected cell gets a brand-tinted background.

**Day detail panel (w-72):**
Slides in on the right side of the calendar. Lists all tickets due on the selected day. Clicking a ticket opens the ticket detail panel in the same slot.

**Ticket detail panel:**
Replaces the day panel. Shows full ticket metadata. A back button returns to the day panel.

**Month navigation:**
Chevron buttons cycle through months. The grid rebuilds for the new month.

### `src/components/tickets/view-switcher.tsx`

- `ViewMode` extended to include `"calendar"`
- Calendar tab added to `VIEWS` array

### `src/components/tickets-screen.tsx`

- `CalendarView` imported and rendered for `view === "calendar"`

---

# Tickets Page Layout Refinement

## Overview

A focused UX pass to maximise visible workspace on the Tickets page without redesigning the page or altering routing. Seven targeted changes.

---

## What Changed

### Removed Redundant Heading

The `"MOBILE BANKING APP"` heading above the Tickets title was removed. The project context is already present in the sidebar, so the heading was redundant noise.

### Header Space Reduction

Reduced top padding and tightened vertical rhythm in the header block. Visible area gained roughly one ticket row's height.

### View Switcher + New Ticket on One Row

The view switcher and the `+ New Ticket` primary action button are now aligned on the same horizontal row (`flex items-center gap-3`). Previously they occupied separate rows.

### Wider Search Box

Search input widened from `w-48` → `w-64`.

### Higher Filter Chip Contrast

Quick filter chips in inactive state now use darker text and a more visible border: `text-slate-600 border-slate-300 hover:border-slate-400 hover:text-slate-800` (light) / `text-zinc-300 border-zinc-600` (dark). Previously chips were nearly invisible against the background.

### Active Project Sidebar Prominence

The active project section in the left sidebar received:
- `ring-1 ring-brand-100 dark:ring-brand-500/20` container ring
- Project name link upgraded to `font-semibold`
- Active sub-link (Overview / Tickets) now uses `font-semibold` with a subtle white elevated background

### Filter Bar

- Quick filters updated to: Mine, Blocked, High Priority, Due Soon, Recently Updated

### Files Modified

- `src/components/tickets-screen.tsx` — removed redundant heading, combined header row
- `src/components/tickets/filter-bar.tsx` — widened search, updated quick filter labels
- `src/components/tickets/filter-chip.tsx` — increased inactive state contrast
- `src/components/sidebar.tsx` — improved active project ring, weight, and sub-link styles

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
