import { AppShell } from "@/components/app-shell";
import { TicketDetailScreen, TicketDetailBreadcrumb } from "@/components/tickets/ticket-detail-screen";
import { projects } from "@/lib/mock-projects";
import { tickets, getTicketDisplayKey } from "@/lib/mock-tickets";

export function generateStaticParams() {
  return projects.flatMap((project) =>
    tickets
      .filter((ticket) => ticket.projectSlug === project.slug)
      .map((ticket) => ({ slug: project.slug, ticketCode: getTicketDisplayKey(ticket) }))
  );
}

export default async function TicketDetailPage(props: PageProps<"/projects/[slug]/tickets/[ticketCode]">) {
  const { slug, ticketCode } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="tickets"
      breadcrumb={<TicketDetailBreadcrumb slug={slug} ticketCode={ticketCode} />}
    >
      <TicketDetailScreen slug={slug} ticketCode={ticketCode} />
    </AppShell>
  );
}
