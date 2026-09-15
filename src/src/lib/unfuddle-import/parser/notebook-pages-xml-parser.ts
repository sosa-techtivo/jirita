import { createReadStream } from "node:fs";
import { createStream, type Tag } from "sax";

import type { NotebookPageRevision, ParsedNotebookPages } from "../types/notes-recovery";
import { intOrNull, textOrNull } from "../utils/value-parsing";

/**
 * Streams Techtivo's backup.xml a second time, scoped ONLY to
 * <account><projects><project><notebooks><notebook><pages><page> for a
 * single target Unfuddle Project — the exact subtree
 * parser/backup-xml-parser.ts explicitly skips as out of the original
 * import phase's scope (see its own comment: "notebooks ... is out of this
 * import phase's scope (spec §8)").
 *
 * A separate parser file, not an extension of backup-xml-parser.ts, on
 * purpose: this recovery is a narrowly-scoped addition, not a rewrite of
 * the already-verified Phase 1-7 parsing path (task's own "Do not
 * unnecessarily modify the original Phase 1-7 runners").
 *
 * Notebooks are project-scoped in Unfuddle, not milestone-scoped — Unfuddle
 * has no per-milestone notebook concept — so this reads every notebook
 * under the target Unfuddle Project id (152, the container project), not
 * the target Milestone (183, what became the KTVibe project in JIRITA).
 * Confirmed directly against the raw XML: <notebook> is a direct child of
 * <project><notebooks>, and every <notebook><project-id> in the file equals
 * 152 (100% of the 53 notebooks present in the whole backup).
 *
 * Every <page> revision is emitted as its own NotebookPageRevision — this
 * parser does NOT group by logical page (see
 * import-notes-recovery/group-logical-pages.ts for that, a separate, pure,
 * independently-testable step). Full body text is held in memory for every
 * revision (unavoidable — the recovery genuinely needs it to build
 * `content` for the latest revision of each logical page) but this module
 * NEVER logs/prints it; see runner/notes-recovery-print-report.ts for the
 * enforced safe-metadata-only reporting contract.
 */

export interface NotebookPagesParserOptions {
  backupXmlPath: string;
  targetProjectId: number;
}

function emptyRevision(): NotebookPageRevision {
  return {
    notebookUnfuddleId: 0,
    notebookTitle: "",
    notebookProjectUnfuddleId: 0,
    pageUnfuddleId: 0,
    pageNumber: 0,
    pageTitle: "",
    version: 0,
    body: "",
    bodyFormat: null,
    authorUnfuddleId: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function parseNotebookPagesXml(options: NotebookPagesParserOptions): Promise<ParsedNotebookPages> {
  const { backupXmlPath, targetProjectId } = options;

  return new Promise((resolve, reject) => {
    const stack: string[] = [];
    let textBuf = "";
    /** When set, every tag until the stack returns to this depth is ignored. */
    let skipBoundaryDepth: number | null = null;

    const at = (fromEnd: number): string | undefined => stack[stack.length - 1 - fromEnd];

    const revisions: NotebookPageRevision[] = [];
    let notebookCount = 0;

    let projectIdScalar: number | null = null;
    let projectMatchesTarget = false;

    let notebookTitle = "";
    let notebookUnfuddleId = 0;
    let notebookProjectUnfuddleId = 0;

    let pageDraft: NotebookPageRevision | null = null;

    const saxStream = createStream(true, { trim: false, normalize: false });

    saxStream.on("opentag", (tag: Tag) => {
      if (skipBoundaryDepth !== null) {
        stack.push(tag.name);
        return;
      }
      textBuf = "";
      const parent = at(0);
      const name = tag.name;

      if (parent === "account" && name !== "projects") {
        skipBoundaryDepth = stack.length;
        stack.push(name);
        return;
      }

      if (parent === "project") {
        if (name !== "id" && name !== "notebooks") {
          // Only <id> (to confirm project match) and <notebooks> matter here
          // — everything else a <project> carries (tickets, milestones,
          // messages, ...) is Phase 1-7's concern, not this recovery's.
          skipBoundaryDepth = stack.length;
          stack.push(name);
          return;
        }
        if (name === "notebooks" && !projectMatchesTarget) {
          skipBoundaryDepth = stack.length;
          stack.push(name);
          return;
        }
      }

      if (parent === "projects" && name === "project") {
        projectIdScalar = null;
        projectMatchesTarget = false;
      } else if (parent === "notebooks" && name === "notebook") {
        notebookTitle = "";
        notebookUnfuddleId = 0;
        notebookProjectUnfuddleId = 0;
      } else if (parent === "pages" && name === "page") {
        pageDraft = emptyRevision();
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

      if (immediateParent === "project" && grandParent === "projects") {
        if (name === "id") {
          projectIdScalar = intOrNull(text);
          if (projectIdScalar === targetProjectId) projectMatchesTarget = true;
        }
      } else if (immediateParent === "notebook" && grandParent === "notebooks") {
        switch (name) {
          case "id":
            notebookUnfuddleId = intOrNull(text) ?? 0;
            break;
          case "title":
            notebookTitle = text.trim();
            break;
          case "project-id":
            notebookProjectUnfuddleId = intOrNull(text) ?? 0;
            break;
          default:
            break;
        }
      } else if (immediateParent === "page" && grandParent === "pages") {
        if (pageDraft) applyPageField(pageDraft, name, text);
      } else if (name === "notebook" && immediateParent === "notebooks") {
        notebookCount += 1;
      } else if (name === "page" && immediateParent === "pages") {
        if (pageDraft) {
          pageDraft.notebookUnfuddleId = notebookUnfuddleId;
          pageDraft.notebookTitle = notebookTitle;
          pageDraft.notebookProjectUnfuddleId = notebookProjectUnfuddleId;
          revisions.push(pageDraft);
        }
        pageDraft = null;
      }

      stack.pop();
    });

    saxStream.on("error", (err: Error) => {
      reject(err);
    });

    saxStream.on("end", () => {
      resolve({ revisions, notebookCount });
    });

    const fileStream = createReadStream(backupXmlPath);
    fileStream.on("error", (err) => reject(err));
    fileStream.pipe(saxStream);
  });
}

function applyPageField(draft: NotebookPageRevision, name: string, text: string): void {
  switch (name) {
    case "id":
      draft.pageUnfuddleId = intOrNull(text) ?? 0;
      break;
    case "number":
      draft.pageNumber = intOrNull(text) ?? 0;
      break;
    case "title":
      draft.pageTitle = text.trim();
      break;
    case "version":
      draft.version = intOrNull(text) ?? 0;
      break;
    case "body":
      draft.body = text;
      break;
    case "body-format":
      draft.bodyFormat = textOrNull(text);
      break;
    case "author-id":
      draft.authorUnfuddleId = intOrNull(text);
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
