"use client";

// Builds the Mention extension's `suggestion` option — the one place that
// wires the candidate list + search into Tiptap's Suggestion plugin and
// mounts mention-list.tsx's popup. `getCandidates` is called fresh on
// every keystroke (never captured once at editor-mount time), so the
// suggestion list always reflects the caller's current project roster even
// if it finishes loading after the editor itself has already mounted — see
// rich-text-editor.tsx's own candidatesRef.

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { MentionList } from "./mention-list";
import type { MentionListRef } from "./mention-list";
import type { MentionCandidate } from "./mention-types";

const MAX_SUGGESTIONS = 8;

function filterCandidates(all: MentionCandidate[], query: string): MentionCandidate[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? all.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : all;
  return matches.slice(0, MAX_SUGGESTIONS);
}

export function buildMentionSuggestion(
  getCandidates: () => MentionCandidate[]
): Omit<SuggestionOptions<MentionCandidate, MentionNodeAttrs>, "editor"> {
  return {
    char: "@",
    items: ({ query }) => filterCandidates(getCandidates(), query),
    render: () => {
      let component: ReactRenderer<
        MentionListRef,
        { items: MentionCandidate[]; command: (item: MentionCandidate) => void }
      >;
      let unmount: (() => void) | undefined;

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              command: (item: MentionCandidate) => props.command({ id: item.id, label: item.name }),
            },
            editor: props.editor,
          });
          unmount = props.mount(component.element);
        },
        onUpdate: (props) => {
          component.updateProps({
            items: props.items,
            command: (item: MentionCandidate) => props.command({ id: item.id, label: item.name }),
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            unmount?.();
            return true;
          }
          return component.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          unmount?.();
          component.destroy();
        },
      };
    },
  };
}
