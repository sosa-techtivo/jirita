import { AppShell } from "@/components/app-shell";
import { ProjectReportsScreen, ProjectReportsBreadcrumb } from "@/components/project-reports-screen";
import { projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectReportsPage(props: PageProps<"/projects/[slug]/reports">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="reports"
      breadcrumb={<ProjectReportsBreadcrumb slug={slug} />}
    >
      <ProjectReportsScreen slug={slug} />
    </AppShell>
  );
}
