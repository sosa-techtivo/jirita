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

Most of the application is now connected to a live Supabase project:
Auth/Profile, Projects (Sidebar, `/projects`, Project Settings — including
an editable Target Date), Tickets (all five views, New Ticket, full Ticket
Detail, Related Tickets, Attachments, Time Tracking, Comments, Activity
Log), ticket-assignment restriction to active project members, Project →
Team, Project Notes, the Admin/Project Lead/Member Dashboards (including
their project scope selectors, and the Project Lead Dashboard's real,
independently clickable Current Delivery/Attention Required KPI cards),
Reports — both the Admin's company-wide view and the Project Lead's own
scoped view (Delivery + Team, including its own clickable KPI band),
Project Overview (all three roles), per-project Reports (all roles), Time
Tracking (all three roles), My Work (Member, including its own clickable
KPI), Users, and global Search are all real.

Auth/Profile through company-wide Reports (Admin) are confirmed working
end-to-end against a live Supabase project. Everything from the Admin
Project Overview onward in the list above (per-project Reports, Time
Tracking, the Project Lead's/Member's own Project Overview, the Dashboard
scope selectors and KPI click-throughs, Project Settings' Target Date
field, My Work, ticket-assignment restriction, Member's "My Projects", and
Search) is implemented and passes `tsc`/`eslint`/`next build`, but has not
yet been clicked through in a live browser — treat it as "should work, not
yet verified."

Only the rest of Settings (`/settings/*`) still runs entirely on mock
data.

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