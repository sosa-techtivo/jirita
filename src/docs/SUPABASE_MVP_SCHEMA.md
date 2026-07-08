# Supabase MVP Schema (Design Only — Not Yet Applied)

This document defines the minimum Postgres/Supabase schema needed to take Jirita from
mock data to a real backend for the first live version. **No migration has been run
and no table exists yet** — this is the design to review before any `CREATE TABLE`
is written.

Scope is deliberately narrow: enough to replace `lib/mock-*.ts` for Projects, Tickets,
Team, and Users, plus a clean seam for the Unfuddle import. Reports, advanced time
tracking, custom fields, automations, and third-party integrations are intentionally
**not** modeled yet — see "Deferred, not modeled yet" at the end.

Naming follows the app's existing domain vocabulary in `src/lib/mock-*.ts` and
`src/lib/current-user.ts` so the eventual data-fetching layer maps onto these tables
with minimal renaming.

---

## Entity overview

```
organizations
  └─ organization_memberships (profile + org role)
  └─ projects
       └─ project_memberships (profile + project title/capacity)
       └─ tickets
            ├─ ticket_comments
            └─ ticket_activity

profiles (1:1 with auth.users)
```

One `organizations` row = one workspace (today: a single "Techtivo" workspace — the
table exists from day one so a future customer workspace is just another row, not a
schema change).

---

## Tables

### `organizations`

Purpose: the Workspace — the top-level tenant boundary everything else scopes to.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `name` | `text` | e.g. "Techtivo" |
| `slug` | `text` unique | |
| `created_at` | `timestamptz` | |

Relationships: parent of `organization_memberships` and `projects`.

---

### `profiles`

Purpose: a person's identity. One row per Supabase Auth user — this table does **not**
hold a role; role is per-organization (see `organization_memberships`), which keeps a
person's identity separate from their access level and holds up if Jirita ever needs
one person in more than one workspace.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | `references auth.users(id) on delete cascade` |
| `first_name` | `text` | |
| `last_name` | `text` | |
| `email` | `text` | denormalized copy of `auth.users.email` for convenient reads/joins |
| `avatar_url` | `text` | nullable |
| `unfuddle_id` | `text` unique, nullable | legacy Unfuddle user id, for import matching |
| `created_at` / `updated_at` | `timestamptz` | |

Relationships: referenced by `organization_memberships.profile_id`,
`project_memberships.profile_id`, `tickets.assignee_profile_id`,
`ticket_comments.author_profile_id`, `ticket_activity.actor_profile_id`.

Not modeled here: `weeklyCapacity`, `status` (Active/Invited/Disabled) from
`mock-users.ts`'s `User` — those are workspace-membership concerns, not identity, so
they belong on `organization_memberships` (see below), not `profiles`.

---

### `organization_memberships`

Purpose: org-level role — the direct replacement for `current-user.ts`'s `Role`
(`ADMIN | PROJECT_LEAD | MEMBER`) and `mock-users.ts`'s workspace account record.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `organization_id` | `uuid` fk → `organizations.id` | |
| `profile_id` | `uuid` fk → `profiles.id` | |
| `role` | `org_role` enum | `admin` \| `project_lead` \| `member` |
| `status` | `membership_status` enum | `active` \| `invited` \| `disabled` — from `mock-users.ts`'s `UserStatus` |
| `weekly_capacity` | `numeric` | hours/week, nullable |
| `created_at` | `timestamptz` | |

Constraints: `unique (organization_id, profile_id)`.

Relationships: child of `organizations` and `profiles`.

Note: this table is what makes someone show up in the Admin-only Users module
(`/users`) and gates `canManage()`-style checks — same shape as today, just per-org
instead of hardcoded to three demo accounts.

---

### `projects`

Purpose: matches `ProjectSummary` in `mock-projects.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `organization_id` | `uuid` fk → `organizations.id` | |
| `slug` | `text` | unique within org — used in routes (`/projects/[slug]`) |
| `name` | `text` | |
| `short_name` | `text` | |
| `project_code` | `text` | unique within org — prefixes visible ticket IDs (`MBA-12`) |
| `description` | `text` | |
| `status` | `project_status` enum | `planning` \| `active` \| `on_hold` \| `completed` \| `archived` |
| `priority` | `project_priority` enum | `critical` \| `high` \| `medium` \| `low` |
| `health` | `project_health` enum | `healthy` \| `needs_attention` \| `critical` |
| `category` | `project_category` enum | `client` \| `internal` |
| `client_name` | `text` | nullable; only meaningful when `category = 'client'` — plain text for MVP, same as `CLIENT_NAMES` today |
| `default_hourly_rate` | `numeric` | nullable |
| `owner_profile_id` | `uuid` fk → `profiles.id` | nullable |
| `target_date` | `date` | nullable |
| `unfuddle_id` | `text` unique, nullable | legacy Unfuddle project id |
| `unfuddle_imported_at` | `timestamptz` | nullable |
| `created_at` / `updated_at` | `timestamptz` | |

Constraints: `unique (organization_id, slug)`, `unique (organization_id, project_code)`.

**Not stored:** `openTickets`, `blockedTickets`, `overdueTickets`,
`awaitingReviewTickets`, `dueThisWeekTickets`, `progress`, `activeMilestones`. These
are all counts/aggregates derived from `tickets` today and should stay derived (a view
or a query at read time) rather than columns that can drift out of sync — the #1
source of "overdesign" risk in this table.

Milestone is kept as the free-text field it already is on `tickets.milestone`
(see below) rather than promoted to its own table — the app doesn't need
milestone-level CRUD yet, and `mock-tickets.ts` never modeled it as more than a
label.

---

### `project_memberships`

Purpose: matches `TeamMember` in `mock-team.ts` — one row per person *per project*.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `project_id` | `uuid` fk → `projects.id` | |
| `profile_id` | `uuid` fk → `profiles.id` | |
| `title` | `text` | free-form display title, e.g. "Senior Engineer" — distinct from the org-level `role` enum, matches `TeamMember.role` today |
| `weekly_capacity` | `numeric` | hours/week on *this* project; nullable |
| `created_at` | `timestamptz` | |

Constraints: `unique (project_id, profile_id)`.

**Not stored:** `status` (Available/Busy/Away) and `assignedHours` from `TeamMember`
— presence and workload are both derived/ephemeral (assigned hours = sum of open
tickets' `hours` where `assignee_profile_id` = this profile within this project;
presence has no real system behind it yet). `activeTicketIds` is simply
`tickets` filtered by `assignee_profile_id` + `project_id` — no need to store it.

---

### `tickets`

Purpose: matches `Ticket` in `mock-tickets.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `project_id` | `uuid` fk → `projects.id` | |
| `ticket_number` | `integer` | sequential **within its project** — see Unfuddle notes below for why this matters |
| `title` | `text` | |
| `description` | `text` | |
| `status` | `ticket_status` enum | `backlog` \| `to_do` \| `in_progress` \| `review` \| `blocked` \| `done` |
| `priority` | `ticket_priority` enum | `high` \| `normal` \| `low` |
| `type` | `ticket_type` enum | `task` \| `bug` |
| `assignee_profile_id` | `uuid` fk → `profiles.id` | nullable = unassigned |
| `milestone` | `text` | nullable, free-form (see note above) |
| `labels` | `text[]` | |
| `acceptance_criteria` | `text[]` | nullable |
| `story_points` | `integer` | nullable |
| `hours` | `numeric` | nullable — estimate |
| `due_date` | `date` | nullable |
| `unfuddle_id` | `text` unique, nullable | legacy Unfuddle ticket id |
| `unfuddle_imported_at` | `timestamptz` | nullable |
| `created_at` / `updated_at` | `timestamptz` | |

Constraints: `unique (project_id, ticket_number)`.

**Not stored:** `commentCount`, `attachmentCount` — derive from `ticket_comments`
count and a future attachments table respectively. `getTicketDisplayKey()` stays a
pure function of `projects.project_code` + `tickets.ticket_number`, never a stored
column, exactly as it works today.

---

### `ticket_comments`

Purpose: user-authored discussion on a ticket — the persisted counterpart to
`MockComment` in `ticket-ui.tsx`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `ticket_id` | `uuid` fk → `tickets.id` | |
| `author_profile_id` | `uuid` fk → `profiles.id` | nullable — see Unfuddle notes (unmatched legacy authors) |
| `body` | `text` | |
| `unfuddle_id` | `text` unique, nullable | legacy Unfuddle comment id |
| `unfuddle_imported_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | nullable — set only if the comment is edited |

---

### `ticket_activity`

Purpose: append-only system/audit log — the persisted counterpart to `MockActivity`
in `ticket-ui.tsx` (status changes, assignment changes, creation, etc.). Distinct
from `ticket_comments` because it's system-generated, not user-authored, and never
edited.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `ticket_id` | `uuid` fk → `tickets.id` | |
| `actor_profile_id` | `uuid` fk → `profiles.id` | nullable (system-generated events, or legacy import) |
| `event_type` | `text` | e.g. `created`, `status_changed`, `assigned`, `priority_changed` |
| `payload` | `jsonb` | event-specific detail, e.g. `{"from": "to_do", "to": "in_progress"}` |
| `created_at` | `timestamptz` | |

Written by application logic (or a later trigger), not directly editable by end
users — see RLS below.

---

## Statuses / priorities: enums, not lookup tables (for now)

`ticket_status`, `ticket_priority`, `ticket_type`, `project_status`,
`project_priority`, `project_health`, `project_category`, and `org_role` are modeled
as **Postgres enums** matching the fixed string-union types already hardcoded across
`mock-tickets.ts`, `mock-projects.ts`, and `current-user.ts` — not editable database
rows.

Rationale: today these values are baked into UI logic (column groupings, filter
chips, color classes) throughout the components layer. Making them user-editable
lookup tables would need a settings UI, migration of that UI logic to read
dynamic values, and answers to questions (can a status be deleted mid-use? reordered?)
that are out of scope for the MVP and contrary to "not a highly configurable
enterprise platform." If/when Jirita needs per-project custom workflows, that's the
point to promote these to real tables — not before.

---

## Initial RLS strategy

All tables above get `ROW LEVEL SECURITY` enabled. The non-negotiable baseline from
day one is **tenant isolation**: a user can never see a row belonging to an
organization they aren't a member of. Everything else builds on that.

**Helper:** a `security definer` function, e.g. `is_org_member(org_id uuid) returns
boolean`, wrapping an `exists (select 1 from organization_memberships where
organization_id = org_id and profile_id = auth.uid() and status = 'active')` check —
reused across every policy below instead of repeating the subquery.

**Read policies:**

- `organizations` — visible if `is_org_member(id)`.
- `profiles` — visible if the requester shares at least one organization with the
  target profile (via `organization_memberships`).
- `organization_memberships` — visible to other members of the same organization
  (so teammates show up in the Users module / member pickers).
- `projects` — visible if `is_org_member(organization_id)` **and** (`org role =
  'admin'` **or** a `project_memberships` row exists for `(project.id, auth.uid())`).
  This mirrors today's three-role behavior: Admin sees every project org-wide;
  Project Lead/Member see only projects they're staffed on.
- `project_memberships`, `tickets`, `ticket_comments`, `ticket_activity` — visible
  to anyone who can see the parent `project` (policy cascades via a join/subquery on
  `project_id`).

**Write policies (deliberately simple for MVP, tighten later):**

- `projects` — insert/update/delete restricted to org role `admin` or
  `project_lead`.
- `project_memberships` — managed by `admin`/`project_lead` of that project's org.
- `tickets` — insert allowed for any project member; update allowed for
  `admin`/`project_lead`, or the ticket's own `assignee_profile_id`, matching that a
  Member's real job is updating their own tickets' status/hours, not everyone else's.
- `ticket_comments` — insert allowed for any project member; no update/delete in the
  MVP (or author-only edit, if needed later).
- `ticket_activity` — insert-only, written by application/service-role logic, never
  directly by an end-user client — this keeps the audit trail tamper-proof.

Column-level nuance (e.g., "Members can change `status` but not `priority`") is
explicitly **not** part of this initial pass — mock role gating today only decides
what *renders*, not what's *allowed*, so starting with project-membership-level RLS
is already a strict improvement, and finer-grained policies can layer on once real
write flows exist.

---

## Unfuddle import notes

The schema above carries `unfuddle_id` + `unfuddle_imported_at` on every table that
maps to a real Unfuddle entity: `profiles`, `projects`, `tickets`, `ticket_comments`.
This is the whole import-tracking mechanism — no separate import-log table is needed
for the MVP:

- **Idempotency:** every import script upserts `on conflict (unfuddle_id) do
  update...`, so re-running an import (or importing incrementally) never creates
  duplicates.
- **Import order** (respects foreign keys): `profiles` → `projects` →
  `project_memberships` → `tickets` → `ticket_comments` / `ticket_activity`.
- **Ticket numbers carry over as-is.** Because `tickets.ticket_number` is already
  scoped per-project (matching `pending-tickets.ts`'s existing per-project counter
  design), the importer should set `ticket_number` directly to Unfuddle's own
  per-project ticket number rather than re-numbering. That keeps every historical
  ticket ID (`MBA-42`, etc.) stable across the migration — old links, references in
  Slack/email, and institutional memory keep working.
- **Unmatched users:** if an Unfuddle comment/ticket references a person with no
  corresponding `profiles` row (e.g., a long-departed contractor), leave
  `author_profile_id` / `assignee_profile_id` / `actor_profile_id` `null` rather than
  blocking the import — the UI should render a neutral "Unfuddle Import" or archived-user
  placeholder in that case. This is why those columns are nullable.
- **Project code collisions:** `project_code` must be decided (or confirmed against
  Unfuddle's existing short names) *before* import, since it's part of the unique
  constraint and drives every visible ticket ID going forward.
- **What's intentionally not imported:** Unfuddle-specific concepts with no Jirita
  equivalent yet (custom fields, time tracking entries, milestones-as-objects,
  attachments) are out of scope for this pass — see below. Import them once their
  tables exist, not by bolting extra columns onto `tickets` now.

---

## Deferred, not modeled yet

Per MVP scope, the following are **intentionally excluded** from this schema pass and
should get their own design doc when their turn comes:

- Time Tracking / time entries (`mock-time-tracking.ts`'s domain)
- Notes & Wiki (`mock-notes.ts`'s domain)
- Milestones as a first-class table (kept as a text field on `tickets` for now)
- Reports / aggregated analytics
- Custom fields
- Automations
- Third-party integrations (beyond the one-time Unfuddle import above)
- Attachments (ticket `attachmentCount` has no backing table yet)

These are real Core Concepts per the product docs and will need tables eventually —
they're left out now specifically so this first pass stays reviewable and doesn't
couple unrelated decisions together.
