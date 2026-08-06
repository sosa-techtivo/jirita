import { AppShell } from "@/components/app-shell";
import { NotesScreen, NotesBreadcrumb } from "@/components/notes-screen";
import { projects } from "@/lib/mock-projects";

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function NotesPage(props: PageProps<"/projects/[slug]/notes">) {
  const { slug } = await props.params;

  return (
    <AppShell
      activeSlug={slug}
      activeSection="notes"
      breadcrumb={<NotesBreadcrumb slug={slug} />}
    >
      <NotesScreen slug={slug} />
    </AppShell>
  );
}
