// Type only — real data now comes from src/lib/notes.ts (project_notes in
// Supabase). The mock array and getNotesByProjectSlug that used to live
// here are gone; kept as a type-only module for the same reason
// mock-tickets.ts/mock-team.ts still hold their own types after being
// replaced as a data source (see CLAUDE.md).
//
// `tag` stays optional and unwired — see notes.ts's header comment. It's
// still fully interactive in the UI (NewNoteModal/NoteDetailModal's Tag
// picker), just never persisted.

export interface ProjectNote {
  id: string;
  projectSlug: string;
  title: string;
  body: string;
  tag?: string;
  updatedAt: string;
  author: { name: string; avatar: string };
  attachments: ProjectNoteAttachment[];
}

export interface ProjectNoteAttachment {
  id: string;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedByName: string;
  uploadedByAvatar: string;
  /** Real profiles.id of the uploader, when known — lets a "click this
   *  person" trigger open the Member Profile Modal against their real
   *  identity instead of a name-based guess. Null when genuinely unknown
   *  (uploaded_by is null). */
  uploadedByProfileId: string | null;
  /** Pre-formatted relative time ("3 days ago") — same convention as ProjectNote.updatedAt. */
  uploadedAt: string;
  /** Storage path of the pre-resized (max ~600px wide) derivative generated
   *  at upload time — null for non-image attachments and for any image
   *  whose thumbnail generation failed or was skipped. Not yet consumed by
   *  the Notes UI (note-attachments.tsx still resolves storagePath
   *  directly) — see lib/notes.ts's uploadProjectNoteAttachment. */
  thumbnailPath: string | null;
}
