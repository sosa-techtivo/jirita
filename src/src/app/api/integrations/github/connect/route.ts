// GET /api/integrations/github/connect?projectId=<real project id>
//
// Starts the real GitHub OAuth flow for one project's Repository
// Integration. Reached via a normal top-level browser navigation (never a
// popup) — see project-settings-screen.tsx's "Connect GitHub"/"Reconnect
// GitHub" button.
//
// Auth note: this app's Supabase session lives in the browser's own
// localStorage (see lib/supabase-client.ts), not a cookie — so a plain GET
// navigation carries no proof of identity on its own. The button click
// bridges its own already-verified session token into a short-lived,
// single-purpose cookie (jirita_gh_bridge) immediately before navigating
// here; consumeBridgeSessionToken() (the same helper the status/Disconnect
// Server Actions reuse, rather than a second auth mechanism) reads it once
// and clears it right away. This never starts the actual OAuth logic
// (state/PKCE/redirect construction) client-side — that all happens
// below, server-side. The bridge token itself is never logged, never
// placed in a query param, and never included in any response.

import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import {
  GITHUB_REPO_URL_RE,
  OAUTH_COOKIE_NAMES,
  consumeBridgeSessionToken,
  expiredOauthCookieOptions,
  getAdminClient,
  getCallerClient,
  isOrgAdminOrLead,
  loadRepositoryProjectRow,
  oauthCookieOptions,
  requireGithubOAuthEnv,
  type GithubIntegrationErrorReason,
} from "@/lib/server/github-repository-connection";

export const runtime = "nodejs";

// Only the state/verifier/projectId/organizationId/profileId cookies —
// the bridge cookie has its own path/lifetime and is already
// read-and-cleared by consumeBridgeSessionToken() before this ever runs.
const OAUTH_FLOW_COOKIE_NAMES = [
  OAUTH_COOKIE_NAMES.state,
  OAUTH_COOKIE_NAMES.verifier,
  OAUTH_COOKIE_NAMES.projectId,
  OAUTH_COOKIE_NAMES.organizationId,
  OAUTH_COOKIE_NAMES.profileId,
];

function clearOauthCookies(res: NextResponse): void {
  const expired = expiredOauthCookieOptions();
  for (const name of OAUTH_FLOW_COOKIE_NAMES) {
    res.cookies.set(name, "", expired);
  }
}

function redirectWithReason(
  request: NextRequest,
  path: string,
  reason: GithubIntegrationErrorReason
): NextResponse {
  const res = NextResponse.redirect(new URL(`${path}?integration=error&reason=${reason}`, request.url));
  clearOauthCookies(res);
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const projectId = request.nextUrl.searchParams.get("projectId");
  // Always consumed (read + cleared) exactly once here, regardless of
  // outcome below — never re-read, never logged.
  const bridgeToken = await consumeBridgeSessionToken();

  // Never trusted for anything beyond "where to send an error back to" —
  // real authorization/ownership is always re-derived from the real
  // project row below, never this raw input.
  const fallbackPath = "/projects";

  if (!projectId) return redirectWithReason(request, fallbackPath, "not_authorized");
  if (!bridgeToken) return redirectWithReason(request, fallbackPath, "session_expired");

  let env;
  try {
    env = requireGithubOAuthEnv();
  } catch {
    return redirectWithReason(request, fallbackPath, "not_configured");
  }

  const caller = getCallerClient(bridgeToken);
  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(bridgeToken);
  if (callerAuthError || !callerData.user) {
    return redirectWithReason(request, fallbackPath, "session_expired");
  }

  const admin = getAdminClient();
  const project = await loadRepositoryProjectRow(admin, projectId);
  if (!project) return redirectWithReason(request, fallbackPath, "not_found");

  const settingsPath = `/projects/${project.slug}/settings`;

  const authorized = await isOrgAdminOrLead(admin, project.organization_id, callerData.user.id);
  if (!authorized) return redirectWithReason(request, settingsPath, "not_authorized");

  if (
    project.repository_provider !== "github" ||
    !project.repository_url ||
    !GITHUB_REPO_URL_RE.test(project.repository_url)
  ) {
    return redirectWithReason(request, settingsPath, "provider_mismatch");
  }

  // Real, cryptographically random state + PKCE (S256) — never derived
  // from anything predictable.
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.clientId);
  authorizeUrl.searchParams.set("redirect_uri", env.callbackUrl);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("scope", "repo");
  authorizeUrl.searchParams.set("allow_signup", "false");

  const res = NextResponse.redirect(authorizeUrl);
  const cookieOptions = oauthCookieOptions();
  res.cookies.set(OAUTH_COOKIE_NAMES.state, state, cookieOptions);
  res.cookies.set(OAUTH_COOKIE_NAMES.verifier, codeVerifier, cookieOptions);
  res.cookies.set(OAUTH_COOKIE_NAMES.projectId, project.id, cookieOptions);
  res.cookies.set(OAUTH_COOKIE_NAMES.organizationId, project.organization_id, cookieOptions);
  res.cookies.set(OAUTH_COOKIE_NAMES.profileId, callerData.user.id, cookieOptions);
  // The bridge cookie was already consumed (read + cleared) by
  // consumeBridgeSessionToken() above — nothing left to do for it here.
  return res;
}
