# Jirita

## Project Overview

Jirita is a modern project management platform focused on simplicity, speed, and usability.

The goal is not to build another Jira.

The goal is to build the simplest project management platform teams actually enjoy using every day.

The initial objective is to replace the current Unfuddle-based workflow used internally by Techtivo.

Future versions may be offered to external customers.

---

# Product Vision

Jirita combines:

- Project Management
- Ticket Tracking
- Milestone Planning
- Team Collaboration
- Project Documentation
- Time Tracking
- Reporting

into a single cohesive experience.

The platform should feel:

- Fast
- Modern
- Intuitive
- Efficient
- Pleasant to use

---
# Project Scope

This directory (/src) is the active implementation project.

Rules:

- All development happens only inside this directory.
- Never modify files outside this directory.
- Do not read, edit, delete or refactor anything under:

  ../product
  ../prototypes

Those directories are read-only references.

If a requested change would require modifying them, stop and explain why instead of making the change.

---

# Source of Truth Documents

Before making product, UX, or architecture decisions, review the following documents:

1. PRODUCT_VISION.md
2. MVP_SCOPE.md
3. DESIGN_PRINCIPLES.md
4. DESIGN_SYSTEM_PRINCIPLES.md
5. USER_PERSONAS.md
6. CORE_CONCEPTS.md
7. INFORMATION_ARCHITECTURE.md
8. USER_FLOWS.md
9. NAVIGATION_PRINCIPLES.md
10. FUTURE_ROADMAP.md

These documents define the product and take precedence over assumptions.

---

# Primary Goal

Replace the current internal workflow used in Unfuddle while significantly improving:

- User Experience
- User Interface
- Speed
- Simplicity
- Discoverability

The objective is not feature parity.

The objective is a better overall experience.

---

# Target Users

## Primary Persona

Project Coordinator

Responsible for:

- Creating tickets
- Managing milestones
- Assigning work
- Tracking progress
- Coordinating projects

Most workflows should be optimized for this user.

## Secondary Personas

### Business Owner

Needs:

- Visibility
- Reporting
- Workload insights
- Project health

### Team Member

Needs:

- Assigned work
- Clear priorities
- Fast ticket updates
- Easy time tracking

## Future Persona

### Client

Future releases may allow external clients to access projects.

Client-facing experiences are not part of the MVP.

---

# Core Concepts

The platform is built around the following concepts:

- Workspace
- User
- Project
- Milestone
- Ticket
- Status
- Label
- Comment
- Time Entry
- Note
- Report

Avoid introducing new concepts unless absolutely necessary.

Simplicity is achieved through a limited conceptual model.

---

# Product Principles

Always prioritize:

1. Simplicity
2. Usability
3. Speed
4. Clarity
5. Consistency

When evaluating alternatives, prefer the simpler solution.

---

# Navigation Principles

Users should always know:

- Where they are
- What they can do
- How to return

Navigation should remain shallow and predictable.

Search should be a first-class feature.

---

# Design Principles

The interface should feel:

- Lightweight
- Professional
- Modern
- Approachable

The interface should not feel:

- Corporate
- Bureaucratic
- Enterprise-heavy

Whitespace, typography, and hierarchy should be used intentionally.

---

# What Jirita Is Not

Jirita is not trying to become:

- Jira
- Azure DevOps
- A highly configurable enterprise platform
- A Scrum management system
- A process-heavy governance tool

The goal is focus, not feature quantity.

---

# MVP Scope

The MVP includes:

- Projects
- Milestones
- Tickets
- Team Management
- Notes & Wiki
- Time Tracking
- Reporting
- Search

Features outside the MVP should not influence core architecture decisions unless explicitly approved.

---

# Development Guidance

When proposing solutions:

- Prefer simple implementations.
- Avoid over-engineering.
- Avoid premature abstraction.
- Optimize for maintainability.
- Optimize for usability.

Always explain tradeoffs.

When uncertain, choose the solution that keeps the product simpler.

---

# Decision Framework

Before recommending any feature, workflow, or architectural change, ask:

1. Does it improve usability?
2. Does it reduce complexity?
3. Does it support the primary persona?
4. Does it align with the product vision?
5. Would a new user understand it immediately?

If the answer is no, reconsider the proposal.

---

# Long-Term Vision

Jirita should eventually become the preferred workspace for small and medium-sized software teams.

Future capabilities may include:

- Client Portals
- GitHub Integration
- Executive Dashboards
- AI Assistance
- Capacity Planning
- Staffing Insights

However, simplicity must remain the defining characteristic of the platform.

---

# Backend Integration Status

Supabase Auth, real profile/organization-membership data, and Projects
(Sidebar, the `/projects` list, and Project Settings) are connected and
confirmed working end-to-end against a live Supabase project. Tickets,
Dashboard, Reports, Users, and the rest of Settings are still unconnected
mock data — see "Still mock" below for the exact boundary within Projects
itself (Project Overview/Tickets/Notes/Team/per-project Reports are not
part of this).

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
  stay in sync. **Dev-only fallback:** if no real profile/membership is
  found (or the lookup errors), and only outside a production build, it
  falls back to the old mock `current-user.ts` identity so local dev isn't
  blocked on seeded data — visibly flagged with a "Dev fallback" badge next
  to the (also fallback-only) `RoleSwitcher` in the header. This fallback
  can never engage in a production build. In production, a signed-in user
  with no membership sees `MembershipErrorScreen` instead of the app shell,
  not a fake role.
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
  bug that blocked uploads, fixed in the second file). See
  `docs/SUPABASE_SETUP.md` for how to apply migrations to a new project.

## Confirmed working (Projects — Sidebar, `/projects` list, Project Settings)

Scoped narrowly: only the Sidebar's pinned project list, the `/projects`
page, and `/projects/[slug]/settings` read/write real data. Project
Overview, Tickets, Notes, Team, and per-project Reports still import
`src/lib/mock-projects.ts` directly and are unaffected — see "Still mock".

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
  rate, project lead — `updateProjectSettings`'s status field is typed to
  exclude `"archived"`, so that transition is structurally only reachable
  through `archiveProject`/`restoreProject`, never a parallel path),
  `loadOrganizationMembers` (Project Lead picker roster), and
  `loadOrganizationClients` / `createOrganizationClient` (Billing → Client,
  backed by the `clients` table below).
- `src/components/organization-projects-provider.tsx` —
  `OrganizationProjectsProvider`, mounted in `layout.tsx` next to
  `CurrentUserProvider`, holds the org's project list once so Sidebar and
  `/projects` always show the exact same data; every write refetches
  through it afterward, which is also how edits made in Project Settings
  propagate to Sidebar, `/projects`, and the settings page's own
  breadcrumb without any extra wiring. **Dev-only fallback:** same pattern
  as `CurrentUserProvider` — no real organization falls back to the old
  mock `projects` array (in-memory only, never in production).
- `src/components/create-project-modal.tsx` — Create *and* Edit Project (an
  `editingProject` prop switches modes, mirroring `invite-user-modal.tsx`'s
  `editingUser` pattern).
- `src/components/archive-project-modal.tsx` — the Archive confirmation
  modal, reused as-is by both the Projects list row menu and Project
  Settings' Danger Zone (never duplicated). Restore has no confirmation
  step — the menu item / Danger Zone button call `restoreProject` directly.
- `src/components/project-settings-screen.tsx` — real General (Project
  Name, Description, Project Code, Status, Project Lead) and Billing
  (Project Category, Client, Billing Rate) editing, plus a real "Save
  Changes" button (none existed before this). Also exports
  `ProjectSettingsBreadcrumb`, a client component reading from the shared
  provider so the breadcrumb never shows a stale server-rendered name.
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

## Still mock

- Tickets, Dashboard, Reports, Users, and the rest of Settings
  (`/settings/*`) all still read from `src/lib/mock-*.ts` — do not assume
  otherwise.
- Within Projects itself: Project Overview (`/projects/[slug]`), Tickets,
  Notes, Team, and per-project Reports still import
  `src/lib/mock-projects.ts` directly — only the Sidebar, `/projects`, and
  `/projects/[slug]/settings` are real (see above).
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` defines how Techtivo's Unfuddle
  backup maps onto the schema for the eventual data migration. No importer
  code exists yet, and it leaves several product decisions (orphaned
  tickets, the priority mapping, ticket-type classification) explicitly
  unresolved.

## Documentation Loading Strategy

At the beginning of every new session, only read:

- PROJECT_STATUS.md
- CHANGELOG.md

Consult additional documentation under /docs only when it is relevant to the specific task being implemented:

- `docs/SUPABASE_MVP_SCHEMA.md` — target database schema for backend work
- `docs/SUPABASE_SETUP.md` — how to apply the migration to a real Supabase project
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` — the Unfuddle → Jirita migration spec

Do not read the entire documentation set unless explicitly requested.