import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { projects, getProjectBySlug } from "@/lib/mock-projects";
import { tickets, getTicketById } from "@/lib/mock-tickets";
import { TicketDetailScreen } from "@/components/tickets/ticket-detail-screen";

export function generateStaticParams() {
  return projects.flatMap((project) =>
    tickets.map((ticket) => ({ slug: project.slug, ticketId: ticket.id }))
  );
}

export default async function TicketDetailPage(props: PageProps<"/projects/[slug]/tickets/[ticketId]">) {
  const { slug, ticketId } = await props.params;
  const project = getProjectBySlug(slug);
  const projectName = project?.name ?? "Project";
  const ticket = getTicketById(ticketId);
  const ticketTitle = ticket?.title ?? ticketId;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="tickets"
      breadcrumb={
        <>
          <Link
            href="/projects"
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
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
          <Link
            href={`/projects/${slug}/tickets`}
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Tickets
          </Link>
          <span className="text-slate-300 dark:text-zinc-700">/</span>
          <span className="text-slate-800 font-medium dark:text-zinc-200 truncate">
            {ticketTitle}
          </span>
        </>
      }
    >
      <TicketDetailScreen ticket={ticket} ticketId={ticketId} slug={slug} />
    </AppShell>
  );
}
