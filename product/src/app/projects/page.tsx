import { AppShell } from "@/components/app-shell";
import { ProjectsListScreen } from "@/components/projects-list-screen";

export default function ProjectsListPage() {
  return (
    <AppShell breadcrumb={<span className="text-slate-800 font-medium dark:text-zinc-200">Projects</span>}>
      <ProjectsListScreen />
    </AppShell>
  );
}
