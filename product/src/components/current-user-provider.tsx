"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_ROLE, MOCK_USERS, type CurrentUser, type Role } from "@/lib/current-user";

const STORAGE_KEY = "jirita:mock-role";

interface CurrentUserContextValue {
  user: CurrentUser;
  setRole: (role: Role) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

function isRole(value: string | null): value is Role {
  return value === "ADMIN" || value === "PROJECT_LEAD" || value === "MEMBER";
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isRole(stored)) setRoleState(stored);
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ user: MOCK_USERS[role], setRole }),
    [role, setRole],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within a CurrentUserProvider");
  return ctx;
}
