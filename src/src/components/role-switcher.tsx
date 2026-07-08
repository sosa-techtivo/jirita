"use client";

import { useCurrentUser } from "@/components/current-user-provider";
import { ROLE_LABELS, type Role } from "@/lib/current-user";

const ROLES: Role[] = ["ADMIN", "PROJECT_LEAD", "MEMBER"];

// Dev-only affordance for switching the mock currentUser's role so the
// role-based nav/actions can be exercised without a real auth backend.
export function RoleSwitcher() {
  const { user, setRole } = useCurrentUser();

  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="hidden lg:inline text-slate-400 dark:text-zinc-500">Viewing as</span>
      <select
        value={user.role}
        onChange={(event) => setRole(event.target.value as Role)}
        aria-label="Switch mock user role"
        className="rounded-md border border-slate-200 bg-slate-50 text-slate-600 text-xs font-medium px-2 py-1 outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </label>
  );
}
