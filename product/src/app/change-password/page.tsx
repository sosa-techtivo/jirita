import { AppShell } from "@/components/app-shell";
import { ChangePasswordScreen } from "@/components/change-password-screen";

export const metadata = {
  title: "Change Password — Jirita",
};

export default function ChangePasswordPage() {
  return (
    <AppShell breadcrumb={<span className="text-slate-800 font-medium dark:text-zinc-200">Change Password</span>}>
      <ChangePasswordScreen />
    </AppShell>
  );
}
