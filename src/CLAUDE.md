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

Supabase Auth is connected for login/logout/session — everything else still
runs entirely on mock data.

- `src/lib/auth.ts` wraps `src/lib/supabase-client.ts` for real
  login/logout/session (`login`, `logout`, `onAuthStateChange`,
  `requestPasswordReset`, `confirmPasswordReset`). `AuthGuard`
  (`src/components/auth-guard.tsx`) gates every `AppShell`-wrapped route on
  a real Supabase session instead of a `localStorage` flag.
- `src/lib/mock-auth.ts` now only covers Change Password (`mockChangePassword`,
  still mock — out of scope for the Auth pass) and the shared
  password-strength helpers used by both the mock and real auth screens.
- Role (Admin / Project Lead / Member) is still assigned by the mock
  `current-user.ts` / `CurrentUserProvider` fallback (localStorage +
  `RoleSwitcher`), not by any real Supabase membership — that mapping is
  unchanged and intentionally still mock until org/project memberships are
  connected.
- Projects, tickets, dashboard, reports, users, and settings are all still
  unconnected mock data (`src/lib/mock-*.ts`) — do not assume otherwise.
- `docs/SUPABASE_MVP_SCHEMA.md` defines the MVP database schema
  (organizations, profiles, organization memberships, projects, project
  memberships, tickets, ticket comments, ticket activity), and
  `supabase/migrations/20260708000000_mvp_schema.sql` implements it — but
  that migration has not been applied to any Supabase project from this
  repo. See `docs/SUPABASE_SETUP.md` for how to apply it.
- `docs/UNFUDDLE_IMPORT_SPECIFICATION.md` defines how Techtivo's Unfuddle
  backup maps onto that schema for the eventual data migration. No importer
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