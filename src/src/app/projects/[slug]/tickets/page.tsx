import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { TicketsScreen, TicketsBreadcrumb } from "@/components/tickets-screen";
import { projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function TicketsPage(props: PageProps<"/projects/[slug]/tickets">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="tickets"
      breadcrumb={<TicketsBreadcrumb slug={slug} />}
    >
      {/* useSearchParams() (for ?alerts=) requires a Suspense boundary */}
      <Suspense fallback={null}>
        <TicketsScreen slug={slug} />
      </Suspense>
    </AppShell>
  );
}
