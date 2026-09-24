import { describe, expect, it } from "vitest";
import { MY_ACTIVE_WORK_LIMIT, computeAdminDashboardKpis, selectMyActiveWork } from "./admin-dashboard-kpis";
import type { AdminDashboardTicket } from "./tickets";

const TODAY = "2026-09-24";
const ME = "user-me";

function t(id: string, overrides: Partial<AdminDashboardTicket> = {}): AdminDashboardTicket {
  return {
    id, projectSlug: "alpha", ticketNumber: 1, title: id, type: "TASK", status: "to-do",
    statusGroupType: "open", dueDate: undefined, assigneeProfileId: null, dueDateISO: null, ...overrides,
  };
}

const closed = { status: "done" as const, statusGroupType: "closed" as const };

const tickets = [
  t("open-no-due"),
  t("in-progress", { status: "in-progress" }),
  t("review", { status: "review" }),
  t("blocked-overdue", { status: "blocked", dueDateISO: "2026-09-20" }),
  t("due-today", { dueDateISO: TODAY }),
  t("closed-due-today", { ...closed, dueDateISO: TODAY }),
  t("overdue", { dueDateISO: "2026-09-23" }),
  t("closed-overdue", { ...closed, dueDateISO: "2026-01-01" }),
  // A custom status in a closed group (not legacy "done") still counts as closed.
  t("closed-by-group", { status: "review", statusGroupType: "closed", dueDateISO: "2026-09-01" }),
  // No status row loaded → isTicketClosed falls back to status === "done".
  t("done-no-group", { status: "done", statusGroupType: undefined }),
  t("future", { dueDateISO: "2026-10-01" }),
];

const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("computeAdminDashboardKpis", () => {
  const kpis = computeAdminDashboardKpis(tickets, TODAY);

  it("Assigned Tickets = every open ticket in scope (the original Assigned Tickets KPI)", () => {
    expect(ids(kpis.assigned)).toEqual(["open-no-due", "in-progress", "review", "blocked-overdue", "due-today", "overdue", "future"]);
  });

  it("its 'N active' sub-count = assigned tickets in progress or in review", () => {
    expect(kpis.activeCount).toBe(2);
  });

  it("Blocked = status blocked", () => {
    expect(ids(kpis.blocked)).toEqual(["blocked-overdue"]);
  });

  it("Due Today = due today, with no status exclusion", () => {
    expect(ids(kpis.dueToday)).toEqual(["due-today", "closed-due-today"]);
  });

  it("Overdue = not closed, has a due date, and it is before today", () => {
    expect(ids(kpis.overdue)).toEqual(["blocked-overdue", "overdue"]);
  });

  it("returns zeros for an empty scope", () => {
    expect(computeAdminDashboardKpis([], TODAY)).toEqual({ assigned: [], activeCount: 0, blocked: [], dueToday: [], overdue: [] });
  });
});

describe("selectMyActiveWork", () => {
  it("keeps only open tickets assigned to the signed-in user, in loaded order", () => {
    const list = [
      t("mine-1", { assigneeProfileId: ME }),
      t("someone-else", { assigneeProfileId: "user-other" }),
      t("unassigned"),
      t("mine-closed", { ...closed, assigneeProfileId: ME }),
      t("mine-2", { assigneeProfileId: ME, status: "blocked" }),
    ];
    expect(selectMyActiveWork(list, ME)).toEqual({ total: 2, visible: [list[0], list[4]] });
  });

  it("returns nothing without a signed-in user id", () => {
    expect(selectMyActiveWork([t("x", { assigneeProfileId: ME })], null)).toEqual({ total: 0, visible: [] });
  });

  it("renders at most 10 while the count badge — and every KPI — still use the full dataset", () => {
    const mine = Array.from({ length: 25 }, (_, i) => t(`mine-${i}`, { assigneeProfileId: ME, status: "in-progress" }));
    const others = Array.from({ length: 30 }, (_, i) => t(`other-${i}`, { status: "blocked" }));
    const all = [...mine, ...others];

    const work = selectMyActiveWork(all, ME);
    expect(MY_ACTIVE_WORK_LIMIT).toBe(10);
    expect(work.visible).toHaveLength(10);
    expect(ids(work.visible)).toEqual(ids(mine.slice(0, 10)));
    expect(work.total).toBe(25);

    const kpis = computeAdminDashboardKpis(all, TODAY);
    expect(kpis.assigned).toHaveLength(55);
    expect(kpis.activeCount).toBe(25);
    expect(kpis.blocked).toHaveLength(30);
  });
});
