// GET /api/integrations/github/callback — GitHub redirects here after the
// user approves (or cancels) the authorization on github.com. Never reached
// any other way; nothing in this app links to it directly.

import { NextResponse, type NextRequest } from "next/server";
import { encryptGitHubToken } from "@/lib/server/github-token-crypto";
import {
  GITHUB_REPO_URL_RE,
  OAUTH_COOKIE_NAMES,
  expiredOauthCookieOptions,
  getAdminClient,
  githubApiHeaders,
  isOrgAdminOrLead,
  loadRepositoryProjectRow,
  mapGithubApiStatus,
  parseGithubOwnerRepo,
  requireGithubOAuthEnv,
  type GithubIntegrationErrorReason,
} from "@/lib/server/github-repository-connection";

export const runtime = "nodejs";

// Only the state/verifier/projectId/organizationId/profileId cookies — the
// bridge cookie has its own separate path/lifetime and is never set or
// read by this route at all (it's only ever consumed by /connect, before
// GitHub even redirects here).
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

function redirectConnected(request: NextRequest, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(`${path}?integration=connected`, request.url));
  clearOauthCookies(res);
  return res;
}

interface GithubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
}

interface GithubUserResponse {
  id?: number;
  login?: string;
}

interface GithubRepoResponse {
  id?: number;
  full_name?: string;
  html_url?: string;
  default_branch?: string;
  private?: boolean;
  permissions?: { pull?: boolean };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const githubError = searchParams.get("error"); // e.g. "access_denied" — user cancelled on GitHub's own screen

  const cookieState = request.cookies.get(OAUTH_COOKIE_NAMES.state)?.value;
  const verifier = request.cookies.get(OAUTH_COOKIE_NAMES.verifier)?.value;
  const projectId = request.cookies.get(OAUTH_COOKIE_NAMES.projectId)?.value;
  const organizationId = request.cookies.get(OAUTH_COOKIE_NAMES.organizationId)?.value;
  const profileId = request.cookies.get(OAUTH_COOKIE_NAMES.profileId)?.value;

  // Only an internal path is ever redirected to — computed fresh from the
  // real project row below, never accepted as input from the client/GitHub.
  const fallbackPath = "/projects";

  if (!projectId || !organizationId || !profileId || !cookieState || !verifier) {
    return redirectWithReason(request, fallbackPath, "session_expired");
  }

  const admin = getAdminClient();
  const project = await loadRepositoryProjectRow(admin, projectId);
  const returnPath = project ? `/projects/${project.slug}/settings` : fallbackPath;

  if (!project || project.organization_id !== organizationId) {
    return redirectWithReason(request, returnPath, "not_found");
  }

  if (githubError) {
    return redirectWithReason(request, returnPath, githubError === "access_denied" ? "cancelled" : "github_error");
  }

  if (!code || !stateParam || stateParam !== cookieState) {
    // Abort outright — never exchange the code without an exact state match.
    return redirectWithReason(request, returnPath, "state_mismatch");
  }

  // Re-verified fresh (never trusted from the connect-time cookie alone) —
  // permissions can change in the minutes between /connect and this callback.
  const authorized = await isOrgAdminOrLead(admin, organizationId, profileId);
  if (!authorized) return redirectWithReason(request, returnPath, "not_authorized");

  if (
    project.repository_provider !== "github" ||
    !project.repository_url ||
    !GITHUB_REPO_URL_RE.test(project.repository_url)
  ) {
    return redirectWithReason(request, returnPath, "provider_mismatch");
  }

  const parsedRepo = parseGithubOwnerRepo(project.repository_url);
  if (!parsedRepo) return redirectWithReason(request, returnPath, "provider_mismatch");

  let env;
  try {
    env = requireGithubOAuthEnv();
  } catch {
    return redirectWithReason(request, returnPath, "not_configured");
  }

  // ── Exchange code for a real access token — server-side only. ──────────
  let tokenJson: GithubTokenResponse;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
        redirect_uri: env.callbackUrl,
        code_verifier: verifier,
      }),
    });
    tokenJson = (await tokenRes.json()) as GithubTokenResponse;
  } catch {
    return redirectWithReason(request, returnPath, "network_error");
  }

  // Never logged, never included in any response — read once, used once.
  const accessToken = tokenJson.access_token;
  if (!accessToken || tokenJson.error) {
    return redirectWithReason(request, returnPath, "github_error");
  }
  const tokenType = tokenJson.token_type ?? null;
  const grantedScopes = typeof tokenJson.scope === "string" && tokenJson.scope.length > 0 ? tokenJson.scope.split(",") : [];

  // ── Verify the GitHub user ──────────────────────────────────────────────
  let githubUser: GithubUserResponse;
  try {
    const userRes = await fetch("https://api.github.com/user", { headers: githubApiHeaders(accessToken) });
    if (!userRes.ok) return redirectWithReason(request, returnPath, mapGithubApiStatus(userRes.status) as GithubIntegrationErrorReason);
    githubUser = (await userRes.json()) as GithubUserResponse;
  } catch {
    return redirectWithReason(request, returnPath, "network_error");
  }

  // ── Verify real, read access to the exact configured repository ────────
  let repoData: GithubRepoResponse;
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}`, {
      headers: githubApiHeaders(accessToken),
    });
    if (!repoRes.ok) return redirectWithReason(request, returnPath, mapGithubApiStatus(repoRes.status) as GithubIntegrationErrorReason);
    repoData = (await repoRes.json()) as GithubRepoResponse;
  } catch {
    return redirectWithReason(request, returnPath, "network_error");
  }

  const expectedFullName = `${parsedRepo.owner}/${parsedRepo.repo}`.toLowerCase();
  if (typeof repoData.full_name !== "string" || repoData.full_name.toLowerCase() !== expectedFullName) {
    return redirectWithReason(request, returnPath, "repo_mismatch");
  }
  if (repoData.permissions && repoData.permissions.pull !== true) {
    return redirectWithReason(request, returnPath, "insufficient_scope");
  }

  const encrypted = encryptGitHubToken(accessToken);
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await admin.from("project_repository_connections").upsert(
    {
      organization_id: organizationId,
      project_id: projectId,
      provider: "github",
      access_token_ciphertext: encrypted.ciphertext,
      access_token_iv: encrypted.iv,
      access_token_auth_tag: encrypted.authTag,
      token_type: tokenType,
      granted_scopes: grantedScopes,
      provider_user_id: githubUser.id ?? null,
      provider_username: githubUser.login ?? null,
      repository_id: repoData.id ?? null,
      repository_full_name: repoData.full_name ?? null,
      repository_html_url: repoData.html_url ?? null,
      repository_default_branch: repoData.default_branch ?? null,
      repository_is_private: typeof repoData.private === "boolean" ? repoData.private : null,
      connected_by_profile_id: profileId,
      connected_at: nowIso,
      last_verified_at: nowIso,
    },
    { onConflict: "project_id,provider" }
  );

  if (upsertError) {
    return redirectWithReason(request, returnPath, "github_error");
  }

  return redirectConnected(request, returnPath);
}
