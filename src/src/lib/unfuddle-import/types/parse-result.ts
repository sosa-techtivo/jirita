import type { Project, Ticket, UnfuddleProjectMeta, UserReference } from "./models";

/** Everything the streaming parser extracted for the configured target project/milestone. */
export interface ParsedBackup {
  /** All People in the backup — always parsed in full, regardless of milestone scope (spec §6 Step 6). */
  users: UserReference[];
  /** The single Unfuddle Project, if it matched the configured target project id. */
  projectMeta: UnfuddleProjectMeta | null;
  /** The candidate Jirita Project derived from the target Milestone, if found. */
  project: Project | null;
  /** Top-level Tickets belonging to the target Milestone. Embedded associated-tickets are never included here. */
  tickets: Ticket[];
}
