export interface UserResolutionResult {
  /** Distinct Unfuddle person ids referenced (assignee/reporter/comment author/time-entry person) that matched a known Person. */
  resolvedUnfuddleIds: number[];
  /** Distinct referenced ids with no matching Person anywhere in the backup's People list — a broken internal reference. */
  nonexistentUnfuddleIds: number[];
  /** Distinct referenced ids that resolved to a Person flagged is-removed (former Unfuddle user). */
  orphanedUnfuddleIds: number[];
  warnings: string[];
}

export interface RelationValidationResult {
  validCount: number;
  invalidCount: number;
  externalCount: number;
  invalidDetails: string[];
  externalDetails: string[];
}

export interface DuplicateFinding {
  key: string;
  count: number;
}

export interface DuplicateValidationResult {
  duplicateTicketNumbers: DuplicateFinding[];
  duplicateTicketUnfuddleIds: DuplicateFinding[];
  duplicateCommentUnfuddleIds: DuplicateFinding[];
  duplicateTimeEntryUnfuddleIds: DuplicateFinding[];
  duplicateAttachmentUnfuddleIds: DuplicateFinding[];
  duplicateCommentContent: DuplicateFinding[];
  duplicateTimeEntryContent: DuplicateFinding[];
}

export interface AttachmentVerificationResult {
  totalReferenced: number;
  foundCount: number;
  missingCount: number;
  missingDetails: string[];
  totalSizeBytes: number;
  sizeMismatchWarnings: string[];
  mediaDirFileCount: number;
}

export interface DryRunReport {
  config: {
    backupXmlPath: string;
    mediaDir: string;
    targetProjectId: number;
    targetMilestoneId: number;
  };
  general: {
    projectFound: boolean;
    projectTitle: string | null;
    milestoneFound: boolean;
    milestoneTitle: string | null;
    ticketCount: number;
    commentCount: number;
    timeEntryCount: number;
    attachmentCount: number;
    relationCount: number;
    parseElapsedMs: number;
  };
  users: UserResolutionResult;
  attachments: AttachmentVerificationResult;
  relations: RelationValidationResult;
  duplicates: DuplicateValidationResult;
}
