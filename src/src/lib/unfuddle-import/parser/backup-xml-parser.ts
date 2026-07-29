import { createReadStream } from "node:fs";
import { createStream, type Tag } from "sax";

import type {
  Attachment,
  AttachmentParentType,
  Comment,
  Project,
  Ticket,
  TimeEntry,
  UnfuddleProjectMeta,
  UserReference,
} from "../types/models";
import type { ParsedBackup } from "../types/parse-result";
import { boolFromText, floatOrNull, intOrNull, textOrNull } from "../utils/value-parsing";

/**
 * Streams Techtivo's backup.xml (~42 MB, ~1,046,500 lines, one <account> tree)
 * and builds typed models scoped to a single target Unfuddle Project +
 * Milestone — see docs/UNFUDDLE_IMPORT_SPECIFICATION.md for the confirmed
 * shape this relies on.
 *
 * Design (why streaming, and why scoped):
 * - The file is never read into memory as a whole string or DOM; `sax`
 *   parses it as bytes arrive from a read stream.
 * - Only Tickets that are direct children of <project><tickets> are ever
 *   built into a `Ticket` model ("top-level tickets" per the task's own
 *   wording). A Ticket embedded inside another Ticket's
 *   <associated-tickets> block is a shallow, duplicate copy Unfuddle embeds
 *   for convenience — this parser only reads its <id> (to record a
 *   `Relation`) and otherwise ignores it entirely; it is never built into a
 *   `Ticket` model or counted as one.
 * - As soon as a top-level ticket's <milestone-id> is known, tickets
 *   outside the target Milestone have their remaining subtree (comments,
 *   attachments, time entries, associated-tickets, audit-trails, ...)
 *   skipped without allocating any model objects for it — of the backup's
 *   12,610 tickets, only the target Milestone's are ever fully built.
 * - <audit-trails>, <changesets>, and <subscriptions> are always skipped,
 *   even for in-scope tickets — they carry no data any of the required
 *   models (Ticket, Comment, Attachment, TimeEntry, Relation) need.
 */

const IGNORED_TICKET_CHILD_CONTAINERS = new Set(["audit-trails", "changesets", "subscriptions"]);

function emptyAttachment(): Attachment {
  return {
    unfuddleId: 0,
    parentType: "Ticket",
    parentUnfuddleId: 0,
    ticketUnfuddleId: 0,
    filename: "",
    contentType: "",
    declaredSize: null,
    createdAt: null,
    updatedAt: null,
  };
}

function emptyComment(): Comment {
  return {
    unfuddleId: 0,
    ticketUnfuddleId: 0,
    authorUnfuddleId: null,
    body: "",
    bodyFormat: null,
    createdAt: null,
    updatedAt: null,
    attachments: [],
  };
}

function emptyTimeEntry(): TimeEntry {
  return {
    unfuddleId: 0,
    ticketUnfuddleId: 0,
    personUnfuddleId: null,
    date: null,
    hours: null,
    description: "",
    createdAt: null,
    updatedAt: null,
  };
}

function emptyTicket(): Ticket {
  return {
    unfuddleId: 0,
    number: null,
    projectUnfuddleId: null,
    milestoneUnfuddleId: null,
    summary: "",
    description: "",
    status: "",
    priority: null,
    assigneeUnfuddleId: null,
    reporterUnfuddleId: null,
    dueOn: null,
    hoursEstimateCurrent: null,
    createdAt: null,
    updatedAt: null,
    comments: [],
    attachments: [],
    timeEntries: [],
    relations: [],
  };
}

function emptyUser(): UserReference {
  return {
    unfuddleId: 0,
    email: "",
    firstName: "",
    lastName: "",
    username: null,
    isAdministrator: false,
    isRemoved: false,
    createdAt: null,
    updatedAt: null,
  };
}

function emptyProjectMeta(): UnfuddleProjectMeta {
  return { unfuddleId: 0, title: "", shortName: "", archived: false };
}

function emptyMilestone(): Project {
  return {
    unfuddleMilestoneId: 0,
    unfuddleProjectId: 0,
    name: "",
    description: "",
    archived: false,
    createdAt: null,
    updatedAt: null,
  };
}

export interface BackupXmlParserOptions {
  backupXmlPath: string;
  targetProjectId: number;
  targetMilestoneId: number;
}

export function parseBackupXml(options: BackupXmlParserOptions): Promise<ParsedBackup> {
  const { backupXmlPath, targetProjectId, targetMilestoneId } = options;

  return new Promise((resolve, reject) => {
    const stack: string[] = [];
    let textBuf = "";
    /** When set, every tag until the stack returns to this depth is ignored. */
    let skipBoundaryDepth: number | null = null;

    const at = (fromEnd: number): string | undefined => stack[stack.length - 1 - fromEnd];

    const users: UserReference[] = [];
    let projectMeta: UnfuddleProjectMeta | null = null;
    let project: Project | null = null;
    const tickets: Ticket[] = [];

    let personDraft: UserReference | null = null;
    let projectScalar: UnfuddleProjectMeta | null = null;
    let projectMatchesTarget = false;
    let milestoneDraft: Project | null = null;

    let ticketDraft: Ticket | null = null;
    let ticketInScope = false;

    let commentDraft: Comment | null = null;
    let timeEntryDraft: TimeEntry | null = null;
    let attachmentDraft: Attachment | null = null;
    let embeddedTicketId: number | null = null;

    const saxStream = createStream(true, { trim: false, normalize: false });

    saxStream.on("opentag", (tag: Tag) => {
      if (skipBoundaryDepth !== null) {
        stack.push(tag.name);
        return;
      }
      textBuf = "";
      const parent = at(0);
      const name = tag.name;

      if (parent === "account" && name !== "people" && name !== "projects") {
        skipBoundaryDepth = stack.length;
        stack.push(name);
        return;
      }

      if (parent === "project") {
        if (name === "tickets" || name === "milestones") {
          if (!projectMatchesTarget) {
            skipBoundaryDepth = stack.length;
            stack.push(name);
            return;
          }
        } else if (name !== "id" && name !== "title" && name !== "short-name" && name !== "archived") {
          // Any other project child (messages, notebooks, ticket_reports,
          // versions, components, ...) is out of this import phase's scope
          // (spec §8) and never contains a target Ticket/Milestone.
          skipBoundaryDepth = stack.length;
          stack.push(name);
          return;
        }
      }

      if (parent === "ticket" && at(1) === "tickets") {
        if (IGNORED_TICKET_CHILD_CONTAINERS.has(name) || (!ticketInScope && isNestedTicketContainer(name))) {
          skipBoundaryDepth = stack.length;
          stack.push(name);
          return;
        }
      }

      if (parent === "people" && name === "person") {
        personDraft = emptyUser();
      } else if (parent === "projects" && name === "project") {
        projectScalar = emptyProjectMeta();
        projectMatchesTarget = false;
      } else if (parent === "milestones" && name === "milestone") {
        milestoneDraft = emptyMilestone();
      } else if (parent === "tickets" && name === "ticket") {
        ticketDraft = emptyTicket();
        ticketInScope = false;
      } else if (parent === "comments" && name === "comment") {
        commentDraft = emptyComment();
      } else if (parent === "time-entries" && name === "time-entry") {
        timeEntryDraft = emptyTimeEntry();
      } else if (parent === "attachments" && name === "attachment") {
        attachmentDraft = emptyAttachment();
      } else if (parent === "associated-tickets" && name === "ticket") {
        embeddedTicketId = null;
      }

      stack.push(name);
    });

    saxStream.on("text", (t: string) => {
      if (skipBoundaryDepth !== null) return;
      textBuf += t;
    });

    saxStream.on("closetag", (name: string) => {
      if (skipBoundaryDepth !== null) {
        stack.pop();
        if (stack.length === skipBoundaryDepth) skipBoundaryDepth = null;
        return;
      }

      const text = textBuf;
      textBuf = "";
      const immediateParent = at(1);
      const grandParent = at(2);

      if (immediateParent === "person") {
        applyPersonField(personDraft!, name, text);
      } else if (immediateParent === "project") {
        applyProjectMetaField(projectScalar!, name, text);
        if (name === "id" && projectScalar!.unfuddleId === targetProjectId) {
          projectMatchesTarget = true;
        }
      } else if (immediateParent === "milestone") {
        applyMilestoneField(milestoneDraft!, name, text);
      } else if (immediateParent === "ticket" && grandParent === "tickets") {
        applyTicketField(ticketDraft!, name, text);
        if (name === "milestone-id") {
          ticketInScope = ticketDraft!.milestoneUnfuddleId === targetMilestoneId;
        }
      } else if (immediateParent === "ticket" && grandParent === "associated-tickets" && name === "id") {
        embeddedTicketId = intOrNull(text);
      } else if (immediateParent === "comment") {
        applyCommentField(commentDraft!, name, text);
      } else if (immediateParent === "time-entry") {
        applyTimeEntryField(timeEntryDraft!, name, text);
      } else if (immediateParent === "attachment") {
        applyAttachmentField(attachmentDraft!, name, text);
      } else if (immediateParent === "associated-tickets" && name === "relationship") {
        if (ticketDraft && embeddedTicketId !== null) {
          ticketDraft.relations.push({
            fromTicketUnfuddleId: ticketDraft.unfuddleId,
            toTicketUnfuddleId: embeddedTicketId,
            type: text.trim(),
          });
        }
        embeddedTicketId = null;
      } else if (name === "person" && immediateParent === "people") {
        users.push(personDraft!);
        personDraft = null;
      } else if (name === "project" && immediateParent === "projects") {
        if (projectMatchesTarget) projectMeta = projectScalar;
        projectScalar = null;
      } else if (name === "milestone" && immediateParent === "milestones") {
        if (milestoneDraft && milestoneDraft.unfuddleMilestoneId === targetMilestoneId) {
          project = milestoneDraft;
        }
        milestoneDraft = null;
      } else if (name === "attachment" && immediateParent === "attachments") {
        if (attachmentDraft) {
          attachmentDraft.ticketUnfuddleId = ticketDraft ? ticketDraft.unfuddleId : 0;
          if (grandParent === "comment" && commentDraft) {
            commentDraft.attachments.push(attachmentDraft);
          } else if (grandParent === "ticket" && ticketDraft) {
            ticketDraft.attachments.push(attachmentDraft);
          }
        }
        attachmentDraft = null;
      } else if (name === "comment" && immediateParent === "comments") {
        if (commentDraft && ticketDraft) {
          commentDraft.ticketUnfuddleId = ticketDraft.unfuddleId;
          ticketDraft.comments.push(commentDraft);
        }
        commentDraft = null;
      } else if (name === "time-entry" && immediateParent === "time-entries") {
        if (timeEntryDraft && ticketDraft) {
          timeEntryDraft.ticketUnfuddleId = ticketDraft.unfuddleId;
          ticketDraft.timeEntries.push(timeEntryDraft);
        }
        timeEntryDraft = null;
      } else if (name === "ticket" && immediateParent === "tickets") {
        if (ticketDraft && ticketInScope) tickets.push(ticketDraft);
        ticketDraft = null;
        ticketInScope = false;
      }

      stack.pop();
    });

    saxStream.on("error", (err: Error) => {
      reject(err);
    });

    saxStream.on("end", () => {
      resolve({ users, projectMeta, project, tickets });
    });

    const fileStream = createReadStream(backupXmlPath);
    fileStream.on("error", (err) => reject(err));
    fileStream.pipe(saxStream);
  });
}

function isNestedTicketContainer(name: string): boolean {
  return (
    name === "attachments" ||
    name === "comments" ||
    name === "time-entries" ||
    name === "associated-tickets" ||
    IGNORED_TICKET_CHILD_CONTAINERS.has(name)
  );
}

function applyPersonField(draft: UserReference, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleId = intOrNull(text) ?? 0;
      break;
    case "email":
      draft.email = text.trim();
      break;
    case "first-name":
      draft.firstName = text;
      break;
    case "last-name":
      draft.lastName = text;
      break;
    case "username":
      draft.username = textOrNull(text);
      break;
    case "is-administrator":
      draft.isAdministrator = boolFromText(text);
      break;
    case "is-removed":
      draft.isRemoved = boolFromText(text);
      break;
    case "created-at":
      draft.createdAt = textOrNull(text);
      break;
    case "updated-at":
      draft.updatedAt = textOrNull(text);
      break;
    default:
      break;
  }
}

function applyProjectMetaField(draft: UnfuddleProjectMeta, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleId = intOrNull(text) ?? 0;
      break;
    case "title":
      draft.title = text.trim();
      break;
    case "short-name":
      draft.shortName = text.trim();
      break;
    case "archived":
      draft.archived = boolFromText(text);
      break;
    default:
      break;
  }
}

function applyMilestoneField(draft: Project, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleMilestoneId = intOrNull(text) ?? 0;
      break;
    case "project-id":
      draft.unfuddleProjectId = intOrNull(text) ?? 0;
      break;
    case "title":
      draft.name = text.trim();
      break;
    case "description":
      draft.description = text;
      break;
    case "archived":
      draft.archived = boolFromText(text);
      break;
    case "created-at":
      draft.createdAt = textOrNull(text);
      break;
    case "updated-at":
      draft.updatedAt = textOrNull(text);
      break;
    default:
      break;
  }
}

function applyTicketField(draft: Ticket, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleId = intOrNull(text) ?? 0;
      break;
    case "number":
      draft.number = intOrNull(text);
      break;
    case "project-id":
      draft.projectUnfuddleId = intOrNull(text);
      break;
    case "milestone-id":
      draft.milestoneUnfuddleId = intOrNull(text);
      break;
    case "summary":
      draft.summary = text.trim();
      break;
    case "description":
      draft.description = text;
      break;
    case "status":
      draft.status = text.trim();
      break;
    case "priority":
      draft.priority = intOrNull(text);
      break;
    case "assignee-id":
      draft.assigneeUnfuddleId = intOrNull(text);
      break;
    case "reporter-id":
      draft.reporterUnfuddleId = intOrNull(text);
      break;
    case "due-on":
      draft.dueOn = textOrNull(text);
      break;
    case "hours-estimate-current":
      draft.hoursEstimateCurrent = floatOrNull(text);
      break;
    case "created-at":
      draft.createdAt = textOrNull(text);
      break;
    case "updated-at":
      draft.updatedAt = textOrNull(text);
      break;
    default:
      break;
  }
}

function applyCommentField(draft: Comment, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleId = intOrNull(text) ?? 0;
      break;
    case "author-id":
      draft.authorUnfuddleId = intOrNull(text);
      break;
    case "body":
      draft.body = text;
      break;
    case "body-format":
      draft.bodyFormat = textOrNull(text);
      break;
    case "created-at":
      draft.createdAt = textOrNull(text);
      break;
    case "updated-at":
      draft.updatedAt = textOrNull(text);
      break;
    default:
      break;
  }
}

function applyTimeEntryField(draft: TimeEntry, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleId = intOrNull(text) ?? 0;
      break;
    case "person-id":
      draft.personUnfuddleId = intOrNull(text);
      break;
    case "date":
      draft.date = textOrNull(text);
      break;
    case "hours":
      draft.hours = floatOrNull(text);
      break;
    case "description":
      draft.description = text;
      break;
    case "created-at":
      draft.createdAt = textOrNull(text);
      break;
    case "updated-at":
      draft.updatedAt = textOrNull(text);
      break;
    default:
      break;
  }
}

function applyAttachmentField(draft: Attachment, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.unfuddleId = intOrNull(text) ?? 0;
      break;
    case "filename":
      draft.filename = text.trim();
      break;
    case "content-type":
      draft.contentType = text.trim();
      break;
    case "size":
      draft.declaredSize = intOrNull(text);
      break;
    case "parent-id":
      draft.parentUnfuddleId = intOrNull(text) ?? 0;
      break;
    case "parent-type":
      draft.parentType = text.trim() as AttachmentParentType;
      break;
    case "created-at":
      draft.createdAt = textOrNull(text);
      break;
    case "updated-at":
      draft.updatedAt = textOrNull(text);
      break;
    default:
      break;
  }
}
