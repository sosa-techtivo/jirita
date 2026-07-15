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
}
