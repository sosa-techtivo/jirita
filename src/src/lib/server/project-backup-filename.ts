// Builds the suggested filename for a project backup ZIP:
// "<ProjectName>-backup-YYYY-MM-DD.zip", with project.name sanitized into a
// safe filename fragment. Extracted into its own module so every caller
// that needs to name a backup download (currently: the
// /api/projects/backup Route Handler) shares exactly one implementation —
// never copy-pasted per caller. Only affects the computed filename string;
// never the project row / database value itself.

// Remaining filename-invalid characters once "/" and "\" have already been
// turned into "-" below: ASCII control characters plus the other reserved
// characters (<>:"|?*). Dropped outright, never replaced with a separator.
const INVALID_FILENAME_CHARS_RE = /[\x00-\x1f<>:"|?*]/g;

function sanitizeProjectNameForFilename(projectName: string): string {
  return (
    projectName
      // "/" or "\" (and any whitespace touching them) collapse into a
      // single "-", e.g. "CRM / LendingPoint" -> "CRM-LendingPoint".
      .replace(/\s*[\\/]+\s*/g, "-")
      .replace(INVALID_FILENAME_CHARS_RE, "")
      // Repeated whitespace unrelated to any "-" collapses to one space.
      .replace(/\s+/g, " ")
      .trim()
      // Multiple consecutive "-" (from several slashes in a row, or one
      // newly-added "-" landing next to an existing one) collapse into a
      // single "-"; any left dangling at either edge is trimmed too.
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

// "<ProjectName>-backup-YYYY-MM-DD.zip" — the date is expected to come from
// the export's own `exportedAt` (already computed once, inside
// exportProject()), not a second independently-taken "now", so the
// filename can never disagree with what manifest.json itself records as
// the export time.
export function buildProjectBackupFilename(projectName: string, exportedAtIso: string): string {
  const date = exportedAtIso.slice(0, 10);
  const safeName = sanitizeProjectNameForFilename(projectName);
  return `${safeName}-backup-${date}.zip`;
}
