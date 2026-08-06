// Shared helpers for every real rich-text field in the app (Ticket
// Description today; Comments/Project Notes/Documentation later reuse the
// exact same two functions rather than inventing their own). A field's
// stored value is always a plain string — HTML once written by
// RichTextEditor, or legacy plain text from before this feature existed.
// Nothing here is React-specific, so both RichTextEditor and RichTextViewer
// (and any future non-editor consumer) share one implementation.

// Plain, browser-only DOMPurify — not "isomorphic-dompurify". That package
// constructs a real jsdom window at module-import time (unconditionally,
// even in Node/SSR), which is what actually crashed every route that
// merely imported this file: jsdom either isn't traced into the Vercel
// serverless bundle correctly or simply can't run there, so requiring it
// throws the instant this module loads — before sanitizeRichTextHtml is
// even called. Plain dompurify imports safely with no window (isSupported
// just becomes false); see rich-text-viewer.tsx for why sanitize() itself
// is still only ever actually invoked client-side.
import DOMPurify from "dompurify";

// A real HTML tag anywhere in the string is enough to treat a value as
// already-rich content — Tiptap always emits at least one block tag
// (typically <p>...</p>) for non-empty content, so genuine legacy plain
// text (which contains none) can never false-positive here.
const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

export function looksLikeHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Converts legacy plain text to the same paragraph/line-break shape the
// editor itself produces: a blank line starts a new paragraph, a single
// newline within one becomes a <br> — so old content reflows and wraps
// exactly as it used to, never collapsed into one run-on line.
export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).split("\n").join("<br>")}</p>`)
    .join("");
}

// The one place a stored value becomes safe-to-render/safe-to-load-into-
// the-editor HTML — migrates legacy plain text transparently (never
// touches what's actually persisted; only applied at read/edit time) and
// is a no-op for anything already real HTML.
export function normalizeRichText(value: string): string {
  if (!value) return "";
  return looksLikeHtml(value) ? value : plainTextToHtml(value);
}

// Every tag/attribute RichTextEditor's own extensions can actually produce
// (see rich-text-editor.tsx's extension list) — anything else (script,
// iframe, event-handler attributes, etc.) is stripped. Applied both right
// before persisting a save and right before rendering already-stored
// content, so a value can never carry an unsafe payload either from a
// tampered write or from data that predates this allowlist.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "mark",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "hr", "a", "span", "div", "label", "input",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "style", "class",
  "type", "checked", "disabled",
  "data-type", "data-checked", "data-color", "color",
  // @mention spans (Comments only — see mention-suggestion.ts/Mention's own
  // default attribute rendering): data-id is the real profiles.id a saved
  // mention is later parsed back out of and notified against; data-label
  // and data-mention-suggestion-char are kept too so reloading saved HTML
  // back into RichTextEditor for a fresh edit reconstructs the exact same
  // mention node (see Mention's own parseHTML), not just inert text.
  "data-id", "data-label", "data-mention-suggestion-char",
];

export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// Read-only rendering only — a checkbox in stored task-list HTML has no
// `disabled` attribute of its own (that's an editing-mode-only concern),
// so without this it would render as a genuinely clickable (if inert)
// checkbox in a supposedly read-only viewer.
export function disableCheckboxes(html: string): string {
  return html.replace(/<input(?![^>]*\bdisabled\b)([^>]*)>/g, "<input$1 disabled>");
}

// Read-only rendering nested inside its own clickable row only (e.g. a
// notification's comment-excerpt preview, itself inside a <button> that
// navigates to the ticket) — strips just the `href` off every real <a>,
// so a click can never navigate away or fight that row's own click
// handler. The link keeps its usual visual style regardless: this app's
// own `.jirita-rich-text a` CSS is a plain element selector (not a
// :link/:visited pseudo-class), so it still matches an <a> with no href.
export function disableLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => `<a${attrs.replace(/\s+href=("[^"]*"|'[^']*')/i, "")}>`);
}

// A brand-new Tiptap doc still serializes to "<p></p>" — a non-empty
// string that would otherwise pass any naive `.trim().length > 0` check.
// Reuses DOMPurify itself (stripping every tag leaves only real text
// content) rather than a second, regex-based "is this actually blank"
// implementation. Any field that requires real content (Comments) should
// gate its own submit button on this, exactly like a plain <textarea>
// would gate on `.trim().length === 0`.
export function isRichTextEmpty(html: string): boolean {
  if (!html) return true;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).replace(/\s+/g, "").length === 0;
}

// Plain-text rendering for a compact preview (e.g. a card/list snippet
// meant to be truncated with line-clamp) — strips every tag via DOMPurify
// (same empty-allowlist technique isRichTextEmpty already uses) rather
// than truncating raw HTML mid-tag. A no-op for legacy plain text (nothing
// to strip), so callers never need to normalizeRichText first.
export function richTextToPlainText(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).replace(/\s+/g, " ").trim();
}
