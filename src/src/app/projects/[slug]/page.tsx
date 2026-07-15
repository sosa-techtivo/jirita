import { AppShell } from "@/components/app-shell";
import { ProjectOverview, ProjectOverviewBreadcrumb } from "@/components/project-overview";
import { projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectOverviewPage(props: PageProps<"/projects/[slug]">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      breadcrumb={<ProjectOverviewBreadcrumb slug={slug} />}
    >
      <ProjectOverview slug={slug} />
    </AppShell>
  );
}
