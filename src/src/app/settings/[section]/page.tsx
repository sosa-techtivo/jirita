import { redirect } from "next/navigation";

// The workspace-wide Settings screen was retired outright — JIRITA is
// single-tenant, so workspace name/active days/default role/default
// capacity are no longer user-configurable (see PROJECT_STATUS.md). Every
// subroute here (e.g. /settings/general, /settings/danger-zone) redirects
// to the Dashboard instead of rendering the old General/Danger Zone UI.
export default function SettingsSectionPage() {
  redirect("/dashboard");
}
