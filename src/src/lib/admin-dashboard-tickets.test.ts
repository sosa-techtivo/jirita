import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Supabase client: records every query (table, selected columns,
// filters, range, abort signal) and answers from `respond`.
interface RecordedQuery {
  table: string;
  columns?: string;
  eq: [string, unknown][];
  inFilter: [string, unknown[]][];
  range?: [number, number];
  signal?: AbortSignal;
}

const queries: RecordedQuery[] = [];
let respond: (q: RecordedQuery) => { data: unknown[] | null; error: { message: string } | null };

function builder(table: string) {
  const q: RecordedQuery = { table, eq: [], inFilter: [] };
  queries.push(q);
  const chain = {
    select(columns: string) { q.columns = columns; return chain; },
    eq(column: string, value: unknown) { q.eq.push([column, value]); return chain; },
    in(column: string, values: unknown[]) { q.inFilter.push([column, values]); return chain; },
    order() { return chain; },
    range(from: number, to: number) { q.range = [from, to]; return chain; },
    abortSignal(signal: AbortSignal) { q.signal = signal; return chain; },
    returns() { return chain; },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(respond(q)).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock("./supabase-client", () => ({ getSupabaseBrowserClient: () => ({ from: builder }) }));

const { loadAdminDashboardTickets, isTicketClosed } = await import("./tickets");
const { getTicketDisplayKey } = await import("./mock-tickets");
const { runAdminDashboardLoad } = await import("./admin-dashboard-load");

const PROJECTS = [
  { id: "p-alpha", slug: "alpha", name: "Alpha", status: "active", project_code: "ALP" },
  { id: "p-beta", slug: "beta", name: "Beta", status: "archived", project_code: "BET" },
  { id: "p-gamma", slug: "gamma", name: "Gamma", status: "on_hold", project_code: "GAM" },
];

function ticketRow(id: string, projectId: string, n: number, extra: Record<string, unknown> = {}) {
  return {
    id, project_id: projectId, ticket_number: n, title: `T${n}`, status: "in_progress", status_id: "s-open",
    type: "task", assignee_profile_id: null, due_date: null, ...extra,
  };
}

// Deliberately out of project order — the loader restores project order
// (projects query order), then ticket_number.
const TICKETS = [
  ticketRow("b2", "p-beta", 2, { status: "blocked", status_id: "s-unknown", type: "bug" }),
  ticketRow("a2", "p-alpha", 2, { status: "review", status_id: "s-closed" }), // closed via its project's status group
  ticketRow("b1", "p-beta", 1, { status: "done", status_id: "s-unknown" }), // no status row → legacy "done" fallback
  ticketRow("a1", "p-alpha", 1, { due_date: "2026-09-30", assignee_profile_id: "u1" }),
];

const STATUSES = [
  { id: "s-open", group_type: "open" },
  { id: "s-closed", group_type: "closed" },
];

function defaultRespond(q: RecordedQuery) {
  const data =
    q.table === "projects" ? PROJECTS :
    q.table === "tickets" ? TICKETS :
    q.table === "ticket_statuses" ? STATUSES : [];
  return { data, error: null };
}

beforeEach(() => {
  queries.length = 0;
  respond = defaultRespond;
});

describe("loadAdminDashboardTickets", () => {
  it("uses organization-level queries — no per-project N+1 regardless of project count", async () => {
    const result = await loadAdminDashboardTickets("org-1");
    expect(result.status).toBe("ready");

    const byTable = (table: string) => queries.filter((q) => q.table === table);
    expect(byTable("projects")).toHaveLength(1);
    expect(byTable("projects")[0].eq).toEqual([["organization_id", "org-1"]]);
    expect(queries.some((q) => q.eq.some(([column]) => column === "slug"))).toBe(false); // old per-project lookup
    expect(byTable("tickets")).toHaveLength(1);
    expect(byTable("tickets")[0].inFilter).toEqual([["project_id", ["p-alpha", "p-beta", "p-gamma"]]]);
    expect(byTable("ticket_statuses")).toHaveLength(1);
  });

  it("requests only the small fields the KPIs, status interpretation and My Active Work rows need", async () => {
    await loadAdminDashboardTickets("org-1");
    const cols = (table: string) => queries.find((q) => q.table === table)!.columns!.split(",").map((c) => c.trim()).sort();
    expect(cols("tickets")).toEqual([
      "assignee_profile_id", "due_date", "id", "project_id", "status", "status_id", "ticket_number", "title", "type",
    ]);
    expect(cols("ticket_statuses")).toEqual(["group_type", "id"]);
    expect(cols("projects")).toEqual(["id", "name", "project_code", "slug", "status"]);
  });

  it("returns tickets with the same field semantics and order as full Tickets", async () => {
    const result = await loadAdminDashboardTickets("org-1");
    if (result.status !== "ready") throw new Error("expected ready");

    expect(result.projects).toEqual([
      { slug: "alpha", name: "Alpha", status: "active" },
      { slug: "beta", name: "Beta", status: "archived" },
      { slug: "gamma", name: "Gamma", status: "on-hold" },
    ]);
    expect(result.tickets.map((t) => t.id)).toEqual(["a1", "a2", "b1", "b2"]);
    const [a1, a2, b1, b2] = result.tickets;
    expect(a1).toMatchObject({
      projectSlug: "alpha", ticketNumber: 1, title: "T1", type: "TASK", status: "in-progress", statusGroupType: "open",
      assigneeProfileId: "u1", dueDateISO: "2026-09-30",
    });
    expect(a1.dueDate).toBeTruthy(); // same display string rowToTicket builds
    expect(a2).toMatchObject({ status: "review", statusGroupType: "closed" });
    expect(isTicketClosed(a2)).toBe(true);
    expect(b1.statusGroupType).toBeUndefined();
    expect(isTicketClosed(b1)).toBe(true); // legacy "done" fallback
    expect(b2).toMatchObject({ status: "blocked", type: "BUG" });
    expect(isTicketClosed(b2)).toBe(false);
    expect(getTicketDisplayKey(a2)).toBe("ALP-2");
    expect(getTicketDisplayKey(b2)).toBe("BET-2");
  });

  it("pages through tickets so an organization with more than 1,000 tickets is never truncated", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ticketRow(`x${i}`, "p-alpha", i + 1));
    const secondPage = [ticketRow("y1", "p-alpha", 1001)];
    respond = (q) => (q.table === "tickets" ? { data: q.range?.[0] === 0 ? firstPage : secondPage, error: null } : defaultRespond(q));

    const result = await loadAdminDashboardTickets("org-1");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.tickets).toHaveLength(1001);
    expect(queries.filter((q) => q.table === "tickets").map((q) => q.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("forwards the abort signal to every query", async () => {
    const controller = new AbortController();
    await loadAdminDashboardTickets("org-1", controller.signal);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q.signal).toBe(controller.signal);
  });

  it("fails the call on a tickets query error", async () => {
    respond = (q) => (q.table === "tickets" ? { data: null, error: { message: "boom" } } : defaultRespond(q));
    expect(await loadAdminDashboardTickets("org-1")).toEqual({ status: "error", message: "boom" });
  });
});

describe("Admin Dashboard load (default loader)", () => {
  it("only touches projects / tickets / ticket_statuses — never minutes, activity, or workload data", async () => {
    const result = await runAdminDashboardLoad("org-1");
    expect(result.status).toBe("ready");
    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(["projects", "tickets", "ticket_statuses"]));
  });
});
