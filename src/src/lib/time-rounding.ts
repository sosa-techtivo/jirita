// Pure, shared time-rounding helper — JIRITA's fixed product rule (never
// configurable, never read from organizations.time_rounding_minutes/
// round_time_up — those columns are deprecated, see lib/membership.ts's own
// note): every logged time entry rounds UP to the next 15-minute increment.
// Reused by every real time-entry write path (today: only logTicketTime,
// lib/tickets.ts — the one real write path Admin, Project Lead, and Member
// all share, see ticket-detail-screen.tsx's TimeTrackingSection) so no
// screen can ever apply a different rounding rule than another. No React/
// Supabase imports — pure math only.
//
// Deliberately unaware of Assigned Hours/ticket.hours/Workload/Weekly
// Capacity/Hours Missing — this only ever rounds a single logged-time
// duration, never anything derived from estimates or capacity.

export const TIME_ROUNDING_INCREMENT_MINUTES = 15;

// Rounds a raw, positive minute duration up to the next multiple of
// TIME_ROUNDING_INCREMENT_MINUTES. A positive input can never round up to
// 0 (ceil of any positive value is always >= 1 increment) — e.g. 1 min →
// 15 min, 15 min → 15 min, 16 min → 30 min, 61 min → 75 min.
//
// Callers are expected to reject a non-positive rawMinutes themselves
// before ever reaching this (the same "greater than 0" rule every real
// time-entry write path already enforces) — a non-positive/non-finite
// input here is normalized to 0 purely as a defensive fallback, never the
// primary validation.
export function roundLoggedMinutesUp(rawMinutes: number): number {
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) return 0;
  return Math.ceil(rawMinutes / TIME_ROUNDING_INCREMENT_MINUTES) * TIME_ROUNDING_INCREMENT_MINUTES;
}
