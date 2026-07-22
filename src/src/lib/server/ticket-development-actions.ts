"use server";

// Server Action backing Ticket Detail's "Development" section — real
// GitHub branches/commits/pull requests related to one ticket, matched
// solely by its own real ticket code (e.g. "JIR-8"), read-only. Reuses the
// existing GitHub OAuth infrastructure (lib/server/github-repository-
// connection.ts, github-token-crypto.ts) without modifying either file.
//
// Auth: the Supabase JWT is never a parameter here — same reasoning (and
// the exact same short-lived cookie mechanism) github-repository-
// connection-actions.ts already established: a Server Action's own
// arguments are visible in Next.js's dev-time Server Action logging, so
// the token is bridged via consumeBridgeSessionToken() instead. Ticket
// Detail's own client code sets that cookie right before calling this,
// mirroring project-settings-screen.tsx's bridgeGithubSession() exactly.
//
// Authorization: project/ticket access is re-verified using the CALLER's
// own Supabase client (anon key + their bearer token), so `projects_select`/
// `tickets_select`'s existing real RLS (can_view_project) decides what's
// visible — never a second, hand-written permission model, and never
// trusts projectId/ticketCode blindly (a ticket row only ever comes back
// for a ticket that genuinely exists in that exact project). Only once
// that's confirmed does anything escalate to the service-role client, and
// only to read project_repository_connections (which has no grant for
// `authenticated` at all) and decrypt its token.

import {
  consumeBridgeSessionToken,
  getAdminClient,
  getCallerClient,
  githubApiHeaders,
} from "./github-repository-connection";
import { decryptGitHubToken } from "./github-token-crypto";

function logDev(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") console.warn("[ticket-development]", ...args);
}

// ── Safe DTOs ────────────────────────────────────────────────────────────
// Never a GitHub access token, ciphertext/IV/auth tag, scopes, OAuth code,
// raw headers, or a full GitHub API response — only these hand-picked
// fields ever leave this file.

export interface DevelopmentBranch {
  name: string;
  htmlUrl: string;
}

export interface DevelopmentCommit {
  shaShort: string;
  message: string;
  authorName: string;
  authorAvatar: string | null;
  authoredAt: string;
  htmlUrl: string;
}

export type DevelopmentPullRequestState = "open" | "draft" | "merged" | "closed";

export interface DevelopmentPullRequest {
  number: number;
  title: string;
  state: DevelopmentPullRequestState;
  isDraft: boolean;
  merged: boolean;
  authorName: string;
  authorAvatar: string | null;
  updatedAt: string;
  htmlUrl: string;
  headBranch: string;
}

// The section either has real data to show, or it doesn't exist as far as
// the UI is concerned — "hidden" deliberately collapses every reason
// (no connection, needs-reconnect, GitHub error, no matches, no access)
// into one outcome, matching this feature's own rule that Development
// never renders an empty state or a technical error inside a ticket.
export type TicketDevelopmentResult =
  | { status: "ready"; branches: DevelopmentBranch[]; commits: DevelopmentCommit[]; pullRequests: DevelopmentPullRequest[] }
  | { status: "hidden" };

const MAX_BRANCHES = 5;
const MAX_COMMITS = 10;
const MAX_PULL_REQUESTS = 10;
const GITHUB_PAGE_SIZE = 100;

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  result: TicketDevelopmentResult;
}

// Server-process-local cache, keyed by projectId+ticketCode — 5 minutes,
// per this feature's own spec. Not a distributed cache (no new dependency
// added for one), acceptable at this app's scale, same convention as
// github-repository-connection-actions.ts's own in-flight verification map.
const developmentCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<TicketDevelopmentResult>>();

function cacheKey(projectId: string, ticketCode: string): string {
  return `${projectId}:${ticketCode.trim().toLowerCase()}`;
}

interface GithubBranchApiRow {
  name?: string;
}

interface GithubCommitApiRow {
  sha?: string;
  html_url?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  author?: { login?: string; avatar_url?: string } | null;
}

interface GithubPullRequestApiRow {
  number?: number;
  title?: string;
  body?: string | null;
  state?: string;
  draft?: boolean;
  merged_at?: string | null;
  updated_at?: string;
  html_url?: string;
  head?: { ref?: string };
  user?: { login?: string; avatar_url?: string } | null;
}

function pullRequestDisplayState(row: GithubPullRequestApiRow): DevelopmentPullRequestState {
  if (row.merged_at) return "merged";
  if (row.state === "open" && row.draft) return "draft";
  if (row.state === "open") return "open";
  return "closed";
}

export interface LoadTicketDevelopmentActivityParams {
  projectId: string;
  ticketCode: string;
  /** Set only by Development's manual "Refresh" action — skips this exact
   *  cache entry (never any other project/ticket's) and re-checks GitHub
   *  immediately. The cache key itself is always rebuilt server-side from
   *  projectId/ticketCode below; the client can never supply an arbitrary
   *  key. Every validation (session/organization/project+ticket access/
   *  GitHub connection) still runs in full on every forced check, exactly
   *  as it does on a normal one — this flag only ever affects the cache
   *  read/write below, nothing about authorization. */
  forceRefresh?: boolean;
}

export async function loadTicketDevelopmentActivityAction(
  params: LoadTicketDevelopmentActivityParams
): Promise<TicketDevelopmentResult> {
  const key = cacheKey(params.projectId, params.ticketCode);

  if (!params.forceRefresh) {
    const cached = developmentCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
  }

  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const promise = computeTicketDevelopmentActivity(params, key);
  inFlightRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(key);
  }
}

async function computeTicketDevelopmentActivity(
  params: LoadTicketDevelopmentActivityParams,
  key: string
): Promise<TicketDevelopmentResult> {
  const result = await resolveTicketDevelopmentActivity(params);

  // A forced manual refresh that comes back "hidden" (a transient GitHub
  // error, a momentary connection hiccup) never overwrites a previously
  // good "ready" snapshot still sitting in the cache for this exact key —
  // the whole point of Refresh is to get fresher data, never to make
  // already-correct data disappear because of one failed attempt. TTL
  // itself is untouched either way (the kept entry's original expiresAt is
  // left as-is, never extended). A normal (non-forced) check always writes
  // through exactly as before.
  if (params.forceRefresh && result.status === "hidden") {
    const previous = developmentCache.get(key);
    if (previous && previous.result.status === "ready") {
      return previous.result;
    }
  }

  // Only a real "ready" result (or a confirmed "hidden") is cached — an
  // in-flight request that later fails is simply not memoized here, since
  // resolveTicketDevelopmentActivity itself never throws (every branch
  // below returns a value), so this always has something real to cache.
  developmentCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}

async function resolveTicketDevelopmentActivity(
  params: LoadTicketDevelopmentActivityParams
): Promise<TicketDevelopmentResult> {
  const accessToken = await consumeBridgeSessionToken();
  if (!accessToken) return { status: "hidden" };

  const caller = getCallerClient(accessToken);
  const { data: callerData, error: callerAuthError } = await caller.auth.getUser(accessToken);
  if (callerAuthError || !callerData.user) return { status: "hidden" };

  // RLS-scoped read (projects_select → can_view_project) — a row only
  // comes back if this profile can really view this project; never a
  // second, hand-rolled permission check duplicating that policy.
  const { data: projectRow, error: projectError } = await caller
    .from("projects")
    .select("id, organization_id, project_code, repository_provider, repository_url")
    .eq("id", params.projectId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      project_code: string;
      repository_provider: string | null;
      repository_url: string | null;
    }>();

  if (projectError || !projectRow) return { status: "hidden" };
  if (projectRow.repository_provider !== "github" || !projectRow.repository_url) {
    return { status: "hidden" };
  }

  // Never trusts ticketCode blindly — parses it the same
  // "<project_code>-<ticket_number>" way lib/tickets.ts's own
  // loadTicketByCode does, then confirms a real ticket row exists (RLS-
  // scoped the same way as the project lookup above).
  const prefix = `${projectRow.project_code}-`;
  if (!params.ticketCode.toUpperCase().startsWith(prefix.toUpperCase())) return { status: "hidden" };
  const ticketNumber = Number(params.ticketCode.slice(prefix.length));
  if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) return { status: "hidden" };

  const { data: ticketRow, error: ticketError } = await caller
    .from("tickets")
    .select("id")
    .eq("project_id", projectRow.id)
    .eq("ticket_number", ticketNumber)
    .maybeSingle<{ id: string }>();

  if (ticketError || !ticketRow) return { status: "hidden" };

  // From here on, service-role only — project_repository_connections has
  // no grant for `authenticated` at all (see
  // 20260821000000_add_project_repository_connections.sql), so this is
  // the only way to read it, same as every real read/write in
  // github-repository-connection-actions.ts.
  const admin = getAdminClient();
  const { data: connectionRow, error: connectionError } = await admin
    .from("project_repository_connections")
    .select("organization_id, access_token_ciphertext, access_token_iv, access_token_auth_tag, repository_full_name, repository_default_branch, last_verified_at")
    .eq("project_id", projectRow.id)
    .eq("provider", "github")
    .maybeSingle<{
      organization_id: string;
      access_token_ciphertext: string;
      access_token_iv: string;
      access_token_auth_tag: string;
      repository_full_name: string | null;
      repository_default_branch: string | null;
      last_verified_at: string | null;
    }>();

  if (connectionError || !connectionRow || !connectionRow.repository_full_name) {
    return { status: "hidden" };
  }
  // Defense in depth — should be structurally impossible (both derived
  // from the same real project row), never trusted blindly.
  if (connectionRow.organization_id !== projectRow.organization_id) {
    return { status: "hidden" };
  }

  let token: string;
  try {
    token = decryptGitHubToken({
      ciphertext: connectionRow.access_token_ciphertext,
      iv: connectionRow.access_token_iv,
      authTag: connectionRow.access_token_auth_tag,
    });
  } catch (err) {
    logDev("token decrypt failed", err instanceof Error ? err.message : "unknown error");
    return { status: "hidden" };
  }

  const fullName = connectionRow.repository_full_name;
  const defaultBranch = connectionRow.repository_default_branch;
  const headers = githubApiHeaders(token);

  let branchesRes: Response, pullsRes: Response;
  try {
    [branchesRes, pullsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${fullName}/branches?per_page=${GITHUB_PAGE_SIZE}`, { headers }),
      fetch(`https://api.github.com/repos/${fullName}/pulls?state=all&per_page=${GITHUB_PAGE_SIZE}`, { headers }),
    ]);
  } catch (err) {
    logDev("github request failed", err instanceof Error ? err.message : "network error");
    return { status: "hidden" };
  }

  // 401/403/404 (invalid authorization, restricted access, repo gone) all
  // just hide the section — never a technical error inside the ticket,
  // never a broken page. Status codes only, never the response body.
  // Commits have their own, per-branch fault tolerance below (a single
  // deleted/unreadable branch never hides the whole section).
  if (!branchesRes.ok || !pullsRes.ok) {
    logDev("github api error", { branches: branchesRes.status, pulls: pullsRes.status });
    return { status: "hidden" };
  }

  let branchRows: GithubBranchApiRow[];
  let pullRows: GithubPullRequestApiRow[];
  try {
    [branchRows, pullRows] = (await Promise.all([branchesRes.json(), pullsRes.json()])) as [
      GithubBranchApiRow[],
      GithubPullRequestApiRow[],
    ];
  } catch (err) {
    logDev("github response parse failed", err instanceof Error ? err.message : "parse error");
    return { status: "hidden" };
  }

  // The ticket code is the *only* matching key — never the ticket's title,
  // an author's name, or any other ambiguous text.
  const codeLower = params.ticketCode.trim().toLowerCase();

  const branches: DevelopmentBranch[] = (Array.isArray(branchRows) ? branchRows : [])
    .filter((row): row is Required<GithubBranchApiRow> => typeof row.name === "string" && row.name.toLowerCase().includes(codeLower))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_BRANCHES)
    .map((row) => ({
      name: row.name,
      htmlUrl: `https://github.com/${fullName}/tree/${encodeURIComponent(row.name)}`,
    }));

  // Commits related to the ticket can still exist only on an unmerged
  // feature branch — GitHub's default (no `sha`) /commits endpoint only
  // ever returns the default branch's own history, which is exactly why a
  // real commit on e.g. "test/JIR-8-github-integration" was never found
  // before this fix. Query each already-related branch (the same, already
  // capped-at-MAX_BRANCHES list used for display above — never a second,
  // larger set) plus the repository's own real default branch, deduped by
  // name so a coincidental match never fires the same request twice.
  // Never "main"/"master" assumed — repository_default_branch is the real
  // value captured when the connection itself was verified.
  const commitRefs = Array.from(new Set([...branches.map((b) => b.name), ...(defaultBranch ? [defaultBranch] : [])]));

  const commitResponses = await Promise.allSettled(
    commitRefs.map((ref) =>
      fetch(`https://api.github.com/repos/${fullName}/commits?sha=${encodeURIComponent(ref)}&per_page=${GITHUB_PAGE_SIZE}`, {
        headers,
      })
    )
  );

  // Deduped by full SHA — the same real commit can legitimately show up on
  // both its feature branch and (once merged) the default branch, and must
  // only ever be displayed once.
  const commitRowsBySha = new Map<string, GithubCommitApiRow>();

  for (const settled of commitResponses) {
    if (settled.status !== "fulfilled") {
      // Network failure for this one ref only — e.g. the branch was
      // deleted between the branches listing and this query. Ignore only
      // this ref and keep whatever the other refs already found; never a
      // reason to hide results that were genuinely obtained.
      logDev("commit request failed for one branch", settled.reason instanceof Error ? settled.reason.message : "network error");
      continue;
    }
    const res = settled.value;
    if (!res.ok) {
      // 401/403 (auth/permissions) or 404 (branch gone) — status code
      // only, never the response body, and never surfaced to the user.
      logDev("commit fetch returned non-ok status for one branch", res.status);
      continue;
    }
    let rows: GithubCommitApiRow[];
    try {
      rows = (await res.json()) as GithubCommitApiRow[];
    } catch (err) {
      logDev("commit response parse failed for one branch", err instanceof Error ? err.message : "parse error");
      continue;
    }
    for (const row of Array.isArray(rows) ? rows : []) {
      if (typeof row.commit?.message !== "string" || !row.commit.message.toLowerCase().includes(codeLower)) continue;
      if (!row.sha || commitRowsBySha.has(row.sha)) continue;
      commitRowsBySha.set(row.sha, row);
    }
  }

  const commits: DevelopmentCommit[] = Array.from(commitRowsBySha.values())
    .sort((a, b) => new Date(b.commit?.author?.date ?? 0).getTime() - new Date(a.commit?.author?.date ?? 0).getTime())
    .slice(0, MAX_COMMITS)
    .map((row) => ({
      shaShort: (row.sha ?? "").slice(0, 7),
      message: row.commit?.message ?? "",
      authorName: row.author?.login ?? row.commit?.author?.name ?? "Unknown",
      authorAvatar: row.author?.avatar_url ?? null,
      authoredAt: row.commit?.author?.date ?? new Date(0).toISOString(),
      htmlUrl: row.html_url ?? `https://github.com/${fullName}/commit/${row.sha ?? ""}`,
    }));

  const pullRequests: DevelopmentPullRequest[] = (Array.isArray(pullRows) ? pullRows : [])
    .filter((row) => {
      const title = row.title ?? "";
      const body = row.body ?? "";
      const headRef = row.head?.ref ?? "";
      return (
        title.toLowerCase().includes(codeLower) ||
        body.toLowerCase().includes(codeLower) ||
        headRef.toLowerCase().includes(codeLower)
      );
    })
    .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
    .slice(0, MAX_PULL_REQUESTS)
    .map((row) => ({
      number: row.number ?? 0,
      title: row.title ?? "",
      state: pullRequestDisplayState(row),
      isDraft: Boolean(row.draft),
      merged: Boolean(row.merged_at),
      authorName: row.user?.login ?? "Unknown",
      authorAvatar: row.user?.avatar_url ?? null,
      updatedAt: row.updated_at ?? new Date(0).toISOString(),
      htmlUrl: row.html_url ?? `https://github.com/${fullName}/pull/${row.number ?? ""}`,
      headBranch: row.head?.ref ?? "",
    }));

  if (branches.length === 0 && commits.length === 0 && pullRequests.length === 0) {
    return { status: "hidden" };
  }

  return { status: "ready", branches, commits, pullRequests };
}
