import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProjectOverview } from "@/components/project-overview";
import { getProjectBySlug, projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectOverviewPage(props: PageProps<"/projects/[slug]">) {
  const { slug } = await props.params;
  const project = getProjectBySlug(slug);
  const projectName = project?.name ?? "Mobile Banking App";

  return (
    <AppShell
      activeSlug={slug}
      breadcrumb={
        <>
          <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            Projects
          </Link>
          <span className="text-slate-300 dark:text-zinc-700">/</span>
          <span className="text-slate-800 font-medium dark:text-zinc-200">{projectName}</span>
        </>
      }
    >
      <ProjectOverview slug={slug} />
    </AppShell>
  );
}
