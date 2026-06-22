# User Personas

This document defines the primary user types of Jirita.

These personas represent the users the platform is designed for and should guide product, UX, and development decisions.

Features should be evaluated based on how well they support these personas and their goals.

---

# Persona 1: Business Owner

## Example

Company Owner, Executive, Director, Founder

## Description

Responsible for overseeing projects, team performance, delivery progress, and business operations.

This user is primarily interested in visibility rather than day-to-day task execution.

## Goals

- Understand project status quickly
- Monitor team workload
- Review milestone progress
- Analyze time invested per project
- Generate reports for business decisions
- Identify risks and blockers early

## Frustrations

- Complex project management tools
- Excessive configuration
- Poor visibility across projects
- Difficult reporting
- Having to switch between multiple systems

## Typical Actions

- Review project progress
- Review milestone completion
- Review team activity
- Review time reports
- Review workload reports
- Search historical information

## Success Criteria

The user can understand the health of projects and teams within minutes without navigating multiple screens.

---

# Persona 2: Project Coordinator

## Example

Project Manager, Delivery Manager, Operations Coordinator

## Description

Responsible for organizing and coordinating work across projects.

This user spends a significant portion of the day inside the platform.

## Goals

- Organize work efficiently
- Create and assign tickets
- Track project progress
- Maintain project documentation
- Ensure milestones remain on track
- Produce accurate reports

## Frustrations

- Slow workflows
- Excessive clicks
- Difficult navigation
- Confusing project structures
- Duplicate data entry

## Typical Actions

- Create tickets
- Assign tickets
- Update ticket status
- Manage milestones
- Register time
- Review team activity
- Maintain project notes

## Success Criteria

The user can coordinate projects quickly and efficiently with minimal administrative overhead.

---

# Persona 3: Team Member

## Example

Developer, QA Engineer, Designer, Product Specialist, Technical Support Representative

## Description

Responsible for executing assigned work and collaborating with teammates.

This user needs clarity, focus, and minimal administrative burden.

## Goals

- Know what to work on next
- Understand priorities
- Track personal workload
- Log time easily
- Collaborate with teammates
- Access project information quickly

## Frustrations

- Unclear priorities
- Difficult ticket management
- Excessive administrative work
- Complicated time tracking
- Information scattered across multiple systems

## Typical Actions

- View assigned tickets
- Update ticket status
- Add comments
- Log time
- Review milestones
- Search documentation
- Review project activity

## Success Criteria

The user can focus on delivering work rather than managing the tool.

---

# Persona 4: Client (Future Phase)

## Description

External stakeholder with visibility into project progress.

This persona is not part of the MVP but is expected to become important in future releases.

## Goals

- Understand project status
- Review milestones and deliverables
- Submit requests and feedback
- Follow project progress without requiring meetings

## Frustrations

- Lack of transparency
- Delayed updates
- Excessive communication overhead
- Difficulty understanding project progress

## Typical Actions

- Review project dashboards
- Review milestone progress
- Submit requests
- Comment on deliverables
- Track project status

## Success Criteria

The user can understand project status and progress without needing direct assistance from the team.

---

# Primary Persona

The primary persona for the MVP is the Project Coordinator.

Most workflows, screens, and interactions should be optimized for this user.

This persona spends the most time inside the platform and is responsible for keeping projects organized.

---

# Secondary Personas

The Business Owner and Team Member personas are secondary MVP users.

The platform should support their needs without compromising the simplicity and efficiency required by Project Coordinators.

---

# Future Persona

The Client persona becomes relevant in future releases when client-facing functionality is introduced.

Client experiences should follow the same simplicity and usability principles that define the internal platform.

---

# Design Implications

When evaluating features, workflows, or interface decisions, always ask:

1. Which persona benefits from this?
2. Does this simplify or complicate their workflow?
3. Does it improve visibility, efficiency, or usability?
4. Would the primary persona use this regularly?

If a feature does not provide meaningful value to at least one persona, it should be reconsidered.