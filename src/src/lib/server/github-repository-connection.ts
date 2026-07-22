// Shared server-only helpers for GitHub Repository Integration OAuth —
// used by both the connect/callback Route Handlers (app/api/integrations/
// github/*/route.ts, which are never bundled client-side by Next.js) and
// the Server Actions in github-repository-connection-actions.ts. Nothing
// here is itself a Server Action or Route Handler; it's just the common
// plumbing so those files don't each duplicate it.

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// ── Supabase clients ─────────────────────────────────────────────────────
// Same caller-client-for-identity / admin-client-for-the-privileged-write
// pattern every other Server Action in this app already uses (see
// disable-user-action.ts / create-notification-action.ts).

function requireSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  return url;
}

export function getCallerClient(accessToken: string): SupabaseClient {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createClient(requireSupabaseUrl(), anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function getAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Missing Supabase server environment variables. Set SUPABASE_SERVICE_ROLE_KEY (see .env.example)."
    );
  }
  return createClient(requireSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Authorization ────────────────────────────────────────────────────────
// Mirrors projects_update's own RLS (is_org_admin_or_lead) exactly — the
// same "Admin or Project Lead" rule every other Project Settings write
// already goes through. Queried with the service-role client (bypasses
// RLS) so it can't be spoofed by a client-controlled organizationId —
// same reasoning create-notification-action.ts's own membership check uses.
export async function isOrgAdminOrLead(
  admin: SupabaseClient,
  organizationId: string,
  profileId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .maybeSingle<{ role: string; status: string }>();

  if (error || !data) return false;
  return data.status === "active" && (data.role === "admin" || data.role === "project_lead");
}

interface RepositoryProjectRow {
  id: string;
  organization_id: string;
  slug: string;
  repository_provider: string | null;
  repository_url: string | null;
}

// Fresh lookup by real project id — never resolved by slug/name/position.
export async function loadRepositoryProjectRow(
  admin: SupabaseClient,
  projectId: string
): Promise<RepositoryProjectRow | null> {
  const { data, error } = await admin
    .from("projects")
    .select("id, organization_id, slug, repository_provider, repository_url")
    .eq("id", projectId)
    .maybeSingle<RepositoryProjectRow>();

  if (error || !data) return null;
  return data;
}

// ── GitHub URL parsing/validation ────────────────────────────────────────
// Same shape lib/projects.ts's own GITHUB_REPO_URL_RE validates for Project
// Settings' Save Changes — duplicated here (rather than imported) so this
// server-only module has no dependency on that client-importable one.
export const GITHUB_REPO_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;

// Strips an optional trailing "/" and an optional ".git" suffix for the
// *parsed* owner/repo only — never mutates the stored repository_url
// itself, which keeps ".git"/trailing-slash exactly as saved.
export function parseGithubOwnerRepo(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

// ── GitHub API ───────────────────────────────────────────────────────────

export function githubApiHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Jirita-App",
  };
}

// Never logs/returns the GitHub response body — only a safe, small reason
// code the UI maps to its own copy.
export function mapGithubApiStatus(status: number): string {
  if (status === 401) return "invalid_authorization";
  if (status === 403) return "forbidden";
  if (status === 404) return "repo_not_found";
  return "github_error";
}

// ── OAuth env ────────────────────────────────────────────────────────────
// Reads exactly what's already in .env.local for this feature. Note: the
// live .env.local uses GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET (not
// GITHUB_OAUTH_CLIENT_ID/_SECRET) — see .env.example's own comment and
// PROJECT_STATUS.md for this naming discrepancy from the original request.
export interface GithubOAuthEnv {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export function requireGithubOAuthEnv(): GithubOAuthEnv {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      "Missing GitHub OAuth environment variables. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and " +
        "GITHUB_OAUTH_CALLBACK_URL (see .env.example)."
    );
  }

  return { clientId, clientSecret, callbackUrl };
}

// ── OAuth flow cookies ───────────────────────────────────────────────────
// state/verifier/projectId/organizationId/profileId are scoped to
// /api/integrations/github (never sent to unrelated routes) — they're only
// ever read back by the callback route, which GitHub itself redirects to
// under that same path. httpOnly, sameSite=lax (required so they still
// arrive on the top-level GET redirect GitHub issues back to our callback
// — Strict would drop them), secure outside local dev, and short-lived (10
// minutes, matching the "expiración máxima de 10 minutos" requirement).
// sameSite lax + short-lived is also what keeps this reasonably safe as a
// plain (non-encrypted-at-rest) cookie — it never holds the GitHub access
// token, only identifiers already known to be real (state/verifier/ids)
// that get re-verified server-side again at callback time regardless.

export const OAUTH_COOKIE_PATH = "/api/integrations/github";
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

// The bridge cookie is different: it has to reach both a plain navigation
// to /api/integrations/github/connect *and* a Server Action invoked from
// whatever page path the caller is currently on (e.g.
// /projects/[slug]/settings) — a cookie scoped to /api/integrations/github
// would never be sent along with the latter. It's also set client-side
// (document.cookie can't set httpOnly, so project-settings-screen.tsx's own
// bridgeGithubSession() sets a literal "Max-Age=30" there — this file only
// ever clears it, never sets a fresh one), so its actual security rests on
// being extremely short-lived and consumed (read + cleared) exactly once,
// never on being httpOnly.
const BRIDGE_COOKIE_PATH = "/";

export const OAUTH_COOKIE_NAMES = {
  bridge: "jirita_gh_bridge",
  state: "jirita_gh_state",
  verifier: "jirita_gh_verifier",
  projectId: "jirita_gh_project_id",
  organizationId: "jirita_gh_org_id",
  profileId: "jirita_gh_profile_id",
} as const;

export function oauthCookieOptions(maxAgeSeconds = OAUTH_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: OAUTH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  };
}

export function expiredOauthCookieOptions() {
  return { ...oauthCookieOptions(0), maxAge: 0 };
}

function expiredBridgeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: BRIDGE_COOKIE_PATH,
    maxAge: 0,
  };
}

// Reads the short-lived session-bridge cookie a Server Action needs to
// authenticate a caller that reached it via a plain function call — no
// Authorization header, and this app's Supabase session lives in the
// browser's own localStorage (lib/supabase-client.ts), never a cookie, so
// there's otherwise no proof of identity available to a Server Action
// invoked this way. This is the exact same bridge mechanism/cookie name
// project-settings-screen.tsx's "Connect GitHub" button already sets
// before navigating to /connect — reused here rather than a second
// authentication strategy (e.g. an Authorization-header Route Handler).
//
// Always clears the cookie immediately, whether or not it was present, so
// it can never be replayed — and never logs or returns anything about the
// cookie other than the raw token value itself, which the caller only
// ever passes straight into `caller.auth.getUser(...)`, never into a log
// statement or a returned DTO.
export async function consumeBridgeSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OAUTH_COOKIE_NAMES.bridge)?.value ?? null;
  cookieStore.set(OAUTH_COOKIE_NAMES.bridge, "", expiredBridgeCookieOptions());
  return token;
}

// A small, closed set of safe reason codes surfaced to the UI via
// ?integration=error&reason=... — never the raw GitHub error/response body.
export type GithubIntegrationErrorReason =
  | "not_authorized"
  | "not_found"
  | "not_configured"
  | "session_expired"
  | "provider_mismatch"
  | "state_mismatch"
  | "cancelled"
  | "invalid_authorization"
  | "forbidden"
  | "repo_not_found"
  | "repo_mismatch"
  | "insufficient_scope"
  | "network_error"
  | "github_error";
