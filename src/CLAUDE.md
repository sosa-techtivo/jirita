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

Supabase Auth, real profile/organization-membership data, Projects
(Sidebar, the `/projects` list, and Project Settings), and Tickets
(the five list views with real search/filters, New Ticket creation, the
full Ticket Detail page — inline edits, Labels, Acceptance Criteria,
Attachments including rename/delete/preview, Time Tracking, Comments,
Related Tickets, and Activity — plus an editable Quick Ticket Preview
panel) are connected and confirmed working end-to-end against a live
Supabase project. The per-project Member Profile card (Active Tickets,
Assigned Hours, Utilization, Workload) is also real. Dashboard, Reports,
Users, and the rest of Settings are still unconnected mock data — see
"Still mock" below for the exact boundary within Projects itself
(Project Overview/Notes/Team/per-project Reports are not part of this).

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

## Confirmed working (Tickets — list views, New Ticket, and Ticket Detail)

Scoped narrowly, like Projects above: only the ticket data itself and the
screens listed here are real. Project Overview, Notes, Team, and
per-project Reports are untouched — see "Still mock".

- `src/lib/tickets.ts` — the single module for every real Tickets read/write:
  `loadProjectTickets` (all five list views — List/Board/Calendar/Timeline/
  Insights — scoped to one project via `project_id`, RLS decides
  visibility same as Projects), `loadTicketByCode` (Ticket Detail's real
  data source, resolved by the visible ticket code — e.g. `JIR-1` — never
  the internal uuid, which stays a database-only identifier and is never
  exposed in a URL), `createTicket` (New Ticket modal: title, description,
  acceptance criteria, estimated hours, and assignee are persisted;
  Type/Status/Priority/Labels/Due Date in "More Options" are still
  unwired and always write fixed defaults — `to_do`/`medium`/`task`/none —
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
  sites (Dashboard, Reports, Project Overview, etc., all still on mock
  data) render it read-only exactly as before. Persists through the same
  `updateTicket()` Ticket Detail itself uses, so both stay in sync.
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
  existing write path (`createTicket`/`updateTicket`/
  `uploadTicketAttachment`/`renameTicketAttachment`/`deleteTicketAttachment`/
  `logTicketTime`/`createTicketComment`/`createTicketRelation`/
  `deleteTicketRelation`) had to change: ticket creation, every field change
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
  this ticket" entry for tickets that predate this feature — using that
  ticket's own real `created_at`/`created_by`, with no actor shown at all
  if `created_by` is null, never a fabricated name.
- **Error handling is real across every Ticket write path** (create/edit/
  move, comments, time entries, attachments, related tickets): a shared
  `ErrorToast` (`ticket-ui.tsx`) surfaces failures that previously only hit
  `console.warn` with nothing shown to the user; inline field edits
  (`persist()` in `ticket-detail-screen.tsx`) roll back to the pre-edit
  value on failure instead of leaving an unpersisted change on screen;
  attachment rename now waits for the real result before closing its input
  (previously closed optimistically, before knowing whether it saved);
  New Ticket/Comment/Log Time all guard against a stuck spinner on a
  rejected (not just `{status:"error"}`) request; Ticket Detail's own load
  failure now has a Retry button, matching the ticket list's.
- Migrations (all confirmed against the live project, in order):
  `20260717000000_grant_authenticated_tickets_read.sql`,
  `20260718000000_grant_authenticated_tickets_insert.sql`,
  `20260719000000_fix_tickets_insert_rls_admin_lead.sql` (real bug: the
  base schema's `tickets_insert`/`ticket_comments_insert`/etc. policies
  only allowed a real `project_memberships` row, but that table is still
  empty — no staffing UI exists yet — so every insert was blocked for
  everyone; fixed by also allowing an org admin/lead, the same fix reused
  by every ticket-related insert policy added afterward),
  `20260720000000_grant_authenticated_ticket_comments_activity_read.sql`,
  `20260721000000_grant_authenticated_tickets_update.sql`,
  `20260722000000_add_labels_table.sql`,
  `20260723000000_add_tickets_acceptance_criteria_done.sql` (parallel
  `boolean[]` aligned by index with `acceptance_criteria` — deliberately
  not a restructuring of that column, since reordering/editing/deleting
  criteria aren't implemented),
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
  `author_profile_id`, and adds the first Activity-logging trigger,
  `log_comment_activity`), `20260728000000_real_ticket_activity_log.sql`
  (`tickets.created_by`, new `field_name`/`old_value`/`new_value` columns
  on `ticket_activity`, and the creation/field-change/attachment/time-entry
  triggers described above),
  `20260729000000_add_ticket_attachments_rename.sql` (RLS UPDATE policy +
  column-scoped `grant update (filename)` — attachment rename never touches
  `storage_path`, only the metadata row),
  `20260730000000_add_ticket_attachments_delete.sql` (RLS DELETE policy on
  both the metadata table and the `ticket-attachments` Storage bucket — no
  delete permission existed anywhere before this),
  `20260731000000_log_attachment_rename_delete_activity.sql` (the
  `attachment_renamed`/`attachment_deleted` Activity triggers),
  `20260801000000_unify_ticket_priority_scale.sql` (swaps the
  `ticket_priority` enum from `high`/`normal`/`low` to
  `highest`/`high`/`medium`/`low` — existing `normal` rows are migrated to
  `medium` in the same `ALTER TYPE ... USING` step, and the old enum type is
  dropped, not just deprecated),
  `20260802000000_add_ticket_relations.sql` (the `ticket_relations` table,
  its RLS policies, and the `relation_added`/`relation_removed` Activity
  triggers described above).

## Still mock

- Dashboard, Reports, Users, and the rest of Settings (`/settings/*`) all
  still read from `src/lib/mock-*.ts` — do not assume otherwise.
- Within Projects itself: Project Overview (`/projects/[slug]`), Notes,
  Team, and per-project Reports still import `src/lib/mock-projects.ts`
  directly — only the Sidebar, `/projects`, and `/projects/[slug]/settings`
  are real (see above). `admin-project-overview.tsx` and
  `project-lead-project-overview.tsx` (the Project Overview dashboards)
  still render `NewTicketModal`/`TicketDetailScreen` against their own
  local mock ticket state — real Tickets data doesn't reach these two
  screens.
- Within Tickets/Ticket Detail specifically, still mock/unimplemented on
  purpose (see the section above for what's real):
  - New Ticket's "More Options" fields (Type, Status, Priority, Labels, Due
    Date) — always write fixed defaults, never the value picked in the
    modal.
  - Editing or deleting a Comment — local-only, not persisted (posting a
    comment itself is real).
  - Attachments: rename, delete, download, and Preview are all real (see
    above) — "Replace File" isn't a partial/mock feature, it was removed
    from the menu entirely rather than wired up.
  - Milestone and Story Points fields on Ticket Detail — dead code, not
    rendered anywhere.
  - GitHub/Development integration — removed from Ticket Detail entirely
    (no real integration exists).
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` defines how Techtivo's Unfuddle
  backup maps onto the schema for the eventual data migration. No importer
  code exists yet, and it leaves several product decisions (orphaned
  tickets, the priority mapping, ticket-type classification) explicitly
  unresolved.

## Documentation Loading Strategy

At the beginning of every new session, only read:

- PROJECT_STATUS.md

Consult additional documentation under /docs only when it is relevant to the specific task being implemented:

- `docs/SUPABASE_MVP_SCHEMA.md` — target database schema for backend work
- `docs/SUPABASE_SETUP.md` — how to apply the migration to a real Supabase project
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` — the Unfuddle → Jirita migration spec

Do not read the entire documentation set unless explicitly requested.