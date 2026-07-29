/**
 * Deliberately copied — not imported — from src/lib/projects.ts's
 * `slugify`/`generateProjectCode`. That module also pulls in
 * notifications.ts / membership.ts (and a "use server" action further down
 * that chain), which this importer must never touch (task scope: no
 * tickets/comments/activity/notifications/memberships code). These two
 * functions are pure string transforms with no side effects, so the
 * duplication trades a few lines for keeping this CLI's dependency graph
 * isolated from the app's notification-triggering code paths. Keep in sync
 * with src/lib/projects.ts by hand if that logic ever changes.
 */

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `project-${Date.now()}`;
}

export function generateProjectCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const raw =
    words.length >= 2
      ? words.map((word) => word[0]).join("").toUpperCase().slice(0, 4)
      : (words[0] ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
  return raw || `P${Date.now().toString().slice(-4)}`;
}
