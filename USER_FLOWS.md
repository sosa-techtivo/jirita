# User Flows

This document defines the primary user flows within Jirita.

The purpose of these flows is to ensure that common actions remain simple, efficient, and intuitive.

When designing screens and interactions, these flows should be optimized before considering edge cases or advanced functionality.

---

# Guiding Principles

All user flows should follow these principles:

- Minimize clicks
- Reduce cognitive load
- Avoid unnecessary screens
- Prioritize speed
- Keep users in context
- Make actions obvious

The best flow is often the simplest one.

---

# Create a Project

## Goal

Create a new project and begin organizing work.

## Flow

```text
Projects
↓
Create Project
↓
Enter Project Information
↓
Save
↓
Project Overview
```

## Success Criteria

The user can create a project in less than one minute.

---

# Create a Milestone

## Goal

Define a significant delivery, release, or project objective.

## Flow

```text
Project
↓
Milestones
↓
Create Milestone
↓
Enter Milestone Information
↓
Save
↓
Milestone Detail
```

## Success Criteria

The user can create a milestone without leaving the project context.

---

# Create a Ticket

## Goal

Create a new work item.

## Flow

```text
Project
↓
Tickets
↓
Create Ticket
↓
Enter Ticket Information
↓
Save
↓
Ticket Detail
```

## Required Information

- Title

## Optional Information

- Description
- Assignee
- Milestone
- Labels

## Success Criteria

Creating a ticket should require minimal effort.

---

# Assign a Ticket

## Goal

Assign work to a team member.

## Flow

```text
Ticket
↓
Select Assignee
↓
Save
```

## Success Criteria

Assignment should be possible directly from the ticket without additional navigation.

---

# Update Ticket Status

## Goal

Reflect progress on a work item.

## Flow

```text
Ticket
↓
Change Status
↓
Save
```

## Example

```text
Backlog
↓
To Do
↓
In Progress
↓
Review
↓
Done
```

## Success Criteria

Status changes should require a single interaction.

---

# Add a Comment

## Goal

Collaborate and provide updates.

## Flow

```text
Ticket
↓
Add Comment
↓
Submit
```

## Success Criteria

Comments should be fast and frictionless.

---

# Log Time

## Goal

Record effort spent on work.

## Flow

```text
Ticket
↓
Log Time
↓
Enter Time
↓
Save
```

## Example

```text
2h
30m
1d
```

## Success Criteria

Logging time should take only a few seconds.

---

# Create a Note

## Goal

Store project knowledge and documentation.

## Flow

```text
Project
↓
Notes
↓
Create Note
↓
Write Content
↓
Save
```

## Success Criteria

Documentation should be easy to create and maintain.

---

# Search for Information

## Goal

Find information quickly.

## Flow

```text
Global Search
↓
Enter Search Term
↓
View Results
↓
Open Result
```

## Search Targets

- Projects
- Milestones
- Tickets
- Notes
- Users

## Success Criteria

Users should find information without navigating through multiple screens.

---

# View Project Progress

## Goal

Understand the current state of a project.

## Flow

```text
Projects
↓
Project
↓
Overview
```

## Potential Information

- Progress
- Active milestones
- Open tickets
- Team activity
- Recent updates

## Success Criteria

Users should understand project health within seconds.

---

# View Personal Work

## Goal

Understand assigned work and priorities.

## Flow

```text
My Work
↓
Assigned Tickets
↓
Open Ticket
```

## Potential Information

- Assigned tickets
- Recent activity
- Upcoming deadlines
- Recently viewed items

## Success Criteria

Users should immediately know what to work on next.

---

# Generate a Report

## Goal

Review operational data and project metrics.

## Flow

```text
Reports
↓
Select Report
↓
Apply Filters
↓
View Results
```

## Examples

- Hours by project
- Hours by user
- Hours by milestone
- Activity reports

## Success Criteria

Reports should be understandable without training.

---

# Invite a User

## Goal

Add a team member to the workspace.

## Flow

```text
Settings
↓
Users
↓
Invite User
↓
Enter Email
↓
Send Invitation
```

## Success Criteria

Inviting users should be simple and quick.

---

# Primary Daily Flows

The following flows represent the most common daily activities and should receive the highest UX priority:

1. View My Work
2. Create Ticket
3. Update Ticket Status
4. Assign Ticket
5. Add Comment
6. Log Time
7. Search Information
8. View Project Progress

These flows should always remain fast and easy to use.

---

# Future Flows

The following flows are expected in future releases:

- Client Project Review
- GitHub Integration
- AI Ticket Creation
- AI Project Summaries
- Capacity Planning
- Staffing Management

These flows should be designed to integrate naturally with the existing user experience.

---

# Guiding Principle

Every user flow should answer a simple question:

> Can a first-time user complete this task without training?

If the answer is no, the flow should be simplified.