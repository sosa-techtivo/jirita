import { AppShell } from "@/components/app-shell";
import { MyWorkScreen } from "@/components/my-work-screen";

export const metadata = {
  title: "My Work — Jirita",
};

export default function MyWorkPage() {
  return (
    <AppShell
      activePage="my-work"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">My Work</span>
      }
    >
      <MyWorkScreen />
    </AppShell>
  );
}
