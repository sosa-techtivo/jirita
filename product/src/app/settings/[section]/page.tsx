import { AppShell } from "@/components/app-shell";
import { SettingsSectionScreen } from "@/components/settings-section-screen";
import Link from "next/link";

const SECTION_TITLES: Record<string, string> = {
  "general":       "General",
  "people":        "People",
  "projects":      "Projects",
  "time-tracking": "Time Tracking",
  "notifications": "Notifications",
  "integrations":  "Integrations",
  "danger-zone":   "Danger Zone",
};

export function generateStaticParams() {
  return Object.keys(SECTION_TITLES).map((section) => ({ section }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = SECTION_TITLES[section] ?? "Settings";
  return { title: `${title} · Settings — Jirita` };
}

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = SECTION_TITLES[section] ?? "Settings";

  return (
    <AppShell
      activePage="settings"
      breadcrumb={
        <>
          <Link
            href="/settings"
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Settings
          </Link>
          <span className="text-slate-300 dark:text-zinc-700">/</span>
          <span className="text-slate-800 font-medium dark:text-zinc-200">{title}</span>
        </>
      }
    >
      <SettingsSectionScreen section={section} />
    </AppShell>
  );
}
