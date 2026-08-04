"use client";

// The one reusable rich-text editor for the whole app — Ticket Description
// is its first real caller, but nothing here is Description-specific.
// Comments/Project Notes/Documentation should mount this same component
// rather than a second implementation. `content`/`onChange` are HTML
// strings (see rich-text-utils.ts); this component never talks to Supabase
// or any particular field's save action itself — that stays the caller's
// job, same as a plain <textarea> would.

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { normalizeRichText } from "./rich-text-utils";
import { RichTextToolbar } from "./rich-text-toolbar";

export function RichTextEditor({
  content,
  onChange,
  onFocus,
  onBlur,
  placeholder = "Write something…",
  autoFocus = false,
  className,
  contentClassName,
}: {
  /** Initial HTML (or legacy plain text — normalized transparently). Only
   *  read once, on mount; remount via a `key` change to load new content
   *  into a fresh editor instance, same convention a plain <textarea>
   *  would need for an uncontrolled value. */
  content: string;
  /** Called with the editor's current HTML on every change. */
  onChange: (html: string) => void;
  /** Mirrors the underlying editor's own focus state — e.g. so a caller can
   *  tell "is the user actively typing here right now" (contextual paste
   *  routing, an active-state indicator, etc.) without reaching into
   *  ProseMirror internals itself. */
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Extra classes for the actual editable content element — every real
   *  field sets its own text size here (Description: 14px, Comments: 13px)
   *  since this component deliberately has no size opinion of its own
   *  beyond the mobile iOS-zoom-prevention default below. */
  contentClassName?: string;
}) {
  const editor = useEditor({
    // Next.js renders client components once on the server too —
    // Tiptap's own SSR content would then mismatch the client's first
    // render (ProseMirror decorates the DOM in ways React can't predict).
    // false means the first real render only ever happens client-side.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: normalizeRichText(content),
    editorProps: {
      attributes: {
        class:
          "jirita-rich-text jirita-rich-text-editable text-[16px] focus:outline-none " +
          (contentClassName ?? ""),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  });

  useEffect(() => {
    if (autoFocus) editor?.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once when the editor instance first becomes available
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={
        "rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden " +
        "focus-within:border-brand-500 dark:focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/30 " +
        (className ?? "")
      }
    >
      <RichTextToolbar editor={editor} />
      <EditorContent editor={editor} className="px-3 py-2.5 max-h-[60vh] overflow-y-auto" />
    </div>
  );
}
