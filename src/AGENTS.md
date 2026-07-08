# Workspace Rules

Active workspace:

/src

Read-only:

/product
/prototypes

Forbidden:

- Editing files outside /src
- Moving files between projects
- Synchronizing changes automatically
- Refactoring the reference implementation

If unsure, assume files outside /src are immutable.