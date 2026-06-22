# Navigation Principles

This document defines the navigation philosophy of Jirita.

The goal is to ensure that users can move through the platform effortlessly, always know where they are, and never feel lost.

Navigation is a core product feature and should be treated with the same importance as functionality.

---

# Core Philosophy

Users should spend their time working, not navigating.

The platform should make information easy to discover and actions easy to perform.

Navigation should feel predictable, consistent, and lightweight.

---

# 1. Shallow Navigation

Navigation depth should remain minimal.

Users should reach most destinations within one or two interactions.

## Preferred

```text
Projects
↓
Project
↓
Tickets
```

## Avoid

```text
Projects
↓
Project
↓
Module
↓
Section
↓
Subsection
↓
Ticket
```

### Principle

If navigation requires multiple levels to reach common actions, the structure should be simplified.

---

# 2. Project-Centric Navigation

Projects are the primary workspace of Jirita.

Most user activity should occur within a project context.

## Example

```text
Project
├── Overview
├── Milestones
├── Tickets
├── Notes
├── Reports
└── Team
```

Users should not need to leave a project to perform common project-related tasks.

---

# 3. Global Search First

Search is a primary navigation mechanism.

Users should be able to locate information without manually browsing through screens.

## Search Targets

- Projects
- Milestones
- Tickets
- Notes
- Users

### Principle

When users know what they are looking for, search should be faster than navigation.

---

# 4. Consistent Navigation Structure

Every project should follow the same navigation model.

Every major section should behave consistently.

Users should never need to learn different navigation patterns for different parts of the application.

### Principle

Consistency reduces cognitive load.

---

# 5. Clear Location Awareness

Users should always know:

- Where they are
- What they are viewing
- How to go back

Navigation should provide clear context at all times.

## Example

```text
Projects > Mobile Banking App > Tickets > Ticket #123
```

### Principle

Users should never feel lost.

---

# 6. Prioritize Frequent Actions

The most common actions should always be easy to access.

Examples:

- Create Ticket
- Assign Ticket
- Change Status
- Log Time
- Add Comment
- Search

### Principle

Navigation should optimize for daily workflows rather than edge cases.

---

# 7. Keep Users in Context

Whenever possible, actions should occur without forcing users to leave their current context.

## Preferred

```text
Project
↓
Create Ticket
↓
Return to Project
```

## Avoid

```text
Project
↓
Separate Ticket Module
↓
Create Ticket
↓
Navigate Back
```

### Principle

Context switching increases friction.

---

# 8. Limit Primary Navigation

The number of top-level navigation items should remain intentionally small.

## Initial MVP

```text
Dashboard
Projects
My Work
Reports
Settings
```

### Principle

More navigation items do not create more clarity.

---

# 9. One Clear Primary Action Per Screen

Every screen should have an obvious next action.

Examples:

### Projects

```text
+ Create Project
```

### Tickets

```text
+ Create Ticket
```

### Notes

```text
+ Create Note
```

### Principle

Users should not have to search for the most important action.

---

# 10. Mobile Navigation Matters

Navigation must remain simple on mobile devices.

Core workflows should remain accessible without excessive menus or hidden interactions.

### Mobile Priorities

- View My Work
- View Tickets
- Update Status
- Log Time
- Add Comments
- Search

### Principle

Mobile users should be able to complete essential tasks quickly.

---

# 11. Progressive Disclosure

Show complexity only when necessary.

The default experience should remain clean and approachable.

Advanced functionality should be available without overwhelming users.

### Principle

Simple things should feel simple.

Complex things should remain possible.

---

# 12. Navigation Should Scale

Future features must integrate into the existing structure.

New capabilities should extend navigation rather than create parallel navigation systems.

## Good Example

```text
Project
├── Overview
├── Milestones
├── Tickets
├── Notes
├── Reports
├── Team
└── GitHub
```

## Bad Example

```text
Project Area
Separate GitHub Area
Separate AI Area
Separate Client Area
```

### Principle

The platform should feel unified as it grows.

---

# Navigation Hierarchy

The intended MVP navigation structure is:

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

This structure should remain the foundation for future expansion.

---

# Success Criteria

Navigation is successful when:

- Users always know where they are.
- Users always know what to do next.
- Users can find information quickly.
- Users can complete common actions with minimal effort.
- Users rarely need training.
- Users do not feel overwhelmed.

---

# Guiding Principle

A first-time user should be able to navigate Jirita confidently within a few minutes.

If navigation requires explanation, it should be simplified.