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
(Sidebar, the `/projects` list, and Project Settings), Tickets
(the five list views with real search/filters, New Ticket creation, the
full Ticket Detail page — inline edits, Labels, Acceptance Criteria,
Attachments including rename/delete/preview, Time Tracking, Comments,
Related Tickets, and Activity — plus an editable Quick Ticket Preview
panel), Project → Team (the real roster, project-scoped Lead/Member role
via `project_memberships.project_role`, Make Project Lead, auto-membership
on real contribution, Add/Remove Member, and a paginated Work History
page), Project Notes (list, search, create, edit, Duplicate, and delete
against real `project_notes`), the Dashboard for the Admin, Project Lead,
and Member roles (every KPI, list, and quick action described below), and
Reports for the Admin role (`/reports` — both the Delivery and Finance
tabs, including filters, Health Alerts, and Export) are connected and
**confirmed working end-to-end against a live Supabase project**. Users
(the `/users` list, Invite by email or by generated link, Disable/Enable,
Edit, a generated Reset Password link, and the shared Member Profile
Modal's Activity/Security tabs) is also fully implemented against the same
schema, but **not yet confirmed end-to-end against a live project or in a
browser** — every migration, Server Action, and screen below passes
`tsc`/`eslint`/`next build`, but this specific set of Users-only flows
(Invite/Disable/Enable/Edit/Reset Password) hasn't itself been clicked
through since it was built; treat that section as "should work, not yet
verified" until it has. Project Lead's own Reports view (a separate
component from Admin Reports) and the rest of Settings are still
unconnected mock data — see "Still mock" below for the exact boundaries
within Projects, Reports, and the Dashboards themselves.

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
  stay in sync. **The old dev-only mock fallback is gone entirely** — a
  real signed-in session with no active membership (or a lookup error)
  never renders a fake role/name/avatar in any environment, including
  local dev (`isDevFallback` is now hard-coded `false`; the "Dev fallback"
  badge and `RoleSwitcher` in the header are unreachable dead code, kept
  as-is rather than deleted). Two real-time behaviors on top of the
  original load: (1) if the signed-in user's membership ever resolves to
  "no-membership" — most notably an admin disabling this exact user while
  their tab is still open — the provider signs them out immediately
  (`logout()`), which flips `status` to `"unauthenticated"` and lets
  `AuthGuard`'s existing redirect-to-`/login` effect take over; a first-
  ever "no-membership" (never invited) still renders `MembershipErrorScreen`
  the same way, just no longer ever masked by mock data. (2) the still-open
  session's membership is silently revalidated (reusing `runFetch`, no new
  fetching mechanism) on window focus and on every route change, so a
  membership change made from another tab/session is picked up without a
  manual reload — no polling, no timers. `organization-projects-provider.tsx`
  had the equivalent mock-array fallback removed the same way; see its own
  bullet below.
- `src/lib/auth.ts` — `acceptInvitation` (sets the new password, then calls
  the `accept_own_invitation` RPC to flip the invited user's own
  `organization_memberships` row to `active`) backs both invite delivery
  methods below. `src/components/accept-invite-screen.tsx` and
  `src/components/reset-password-screen.tsx` both establish their session
  two ways: the email flow's Supabase-hosted link lands with the session
  already in the URL fragment (`detectSessionInUrl`, unchanged); a link
  generated via `generateLink` (Invite/Reset Password — see the Users
  section below) instead carries `?token_hash=...&type=...` in the query
  string, which these two screens now detect and resolve via
  `supabase.auth.verifyOtp()` before continuing through the exact same
  "set your password" form either way.
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
  bug that blocked uploads, fixed in the second file),
  `20260805000000_accept_own_invitation_rpc.sql` (the security-definer RPC
  `acceptInvitation` calls above — `organization_memberships_update` is
  admin-only by design, so an invited user can't flip their own row any
  other way),
  `20260806000000_grant_service_role_public_schema.sql` (a missing
  service-role grant that broke the Invite User Server Action's own writes;
  see the Users section below). See `docs/SUPABASE_SETUP.md` for how to
  apply migrations to a new project.

## Confirmed working (Projects — Sidebar, `/projects` list, Project Settings)

Scoped narrowly: only the Sidebar's pinned project list, the `/projects`
page, and `/projects/[slug]/settings` read/write real data. Project
Overview, Notes, and per-project Reports still import
`src/lib/mock-projects.ts` directly and are unaffected — see "Still mock".
(Team is also real now — see its own section below — but is unrelated to
this one.)

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
  breadcrumb without any extra wiring. The old dev-only mock-array fallback
  (no real organization → the old mock `projects` array) is gone, same as
  `CurrentUserProvider`'s — `isDevFallback` is always `false` now, so this
  provider (and everything gated on it) only ever renders real data or
  nothing.
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
screens listed here are real. Project Overview, Notes, and per-project
Reports are untouched — see "Still mock".

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

## Confirmed working (Project Notes — list, search, New Note, Edit, Duplicate, Delete)

Real replacement for `src/lib/mock-notes.ts`'s hardcoded array on
`/projects/[slug]/notes`. Only the Tag field stays local-only — see below.

- `src/lib/notes.ts` — the single module for every real Notes read/write:
  `loadProjectNotes` (real list for one project, newest-`updated_at`-first;
  RLS via `can_view_project` scopes visibility, no client-side role
  filtering), `createNote`, `updateNote`, `duplicateNote` (copies
  title/content into a new row in the same project, appending
  `(Copy)`/`(Copy 2)`/... — checked against every title that currently
  exists in the project via a fresh query, not just what's loaded
  client-side, so two people duplicating around the same time still land on
  distinct titles; `updated_by` is set explicitly to the real authenticated
  user via `auth.getUser()` so a duplicate reads as "touched by me just
  now," not waiting for a future edit), and `deleteNote`. Activity logging
  (create/update/delete) is handled entirely by database triggers into
  `project_note_activity` — none of the functions above write to it
  directly, and nothing in the UI reads that table yet (logged for a future
  Notes Activity view, not surfaced anywhere today).
- `src/components/notes-screen.tsx` — real list + search (title/body), "+
  New Note" (`NewNoteModal`, now exported so
  `project-lead-dashboard.tsx`'s Quick Actions can reuse it directly — see
  the Dashboard section below), and the card menu's Edit/Duplicate/Delete,
  all real.
- `src/components/note-detail-modal.tsx` — the detail view's Edit (saves
  via `updateNote`, only leaves edit mode on real success), Duplicate, and
  Delete are all wired to the real functions above — the card menu's
  `Duplicate`/`Delete` items were previously no-ops (`onSelect: () => {}`).
- `src/lib/mock-notes.ts` — kept as a type-only module (`ProjectNote`), same
  precedent as `mock-tickets.ts`/`mock-team.ts` after being replaced as a
  data source; the mock array and `getNotesByProjectSlug` are gone.
- **Tag stays local-only, deliberately unwired** — same "still mock"
  precedent as New Ticket's "More Options" fields: the Tag picker in
  `NewNoteModal`/`NoteDetailModal` keeps working as UI state, but no
  `project_notes` column exists for it and it's never sent to or read from
  Supabase.
- Migration: `20260811000000_add_project_notes.sql` (`project_notes` +
  `project_note_activity` tables, RLS select/insert/update/delete policies
  and grants, and the three logging triggers —
  `project_notes_log_created`/`_updated`/`_deleted`).

## Confirmed working (Users — list, Invite, Disable/Enable, Edit, Reset Password link, Activity, Security)

**Implemented and build/type-checked, not yet confirmed against a live
Supabase project or in a browser** — see this document's own opening
paragraph. Scoped to `/users` (Admin only) and the shared Member Profile Modal's
user-mode tabs it opens into. Every privileged write below goes through a
Server Action using `SUPABASE_SERVICE_ROLE_KEY` — never a direct client
write — because `organization_memberships` has no `UPDATE`/`INSERT` grant
for the `authenticated` role at all (RLS alone was never the gate here;
Postgres checks table privileges first), and because each write needs to
independently re-verify the caller server-side (active org admin, same
organization) rather than trust anything the browser claims.

- `src/lib/users.ts` — the real data source, replacing `mock-users.ts`
  entirely for this screen: `loadOrganizationUsers` (role/status/weekly
  capacity/joined date from `organization_memberships` + `profiles`, plus a
  real `lastLogin` — see `last-sign-in-action.ts` below), `disableOrganizationMember`
  / `enableOrganizationMember` (one shared Server Action, `setMembershipStatusAction`,
  just a different target status — status only, never touching
  `profiles`/`auth.users`), `editOrganizationMember` (first/last name +
  role + weekly capacity, atomically as much as two separate writes without
  a real DB transaction can be — an honest partial-failure message if the
  second write fails after the first succeeds, never a false "success"),
  `inviteOrganizationUser` (email invite) / `generateOrganizationInviteLink`
  (single-use link instead), and `generatePasswordResetLink`.
  `updateOrganizationMember` (direct client write, pre-existing) is now
  used **only** by the Users list's inline Weekly Capacity cell
  (`CapacityCell`) — that one path was intentionally left as-is/still
  broken (same "permission denied for table organization_memberships" as
  everything else here) since it's a distinct action from the ones this
  work covered; it has no Server Action yet.
- `src/lib/server/invite-user-action.ts` — `inviteUserAction` (real email
  via `inviteUserByEmail`) and `generateInviteLinkAction` /
  `generatePasswordResetLinkAction` (both use `generateLink`, which mints a
  single-use token but never sends mail) share one `prepareInvite` +
  `finalizeInviteRecords` pair so the two invite methods can't drift on
  validation/idempotency or on what gets written. The link handed back to
  the admin is always built from `NEXT_PUBLIC_APP_URL` + the token
  (`?token_hash=...&type=...`) — never `GenerateLinkProperties.action_link`,
  which points at the Supabase project's own domain — so a copied link
  never exposes a `supabase.co` URL.
- `src/lib/server/disable-user-action.ts` — `disableUserAction` /
  `enableUserAction` (see above); only ever touches
  `organization_memberships.status`, never `profiles` or `auth.users`.
  Unrelated to Team's own, similarly-named `hasProjectMemberHistory` check
  (different file, different table).
- `src/lib/server/edit-user-action.ts` — `editUserAction`, the
  authorization pattern (caller-authenticated client for identity + admin
  check, service-role client only after that passes) mirrored by every
  other Server Action in this family.
- `src/lib/server/last-sign-in-action.ts` — `loadLastSignInTimesAction`
  resolves real `last_sign_in_at` per org member via the Auth Admin API
  (`listUsers`, paged) — the only way to read *someone else's* sign-in
  time, since a client can only ever see its own via `auth.getUser()`.
  Never null unless the account genuinely never signed in.
- `src/components/invite-user-modal.tsx` — a pill toggle between "Send by
  email" (unchanged real flow) and "Generate invite link"; the latter
  replaces the form with a success view (read-only link field, Copy Link,
  Done) instead of closing the modal. Edit mode now genuinely awaits
  `editOrganizationMember` and only closes on real success (previously
  closed the instant the button was clicked, before the save even ran).
- `src/components/reset-password-link-modal.tsx` — the shared "link
  generated" success modal (message, read-only field, Copy Link, Done),
  used both by the Users row menu's "Reset Password" and by the Member
  Profile Modal's Security tab "Generate Reset Link" — pulled into its own
  file specifically to avoid a circular import between `users-screen.tsx`
  and `member-profile-modal.tsx`, not duplicated between them.
- `src/components/users-screen.tsx` — Disable/Enable/Edit/Reset Password
  link are all real now (previously the whole row-actions menu did nothing
  beyond a toast). The shared `Toast` gained a real `variant` ("success" |
  "error"): an error no longer renders with the same green checkmark icon
  as a success — only the icon/color changed, not layout/position/timing.
  Resend Invitation stays intentionally mock (toast-only, no real
  resend path exists).
- `src/components/member-profile-modal.tsx` (user-mode tabs) — the
  Activity tab is real and **summarized**, not a detailed log: reuses
  `ticket_activity` (via `loadUserActivity` in `tickets.ts`), grouping every
  non-milestone action on the same ticket into one "Working on `JIR-x` · N
  updates" entry (never listing comments/status changes/attachments/time
  entries individually) while `ticket_created` and "Joined the workspace"
  (from `organization_memberships.created_at`) stay as their own entries;
  capped at the 10 most recent after grouping. Nothing here is inferred
  from current account status — the old mock events ("Logged in",
  "Invitation email sent", "User disabled", "Assigned to `<project>`") were
  all removed rather than kept alongside real data. The Security tab shows
  the real `lastLogin` from above and its "Generate Reset Link" button
  (renamed from "Send Reset Email") calls `generatePasswordResetLink` and
  opens the same `ResetPasswordLinkModal` described above — no email is
  sent by this action.
- `src/app/accept-invite/` + `src/components/accept-invite-screen.tsx` —
  the real "set your password" landing page for both invite methods (see
  the auth section above for the `token_hash` vs. URL-fragment session
  handling).
- `.env.example` — `NEXT_PUBLIC_APP_URL`, the app's own public base URL
  used to build every generated link above; never a Supabase URL.
- Migrations: `20260805000000_accept_own_invitation_rpc.sql` and
  `20260806000000_grant_service_role_public_schema.sql` (both listed above
  under login/logout — pre-existing, already confirmed against the live
  project). No new grants/RLS were needed for Disable/Enable/Edit/Reset-
  Password-link themselves — all four go through the service-role client,
  which bypasses grants/RLS by design once the Server Action's own
  authorization check has
  already passed.

## Confirmed working (Project → Team)

Scoped to `/projects/[slug]/team` and the Work History page it links to,
plus the project-scoped Lead/Member role and Team Capacity data this
section's own `loadProjectTeam` also backs on the Project Lead Dashboard
(see below). Real replacement for `mock-team.ts`'s `getTeamByProjectSlug`
on this screen only — every other `mock-team.ts` consumer (the Member
Profile Modal's per-project single-view mode, `resolveTeamMember`, ticket
assignees/comment authors/activity-feed actors elsewhere in the app) is
untouched; `mock-team.ts` itself only gained small, additive members
(`TeamMember.projectRole`, `MemberIdentity.profileId`/`projectRole`,
`TEAM_MEMBER_REMOVED_EVENT`, `TEAM_PROJECT_LEAD_CHANGED_EVENT` — see
below), no existing field/behavior changed.

- **Team membership is now (mostly) automatic.** A database trigger
  (`ensure_project_membership`, security-definer — the same
  trigger-on-the-existing-write pattern as Ticket Activity) creates a
  `project_memberships` row the first time someone creates a ticket, edits
  one, comments, logs time, uploads an attachment, or links a ticket —
  never merely by viewing/navigating. It's the only way a plain Member
  (who has no direct `INSERT` grant on `project_memberships`) ends up with
  their own membership row; an Admin who contributes is added exactly the
  same way, with no special-casing of org role. A backfill covers
  contributions that already existed before this trigger.
- **Project-scoped role (Lead vs. Member) is now a real, explicit column** —
  `project_memberships.project_role` (`'lead'` | `'member'`, default
  `'member'`, a partial unique index enforces at most one lead per project)
  is the authoritative "who leads this project" signal, distinct from
  `projects.owner_profile_id` (an older, unrelated Project Settings field)
  and from `organization_memberships.role` (the org-wide Admin/Project
  Lead/Member role). `loadProjectTeam`'s `title` field was also fixed to
  show each member's real *org* role label (Admin/Project Lead/Member)
  rather than `project_memberships.title`, which only ever exists to gate
  project membership, not to be displayed as a role — a real bug where
  every real member showed as "Member" on this screen regardless of their
  actual org role.
- **Make Project Lead** — an Admin-only action in `member-profile-modal.tsx`'s
  `MemberMenu`, gated to members whose real org role is itself Admin or
  Project Lead (never a plain Member). `setProjectLead` (`lib/projects.ts`)
  clears any existing lead on the project first (the unique index allows
  only one), then promotes the new one, touching only that project's own
  `project_memberships` rows — no organization role, no other project, no
  ticket/hours data. `TEAM_PROJECT_LEAD_CHANGED_EVENT` (same `window`
  `CustomEvent` bridge as member removal, below) lets `team-screen.tsx`
  reflect the change immediately without a manual reload.
- **`loadProjectTeam`'s Weekly Capacity now falls back to the member's real
  organization-level capacity** when the project-level value is unset
  (`null`) — a real bug where a member added via "+ Add Member" (which
  never wrote `project_memberships.weekly_capacity`) displayed 0h capacity
  here despite having a real, configured org-level weekly capacity. Only a
  genuinely unset value falls back; an explicit 0 is never overridden. This
  is the exact same query the Project Lead Dashboard's Team Capacity reads
  (see below), so both stay consistent automatically.
- `src/lib/projects.ts` — `loadProjectTeam` (real roster: name/email/avatar/
  title/weekly capacity from `project_memberships` + `profiles`; assigned
  hours/active-ticket count are combined in `team-screen.tsx` itself from
  real tickets, matched by the real `assigneeProfileId`, never by name),
  `addProjectMember` (direct client write — `project_memberships_insert`'s
  own RLS, `is_org_admin_or_lead`, is exactly who "+ Add Member" is already
  gated to, so no Server Action is needed here, unlike Users' admin-on-
  someone-else's-org-row writes), `removeProjectMember` (direct client
  delete; the real guarantee against removing a member with history is a
  database trigger, not this function or the UI — see below), and
  `hasProjectMemberHistory` (an RPC check — created/assigned/commented/
  logged time/uploaded/related/any `ticket_activity` row — deciding whether
  "Remove from Project" even appears; never rendered disabled, simply
  omitted when history exists).
- **"Remove from Project" can never delete a member with real history, at
  the database level.** A `BEFORE DELETE` trigger on `project_memberships`
  calls the same history check and raises an exception if it's true — this
  holds regardless of how the delete is invoked (this app, a future Server
  Action, a manual call), not just because the UI hid the option.
- `src/components/team-screen.tsx` — real roster + real KPIs (Team
  Members/Weekly Capacity/Assigned Hours/Team Utilization, all derived
  live from the same member list, never stored/stale). "+ Add Member"
  opens `add-team-member-modal.tsx`, a picker over real org members not
  already on the team. Removing a member from the Member Profile Modal
  (mounted globally, fully decoupled from this screen) is picked up
  immediately without a manual reload via a `window` `CustomEvent`
  (`TEAM_MEMBER_REMOVED_EVENT` in `mock-team.ts`) dispatched only after the
  server confirms the delete — the listener both filters the member out of
  local state right away and triggers a real refetch, so a slower, already
  in-flight fetch from just before the removal can never resurrect the
  removed member with stale data.
- `src/components/member-profile-modal.tsx` (project-mode `MemberMenu`,
  shared with the modal's other tabs above) — "Send Message" was removed
  outright (no messaging system exists); "View Ticket History" was renamed
  to "View Work History" and now closes this modal and navigates to its
  own page (see below) instead of opening a second modal. `utilizationOf` /
  `remainingAvailabilityLabel` / `CapacityBar` now normalize
  `weeklyCapacity`/`assignedHours` to finite, non-negative numbers before
  dividing — a 0-capacity member shows `0%` (never `NaN%`/`Infinity%`), and
  the bar's width can never receive a non-finite value; over-100%
  (over-allocation) is still shown as-is in text, only the bar's own width
  stays clamped, same convention as before.
- `src/app/projects/[slug]/team/[userId]/work-history/` +
  `src/components/work-history-screen.tsx` — "which tickets has this
  person worked on in this project," never a detailed log (that's still
  the ticket's own Activity Log's job). Real, **server-side** pagination
  (20/page, `?page=` in the URL, Previous/Next) via two RPCs
  (`project_member_work_history_summary` for the full-history totals shown
  regardless of page, `project_member_work_history_page` for one page's
  rows via `LIMIT`/`OFFSET` in Postgres) built on one shared inner table
  function (`project_member_work_history_rows`) so the participation rule
  exists in exactly one place — never the whole history fetched to the
  client to slice locally. A requested page past the end resolves to the
  last real page rather than rendering a misleadingly empty one. Clicking
  a ticket reuses the real Ticket Detail route directly
  (`/projects/[slug]/tickets/[ticketCode]`), never `TicketPreviewPanel`.
- Migrations, in order (all confirmed against the live project):
  `20260803000000_add_project_creator_membership.sql` (a project's creator
  always gets a real `project_memberships` row, plus a backfill for
  existing projects),
  `20260804000000_grant_authenticated_project_memberships_read.sql`
  (SELECT grant — same table-privileges-before-RLS gap as everywhere else),
  `20260807000000_grant_authenticated_project_memberships_write.sql`
  (INSERT/UPDATE/DELETE grant — `project_memberships_insert/_update/_delete`'s
  own RLS, `is_org_admin_or_lead`, was already the correct gate; only the
  privilege grant was missing),
  `20260808000000_auto_project_membership_on_contribution.sql`
  (`ensure_project_membership` + the five contribution triggers + backfill
  described above),
  `20260809000000_project_membership_history_guard.sql`
  (`project_membership_has_history` + the `BEFORE DELETE` trigger that
  actually enforces it),
  `20260810000000_project_member_work_history_pagination.sql` (the three
  Work History RPCs described above),
  `20260812000000_add_project_membership_project_role.sql` (the
  `project_role` column, check constraint, and partial unique index
  described above, with a backfill for existing rows),
  `20260813000000_restore_project_memberships_after_project_role.sql` and
  `20260814000000_restore_manually_added_project_membership.sql`
  (corrective — during this work, a validation script accidentally deleted
  every real `project_memberships` row in the live database; these two
  migrations re-derive/restore them from still-intact source data — project
  creator/owner, ticket contributors — plus, for the one row with no
  derivable source, a hardcoded restore of the exact values observed
  moments before the deletion, approved by the user before applying. Fully
  verified restored afterward: correct rosters, roles, and KPIs, no
  duplicates. Live-validation scripts against this schema must always scope
  test-data creation/cleanup to freshly-generated, uniquely-stamped
  slugs/emails — never broad/unscoped deletes against any real table).

## Confirmed working (Dashboard — Admin)

Real KPIs, lists, and quick actions for the Admin role's `/dashboard` — no
mock data remains on this screen (only `Ticket`/`getTicketDisplayKey` are
still imported from `mock-tickets.ts`, and only as the shared type/display-
key helper every real screen in this app already uses the same way, not as
a data source).

- `src/lib/tickets.ts` gained the three org-wide loaders this screen (and,
  scoped to one project, the Project Lead Dashboard below) both build on:
  `loadOrganizationTickets` (every ticket across every project in the org,
  RLS-scoped same as everywhere else), `loadOrganizationLoggedMinutes`
  (real logged time for a given set of ticket ids), and
  `loadOrganizationActivity` (the real `ticket_activity` feed, filtered to
  the 5 event types this widget has a visual category for —
  `blocked`/`completed`/`hours`/`assigned`/`priority` — everything else,
  e.g. title/description edits, comments, attachments, is genuinely real
  too but just doesn't have a slot in this particular widget).
- `src/lib/projects.ts` gained `loadOrganizationWorkloadMembers` (active
  org members + weekly capacity, for Team Workload).
- `src/components/dashboard-screen.tsx`'s `AdminDashboard()` — Assigned
  Tickets, Hours Burn, Blocked, Due Today (the 4 KPI cards), My Active
  Work, Recent Activity, My Upcoming Deadlines, Team Workload, Projects at
  Risk, and the Organization Health insight band are all computed from the
  real loaders above (previously mock `MY_ACTIVE`/`RECENT_ACTIVITY`-shaped
  data). Real empty states throughout — genuine zero-value math, same
  convention used everywhere else in this app, never a fabricated "0 of 0".
- Quick Actions: **New Project** and **Add Member** open
  `CreateProjectModal`/`InviteUserModal` directly from the Dashboard (the
  same modals Projects/Users already use) instead of navigating there
  first; **New Ticket** was removed from Quick Actions entirely (not
  wired, removed by explicit scope decision, not a partial/mock feature).
- `src/components/dashboard-shared.tsx` — `DashboardActivityEntry` gained
  an optional `ticket?: Ticket` field so real (Supabase-backed) Recent
  Activity callers can pass an already-resolved real ticket object,
  bypassing `getTicketById`'s mock-only lookup; `RecentActivityList` /
  `ActiveTicketRow` / `Card` themselves are unchanged, just now also fed
  real data by this screen and by the Project Lead Dashboard below.
  `MY_ACTIVE`/`RECENT_ACTIVITY` (the mock constants) are no longer read by
  this screen, but stay exported/defined because `project-lead-dashboard.tsx`
  and `project-lead-reports-screen.tsx` still import them.
- No new migrations — this section is pure application-layer
  query/rendering work on top of the already-real
  `tickets`/`ticket_activity`/`organization_memberships` tables.

## Confirmed working (Dashboard — Project Lead)

Real Current Project selector, KPIs, and quick actions for the Project
Lead role's `/dashboard` — every section is now real; nothing on this
screen reads mock data anymore (`LEAD_PROJECT_SLUGS` / `PROJECT_TICKETS` /
`aggregateTeam` / `getTeamByProjectSlug` / `MY_ACTIVE` stay
defined/exported in `project-lead-dashboard.tsx` only because
`projects-list-screen.tsx` and `project-lead-reports-screen.tsx` still
import them directly).

- `src/lib/projects.ts` gained `loadLeadProjects` (the real Current
  Project list — every active project where this profile has a
  `project_memberships` row with `project_role = 'lead'`; a real bug was
  fixed here mid-build — it originally filtered by
  `projects.owner_profile_id`, an older/unrelated field, which silently
  returned "No projects assigned" for a real lead with no
  `owner_profile_id` set) and `setProjectLead` (Make Project Lead — see the
  Team section above).
- `src/components/project-lead-dashboard.tsx`'s `ProjectLeadDashboard()`:
  - **Current Project** — `loadLeadProjects` drives the selector; switching
    projects re-fetches everything below it immediately (tickets, team,
    logged minutes, activity, in one effect keyed on the selected slug).
  - **Current Delivery** — Delivery Progress, Completed Tickets, Remaining
    Hours (estimated hours of this project's active — non-`done` —
    tickets, minus real logged minutes on those same tickets, floored at
    0, same shape as the Admin Dashboard's Hours Burn KPI), and Blocked
    Tickets, all from `loadProjectTickets` + `loadOrganizationLoggedMinutes`.
  - **Target Date** — the nearest due date among this project's own active
    tickets (reuses the same sorted list Upcoming Deadlines already
    computes — `deadlines[0]?.dueDate` — no second date computation);
    shows the existing empty dash when no active ticket has a due date.
    (Previously read `projects.target_date`, a Project Settings field
    unrelated to the project's actual ticket deadlines.)
  - **Attention Required** — Blocked Tickets, Due Today, Over Capacity
    (real per-project roster + real assigned hours via `utilizationOf`),
    and Awaiting Review, all real.
  - **Team Capacity** — the real project roster (`loadProjectTeam`)
    combined with real assigned hours (active tickets matched by
    `assigneeProfileId`, same definition `team-screen.tsx` uses), sorted by
    utilization descending; a real empty state when the project has none.
    Reuses `loadProjectTeam` as-is, including its real-org-capacity
    fallback fix — see the Team section above.
  - **Project Work** (renamed from "My Active Work" once it stopped being
    scoped to the signed-in lead's own tickets) — every active ticket in
    the project regardless of assignee, restricted to the To Do/In
    Progress/Blocked/In Review statuses (backlog and done excluded on
    purpose), sorted blocked-first, then by priority, then by due date
    ascending.
  - **Recent Activity** — `loadOrganizationActivity` scoped to this one
    project's ticket ids (the same function/event categories the Admin
    Dashboard uses), from any project member, not just the signed-in lead.
  - **Upcoming Deadlines** — every active (non-`done`) ticket in the
    project with a due date, from any assignee, sorted ascending, with real
    overdue styling (`parseDisplayDate`/`getTodayISO`, not the old
    hardcoded mock-date string comparison).
  - **Quick Actions** — **Add Member** opens `AddTeamMemberModal` (same
    modal Team uses) directly against the selected project, without
    navigating to the Team page first; **New Note** opens `NewNoteModal`
    (exported from `notes-screen.tsx` for this reuse) and creates via
    `createNote`; **New Ticket** opens `NewTicketModal` (same modal Tickets
    uses, including Possible Duplicates against this project's real
    tickets) and the created ticket appears in Project Work/Upcoming
    Deadlines immediately. All three reuse the exact modals/services those
    other screens already use — no duplicated flow.
  - The header's date subtitle (previously the hardcoded string "Tuesday,
    June 30") now shows the real current date via the existing
    `getTodayISO()`/`formatISODate()` helpers.
- No new migrations — this section is pure application-layer
  query/rendering work on top of already-real tables.

## Confirmed working (Dashboard — Member)

Real greeting/date, KPIs, Recommended Next, My Active Work, Needs Your
Attention, Time Today, and Upcoming Work for the Member role's
`/dashboard` — no mock data remains on this screen itself. `MEMBER_WORK`/
`WorkItem` stay defined/exported in this same file only because
`member-projects-screen.tsx` ("My Projects") still reads them directly and
is out of scope for this pass.

- `src/lib/tickets.ts` gained the Member-Dashboard-specific reads:
  `loadProfileLoggedTimeForDate` (today's real logged time entries for one
  profile, across every ticket they have access to — not just tickets
  assigned to them, so pairing/helping on someone else's ticket still
  counts), `loadProfileLoggedMinutesForRange` (same scope, totaled over an
  inclusive date range — backs "Remaining This Week"), and
  `loadMemberAttentionEvents` (the real "Needs Your Attention" feed: the
  subset of `ticket_activity` on this member's own active tickets that asks
  them to actually do something — blocked, reassigned to them, moved to
  review, or estimate changed. The mock "mention" category has no real
  source in this schema — comments aren't parsed for @mentions — so it
  stays a defined type/dict entry but is never populated, the same "kept
  but unreachable until real data exists" precedent as Project Notes' Tag
  field).
- `src/lib/projects.ts` gained `loadMemberWeeklyCapacity` (a member's real
  weekly capacity, resolved as the max across their own
  `project_memberships.weekly_capacity` rows, falling back to their real
  `organization_memberships.weekly_capacity` when unset or when they have
  no project memberships yet — the same fallback `loadProjectTeam` already
  uses per project, just without a single project to scope to).
- `src/components/member-dashboard.tsx`'s `MemberDashboard()` — real load
  state (`loading`/`ready`/`error` with Retry, same convention as every
  other real screen) backed by `loadOrganizationTickets` (My Active Work:
  real tickets assigned to the signed-in member, excluding `done`) plus the
  three loaders above. Assigned Tickets, Weekly Capacity (renamed from the
  old hardcoded "Planned Today"), Logged Today, and Due Today (the 4 hero
  stats), Recommended Next, My Active Work, Needs Your Attention, the Time
  Today panel (Logged Today / Weekly Capacity / Remaining This Week, plus a
  real per-project breakdown of today's logged time), and Upcoming Work are
  all computed from real data — previously hardcoded mock (`ATTENTION_ITEMS`,
  `LOGGED_TODAY_BY_PROJECT`, a fixed `PLANNED_TODAY = 7`). Real empty states
  throughout ("You're all clear", "Nothing needs your attention right now",
  "No time logged yet today", "Nothing else on the horizon"). Sorting
  (`tierOf`/`dueSortValue`/`isUrgentDue`) now uses the real current local
  date (`getTodayISO()`/`parseDisplayDate()`) instead of a hardcoded mock
  date/label set. The header's date subtitle (previously the hardcoded
  string "Tuesday, June 30") now shows the real current date via
  `formatFullDate(todayISO)` — the same pattern the Project Lead Dashboard
  and (see below) the Reports header both use.
- No new migrations — pure application-layer query/rendering work on top of
  already-real tables.

## Confirmed working (Reports — Admin, Delivery and Finance tabs)

Real KPIs, tables, filters, alerts, and Export for both tabs of `/reports`
(`AdminReportsScreen` — used by both the Admin and Member roles; the
Finance tab itself is Admin-only, gated inside the component). Project
Lead gets a separate, still-mock component (`ProjectLeadReportsScreen`)
instead — see "Still mock" below.

- **Shared filters and period** — the Project/Assignee/Client/Date filters
  plus the Period selector (This Week/This Month/This Quarter/Custom) all
  read from one shared fetch (`rawTickets`/`rawProjects`/`rawMembers`/
  `rawCapacities`/`rawTimeEntries`/`rawActivityEvents`) rather than a
  separate query per widget; every KPI, table, and chip on both tabs
  derives from the same filtered ticket set via `useMemo` chains. Filter
  option lists (Project/Assignee/Client) are restricted to values that
  actually occur on a real ticket in the current unfiltered scope — a real
  org member with zero tickets never appears as a filter option.
- **Delivery KPIs, Health Alerts, Project Health, Hours by Person** —
  `buildDeliveryKpiSummary`, `buildProjectHealthRows`,
  `buildHoursByPersonRows` compute Projects/Active Tickets/Hours
  Burn/Blocked/Done/Overdue and per-person/per-project rollups from real
  tickets plus real logged time (`loadOrganizationLoggedTimeForRange` in
  `lib/tickets.ts`) plus real weekly capacity
  (`loadOrganizationMemberWeeklyCapacities` in `lib/projects.ts`, the same
  org-then-project-capacity fallback used elsewhere in the app). The
  alerts banner's critical/informational thresholds are derived from these
  same real KPI numbers, never a parallel computation.
- **Workload** — `buildWorkloadRows`: real assigned hours/capacity/
  utilization per person, plus a real "change this week" delta computed
  from `loadHoursAndAssigneeActivityForRange` (real `hours_changed`/
  `assignee_changed` activity in the current calendar week, uncapped — a
  weekly sum can't silently drop events past a display limit the way the
  curated Recent Activity widgets do). Heavy/Moderate/Light classification
  uses an inclusive `>=80` threshold.
- **Hours Distribution** — `buildHoursDistribution`: real hours bucketed by
  ticket status (`to_do`/`in_progress`/`blocked`/`review`/`done`),
  excluding backlog on purpose (mirrors the Board view's own status
  columns).
- **Recent Changes** — `buildRecentChanges` +
  `loadDeliveryActivityForTickets` (`lib/tickets.ts`): real, deduped,
  date-grouped activity for the current filtered ticket set, covering
  ticket creation, status/assignee/hours/priority/due-date changes, and
  related-ticket add/remove. `STATUS_FROM_DB` (exported from
  `lib/tickets.ts`) converts a `status_changed` row's raw DB enum value
  (snake_case) to the app's own display labels before rendering.
- **Delivery Export** — the Export dropdown's CSV/Excel/PDF options build 7
  sections (KPIs, Health Alerts, Hours by Person, Project Health, Workload,
  Hours Distribution, Recent Changes) from the exact same in-memory state
  every widget already reads, with no extra queries; the menu itself was
  simplified down to only these 3 real options (no disabled/placeholder
  items).
- **Finance KPIs, Billing Overview, Billable Hours by Member** —
  `buildFinanceKpiSummary`/`buildBillingOverviewRows`/
  `buildBillableHoursByMemberRows`: real Billable/Non-Billable hours,
  Utilization, and Estimated Revenue from real logged time × each
  project's real billing rate; Billing Overview's per-client
  weighted-average rate and Billable Hours by Member's per-member revenue
  are both computed per-project-then-summed (never re-derived from
  already-rounded display values, which would introduce rounding error) so
  their totals match the KPI card and each other to the dollar/hour.
- **Finance Export** — `buildFinanceExportGroups`/`buildFinanceExcelHtml`:
  CSV keeps sections un-mixed, Excel puts each section in its own
  worksheet (via the `xmlns:x="urn:schemas-microsoft-com:office:excel"`
  HTML-table convention — no new npm dependency), and PDF
  (`openPrintableReport`, via `window.print()` on a popup, parametrized
  with a `title` so Delivery/Finance never share a hardcoded report title)
  preserves on-screen order; the Report Summary section always includes
  Organization/Billing Period/Generated/Currency.
- **Header date** — `formatHeaderDate(getTodayISO())` replaces the page
  header's old hardcoded "Monday, June 30, 2026" with the real current
  local date, formatted "Weekday, Month Day, Year"; reuses the same
  `getTodayISO()` source (and the same `toLocaleDateString` pattern) the
  Member and Project Lead Dashboards' own header dates already use.
- No new migrations — pure application-layer query/rendering work on top
  of already-real `tickets`/`ticket_activity`/`ticket_time_entries`/
  `projects`/`organization_memberships`/`project_memberships` tables.

## Still mock

- The rest of Settings (`/settings/*`) all still reads from
  `src/lib/mock-*.ts` — do not assume otherwise. The Admin, Project Lead,
  and Member Dashboards, and Admin Reports (Delivery and Finance), are all
  fully real now — see their own sections above.
- `src/components/project-lead-reports-screen.tsx` — the Project Lead
  role's own Reports view, a separate component from `AdminReportsScreen`
  above (routed by `ReportsScreen()`'s own role check). Still reads
  `PROJECT_TICKETS`/`RECENT_ACTIVITY`/`MY_PROJECT_NAMES` and other
  `mock-*.ts` data untouched by this work.
- `src/components/member-projects-screen.tsx` ("My Projects," Member
  role) still reads `MEMBER_WORK` directly from `member-dashboard.tsx` —
  unaffected by the Member Dashboard becoming real above.
- Within Projects itself: Project Overview (`/projects/[slug]`) and
  per-project Reports still import `src/lib/mock-projects.ts` directly —
  only the Sidebar, `/projects`, `/projects/[slug]/settings`,
  `/projects/[slug]/team`, and `/projects/[slug]/notes` are real (see
  above). `admin-project-overview.tsx` and `project-lead-project-overview.tsx`
  (the Project Overview dashboards) still render `NewTicketModal`/
  `TicketDetailScreen` against their own local mock ticket state — real
  Tickets data doesn't reach these two screens.
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
- Within Users specifically, still mock/unimplemented on purpose (see the
  Users section above for what's real):
  - The Users list's inline Weekly Capacity cell (`CapacityCell`) still
    calls `updateOrganizationMember`, a direct client write — the same
    "permission denied for table organization_memberships" every other
    Users write used to hit before it got its own Server Action. This one
    path was intentionally left as-is; it has no Server Action yet.
  - Resend Invitation — toast-only, no real resend path exists.
  - Editing a user's email — the Edit User form still shows the field but
    never persists a change to it (unchanged from before); only
    first/last name, role, and weekly capacity are real writes.
  - `browser`/`os`/`device` on the Security tab — no real source exists,
    so these stay unset and simply don't render (never a fabricated
    value).
- Within Project → Team specifically, still mock/unimplemented on purpose
  (see the Team section above for what's real — Add/Remove Member and
  Work History are both real and wired up):
  - Per-person `status` (Available/Busy/Away) — no real availability
    source exists anywhere in the app; every real member shows a fixed
    "Available" rather than a fabricated per-person value.
- Within Project Notes specifically, still mock/unimplemented on purpose
  (see its own section above for what's real):
  - The Tag field — fully interactive in the UI, never persisted; no
    `project_notes` column exists for it.
  - `project_note_activity` is written by real database triggers on every
    create/update/delete, but no screen reads it yet — there is no Notes
    Activity view.
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