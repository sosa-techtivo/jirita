import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getProjectBySlug } from "@/lib/mock-projects";
import { getTicketById } from "@/lib/mock-tickets";

export default async function TicketDetailPage(props: PageProps<"/projects/[slug]/tickets/[ticketId]">) {
  const { slug, ticketId } = await props.params;
  const project = getProjectBySlug(slug);
  const projectName = project?.name ?? "Mobile Banking App";
  const ticket = getTicketById(ticketId);
  const ticketTitle = ticket?.title ?? ticketId;

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
          <Link
            href={`/projects/${slug}/tickets`}
            className="text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Tickets
          </Link>
          <span className="text-slate-300 dark:text-zinc-700">/</span>
          <span className="text-slate-800 font-medium dark:text-zinc-200 truncate">{ticketTitle}</span>
        </>
      }
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-20 flex flex-col items-center text-center">
        <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-4 dark:border-zinc-700 dark:text-zinc-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 12h6M9 16h6M9 8h6" />
            <rect x="5" y="4" width="14" height="16" rx="2" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">Ticket Detail — Coming Next</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-sm dark:text-zinc-400">
          This screen will show the full detail for &quot;{ticketTitle}&quot; once it&apos;s built.
        </p>
        <Link
          href={`/projects/${slug}/tickets`}
          className="mt-5 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg px-3.5 py-2 transition-colors dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          ← Back to Tickets
        </Link>
      </div>
    </AppShell>
  );
}
