import { AppShell } from "@/components/app-shell";
import { ProjectSettingsScreen, ProjectSettingsBreadcrumb } from "@/components/project-settings-screen";
import { projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectSettingsPage(props: PageProps<"/projects/[slug]/settings">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="settings"
      breadcrumb={<ProjectSettingsBreadcrumb slug={slug} />}
    >
      <ProjectSettingsScreen slug={slug} />
    </AppShell>
  );
}
