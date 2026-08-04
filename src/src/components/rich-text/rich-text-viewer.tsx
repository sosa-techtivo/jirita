"use client";

// Read-only counterpart to RichTextEditor — renders exactly the HTML a
// RichTextEditor produced (or legacy plain text, migrated transparently),
// sanitized on every render regardless of whether it was already
// sanitized on save, and with any task-list checkboxes forced inert since
// this is a display-only surface, never an editing one.

import { useMemo } from "react";
import { normalizeRichText, sanitizeRichTextHtml, disableCheckboxes } from "./rich-text-utils";

export function RichTextViewer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const html = useMemo(
    () => disableCheckboxes(sanitizeRichTextHtml(normalizeRichText(content))),
    [content]
  );

  return (
    <div
      className={"jirita-rich-text " + (className ?? "")}
      // Safe: html is always the output of sanitizeRichTextHtml immediately
      // above, never the raw stored/user-supplied value.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
