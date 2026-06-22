# Information Architecture

This document defines the high-level structure of Jirita.

Its purpose is to establish how information is organized, how users navigate the platform, and where each core concept lives.

The goal is to create an architecture that feels intuitive, predictable, and easy to learn.

Users should always know:

- Where they are
- What they can do
- Where to find information
- How to return to previous contexts

---

# Architectural Principles

## Project-Centric

Projects are the center of the platform.

Most activities happen within the context of a project.

Users should rarely need to jump across unrelated areas of the application.

---

## Shallow Navigation

Navigation depth should remain minimal.

Users should reach most destinations within one or two clicks.

Avoid deeply nested navigation structures.

---

## Consistent Structure

Every project should follow the same internal structure.

Users should never need to relearn navigation when moving between projects.

---

## Searchable Everything

Search should provide access to projects, milestones, tickets, notes, and users from anywhere in the application.

Navigation should not be the only way to find information.

---

# Primary Navigation

The initial MVP should limit primary navigation to a small number of areas.

```text
Dashboard
Projects
My Work
Reports
Settings
```

The exact naming may evolve, but the number of primary sections should remain intentionally small.

---

# Dashboard

The Dashboard provides an overview of current activity.

## Purpose

Answer the question:

> What needs my attention right now?

## Potential Content

- Assigned work
- Active projects
- Upcoming milestones
- Recent activity
- Team activity
- Quick actions

---

# Projects

Projects are the primary workspace within Jirita.

## Purpose

Answer the question:

> What are we working on?

## Screens

### Project List

Displays all accessible projects.

Possible information:

- Project name
- Status
- Progress
- Team members
- Recent activity

### Project Detail

The main project workspace.

---

# Project Detail Structure

Every project follows the same structure.

```text
Project
│
├── Overview
├── Milestones
├── Tickets
├── Notes
├── Reports
└── Team
```

---

# Project Overview

Provides a summary of project activity.

## Purpose

Answer the question:

> What is happening in this project?

## Potential Content

- Project summary
- Progress indicators
- Active milestones
- Recent activity
- Open tickets
- Team members

---

# Milestones

Displays milestone planning and progress.

## Purpose

Answer the question:

> What are we trying to deliver?

## Capabilities

- View milestones
- Create milestones
- Edit milestones
- Track milestone progress
- View milestone tickets

---

# Tickets

Displays project work items.

## Purpose

Answer the question:

> What work needs to be completed?

## Capabilities

- View tickets
- Create tickets
- Edit tickets
- Assign tickets
- Comment on tickets
- Filter tickets
- Search tickets

---

# Notes

Provides lightweight project documentation.

## Purpose

Answer the question:

> What information should the team remember?

## Capabilities

- Create notes
- Edit notes
- Organize notes
- Search notes

---

# Reports

Provides project-specific visibility.

## Purpose

Answer the question:

> How is the project performing?

## Potential Reports

- Hours by user
- Hours by milestone
- Hours by date range
- Ticket activity
- Progress metrics

---

# Team

Displays users participating in the project.

## Purpose

Answer the question:

> Who is working on this project?

## Capabilities

- View members
- Add members
- Remove members
- Review activity

---

# My Work

Provides a personalized workspace for each user.

## Purpose

Answer the question:

> What should I focus on?

## Potential Content

- Assigned tickets
- Recently viewed work
- Active projects
- Logged time
- Upcoming deadlines

---

# Reports

Provides organization-wide reporting.

## Purpose

Answer the question:

> What is happening across the organization?

## Potential Content

- Hours by project
- Hours by user
- Workload distribution
- Milestone progress
- Ticket trends

---

# Settings

Provides workspace administration.

## Purpose

Answer the question:

> How is the workspace configured?

## Potential Areas

- Workspace settings
- User management
- Permissions
- Preferences

Advanced administration should remain simple and approachable.

---

# Global Search

Search should be available from anywhere.

Search results may include:

- Projects
- Milestones
- Tickets
- Notes
- Users

Search should become one of the primary ways users navigate the platform.

---

# Complete Navigation Hierarchy

```text
Workspace
│
├── Dashboard
│
├── Projects
│   ├── Project List
│   └── Project Detail
│       ├── Overview
│       ├── Milestones
│       ├── Tickets
│       ├── Notes
│       ├── Reports
│       └── Team
│
├── My Work
│
├── Reports
│
└── Settings
```

---

# Future Expansion

Future capabilities should integrate into the existing architecture rather than creating entirely new navigation systems.

Potential future additions:

- Client Portal
- GitHub Integration
- AI Assistant
- Capacity Planning
- Staffing Management

The navigation structure should remain simple regardless of future growth.

---

# Guiding Principle

A new user should be able to understand the platform structure within a few minutes.

If navigation becomes difficult to explain, the architecture should be simplified.