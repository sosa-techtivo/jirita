import { AppShell } from "@/components/app-shell";
import { SettingsSectionScreen, SettingsBreadcrumb } from "@/components/settings-section-screen";

const SECTION_TITLES: Record<string, string> = {
  "general":       "General",
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
      breadcrumb={<SettingsBreadcrumb section={section} title={title} />}
    >
      <SettingsSectionScreen section={section} />
    </AppShell>
  );
}
