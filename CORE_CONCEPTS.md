# Core Concepts

This document defines the fundamental concepts of Jirita.

These concepts form the shared language of the platform and should be used consistently throughout product discussions, design decisions, documentation, and implementation.

Every feature in Jirita should be built around these concepts.

---

# Workspace

A Workspace represents an organization using Jirita.

A workspace contains:

- Users
- Projects
- Notes
- Reports
- Settings

A workspace is the highest-level container within the platform.

## Examples

- Techtivo
- RocketCat
- Acme Software

---

# User

A User is a person who can access Jirita.

Users participate in projects and collaborate with other team members.

## Examples

- Developer
- Project Manager
- QA Engineer
- Designer
- Business Owner

## Responsibilities

Users may:

- Create tickets
- Update tickets
- Log time
- Comment on work
- Manage projects
- Review reports

depending on their permissions.

---

# Project

A Project is the primary organizational unit within Jirita.

Projects represent products, clients, initiatives, services, or internal efforts.

Every piece of work belongs to a project.

## Examples

- Mobile Banking App
- Client Website Redesign
- Internal Platform Migration
- Customer Support Operations

## Contains

- Milestones
- Tickets
- Notes
- Reports
- Team Members

---

# Milestone

A Milestone represents a significant objective, delivery, release, phase, or checkpoint within a project.

Milestones help organize work and measure progress.

## Examples

- MVP Release
- Version 1.0 Launch
- Production Deployment
- Discovery Phase
- Client Acceptance

## Contains

- Tickets

## Purpose

Milestones answer the question:

> What are we trying to deliver?

---

# Ticket

A Ticket is the smallest unit of work within Jirita.

Tickets represent actionable work items.

## Examples

- Bug Fix
- Feature Request
- Technical Task
- Documentation Update
- Support Issue

## Contains

- Title
- Description
- Status
- Assignee
- Comments
- Labels
- Time Entries

## Purpose

Tickets answer the question:

> What needs to be done?

---

# Status

A Status represents the current state of a ticket.

The exact status workflow may evolve, but every ticket should clearly communicate its current state.

## Examples

- Backlog
- To Do
- In Progress
- Blocked
- Review
- Done

## Purpose

Status answers the question:

> Where does this work currently stand?

---

# Label

A Label is a lightweight classification mechanism used to organize tickets.

Labels provide additional context without changing project structure.

## Examples

- Bug
- Enhancement
- Frontend
- Backend
- High Priority
- Technical Debt

## Purpose

Labels answer the question:

> What kind of work is this?

---

# Comment

A Comment represents communication attached to a ticket.

Comments provide context, updates, decisions, and collaboration history.

## Examples

- Progress updates
- Technical discussions
- Clarification requests
- Decision records

## Purpose

Comments answer the question:

> What conversations happened around this work?

---

# Time Entry

A Time Entry records effort spent on a ticket.

Time tracking should remain simple and lightweight.

## Examples

- 30 minutes
- 2 hours
- 1 day

## Purpose

Time Entries answer the question:

> How much effort was invested?

---

# Note

A Note is a piece of project-related documentation.

Notes provide a lightweight knowledge base directly inside the platform.

## Examples

- Credentials
- Deployment Instructions
- Client Information
- Technical Documentation
- Meeting Notes

## Purpose

Notes answer the question:

> What information should the team remember?

---

# Report

A Report provides visibility into work, progress, and team activity.

Reports transform operational data into actionable insights.

## Examples

- Hours by Project
- Hours by User
- Hours by Milestone
- Ticket Activity
- Workload Distribution

## Purpose

Reports answer the question:

> What is happening across the organization?

---

# Relationship Overview

```text
Workspace
│
├── Users
│
├── Projects
│   ├── Milestones
│   │   └── Tickets
│   │
│   ├── Notes
│   ├── Reports
│   └── Team Members
│
└── Settings
```

This hierarchy represents the conceptual structure of Jirita.

Implementation details may evolve, but the meaning of these concepts should remain stable.

---

# Guiding Principle

Every new feature should extend existing concepts whenever possible.

Avoid introducing new concepts unless they solve a meaningful problem that cannot be addressed using the existing model.

Simplicity is achieved not only through interface design, but also through a clear and limited conceptual model.