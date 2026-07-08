import { AppShell } from "@/components/app-shell";
import { ProfileScreen } from "@/components/profile-screen";

export const metadata = {
  title: "Profile — Jirita",
};

export default function ProfilePage() {
  return (
    <AppShell breadcrumb={<span className="text-slate-800 font-medium dark:text-zinc-200">Profile</span>}>
      <ProfileScreen />
    </AppShell>
  );
}
