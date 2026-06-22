# Screen Definitions

This document defines the purpose, primary users, key information, and core actions for each screen in Jirita.

The objective is to ensure every screen has a clear responsibility and avoids becoming overloaded with unrelated functionality.

A screen should answer a specific question for the user.

If a screen attempts to answer too many questions, it should be redesigned.

---

# Dashboard

## Purpose

Provide a quick overview of work that requires attention.

## Primary Users

- Business Owner
- Project Coordinator

## Key Questions

- What needs attention today?
- What projects are active?
- What milestones are approaching?
- What has changed recently?

## Core Components

- Assigned Work
- Active Projects
- Upcoming Milestones
- Recent Activity
- Quick Actions

## Primary Actions

- Open Project
- Open Ticket
- Create Ticket
- Search

---

# Projects

## Purpose

Provide access to all projects within the workspace.

## Primary Users

- Business Owner
- Project Coordinator
- Team Member

## Key Questions

- What projects exist?
- What projects are active?
- Which projects require attention?

## Core Components

- Project List
- Search
- Filters
- Status Indicators

## Primary Actions

- Open Project
- Create Project
- Search Projects

---

# Project Overview

## Purpose

Provide a high-level summary of a project.

## Primary Users

- Business Owner
- Project Coordinator

## Key Questions

- What is happening in this project?
- Is the project healthy?
- What requires attention?

## Core Components

- Project Summary
- Progress Overview
- Active Milestones
- Open Tickets
- Recent Activity
- Team Members

## Primary Actions

- Create Ticket
- Create Milestone
- View Tickets
- View Reports

---

# Milestones

## Purpose

Organize project work around deliveries and objectives.

## Primary Users

- Project Coordinator
- Business Owner

## Key Questions

- What are we trying to deliver?
- What milestones are at risk?
- What work belongs to each milestone?

## Core Components

- Milestone List
- Progress Indicators
- Due Dates
- Associated Tickets

## Primary Actions

- Create Milestone
- Edit Milestone
- View Milestone Details

---

# Milestone Detail

## Purpose

Provide detailed visibility into a specific milestone.

## Primary Users

- Project Coordinator
- Team Member

## Key Questions

- What work is included?
- What is completed?
- What remains open?

## Core Components

- Milestone Information
- Progress Summary
- Associated Tickets
- Activity Feed

## Primary Actions

- Create Ticket
- Edit Milestone
- Review Progress

---

# Tickets

## Purpose

Manage project work items.

## Primary Users

- Project Coordinator
- Team Member

## Key Questions

- What work exists?
- What is in progress?
- What is blocked?

## Core Components

- Ticket List
- Filters
- Search
- Status Views

## Primary Actions

- Create Ticket
- Edit Ticket
- Assign Ticket
- Change Status

---

# Ticket Detail

## Purpose

Manage a specific work item.

## Primary Users

- Team Member
- Project Coordinator

## Key Questions

- What needs to be done?
- Who is responsible?
- What is the current status?
- What discussions have happened?

## Core Components

- Ticket Information
- Description
- Status
- Assignee
- Labels
- Comments
- Time Entries
- Activity History

## Primary Actions

- Change Status
- Assign User
- Add Comment
- Log Time
- Edit Ticket

---

# Notes

## Purpose

Store project knowledge and documentation.

## Primary Users

- Project Coordinator
- Team Member

## Key Questions

- What information should the team remember?
- Where can documentation be found?

## Core Components

- Note List
- Search
- Categories
- Recently Updated Notes

## Primary Actions

- Create Note
- Edit Note
- Search Notes

---

# Note Detail

## Purpose

View and edit documentation.

## Primary Users

- Project Coordinator
- Team Member

## Key Questions

- What information is documented?
- Is the information current?

## Core Components

- Note Content
- Last Updated Information
- Related Notes

## Primary Actions

- Edit Note
- Share Note
- Search Documentation

---

# Team

## Purpose

Manage project participants.

## Primary Users

- Project Coordinator

## Key Questions

- Who is working on this project?
- Who has access?
- Who owns specific work?

## Core Components

- Team Members
- Roles
- Activity Indicators

## Primary Actions

- Add Member
- Remove Member
- View User Activity

---

# My Work

## Purpose

Provide a personalized workspace for each user.

## Primary Users

- Team Member

## Key Questions

- What should I work on next?
- What is assigned to me?
- What requires attention?

## Core Components

- Assigned Tickets
- Recently Updated Work
- Upcoming Deadlines
- Recent Activity

## Primary Actions

- Open Ticket
- Change Status
- Add Comment
- Log Time

---

# Reports

## Purpose

Provide visibility into project and team activity.

## Primary Users

- Business Owner
- Project Coordinator

## Key Questions

- How is the team performing?
- Where is time being spent?
- What work is being completed?

## Core Components

- Hours by Project
- Hours by User
- Hours by Milestone
- Ticket Activity
- Workload Overview

## Primary Actions

- Filter Data
- Export Reports
- Review Metrics

---

# Settings

## Purpose

Configure the workspace.

## Primary Users

- Workspace Administrator

## Key Questions

- How is the workspace configured?
- Who has access?
- What preferences are enabled?

## Core Components

- Workspace Settings
- User Management
- Preferences

## Primary Actions

- Invite User
- Manage Users
- Update Settings

---

# Global Search

## Purpose

Provide immediate access to information from anywhere.

## Primary Users

- All Users

## Key Questions

- Where is the information I need?

## Search Targets

- Projects
- Milestones
- Tickets
- Notes
- Users

## Primary Actions

- Search
- Open Result
- Filter Results

---

# Screen Hierarchy

```text
Dashboard

Projects
├── Project Overview
├── Milestones
│   └── Milestone Detail
├── Tickets
│   └── Ticket Detail
├── Notes
│   └── Note Detail
├── Team
└── Reports

My Work

Reports

Settings
```

---

# Design Rule

Every screen must have:

- A single primary purpose
- A clear primary action
- A clearly identifiable target user
- A limited set of responsibilities

If a screen becomes difficult to explain in one sentence, it is likely trying to do too much.