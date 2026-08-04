// The one @mention candidate shape shared by mention-list.tsx (the popup
// UI) and mention-suggestion.ts (the Tiptap Suggestion config) — kept in
// its own file so neither has to import the other just for this type.

export interface MentionCandidate {
  /** Real profiles.id — what's actually stored (data-id) and later
   *  notified, never resolved by name. */
  id: string;
  name: string;
  email: string;
  avatar: string;
}
