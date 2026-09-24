// The Admin Dashboard's KPIs and My Active Work (JIR-101) — pure, so their
// definitions are unit-tested. Each is the definition the Admin Dashboard
// (or JIRITA elsewhere) already used:
// - Assigned Tickets: every open ticket in scope (isTicketClosed === false),
//   assigned or not — the Dashboard's original "Assigned Tickets" KPI.
//   Its "N active" sub-count: the subset in progress or in review.
// - Blocked: status === "blocked" (the Dashboard's existing Blocked KPI).
// - Due Today: due date is today, no status exclusion (the Dashboard's
//   existing Due Today KPI / tickets-screen's "due-today" alert).
// - Overdue: not closed, has a due date, and it's before today — the same
//   definition as Reports' Overdue KPI and tickets-screen's "overdue" alert.
// - My Active Work: open tickets assigned to the signed-in user, in the
//   loaded order (project order, then ticket number), as before.
// `todayISO` is getTodayISO() (the user's local calendar day); due dates are
// compared as the raw "YYYY-MM-DD" due_date — the same calendar day the
// display-string round trip (formatAbsoluteDate → parseDisplayDate) gives.
import { isTicketClosed, type AdminDashboardTicket } from "./tickets";

/** My Active Work shows at most this many tickets on the Dashboard ("View all" → My Work). */
export const MY_ACTIVE_WORK_LIMIT = 10;

type KpiTicket = Pick<AdminDashboardTicket, "status" | "statusGroupType" | "dueDateISO">;

export interface AdminDashboardKpis<T extends KpiTicket> {
  assigned: T[];
  /** Subset of `assigned` in progress or in review — the "N active" sub-count. */
  activeCount: number;
  blocked: T[];
  dueToday: T[];
  overdue: T[];
}

export function computeAdminDashboardKpis<T extends KpiTicket>(tickets: T[], todayISO: string): AdminDashboardKpis<T> {
  const assigned = tickets.filter((t) => !isTicketClosed(t));
  return {
    assigned,
    activeCount: assigned.filter((t) => t.status === "in-progress" || t.status === "review").length,
    blocked: tickets.filter((t) => t.status === "blocked"),
    dueToday: tickets.filter((t) => t.dueDateISO === todayISO),
    overdue: tickets.filter((t) => !isTicketClosed(t) && t.dueDateISO !== null && t.dueDateISO < todayISO),
  };
}

export interface MyActiveWork<T> {
  /** Every qualifying ticket — the section's count badge. */
  total: number;
  /** The first MY_ACTIVE_WORK_LIMIT, in loaded order — what the Dashboard renders. */
  visible: T[];
}

export function selectMyActiveWork<T extends Pick<AdminDashboardTicket, "status" | "statusGroupType" | "assigneeProfileId">>(
  tickets: T[],
  userId: string | null | undefined
): MyActiveWork<T> {
  const mine = userId ? tickets.filter((t) => t.assigneeProfileId === userId && !isTicketClosed(t)) : [];
  return { total: mine.length, visible: mine.slice(0, MY_ACTIVE_WORK_LIMIT) };
}
