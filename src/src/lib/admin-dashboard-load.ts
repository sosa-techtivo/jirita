// Admin Dashboard data load (JIR-101). The Dashboard needs a single load
// (loadAdminDashboardTickets); this wraps it so the result always settles as
// "ready" or "error" — never an endless loading state:
//
// - an unexpected rejection becomes { status: "error" } (the Dashboard's
//   existing error UI + Retry) instead of an unhandled rejection that used
//   to leave the skeleton up forever;
// - the load is bounded by ADMIN_DASHBOARD_LOAD_TIMEOUT_MS — past that, its
//   in-flight requests are aborted (the loader forwards the signal to
//   Supabase/PostgREST) and the result is a timeout error;
// - an external `signal` (the component's own unmount/re-run cleanup)
//   aborts the in-flight requests the same way.
import { loadAdminDashboardTickets, type AdminDashboardTicketsResult } from "./tickets";

/** Generous bound for the Admin Dashboard load — well past a slow but
 *  healthy load, short enough that a stuck request surfaces Retry. */
export const ADMIN_DASHBOARD_LOAD_TIMEOUT_MS = 30_000;

export const ADMIN_DASHBOARD_TIMEOUT_MESSAGE = "The dashboard took too long to load. Please try again.";
const UNEXPECTED_ERROR_MESSAGE = "Something went wrong while loading the dashboard.";

export type AdminDashboardTicketsLoader = (organizationId: string, signal: AbortSignal) => Promise<AdminDashboardTicketsResult>;

export interface AdminDashboardLoadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Injected in tests; the Dashboard uses the default. */
  loadTickets?: AdminDashboardTicketsLoader;
}

/** Never rejects and never stays pending past the timeout. */
export async function runAdminDashboardLoad(
  organizationId: string,
  options: AdminDashboardLoadOptions = {}
): Promise<AdminDashboardTicketsResult> {
  const loadTickets = options.loadTickets ?? loadAdminDashboardTickets;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AdminDashboardTicketsResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "error", message: ADMIN_DASHBOARD_TIMEOUT_MESSAGE }),
      options.timeoutMs ?? ADMIN_DASHBOARD_LOAD_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([loadTickets(organizationId, controller.signal), timeout]);
  } catch (err) {
    return { status: "error", message: err instanceof Error && err.message ? err.message : UNEXPECTED_ERROR_MESSAGE };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
    // Settled one way or another — cancel anything still in flight (a
    // timed-out or failed load's remaining requests). No-op after success.
    controller.abort();
  }
}
