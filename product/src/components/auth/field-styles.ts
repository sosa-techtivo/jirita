// Shared class strings for auth form fields — copied from the same
// constants used across invite-user-modal.tsx / member-profile-modal.tsx so
// the auth screens match the rest of the app's inputs exactly.

export const FIELD_LABEL =
  "block text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-600 mb-1.5";

export const INPUT =
  "w-full bg-white dark:bg-zinc-900 text-[13px] font-medium text-slate-800 dark:text-zinc-200 " +
  "border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 outline-none " +
  "focus:border-brand-500 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "placeholder:text-slate-300 dark:placeholder:text-zinc-600 transition-colors";

export const INPUT_ERROR =
  "border-red-300 dark:border-red-500/40 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 " +
  "dark:focus:border-red-500 dark:focus:ring-red-500/20";
