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
import { usePathname } from "next/navigation";
import {
  DEFAULT_ROLE,
  FALLBACK_AVATAR,
  ROLE_LABELS,
  type CurrentUser,
  type Role,
} from "@/lib/current-user";
import { logout, onAuthStateChange, type AuthUser } from "@/lib/auth";
import {
  loadMembership,
  updateOwnWeeklyCapacity,
  updateProfileAvatarPath,
  updateProfileNames,
  type Membership,
  type Organization,
} from "@/lib/membership";
import { blobToDataUrl, resizeAvatarToSquareJpeg, uploadAvatarBlob, validateAvatarFile } from "@/lib/avatar-upload";

const OVERRIDES_STORAGE_KEY = "jirita:profile-overrides";
const DEV_ROLE_STORAGE_KEY = "jirita:mock-role";

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
  organization: Organization | null;
  /** The signed-in user's real Supabase auth/profile id (profiles.id === auth.users.id)
   *  — the stable identifier tickets' assignee_profile_id should be compared against
   *  (e.g. a "Mine" filter), never the display name. Null whenever there's no real
   *  membership row to match against (including while one is still loading). */
  userId: string | null;
  /** True when there's no real organization/project/ticket data to read for this
   *  session (membership missing or the lookup errored) — other real-data screens
   *  (Projects, Tickets, etc.) use this to fall back to their own local mock arrays
   *  for local dev without seed data. Does NOT mean `user` is a mock identity — a
   *  real signed-in session (authUser non-null) never shows one; see neutralUser(). */
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

// Shown while a real session's membership is loading, or when it comes
// back empty/errored — replaces the old MOCK_USERS[devRole] fallback
// entirely, so no session (real or dev) can ever display a named mock
// person (no "Sarah Chen", no mock avatar/email/discipline/weeklyCapacity/
// dates). `role` is the one exception: it still follows the RoleSwitcher's
// stored dev role (only ever visible/switchable in the isDevFallback
// state, gated in header-bar.tsx), since that's a permission-preview tool
// for exercising role-gated UI on *real* screens, not an impersonation of
// any specific fake person — no name/avatar/email is ever attached to it
// here.
function neutralUser(role: Role): CurrentUser {
  return {
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    role,
    discipline: "",
    avatar: FALLBACK_AVATAR,
    weeklyCapacity: 0,
    memberSince: "—",
    lastLogin: "—",
  };
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
  const pathname = usePathname();

  useEffect(
    () =>
      onAuthStateChange((user) => {
        setAuthUser(user);
        // Drop the last resolved membership the moment a session actually
        // ends, not just in-flight requests (requestIdRef below still
        // handles those) — otherwise, since fetchState is only ever keyed
        // by forUserId, the *same* user signing back in (e.g. right after
        // being disabled, then re-enabled and logging back in with the
        // same profile id) would instantly match this stale, pre-sign-out
        // value again on the next render, before the fresh runFetch below
        // even resolves. That stale value is exactly what was driving a
        // sign-out just now (see the effect further below), so re-matching
        // it would re-trigger that same sign-out — a real bug (silent
        // bounce straight back to /login after valid credentials), not a
        // hypothetical one. Cleared here, in the same external-event
        // callback that already reports the session ending, rather than a
        // derived effect on authUser.
        if (user === null) setFetchState(null);
      }),
    []
  );

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

  // Clears the previous result immediately, not just once the fresh one
  // lands — a caller reaching for retry() (accept-invite's own post-accept
  // refresh, in particular) means "the last result is known-stale," so
  // currentFetch must read as "loading" for that whole in-flight window,
  // never keep showing the old result. Without this, a stale
  // "no-membership" read from *before* the accept (still the same
  // forUserId, same session) would stay live long enough for the
  // auto-sign-out effect above to act on it after all — even once past
  // /accept-invite itself — since nothing else marks it stale until the new
  // fetch resolves.
  const retry = useCallback(() => {
    if (!authUser) return;
    setFetchState(null);
    runFetch(authUser.id);
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

  // A signed-in session whose membership resolves to "no-membership" — never
  // had one, or an admin just disabled it while the tab was open — must
  // never keep rendering the authenticated app or any fallback identity.
  // signOut() clears the Supabase session (local storage + in-memory),
  // which fires onAuthStateChange(null): authUser becomes null, `status`
  // becomes "unauthenticated", and AuthGuard's existing redirect-to-/login
  // effect takes it from there — no separate redirect/local-state-clearing
  // logic needed here. The dependency array only changes when authUser or
  // fetchState itself actually changes, so this fires once per resolution,
  // not on every render while the (async) sign-out is in flight.
  //
  // Exception: /accept-invite. loadMembership only ever matches a *active*
  // organization_memberships row (see membership.ts) — an invited user who
  // just had their token verified there is, by definition, still 'invited'
  // at this exact moment (accept_own_invitation is what flips that to
  // 'active', and it hasn't run yet), so this always resolves to
  // "no-membership" for them too. Without this exception, CurrentUserProvider
  // — mounted globally at the root layout, so it reacts to that page's
  // SIGNED_IN event the same as anywhere else — would force-sign the invite
  // session back out via logout() moments after it was established, which
  // is exactly what was surfacing as "Auth session missing!" on that page's
  // password submission (the session updateUser needed had already been
  // destroyed here first). Every other page keeps the original protection
  // unchanged.
  useEffect(() => {
    if (pathname === "/accept-invite") return;
    if (authUser && currentFetch?.status === "no-membership") {
      logout();
    }
  }, [authUser, currentFetch, pathname]);

  // Revalidates the still-open session's membership on the two moments
  // most likely to catch a change made elsewhere — regaining window focus
  // and navigating to a new route — using the same runFetch every other
  // refresh (the auth-state effect above, retry()) already goes through.
  // Both are one-shot, event-driven checks, never a timer/poll.
  useEffect(() => {
    if (!authUser) return;
    const userId = authUser.id;
    function onFocus() {
      runFetch(userId);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [authUser, runFetch]);

  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (!authUser) return;
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    runFetch(authUser.id);
  }, [pathname, authUser, runFetch]);

  // Never a mock identity here while a real session exists — this is the
  // fix for the "Sarah Chen" flash: a real signed-in user (authUser is
  // non-null) whose membership is still loading, or came back empty/
  // errored, now always sees neutralUser(), never a named mock person.
  // Saved profile overrides (readOverrides — still written by
  // updateProfile/uploadAvatar's dev-fallback branches below) are no
  // longer read back in here; they only ever made sense layered on top of
  // a named mock identity, which no longer exists.
  const baseUser = readyFetch
    ? realUser(readyFetch.membership, authUser?.lastSignInAt ?? null)
    : neutralUser(devRole);
  const user = baseUser;

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

  // Raw status from auth + the Supabase lookup.
  const rawStatus: MembershipStatus =
    authUser === undefined
      ? "loading"
      : authUser === null
        ? "unauthenticated"
        : (currentFetch?.status ?? "loading");

  // Retired: a real signed-in session's identity/org data must never be
  // masked by fake data, in any environment — a missing or inactive
  // membership (including one just disabled by an admin, see the
  // force-sign-out effect above) always surfaces as the real status below,
  // never as "ready" with a mock role/org. Kept as an explicit `false`
  // rather than deleted, so every existing consumer of `isDevFallback`
  // (header badge/RoleSwitcher, OrganizationProjectsProvider's own local
  // mock-data fallback, etc.) keeps compiling against the same shape —
  // they now simply always take their real-data branch.
  const isDevFallback = false;

  const status: MembershipStatus = isDevFallback ? "ready" : rawStatus;

  const organization = readyFetch ? readyFetch.membership.organization : null;
  const errorMessage = currentFetch?.status === "error" ? currentFetch.message : null;

  const value: CurrentUserContextValue = {
    status,
    user,
    organization,
    userId: readyFetch && authUser ? authUser.id : null,
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
