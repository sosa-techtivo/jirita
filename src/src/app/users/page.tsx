import { AppShell } from "@/components/app-shell";
import { UsersScreen } from "@/components/users-screen";

export const metadata = {
  title: "Users — Jirita",
};

export default function UsersPage() {
  return (
    <AppShell
      activePage="users"
      breadcrumb={
        <span className="text-slate-800 font-medium dark:text-zinc-200">Users</span>
      }
    >
      <UsersScreen />
    </AppShell>
  );
}
