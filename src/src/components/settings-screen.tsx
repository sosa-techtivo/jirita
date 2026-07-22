import Link from "next/link";
import type { ReactNode } from "react";

// ── Section definitions ───────────────────────────────────────────────────────

export const SETTINGS_SECTIONS = [
  {
    slug:        "general",
    title:       "General",
    description: "Workspace identity and locale",
    iconBg:      "bg-slate-100 dark:bg-zinc-800",
    iconColor:   "text-slate-600 dark:text-zinc-300",
    items:       ["Workspace name", "Logo", "Timezone", "Language", "Working days"],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    slug:        "notifications",
    title:       "Notifications",
    description: "Email, desktop and digest preferences",
    iconBg:      "bg-emerald-50 dark:bg-emerald-500/10",
    iconColor:   "text-emerald-600 dark:text-emerald-400",
    items:       ["Email", "Desktop", "Mentions", "Weekly digest"],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
  {
    slug:        "integrations",
    title:       "Integrations",
    description: "Connected tools and services",
    iconBg:      "bg-brand-50 dark:bg-brand-500/10",
    iconColor:   "text-brand-600 dark:text-brand-400",
    items:       ["GitHub", "Slack", "Google Calendar", "Jira Import"],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
] as const;

export const DANGER_SECTION = {
  slug:        "danger-zone",
  title:       "Danger Zone",
  description: "Irreversible workspace actions",
  iconBg:      "bg-red-50 dark:bg-red-500/10",
  iconColor:   "text-red-600 dark:text-red-400",
  items:       ["Archive Workspace", "Delete Workspace"],
  icon: (
    <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  ),
};

// ── Card ──────────────────────────────────────────────────────────────────────

function SectionCard({
  slug,
  title,
  description,
  icon,
  iconBg,
  iconColor,
  items,
  danger,
}: {
  slug:        string;
  title:       string;
  description: string;
  icon:        ReactNode;
  iconBg:      string;
  iconColor:   string;
  items:       readonly string[];
  danger?:     boolean;
}) {
  return (
    <Link
      href={`/settings/${slug}`}
      className={[
        "group flex flex-col rounded-2xl border p-6 transition-all duration-150",
        "shadow-sm shadow-slate-200/40 dark:shadow-black/20",
        danger
          ? "border-red-100 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10 hover:border-red-200 dark:hover:border-red-800/60 hover:shadow-red-100/40"
          : "border-slate-200 dark:border-zinc-700/70 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-600 hover:shadow-md",
      ].join(" ")}
    >
      {/* Card header */}
      <div className="flex items-start justify-between mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <svg
          className={[
            "w-4 h-4 flex-shrink-0 mt-0.5 transition-all duration-150 group-hover:translate-x-0.5",
            danger
              ? "text-red-200 dark:text-red-800 group-hover:text-red-400"
              : "text-slate-200 dark:text-zinc-700 group-hover:text-brand-400",
          ].join(" ")}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" d="M9 18l6-6-6-6" />
        </svg>
      </div>

      {/* Title + description */}
      <h2 className={`text-[15px] font-bold mb-0.5 ${danger ? "text-red-800 dark:text-red-300" : "text-slate-900 dark:text-zinc-50"}`}>
        {title}
      </h2>
      <p className={`text-[12px] mb-4 ${danger ? "text-red-500/80 dark:text-red-400/70" : "text-slate-400 dark:text-zinc-500"}`}>
        {description}
      </p>

      {/* Sub-items */}
      <ul className="space-y-1.5 mt-auto">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className={`w-1 h-1 rounded-full flex-shrink-0 ${danger ? "bg-red-200 dark:bg-red-800" : "bg-slate-200 dark:bg-zinc-700"}`} />
            <span className={`text-[12px] ${danger ? "text-red-500 dark:text-red-400/80" : "text-slate-400 dark:text-zinc-600"}`}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

// ── Main hub component ────────────────────────────────────────────────────────

export function SettingsScreen() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 pb-16">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-slate-900 dark:text-zinc-50 tracking-tight leading-none mb-1.5">
          Settings
        </h1>
        <p className="text-sm text-slate-400 dark:text-zinc-500">
          Manage your workspace, team and application preferences.
        </p>
      </div>

      {/* Section grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SETTINGS_SECTIONS.map((s) => (
          <SectionCard key={s.slug} {...s} />
        ))}

        {/* Danger Zone — full width at the bottom */}
        <div className="md:col-span-2">
          <SectionCard {...DANGER_SECTION} danger />
        </div>
      </div>
    </div>
  );
}
