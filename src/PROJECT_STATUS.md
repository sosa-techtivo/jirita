> Last Updated: July 16, 2026

---

# Project Status

## Overall Progress

JIRITA is currently in the UI/UX MVP phase.

The application now includes the full shell, a role-based UX layer (Admin / Project Lead / Member), projects listing, role-specific project overviews, a five-view Tickets experience with Task/Bug ticket types, Quick Ticket Preview, Full Ticket Detail with Time Tracking, role-specific Dashboards, role-specific Projects/Reports/Time Tracking screens, a personal My Work workspace, an editable Notes experience, a Settings section, a per-project Settings screen, a dedicated Admin-only Users management module, a real Supabase Auth flow (Login/Logout/Forgot/Reset/Change Password) with a Profile page that saves real data, and a single shared Member Profile Modal used everywhere a person is referenced. Auth/Profile, and now Projects (Sidebar, the `/projects` list, and per-project Settings), are backed by a live Supabase project; every other screen is still navigable and connected using mock data — see Architecture Status.

The current objective is to complete the remaining frontend experience while continuing backend integration. Auth, profile/organization-membership data, avatar upload, and change password are confirmed working end-to-end against a live Supabase project. Projects has followed the same path: Sidebar, the `/projects` list, and `/projects/[slug]/settings` now read and write real project rows (create, edit, archive/restore, and per-project Settings' General/Billing fields, including a minimal real Clients roster). Project Overview, Tickets, Notes, Team, per-project Reports, Dashboard, company-wide Reports, Users, and the rest of Settings are still mock data — see Architecture Status.

---

# Repository Structure

```
/src/           — Next.js application (the active codebase — all development happens here)
/product/       — Read-only reference copy of a prior implementation snapshot
/prototypes/    — Read-only standalone HTML prototype files
```

`/src/docs/` holds implementation-facing documentation for backend work
(`SUPABASE_MVP_SCHEMA.md`, `SUPABASE_SETUP.md`, `UNFUDDLE_IMPORT_SPECIFICATION.md`)
— distinct from this file and `CHANGELOG.md`, which live at the `/src` root.

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

Completed. Route: `/users`, Admin only — hidden from the sidebar for Project Lead/Member (same nav-hiding convention as Settings), and the page itself also renders an "Admins only" message if visited directly by a non-Admin.

A dedicated top-level management module, replacing the old Settings → People page — a management table instead of a card list, backed by a new org-wide `mock-users.ts` (`User`: id, first/last name, email, avatar, role, status, weekly capacity, project slugs, last login) distinct from `mock-team.ts`'s `TeamMember` (which is one row per person *per project*, not a canonical account record).

- **Header**: "Users" title, "Manage user accounts, access and permissions." subtitle, "+ Invite User" button
- **Filters**: Search, Role, Status, Project (multi-select dropdowns, same `FilterDropdown` component used across Tickets/Team/Time Tracking)
- **Table columns**: Avatar + Name, Email, Role, Status (Active/Invited/Disabled), Projects (count, clickable — opens the Projects tab), Weekly Capacity, Last Login, Actions
- **Row actions (⋯)**: View Profile, Edit User, Reset Password, Resend Invitation (Invited only), Disable/Enable User, Delete User (confirmation modal required)
- **Invite User modal** (`invite-user-modal.tsx`): First/Last Name, Email, Role, Weekly Capacity, Assign Projects (checkbox list), "Send invitation immediately" toggle. The same component also powers "Edit User" via an `editingUser` prop (pre-filled, no invite toggle, "Save Changes")

The existing Member Profile Modal (`member-profile-modal.tsx`) is reused rather than building a new one — it now supports two modes: the original single-view (unchanged, still used everywhere a `TeamMember` is clicked) and a tabbed mode (Profile / Projects / Permissions / Security / Activity) that activates when opened with a `user` (org-wide `User`) instead of a `member`.

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

Nothing currently in progress. Auth/profile/avatar and Projects (Sidebar, `/projects`, per-project Settings) backend integration are done and confirmed working — see Current Sprint → Completed → Authentication & Profile / Projects / Project Settings. Next candidate is wiring Tickets to the same Supabase schema — see Next Recommended Feature. The Unfuddle → Jirita import is specified (`docs/UNFUDDLE_IMPORT_SPECIFICATION.md`) but no importer code exists yet.

---

# Not Implemented

The following features are documented as planned but do not exist in the codebase yet.

### Authentication

- Register / Sign Up screen (no self-service account creation — accounts are provisioned directly in Supabase; see `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` for the eventual bulk-provisioning path)
- Invitations (inviting a new user to an organization)

Login, Logout, Forgot Password, Reset Password, Change Password, and real server-verified session persistence (a real Supabase session, not a mock `localStorage` flag) are implemented — see Current Sprint → Completed → Authentication & Profile.

### Sidebar Navigation

No known dead links remain. Milestones was removed from the UI entirely for MVP. Per-project Notes, Team, and Reports are real, functional routes (`/projects/[slug]/notes`, `/team`, `/reports`), gated per role via `nav-config.ts` rather than hardcoded.

All top-level navigation items (Dashboard, My Work, Projects, Reports, Settings) are functional, and each renders a role-specific screen where applicable (Dashboard, Projects, Reports).

---

# Next Recommended Feature

Ticket editing — inline status, assignee, and priority changes directly in the ticket detail page. (Authentication, previously recommended here, is now complete and confirmed working against a live Supabase project — see Current Sprint → Completed → Authentication & Profile.)

Alternatively: continue the Supabase backend work already underway — Tickets is the natural next mock-to-real seam to wire, following the same pattern established for profiles/organization_memberships and now Projects (real query + minimum-privilege grants + RLS, with a dev-only mock fallback until it's fully connected). Wiring Tickets would also let Project Overview/per-project Reports/Dashboard pick up real numbers instead of the `openTickets`/`blockedTickets`/`progress`/etc. fields Projects' own real data still defaults to 0 (see Architecture Status). See Architecture Status.

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

Current architecture follows a frontend-first approach, with Auth/Profile and now Projects as real exceptions — see below.

Current stack:

- Next.js 16.2.9
- React 19
- TypeScript
- TailwindCSS v4
- `@supabase/supabase-js` — used by `src/lib/auth.ts`, `src/lib/membership.ts`, `src/lib/avatar-upload.ts`, and `src/lib/projects.ts`

Not installed:

- shadcn/ui (referenced in earlier documentation but not present in `package.json`)

Current data source:

- **Real Supabase**: authentication/session, `profiles`, `organization_memberships`, `organizations`, the `avatars` Storage bucket, `projects`, and `clients` — confirmed working end-to-end against a live project. Real coverage of `projects` is scoped to the Sidebar, the `/projects` list, and `/projects/[slug]/settings` only — Project Overview, Tickets, Notes, Team, and per-project Reports still read `mock-projects.ts` directly.
- **Mock data** (everything else): `src/lib/mock-projects.ts` (still the source for Project Overview/Tickets/Notes/Team/per-project Reports), `src/lib/mock-tickets.ts`, and the other `src/lib/mock-*.ts` files; module-level constants in screen components.

Backend integration, connected and confirmed working:

- `src/lib/supabase-client.ts` — the lazy Supabase browser client, now imported by `auth.ts`/`membership.ts`/`avatar-upload.ts`/`projects.ts`
- `src/lib/auth.ts` — login, logout, session (`onAuthStateChange`), forgot/reset password, and change password (verified via re-authentication, never a manual password comparison)
- `src/lib/membership.ts` — loads a signed-in user's `profiles` + active `organization_memberships` + `organizations` row, and writes real updates (name, weekly capacity via a security-definer RPC, avatar path)
- `src/lib/avatar-upload.ts` — client-side validate/resize (Canvas, no new dependency)/upload to Supabase Storage
- `src/components/current-user-provider.tsx` / `src/components/auth-guard.tsx` — real membership drives `CurrentUser` and route gating, with a dev-only mock fallback (never in production) so local dev isn't blocked on seeded data
- `src/lib/projects.ts` — all real Projects reads/writes: `loadOrganizationProjects` (org-scoped list, RLS decides who sees what — no client-side role filtering), `createProject`/`updateProject` (Projects list Create/Edit modal: name + description), `archiveProject`/`restoreProject` (status only), `loadProjectDetail`/`updateProjectSettings` (Project Settings' General/Billing fields — status writes here structurally exclude `"archived"`), `loadOrganizationMembers` (Project Lead picker), `loadOrganizationClients`/`createOrganizationClient` (Billing → Client roster)
- `src/components/organization-projects-provider.tsx` — `OrganizationProjectsProvider`, mounted in `layout.tsx` next to `CurrentUserProvider`; Sidebar, `/projects`, and the Project Settings breadcrumb all read the same fetched list, so any write anywhere refetches once and every surface updates together. Dev-only mock fallback, same convention as `CurrentUserProvider`.
- `src/components/create-project-modal.tsx` / `archive-project-modal.tsx` / `add-client-modal.tsx` — Create/Edit Project, Archive confirmation (reused unchanged by Project Settings' Danger Zone), and the minimal "+ Add new client" flow, respectively
- Applied migrations, in order: `20260708000000_mvp_schema.sql` (base schema + RLS), `20260708010000_grant_authenticated_membership_read.sql` (SELECT grants — RLS alone doesn't grant table privileges), `20260709000000_profile_self_service_updates.sql` (self-service name/capacity writes), `20260710000000_avatars_storage.sql` + `20260711000000_fix_avatars_storage_policies.sql` (the `avatars` bucket and its RLS policies — first pass had a policy bug blocking uploads, fixed in the second file), `20260712000000_grant_authenticated_projects_read.sql`, `20260713000000_grant_authenticated_projects_insert.sql`, `20260714000000_fix_projects_select_rls_self_reference.sql` (real bug fix — `projects_select`'s helper function re-queried `projects` from within its own policy, which broke `INSERT`/`UPDATE ... RETURNING` specifically because Postgres evaluates the RETURNING-time SELECT check against the row being written in the same command and that self-reference doesn't reliably see it yet; rewritten to check the row's own columns directly), `20260715000000_grant_authenticated_projects_update.sql`, `20260716000000_add_clients_table.sql` (new `clients` table — not a foreign key on `projects`; `client_name` stays free text). See `docs/SUPABASE_SETUP.md` for how to apply migrations to a new project.
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` — how the Techtivo Unfuddle backup will map onto the schema; no importer code exists yet

Everything except Auth/Profile/Avatar and Projects (Sidebar/`/projects`/Project Settings) still runs entirely on mock data — Project Overview, Tickets, Notes, Team, per-project Reports, Dashboard, company-wide Reports, Users, and the rest of Settings are not connected. Note also that Projects' own real rows don't yet populate `openTickets`/`blockedTickets`/`overdueTickets`/`awaitingReviewTickets`/`dueThisWeekTickets`/`progress`/`activeMilestones` — those are derived from `tickets` by design and default to 0 until Tickets is wired (see `docs/SUPABASE_MVP_SCHEMA.md`).

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
- Filter chips and search inputs on the Tickets page are UI-only; chips toggle visually but do not filter the ticket list.
- Ticket Detail page fields are mostly read-only; no inline editing is implemented beyond status transitions.
- `settings-screen.tsx` (`SettingsScreen` hub component) is retained but no longer rendered — `/settings` redirects directly to `/settings/general`.
- Org-wide Settings (`/settings/*`) toggles and fields are visual only; no state persists between page loads. (Project Settings — `/projects/[slug]/settings` — is the one exception: it's real and persists, see Current Sprint → Completed → Project Settings.)
- Role now comes from a real `organization_membership` when one exists; `current-user.ts`'s mock identities are a dev-only fallback (never in production) rather than the only source of truth. **Resolved**: the `RoleSwitcher` is now gated behind `isDevFallback` (only renders, with a visible "Dev fallback" badge, when there's no real membership) instead of always showing. No real server-side permission enforcement is wired into the UI yet for projects/tickets/etc. — the RLS policies in `supabase/migrations/20260708000000_mvp_schema.sql` are applied and enforce tenant isolation at the DB layer, but the UI doesn't call any of those tables yet.
- Note "Duplicate" and "Delete" menu actions in `NoteDetailModal` are visual stubs with no effect.
- In dev fallback only (no real organization membership — never in production): the Projects list no longer filters by the old `LEAD_PROJECT_SLUGS` array (removed since real data is scoped by RLS instead), so a Project Lead testing without a seeded Supabase project now sees the full mock projects list rather than just their 3 owned slugs, while the summary cells (Blocked Tickets, Due This Week, Team Members Over Capacity) still compute against the `LEAD_PROJECT_SLUGS`-scoped team aggregation — a minor mismatch specific to unauthenticated/dev-fallback local testing, not the real-org path.
- Projects' real rows don't populate ticket-derived fields (`openTickets`, `blockedTickets`, `overdueTickets`, `awaitingReviewTickets`, `dueThisWeekTickets`, `progress`, `activeMilestones`) — they default to 0 until Tickets is wired to Supabase (by schema design, see `docs/SUPABASE_MVP_SCHEMA.md`), so the Projects list currently shows 0/empty progress bars for real projects on those specific fields.

Planned future work:

- Backend integration for Tickets/Dashboard/Reports/Users/Settings, and for the still-mock parts of Projects itself (Project Overview, Notes, Team, per-project Reports) (Auth/Profile/Avatar and Projects' Sidebar/`/projects`/Settings are done — see Architecture Status; schema for the rest is designed in `docs/SUPABASE_MVP_SCHEMA.md` and applied via `supabase/migrations/20260708000000_mvp_schema.sql`, just not queried by the UI yet)
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

1. Ticket editing (inline status, assignee, priority changes)
2. Backlog / Sprint Planning
3. Per-project Reports, Notes, Team pages refinements

(Authentication, previously first on this list, is now complete.)

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
