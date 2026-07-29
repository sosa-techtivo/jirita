/**
 * Typed models produced by the Unfuddle backup parser.
 *
 * These mirror the confirmed shape of Techtivo's backup.xml (see
 * docs/UNFUDDLE_IMPORT_SPECIFICATION.md) and the field mapping it defines —
 * they are import-agnostic: nothing here writes to Jirita's schema, later
 * import phases (see ../phases.ts) will consume these to build the actual
 * Supabase rows.
 */

/** Raw Unfuddle Person, kept under the name the audit uses for it: UserReference. */
export interface UserReference {
  unfuddleId: number;
  email: string;
  firstName: string;
  lastName: string;
  username: string | null;
  isAdministrator: boolean;
  isRemoved: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * The candidate Jirita Project derived from one Unfuddle Milestone, per the
 * audit's Milestone -> Project transformation (spec §3/§4). The source
 * Unfuddle Project (152) is intentionally NOT modeled as a `Project` here —
 * it is organization-level import metadata only, see `UnfuddleProjectMeta`.
 */
export interface Project {
  unfuddleMilestoneId: number;
  unfuddleProjectId: number;
  name: string;
  description: string;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** The one Unfuddle Project (152) — provenance metadata only, never a Jirita row. */
export interface UnfuddleProjectMeta {
  unfuddleId: number;
  title: string;
  shortName: string;
  archived: boolean;
}

export type AttachmentParentType = "Ticket" | "Comment";

export interface Attachment {
  unfuddleId: number;
  parentType: AttachmentParentType;
  parentUnfuddleId: number;
  /** The top-level Ticket this attachment belongs to, whether attached directly or via a Comment. */
  ticketUnfuddleId: number;
  filename: string;
  contentType: string;
  declaredSize: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TimeEntry {
  unfuddleId: number;
  ticketUnfuddleId: number;
  personUnfuddleId: number | null;
  date: string | null;
  hours: number | null;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Comment {
  unfuddleId: number;
  ticketUnfuddleId: number;
  authorUnfuddleId: number | null;
  body: string;
  bodyFormat: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  attachments: Attachment[];
}

/**
 * A relation declared by a top-level Ticket's <associated-tickets> block.
 * Only the target ticket's id is kept — the embedded <ticket> element is
 * intentionally not modeled as a Ticket (see parser/backup-xml-parser.ts).
 */
export interface Relation {
  fromTicketUnfuddleId: number;
  toTicketUnfuddleId: number;
  type: string;
}

export interface Ticket {
  unfuddleId: number;
  number: number | null;
  projectUnfuddleId: number | null;
  milestoneUnfuddleId: number | null;
  summary: string;
  description: string;
  status: string;
  priority: number | null;
  assigneeUnfuddleId: number | null;
  reporterUnfuddleId: number | null;
  dueOn: string | null;
  hoursEstimateCurrent: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  comments: Comment[];
  attachments: Attachment[];
  timeEntries: TimeEntry[];
  relations: Relation[];
}
