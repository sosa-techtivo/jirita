// Deterministic initials + pastel color pair for users without a profile
// photo. Same name always maps to the same palette entry.

const PALETTE: { bg: string; text: string }[] = [
  { bg: "bg-rose-100 dark:bg-rose-500/20", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-orange-100 dark:bg-orange-500/20", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-lime-100 dark:bg-lime-500/20", text: "text-lime-700 dark:text-lime-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-teal-100 dark:bg-teal-500/20", text: "text-teal-700 dark:text-teal-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-sky-100 dark:bg-sky-500/20", text: "text-sky-700 dark:text-sky-300" },
  { bg: "bg-indigo-100 dark:bg-indigo-500/20", text: "text-indigo-700 dark:text-indigo-300" },
  { bg: "bg-violet-100 dark:bg-violet-500/20", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-500/20", text: "text-fuchsia-700 dark:text-fuchsia-300" },
  { bg: "bg-pink-100 dark:bg-pink-500/20", text: "text-pink-700 dark:text-pink-300" },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Same seed (a person's display name) always resolves to the same pastel pair. */
export function getAvatarColors(seed: string): { bg: string; text: string } {
  const trimmed = seed.trim();
  if (!trimmed) return PALETTE[0];
  return PALETTE[hashString(trimmed) % PALETTE.length];
}

/** "Alejandro Cadavid" -> "AC"; single word -> first two letters; empty -> "?". */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
