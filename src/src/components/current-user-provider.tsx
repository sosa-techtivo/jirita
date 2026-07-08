"use client";

import { createContext, useCallback, useContext, useReducer, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_ROLE, MOCK_USERS, type CurrentUser, type Role } from "@/lib/current-user";

const STORAGE_KEY = "jirita:mock-role";
const OVERRIDES_STORAGE_KEY = "jirita:profile-overrides";

interface ProfileOverride {
  firstName: string;
  lastName: string;
}

type ProfileOverrides = Partial<Record<Role, ProfileOverride>>;

interface CurrentUserContextValue {
  user: CurrentUser;
  setRole: (role: Role) => void;
  updateProfile: (fields: ProfileOverride) => void;
}

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

function isRole(value: string | null): value is Role {
  return value === "ADMIN" || value === "PROJECT_LEAD" || value === "MEMBER";
}

const emptySubscribe = () => () => {};

// True only once hydrated on the client — lets this render the SSR-safe
// default (DEFAULT_ROLE, no overrides) on the first pass and switch to the
// real localStorage-backed values right after, same trick as
// theme-toggle.tsx's useMounted(), without reaching for setState-in-effect.
function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

function readRole(): Role {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isRole(stored) ? stored : DEFAULT_ROLE;
}

function readOverrides(): ProfileOverrides {
  try {
    const raw = window.localStorage.getItem(OVERRIDES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProfileOverrides) : {};
  } catch {
    return {};
  }
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  // Writes to localStorage don't re-render on their own — bump this from
  // the click handlers below (setRole/updateProfile), never from an effect.
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  const role = mounted ? readRole() : DEFAULT_ROLE;
  const overrides = mounted ? readOverrides() : {};

  const setRole = useCallback((next: Role) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    forceUpdate();
  }, []);

  const updateProfile = useCallback((forRole: Role, fields: ProfileOverride) => {
    const next = { ...readOverrides(), [forRole]: fields };
    window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next));
    forceUpdate();
  }, []);

  const base = MOCK_USERS[role];
  const override = overrides[role];
  const firstName = override?.firstName ?? base.firstName;
  const lastName = override?.lastName ?? base.lastName;

  const value: CurrentUserContextValue = {
    user: { ...base, firstName, lastName, name: `${firstName} ${lastName}` },
    setRole,
    updateProfile: (fields: ProfileOverride) => updateProfile(role, fields),
  };

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within a CurrentUserProvider");
  return ctx;
}
