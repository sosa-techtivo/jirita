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

# Git Workflow

Always work on `main`. Commit and push only to `origin/main`.

Never create branches or Pull Requests unless explicitly asked to.

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

Most of the application is now connected to a live Supabase project:
Auth/Profile, Projects (Sidebar, `/projects`, Project Settings — including
an editable Target Date and a Repository Integration section with a real
GitHub OAuth connection), Tickets (all five views — with a real background
refresh on tab focus/visibility regain and a real loading skeleton — New
Ticket, full Ticket Detail — including a real Development section showing
GitHub branches/commits/pull requests related to a ticket, and its own
real loading skeleton — Related Tickets, Attachments, Time Tracking,
Comments, Activity Log), ticket-assignment restriction to active project
members, Project → Team, Project Notes, the Admin/Project Lead/Member
Dashboards (including their project scope selectors, and the Project Lead
Dashboard's real, independently clickable Current Delivery/Attention
Required KPI cards), Reports — both the Admin's company-wide view and the
Project Lead's own scoped view (Delivery + Team, including its own
clickable KPI band), Project Overview (all three roles, each with its own
real loading skeleton), per-project Reports (all roles), Time Tracking
(all three roles), My Work (Member, including its own clickable KPI),
Users (including real permanent account deletion for Admins and
link-only invitations — the email-invite path still exists but is no
longer offered from the UI), global Search, and a global in-app
Notifications system (header bell + dropdown + `/notifications` page)
are all real. A real production bug in invitation acceptance (session
lost before password submission) has also been found and fixed.

Auth/Profile through company-wide Reports (Admin) are confirmed working
end-to-end against a live Supabase project. Everything from the Admin
Project Overview onward in the list above — including Notifications,
Repository Integration/GitHub OAuth, Ticket Detail → Development, and its
loading skeleton — is implemented and passes `tsc`/`eslint`/`next build`,
but has not yet been clicked through in a live browser — treat it as
"should work, not yet verified."

The offline Unfuddle → JIRITA historical importer (`src/lib/unfuddle-import/`)
has completed its migration of the KTVibe project — all 7 phases are
`implemented`, and a final read-only audit certified the result. This is a
one-time CLI migration, separate from the live app above; see
`PROJECT_STATUS.md` → "Unfuddle Import — KTVibe Migration" for the full
certification.

The workspace-wide Settings screen (`/settings/*`) was retired outright —
JIRITA is single-tenant, so that configuration isn't meant to be
Admin-editable through the UI. "Settings" no longer appears in the
sidebar; `/settings` and every subroute now just redirect to the
Dashboard. Project Settings is unaffected.

Since then: Ticket Comments/Time Tracking/Profile/Project Notes gained the
real functionality (reply threads, reactions, comment attachments, entry
edit/delete, a rounding-bug fix, per-role Weekly Capacity edit rights, note
attachments/rich-text) described in full in `PROJECT_STATUS.md`. Tickets
also gained real, per-project configurable Statuses (create/rename/reorder/
default, Project Settings → Statuses, Admin/Project Lead), real thumbnails
for image attachments (Tickets fully wired; Project Notes upload-side only,
UI wiring still pending), and persistent ticket subscribers — auto-tracked
per ticket interaction plus a manual subscribe/unsubscribe icon next to the
Status field, fanning out through the existing notification system. Reports
gained a dedicated Admin/Project-Lead-scoped Hours Report with real Excel/PDF
export, gated by a new Admin-configurable per-Project-Lead financial-access
permission that also governs Project Settings → Billing visibility. Tickets
also gained a real, exactly-one-level Parent → Children hierarchy (link/create/
unlink children, auto-close/auto-reopen the parent, aggregated Estimated/
Logged hours, a Parent/Child visual grammar — brand lilac vs. sky — shared
by Ticket Detail, Board, and List). The old Ticket Preview slide-over panel
was removed outright: every ticket click across the app (Board, List,
Dashboards, Reports, Project Overview, My Work, Member Profile) now
navigates straight to the ticket's own Ticket Detail page — no
intermediate preview step anywhere.

Most recently: a reusable **unsaved-changes protection** pattern
(`src/lib/unsaved-changes.ts`, a shared discard-confirmation dialog) was
added after a real bug was found and fixed — Project Settings was
silently discarding unsaved edits on an ordinary browser-tab switch
(traced to an effect keyed on the whole `organization` object instead of
its `id`); Create Ticket also gained sessionStorage draft recovery as a
second layer. A real Admin Dashboard "Bad Request" bug (an org-wide
ticket-id query exceeding the gateway's max URL length once the org's
ticket count grew) was fixed by batching. The Sidebar's Projects list was
rebuilt into collapsible **Favorites**/**Projects** accordions with a
mini search and real per-user favorites (new `project_favorites` table +
RLS reusing the existing project-visibility gate), replacing the old
3-project cap for Project Lead/Member — a favorite now renders in exactly
one place, and each accordion's open/closed state is remembered for the
session without ever being forced open by an active project.

Most recently still: JIRITA now sends real transactional email. SendGrid
(sender `JIRITA <no-reply@jirita.techtivo.com>`, domain-authenticated)
sends immediate email for 4 notification types (ticket assigned,
mentioned, replied to, project access requested), gated by a new
per-user Profile preference; a configurable digest (1h/4h/8h/daily,
grouped by project) covers everything else still unread, triggered
hourly by Supabase `pg_cron`/`pg_net` (not Vercel Cron — the Hobby plan
only allows daily schedules) calling a `CRON_SECRET`-protected endpoint,
with the secret read from Supabase Vault, never Git. Two real bugs
(project-access-request notifications silently never firing due to an
RLS gap; a wrong date formatter producing "Invalid Date") were found and
fixed along the way. This also introduced the project's first test suite
(Vitest).

**For the authoritative, feature-by-feature breakdown — every Server
Action, migration, and real bug fixed along the way, and the exact
boundary of what's confirmed live vs. not-yet-verified vs. still mock —
see `PROJECT_STATUS.md` → "Architecture Status".** That file is read at
the start of every session (see Documentation Loading Strategy below);
this file deliberately does not duplicate that detail, since CLAUDE.md is
loaded on every turn and PROJECT_STATUS.md is not.

**When backend work lands, update `PROJECT_STATUS.md`, not this file.**

---

## Documentation Loading Strategy

At the beginning of every new session, only read:

- PROJECT_STATUS.md

Consult additional documentation under /docs only when it is relevant to the specific task being implemented:

- `docs/SUPABASE_MVP_SCHEMA.md` — target database schema for backend work
- `docs/SUPABASE_SETUP.md` — how to apply the migration to a real Supabase project
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` — the Unfuddle → Jirita migration spec

Do not read the entire documentation set unless explicitly requested.