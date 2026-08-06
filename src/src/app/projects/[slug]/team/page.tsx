import { AppShell } from "@/components/app-shell";
import { TeamScreen, TeamBreadcrumb } from "@/components/team-screen";
import { projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function TeamPage(props: PageProps<"/projects/[slug]/team">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="team"
      breadcrumb={<TeamBreadcrumb slug={slug} />}
    >
      <TeamScreen slug={slug} />
    </AppShell>
  );
}
