"use client";

// Read-only counterpart to RichTextEditor — renders exactly the HTML a
// RichTextEditor produced (or legacy plain text, migrated transparently),
// sanitized on every render regardless of whether it was already
// sanitized on save, and with any task-list checkboxes forced inert since
// this is a display-only surface, never an editing one.
//
// Sanitizing is only ever done client-side, inside an effect — never
// directly in the render body (a plain useMemo would still run during
// Next.js's SSR pass for this "use client" component). DOMPurify has no
// real DOM to sanitize against on the server, so calling sanitize() there
// throws; deferring to an effect means it's simply never invoked outside
// the browser at all, at the cost of the real content appearing one tick
// after mount instead of in the server-rendered HTML.

import { useEffect, useState } from "react";
import { normalizeRichText, sanitizeRichTextHtml, disableCheckboxes } from "./rich-text-utils";

export function RichTextViewer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sanitize() must never run during Next.js's SSR pass (no real DOM to sanitize against there), so this is the one place it's deliberately deferred to a real, browser-only effect instead of computed directly in the render body
    setHtml(disableCheckboxes(sanitizeRichTextHtml(normalizeRichText(content))));
  }, [content]);

  return (
    <div
      className={"jirita-rich-text " + (className ?? "")}
      // Safe: html is always the output of sanitizeRichTextHtml above,
      // never the raw stored/user-supplied value.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
