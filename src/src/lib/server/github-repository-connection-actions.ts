"use server";

// Server Actions backing Project Settings' Repository Integration GitHub
// status — the only place a UI ever learns whether a project's GitHub
// connection is real/verified. Never returns access_token_ciphertext/_iv/
// _auth_tag or a decrypted token; loadGitHubConnectionStatusAction's own
// return type structurally can't carry them (see GitHubConnectionStatus).
//
// The caller's Supabase session is deliberately NOT a parameter of either
// action below — a Server Action's own arguments are visible in Next.js's
// dev-time Server Action logging/network payloads, so passing the JWT that
// way would expose it. Both actions instead call consumeBridgeSessionToken()
// (lib/server/github-repository-connection.ts), which reads it from the
// same short-lived cookie project-settings-screen.tsx's "Connect GitHub"
// button already bridges before navigating to /connect — reused here
// rather than a second authentication strategy — and clears it immediately.
// Everything else (caller-client-for-identity / admin-client-for-the-
// privileged-read-or-write) matches every other Server Action in this app.

import {
  consumeBridgeSessionToken,
  getAdminClient,
  getCallerClient,
  githubApiHeaders,
  isOrgAdminOrLead,
} from "./github-repository-connection";
import { decryptGitHubToken } from "./github-token-crypto";

// A verified connection is trusted for this long before re-checking GitHub
// again — never re-verified on every render/focus-regain, only when this
// window has actually elapsed. Matches the "15 minutos" requirement.
const VERIFICATION_TTL_MS = 15 * 60 * 1000;

export type GitHubConnectionStatus =
  | { state: "not-connected" }
  | { state: "connected"; username: string; repositoryFullName: string; repositoryHtmlUrl: string | null }
  | { state: "needs-reconnect" }
  | { state: "error"; message: string };

interface ConnectionRow {
  id: string;
  organization_id: string;
  access_token_ciphertext: string;
  access_token_iv: string;
  access_token_auth_tag: string;
  provider_username: string | null;
  repository_full_name: string | null;
  repository_html_url: string | null;
  last_verified_at: string | null;
}

const CONNECTION_COLUMNS =
  "id, organization_id, access_token_ciphertext, access_token_iv, access_token_auth_tag, provider_username, repository_full_name, repository_html_url, last_verified_at";

// De-dupes concurrent re-verification of the *same* connection within this
// server process — a focus-regain refresh and an initial load landing at
// the same moment share one real GitHub request instead of firing two.
// Process-local only (no new dependency added for a distributed lock),
// acceptable for this app's scale.
const inFlightVerifications = new Map<string, Promise<GitHubConnectionStatus>>();

async function verifyConnectionAgainstGithub(admin: ReturnType<typeof getAdminClient>, row: ConnectionRow): Promise<GitHubConnectionStatus> {
  const existing = inFlightVerifications.get(row.id);
  if (existing) return existing;

  const promise = (async (): Promise<GitHubConnectionStatus> => {
    try {
      const token = decryptGitHubToken({
        ciphertext: row.access_token_ciphertext,
        iv: row.access_token_iv,
        authTag: row.access_token_auth_tag,
      });

      if (!row.repository_full_name) {
        return { state: "needs-reconnect" };
      }

      const repoRes = await fetch(`https://api.github.com/repos/${row.repository_full_name}`, {
        headers: githubApiHeaders(token),
      });

      if (!repoRes.ok) {
        // Token failed — the configured repository_url/provider are never
        // touched here, only this connection's own verification timestamp.
        return { state: "needs-reconnect" };
      }

      const repoData = (await repoRes.json()) as { permissions?: { pull?: boolean } };
      if (repoData.permissions && repoData.permissions.pull !== true) {
        return { state: "needs-reconnect" };
      }

      await admin
        .from("project_repository_connections")
        .update({ last_verified_at: new Date().toISOString() })
        .eq("id", row.id);

      return {
        state: "connected",
        username: row.provider_username ?? "unknown",
        repositoryFullName: row.repository_full_name,
        repositoryHtmlUrl: row.repository_html_url,
      };
    } catch {
      // Network error, decrypt failure, etc. — always resolves to
      // needs-reconnect rather than throwing; the caller never sees a raw
      // error, and repository_provider/repository_url are left untouched.
      return { state: "needs-reconnect" };
    }
  })();

  inFlightVerifications.set(row.id, promise);
  try {
    return await promise;
  } finally {
    inFlightVerifications.delete(row.id);
  }
}

export interface LoadGitHubConnectionStatusParams {
  projectId: string;
}

export async function loadGitHubConnectionStatusAction(
  params: LoadGitHubConnectionStatusParams
): Promise<GitHubConnectionStatus> {
  const accessToken = await consumeBridgeSessionToken();
  if (!accessToken) {
    return { state: "error", message: "Your session has expired. Please sign in again." };
  }

  const caller = getCallerClient(accessToken);
  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(accessToken);
  if (callerAuthError || !callerData.user) {
    return { state: "error", message: "Your session has expired. Please sign in again." };
  }

  const admin = getAdminClient();

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, organization_id")
    .eq("id", params.projectId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (projectError || !project) {
    return { state: "error", message: "Project not found." };
  }

  const authorized = await isOrgAdminOrLead(admin, project.organization_id, callerData.user.id);
  if (!authorized) {
    return { state: "error", message: "You don't have permission to view this integration." };
  }

  const { data: row, error: rowError } = await admin
    .from("project_repository_connections")
    .select(CONNECTION_COLUMNS)
    .eq("project_id", params.projectId)
    .eq("provider", "github")
    .maybeSingle<ConnectionRow>();

  if (rowError) {
    return { state: "error", message: "Could not load the GitHub connection." };
  }
  if (!row) {
    return { state: "not-connected" };
  }
  if (row.organization_id !== project.organization_id) {
    // Defense in depth — should be structurally impossible (both columns
    // come from the same real project row), never trusted blindly.
    return { state: "error", message: "Could not load the GitHub connection." };
  }

  if (row.last_verified_at) {
    const age = Date.now() - new Date(row.last_verified_at).getTime();
    if (age >= 0 && age < VERIFICATION_TTL_MS) {
      return {
        state: "connected",
        username: row.provider_username ?? "unknown",
        repositoryFullName: row.repository_full_name ?? "",
        repositoryHtmlUrl: row.repository_html_url,
      };
    }
  }

  return verifyConnectionAgainstGithub(admin, row);
}

export interface DisconnectGitHubProjectConnectionParams {
  projectId: string;
}

export type DisconnectGitHubProjectConnectionResult = { status: "success" } | { status: "error"; message: string };

// Removes only the local connection row — repository_provider/
// repository_url are never touched, and GitHub's own OAuth App
// authorization is never revoked (the user can revoke it themselves from
// github.com/settings/applications if they want to).
export async function disconnectGitHubProjectConnectionAction(
  params: DisconnectGitHubProjectConnectionParams
): Promise<DisconnectGitHubProjectConnectionResult> {
  const accessToken = await consumeBridgeSessionToken();
  if (!accessToken) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  const caller = getCallerClient(accessToken);
  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(accessToken);
  if (callerAuthError || !callerData.user) {
    return { status: "error", message: "Your session has expired. Please sign in again." };
  }

  const admin = getAdminClient();

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, organization_id")
    .eq("id", params.projectId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (projectError || !project) {
    return { status: "error", message: "Project not found." };
  }

  const authorized = await isOrgAdminOrLead(admin, project.organization_id, callerData.user.id);
  if (!authorized) {
    return { status: "error", message: "Only an organization Admin or Project Lead can disconnect GitHub." };
  }

  const { error: deleteError } = await admin
    .from("project_repository_connections")
    .delete()
    .eq("project_id", params.projectId)
    .eq("organization_id", project.organization_id)
    .eq("provider", "github");

  if (deleteError) {
    return { status: "error", message: deleteError.message };
  }

  return { status: "success" };
}
