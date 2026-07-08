"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_ROLE,
  FALLBACK_AVATAR,
  MOCK_USERS,
  ROLE_LABELS,
  type CurrentUser,
  type Role,
} from "@/lib/current-user";
import { onAuthStateChange, type AuthUser } from "@/lib/auth";
import {
  loadMembership,
  updateOwnWeeklyCapacity,
  updateProfileAvatarPath,
  updateProfileNames,
  type Membership,
} from "@/lib/membership";
import { blobToDataUrl, resizeAvatarToSquareJpeg, uploadAvatarBlob, validateAvatarFile } from "@/lib/avatar-upload";

const OVERRIDES_STORAGE_KEY = "jirita:profile-overrides";
const DEV_ROLE_STORAGE_KEY = "jirita:mock-role";

// Gate for the dev-only mock fallback below — never true in a production
// build, so a missing/empty membership can never render a fake role as if
// it were real production data (see CLAUDE.md Backend Integration Status).
const DEV_FALLBACK_ALLOWED = process.env.NODE_ENV !== "production";

interface ProfileOverride {
  firstName: string;
  lastName: string;
  weeklyCapacity: number;
  /** Dev-fallback-only avatar preview (no Storage bucket to persist to). */
  avatarDataUrl?: string;
}

type ProfileOverrides = Partial<Record<Role, ProfileOverride>>;

export interface ProfileEditableFields {
  firstName: string;
  lastName: string;
  weeklyCapacity: number;
}

export interface ProfileSaveResult {
  success: boolean;
  /** Populated on failure (including partial failure — e.g. name saved but capacity didn't). */
  message?: string;
}

// What AuthGuard actually gates rendering on. "ready" covers both a real
// membership and the dev fallback — callers that only care "can I render
// the app shell now" don't need to know which.
export type MembershipStatus = "loading" | "unauthenticated" | "ready" | "no-membership" | "error";

interface CurrentUserContextValue {
  status: MembershipStatus;
  user: CurrentUser;
  organization: { id: string; name: string; slug: string } | null;
  /** True when `user` is the dev-only mock fallback, not a real Supabase membership. */
  isDevFallback: boolean;
  /** Set only when status is "error" (or the dev fallback masked one) — the raw Supabase error message. */
  errorMessage: string | null;
  setRole: (role: Role) => void;
  /** Real users: persists to Supabase (profiles + organization_memberships) and refetches. Dev fallback: local-only override. */
  updateProfile: (fields: ProfileEditableFields) => Promise<ProfileSaveResult>;
  /** Real users: resizes, uploads to Supabase Storage, saves the path, and refetches. Dev fallback: local-only data-URL preview. */
  uploadAvatar: (file: File) => Promise<ProfileSaveResult>;
  retry: () => void;
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

function readDevRole(): Role {
  if (typeof window === "undefined") return DEFAULT_ROLE;
  const stored = window.localStorage.getItem(DEV_ROLE_STORAGE_KEY);
  return isRole(stored) ? stored : DEFAULT_ROLE;
}

function readOverrides(): ProfileOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProfileOverrides) : {};
  } catch {
    return {};
  }
}

// Dev-fallback only — a real membership is persisted to Supabase directly
// (see updateProfile below) and always reflects the freshly-fetched row, so
// layering a local override on top of it would just mask genuine DB values
// with stale localStorage ones.
function applyOverride(base: CurrentUser, overrides: ProfileOverrides): CurrentUser {
  const override = overrides[base.role];
  if (!override) return base;
  const firstName = override.firstName || base.firstName;
  const lastName = override.lastName || base.lastName;
  return {
    ...base,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    weeklyCapacity: override.weeklyCapacity,
    avatar: override.avatarDataUrl || base.avatar,
  };
}

function devFallbackUser(role: Role): CurrentUser {
  return { ...MOCK_USERS[role] };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

// Maps a real Supabase profile + org membership onto the same CurrentUser
// shape the mock layer used, so every existing consumer (Sidebar,
// AccountMenu, ProfileScreen, RoleSwitcher, etc.) keeps working unchanged.
// `discipline` has no real column (see current-user.ts) — a real member's
// discipline is just their role label.
function realUser(membership: Membership, lastSignInAt: string | null): CurrentUser {
  const { profile, role, weeklyCapacity } = membership;
  const emailHandle = profile.email.split("@")[0] || profile.email;
  const firstName = profile.firstName.trim() || emailHandle;
  const lastName = profile.lastName.trim();
  const name = [firstName, lastName].filter(Boolean).join(" ") || profile.email;
  return {
    firstName,
    lastName,
    name,
    email: profile.email,
    role,
    discipline: ROLE_LABELS[role],
    avatar: profile.avatarUrl || FALLBACK_AVATAR,
    weeklyCapacity: weeklyCapacity ?? 0,
    memberSince: formatDate(profile.createdAt),
    lastLogin: lastSignInAt ? formatDate(lastSignInAt) : "—",
  };
}

// Tagged with the user id it was fetched for, so "loading" can be *derived*
// (fetchState is missing or stale for the current authUser) instead of set
// synchronously in an effect — the only setState call below happens inside
// loadMembership's .then() callback, a genuine async continuation.
type FetchState =
  | { status: "ready"; forUserId: string; membership: Membership }
  | { status: "no-membership"; forUserId: string }
  | { status: "error"; forUserId: string; message: string };

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  // undefined = auth state not yet known, null = known signed-out.
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const requestIdRef = useRef(0);

  const mounted = useMounted();
  const devRole = mounted ? readDevRole() : DEFAULT_ROLE;
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  useEffect(() => onAuthStateChange(setAuthUser), []);

  const runFetch = useCallback((userId: string) => {
    const requestId = ++requestIdRef.current;
    loadMembership(userId).then((result) => {
      if (requestIdRef.current !== requestId) return; // superseded by a newer session/retry
      setFetchState({ ...result, forUserId: userId });
    });
  }, []);

  useEffect(() => {
    if (authUser === undefined) return;
    if (authUser === null) {
      requestIdRef.current++; // invalidate any in-flight fetch from a prior session
      return;
    }
    runFetch(authUser.id);
  }, [authUser, runFetch]);

  const retry = useCallback(() => {
    if (authUser) runFetch(authUser.id);
  }, [authUser, runFetch]);

  const setRole = useCallback((next: Role) => {
    window.localStorage.setItem(DEV_ROLE_STORAGE_KEY, next);
    forceUpdate();
  }, [forceUpdate]);

  // fetchState only counts once it's actually for the signed-in user —
  // otherwise (null, or still tagged with a previous user's id) it's
  // treated as "loading" rather than reset via an effect.
  const currentFetch = authUser && fetchState?.forUserId === authUser.id ? fetchState : null;
  const readyFetch = currentFetch?.status === "ready" ? currentFetch : null;
  const hasRealMembership = readyFetch !== null;

  const baseUser = readyFetch
    ? realUser(readyFetch.membership, authUser?.lastSignInAt ?? null)
    : devFallbackUser(devRole);
  // Real membership: baseUser already reflects the freshly-fetched DB row —
  // no local override layered on top (see applyOverride's comment).
  const user = readyFetch ? baseUser : applyOverride(baseUser, readOverrides());

  const updateProfile = useCallback(
    async (forRole: Role, fields: ProfileEditableFields): Promise<ProfileSaveResult> => {
      if (hasRealMembership && authUser) {
        const [namesResult, capacityResult] = await Promise.all([
          updateProfileNames(authUser.id, { firstName: fields.firstName, lastName: fields.lastName }),
          updateOwnWeeklyCapacity(fields.weeklyCapacity),
        ]);
        runFetch(authUser.id); // reflect the real persisted row either way

        if (namesResult.status === "error" && capacityResult.status === "error") {
          return { success: false, message: `${namesResult.message} ${capacityResult.message}` };
        }
        if (namesResult.status === "error") {
          return { success: false, message: `Weekly capacity saved, but name failed to save: ${namesResult.message}` };
        }
        if (capacityResult.status === "error") {
          return { success: false, message: `Name saved, but weekly capacity failed to save: ${capacityResult.message}` };
        }
        return { success: true };
      }

      // Dev fallback: local-only override, no backend to write to. Keeps
      // any previously-saved avatar preview intact.
      const prevAvatar = readOverrides()[forRole]?.avatarDataUrl;
      const next = { ...readOverrides(), [forRole]: { ...fields, avatarDataUrl: prevAvatar } };
      window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next));
      forceUpdate();
      return { success: true };
    },
    [hasRealMembership, authUser, runFetch, forceUpdate]
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<ProfileSaveResult> => {
      const validationError = validateAvatarFile(file);
      if (validationError) return { success: false, message: validationError };

      let resized: Blob;
      try {
        resized = await resizeAvatarToSquareJpeg(file);
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : "Could not process the image." };
      }

      if (hasRealMembership && authUser) {
        const uploadResult = await uploadAvatarBlob(authUser.id, resized);
        if (uploadResult.status === "error") return { success: false, message: uploadResult.message };

        const saveResult = await updateProfileAvatarPath(authUser.id, uploadResult.path);
        runFetch(authUser.id); // reflect the real persisted row either way
        if (saveResult.status === "error") return { success: false, message: saveResult.message };
        return { success: true };
      }

      // Dev fallback: no Storage bucket to persist to — keep the resized
      // preview as a local data URL, merged onto whatever name/capacity
      // override (if any) already existed.
      const dataUrl = await blobToDataUrl(resized);
      const prev = readOverrides()[user.role];
      const next = {
        ...readOverrides(),
        [user.role]: {
          firstName: prev?.firstName ?? user.firstName,
          lastName: prev?.lastName ?? user.lastName,
          weeklyCapacity: prev?.weeklyCapacity ?? user.weeklyCapacity,
          avatarDataUrl: dataUrl,
        },
      };
      window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next));
      forceUpdate();
      return { success: true };
    },
    [hasRealMembership, authUser, runFetch, forceUpdate, user.role, user.firstName, user.lastName, user.weeklyCapacity]
  );

  // Raw status from auth + the Supabase lookup, before any dev fallback.
  const rawStatus: MembershipStatus =
    authUser === undefined
      ? "loading"
      : authUser === null
        ? "unauthenticated"
        : (currentFetch?.status ?? "loading");

  // Only "no-membership" or "error" ever fall back — and only outside
  // production. A real "ready" membership always wins; a signed-out/loading
  // state is never masked.
  const isDevFallback =
    DEV_FALLBACK_ALLOWED && (rawStatus === "no-membership" || rawStatus === "error");

  const status: MembershipStatus = isDevFallback ? "ready" : rawStatus;

  const organization = readyFetch ? readyFetch.membership.organization : null;
  const errorMessage = currentFetch?.status === "error" ? currentFetch.message : null;

  const value: CurrentUserContextValue = {
    status,
    user,
    organization,
    isDevFallback,
    errorMessage,
    setRole,
    updateProfile: (fields: ProfileEditableFields) => updateProfile(user.role, fields),
    uploadAvatar,
    retry,
  };

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within a CurrentUserProvider");
  return ctx;
}
