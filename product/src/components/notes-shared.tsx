export const TAG_OPTIONS = ["Decision", "Meeting Notes", "Links", "Compliance", "General"];

export const TAG_CLASS: Record<string, string> = {
  Decision: "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400",
  "Meeting Notes": "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  Links: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  Compliance: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  General: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function TagBadge({ tag }: { tag: string }) {
  const cls = TAG_CLASS[tag] ?? TAG_CLASS.General;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold flex-shrink-0 ${cls}`}>
      {tag}
    </span>
  );
}

export const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "placeholder:text-slate-300 dark:placeholder:text-zinc-600 transition-colors";

export const FIELD_LABEL =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";
