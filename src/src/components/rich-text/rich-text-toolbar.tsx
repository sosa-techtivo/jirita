"use client";

// Shared by RichTextEditor only — not exported outside this module. Every
// button is a thin wrapper around a single Tiptap chain command; nothing
// here holds its own copy of the document, so it can never drift from what
// the editor itself thinks is active.

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

const BTN =
  "p-1.5 rounded-md text-slate-400 dark:text-zinc-600 hover:text-slate-700 dark:hover:text-zinc-200 " +
  "hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";
const BTN_ACTIVE = "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10";

function ToolbarButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      // mousedown (not click) + preventDefault keeps the editor's own text
      // selection/focus intact — a plain click first steals focus away from
      // the ProseMirror content, which would otherwise collapse the
      // selection a command like toggleBold needs to apply to.
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={BTN + " " + (active ? BTN_ACTIVE : "")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 mx-0.5 flex-shrink-0" />;
}

const TEXT_COLORS: { label: string; value: string | null }[] = [
  { label: "Default", value: null },
  { label: "Slate", value: "#475569" },
  { label: "Red", value: "#dc2626" },
  { label: "Amber", value: "#d97706" },
  { label: "Emerald", value: "#059669" },
  { label: "Sky", value: "#0284c7" },
  { label: "Violet", value: "#7c3aed" },
];

const HIGHLIGHT_COLORS: { label: string; value: string | null }[] = [
  { label: "None", value: null },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Sky", value: "#bae6fd" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Violet", value: "#e9d5ff" },
];

function SwatchPopover({
  label,
  icon,
  swatches,
  activeValue,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  swatches: { label: string; value: string | null }[];
  activeValue: string | null;
  onPick: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className={BTN + " " + (activeValue ? BTN_ACTIVE : "") + " flex items-center gap-0.5"}
      >
        {icon}
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-slate-200/50 dark:shadow-black/40 flex items-center gap-1">
          {swatches.map((s) => (
            <button
              key={s.label}
              type="button"
              title={s.label}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s.value);
                setOpen(false);
              }}
              className={
                "w-5 h-5 rounded-full flex-shrink-0 border transition-transform hover:scale-110 " +
                (activeValue === s.value ? "border-brand-500 dark:border-brand-400 ring-1 ring-brand-500/50" : "border-slate-200 dark:border-zinc-700")
              }
              style={{ background: s.value ?? "repeating-conic-gradient(#cbd5e1 0% 25%, transparent 0% 50%) 50% / 8px 8px" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = editor.isActive("link");

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const apply = () => {
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton
        label="Link"
        active={active}
        onClick={() => {
          // Seeded here (the click that opens the popover), not in an
          // effect reacting to `open` — an effect calling setState
          // synchronously on every open is exactly the cascading-render
          // pattern React's own rules-of-hooks lint flags.
          setUrl(editor.getAttributes("link").href ?? "");
          setOpen((v) => !v);
        }}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg shadow-slate-200/50 dark:shadow-black/40 flex items-center gap-1.5 w-64">
          <input
            ref={inputRef}
            type="text"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); apply(); }
              if (e.key === "Escape") setOpen(false);
            }}
            className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-zinc-200 bg-transparent outline-none placeholder:text-slate-300 dark:placeholder:text-zinc-600"
          />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); apply(); }}
            className="text-[12px] font-semibold text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0"
          >
            {active ? "Update" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}

export function RichTextToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 dark:border-zinc-800">
      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M6 4h6a3.5 3.5 0 010 7H6zM6 11h7a3.5 3.5 0 010 7H6z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M11 4h6M5 20h6M14 4L8 20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M6 4v6a6 6 0 0012 0V4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M5 12h14M15.5 7.5c-.5-1.5-2-2.5-3.8-2.5-2.3 0-4 1.2-4 3s1.5 2.5 3.5 3M8.5 16.5c.5 1.5 2.2 2.5 4 2.5 2.3 0 4-1.2 4-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>

      <Divider />

      <SwatchPopover
        label="Text color"
        activeValue={editor.getAttributes("textStyle").color ?? null}
        swatches={TEXT_COLORS}
        onPick={(value) => {
          if (value) editor.chain().focus().setColor(value).run();
          else editor.chain().focus().unsetColor().run();
        }}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 17L12 5l3 12M9.5 13h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
      />
      <SwatchPopover
        label="Highlight"
        activeValue={editor.getAttributes("highlight").color ?? null}
        swatches={HIGHLIGHT_COLORS}
        onPick={(value) => {
          if (value) editor.chain().focus().setHighlight({ color: value }).run();
          else editor.chain().focus().unsetHighlight().run();
        }}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 11l6-6 4 4-6 6H9v-4zM5 21l3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
      />

      <Divider />

      <ToolbarButton label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <span className="text-[12px] font-bold w-3.5 text-center">H1</span>
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <span className="text-[12px] font-bold w-3.5 text-center">H2</span>
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <span className="text-[12px] font-bold w-3.5 text-center">H3</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M8 6h13M8 12h13M8 18h13" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="3.5" cy="6" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="18" r="1.25" fill="currentColor" stroke="none" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" strokeLinejoin="round" />
          <text x="1" y="8.5" fontSize="7" fill="currentColor" stroke="none">1</text>
          <text x="1" y="14.5" fontSize="7" fill="currentColor" stroke="none">2</text>
          <text x="1" y="20.5" fontSize="7" fill="currentColor" stroke="none">3</text>
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="4" width="6" height="6" rx="1" />
          <path d="M4.5 7l1 1 2-2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="14" width="6" height="6" rx="1" />
          <path d="M11 7h10M11 17h10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M7.5 8.5A2.5 2.5 0 005 11v3a1 1 0 001 1h3v-5.5H7.5zM16 8.5a2.5 2.5 0 00-2.5 2.5v3a1 1 0 001 1h3v-5.5H16z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M9 8L4 12l5 4M15 8l5 4-5 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </ToolbarButton>
      <LinkButton editor={editor} />
      <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M5 12h14" strokeLinecap="round" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
