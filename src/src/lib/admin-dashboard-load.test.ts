import { describe, expect, it } from "vitest";
import { ADMIN_DASHBOARD_TIMEOUT_MESSAGE, runAdminDashboardLoad, type AdminDashboardTicketsLoader } from "./admin-dashboard-load";
import type { AdminDashboardTicketsResult } from "./tickets";

const READY: AdminDashboardTicketsResult = {
  status: "ready",
  tickets: [
    {
      id: "t1", projectSlug: "alpha", ticketNumber: 1, title: "T1", type: "TASK", status: "blocked",
      statusGroupType: "open", dueDate: undefined, assigneeProfileId: null, dueDateISO: null,
    },
  ],
  projects: [{ slug: "alpha", name: "Alpha", status: "active" }],
};

const okLoader: AdminDashboardTicketsLoader = async () => READY;
const never = <T,>() => new Promise<T>(() => {});

describe("runAdminDashboardLoad", () => {
  it("resolves ready with the KPI ticket data", async () => {
    expect(await runAdminDashboardLoad("org", { loadTickets: okLoader })).toEqual(READY);
  });

  it("keeps the loader's own { status: 'error' } result", async () => {
    const result = await runAdminDashboardLoad("org", {
      loadTickets: async () => ({ status: "error", message: "tickets failed" }),
    });
    expect(result).toEqual({ status: "error", message: "tickets failed" });
  });

  it("turns an unexpected rejection into an error instead of hanging", async () => {
    const result = await runAdminDashboardLoad("org", { loadTickets: () => Promise.reject(new Error("blew up")) });
    expect(result).toEqual({ status: "error", message: "blew up" });
  });

  it("times out a never-settling load, aborts its requests, and Retry (a fresh load) still works", async () => {
    let seenSignal: AbortSignal | undefined;
    const result = await runAdminDashboardLoad("org", {
      timeoutMs: 20,
      loadTickets: (_org, signal) => {
        seenSignal = signal;
        return never();
      },
    });
    expect(result).toEqual({ status: "error", message: ADMIN_DASHBOARD_TIMEOUT_MESSAGE });
    expect(seenSignal?.aborted).toBe(true);

    expect(await runAdminDashboardLoad("org", { timeoutMs: 20, loadTickets: okLoader })).toEqual(READY);
  });

  it("aborts in-flight requests when the caller's signal aborts (unmount / superseded load)", async () => {
    let seenSignal: AbortSignal | undefined;
    const caller = new AbortController();
    const pending = runAdminDashboardLoad("org", {
      signal: caller.signal,
      timeoutMs: 50,
      loadTickets: (_org, signal) => {
        seenSignal = signal;
        return never();
      },
    });
    expect(seenSignal?.aborted).toBe(false);
    caller.abort();
    expect(seenSignal?.aborted).toBe(true);
    expect((await pending).status).toBe("error");
  });
});
