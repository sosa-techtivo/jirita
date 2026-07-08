// Real Supabase Auth for login/logout/session — the one part of the backend
// that's actually wired up. Everything else (projects, tickets, dashboard,
// reports, users, settings) still reads from the mock-*.ts data modules; see
// CLAUDE.md's Backend Integration Status. Change Password stays mock for now
// (see mock-auth.ts) since it's out of scope for this pass.

import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase-client";
import { AuthError } from "./mock-auth";

export { AuthError };

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export interface AuthUser {
  id: string;
  email: string;
  lastSignInAt: string | null;
}

function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    lastSignInAt: session.user.last_sign_in_at ?? null,
  };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new AuthError(error.message);
  const user = toAuthUser(data.session);
  if (!user) throw new AuthError("Sign-in failed. Please try again.");
  return user;
}

export async function logout(): Promise<void> {
  await getSupabaseBrowserClient().auth.signOut();
}

// Fires once with the current session on subscribe, then again on every
// change (sign-in, sign-out, token refresh). Returns an unsubscribe function
// — call sites use this instead of a synchronous localStorage read, since a
// real Supabase session is only known once the client finishes initializing.
export function onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
  const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
    callback(toAuthUser(session));
  });
  return () => data.subscription.unsubscribe();
}

// Always resolves — mirrors a real backend never revealing whether an email
// has an account (Supabase's resetPasswordForEmail behaves the same way).
export async function requestPasswordReset(email: string): Promise<void> {
  await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

// Requires an active recovery session — the Supabase browser client parses
// the recovery token from the URL automatically (detectSessionInUrl, on by
// default) when the user lands here from the emailed link.
export async function confirmPasswordReset(newPassword: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: newPassword });
  if (error) throw new AuthError(error.message);
}
