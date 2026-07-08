import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TicketsScreen } from "@/components/tickets-screen";
import { getProjectBySlug, projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function TicketsPage(props: PageProps<"/projects/[slug]/tickets">) {
  const { slug } = await props.params;
  const project = getProjectBySlug(slug);
  const projectName = project?.name ?? "Mobile Banking App";

  return (
    <AppShell
      activeSlug={slug}
      activeSection="tickets"
      breadcrumb={
        <>
          <Link href="/projects" className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300">
            Projects
          </Link>
          <span className="text-slate-300 dark:text-zinc-700">/</span>
          <Link
            href={`/projects/${slug}`}
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            {projectName}
          </Link>
          <span className="text-slate-300 dark:text-zinc-700">/</span>
          <span className="text-slate-800 font-medium dark:text-zinc-200">Tickets</span>
        </>
      }
    >
      <TicketsScreen slug={slug} projectName={projectName} />
    </AppShell>
  );
}
