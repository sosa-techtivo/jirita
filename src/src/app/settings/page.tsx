import { redirect } from "next/navigation";

// The workspace-wide Settings screen was retired outright — JIRITA is
// single-tenant, so workspace name/active days/default role/default
// capacity are no longer user-configurable (see PROJECT_STATUS.md). This
// route (and every subroute under it) now only redirects to the Dashboard.
export default function SettingsPage() {
  redirect("/dashboard");
}
