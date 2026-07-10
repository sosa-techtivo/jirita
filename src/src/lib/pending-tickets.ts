import type { Ticket } from "./mock-tickets";
import { tickets, getTicketDisplayKey } from "./mock-tickets";

// ── Client-side registry ───────────────────────────────────────────────────────
// Newly created tickets live here until the server knows about them.
// The Map survives soft navigations (client-side route changes) but is cleared
// on a full page reload — acceptable for a mock app.

const registry = new Map<string, Ticket>();

export function registerTicket(ticket: Ticket): void {
  registry.set(ticket.id, ticket);
}

export function getRegisteredTicket(id: string): Ticket | undefined {
  return registry.get(id);
}

// Dev-fallback ticket detail routes navigate by the visible ticket code
// (e.g. "TKT-6"), not the internal id — this looks up a just-created,
// not-yet-in-the-static-array ticket the same way, by deriving its display
// key instead of matching on id.
export function getRegisteredTicketByCode(projectSlug: string, code: string): Ticket | undefined {
  for (const ticket of registry.values()) {
    if (ticket.projectSlug === projectSlug && getTicketDisplayKey(ticket) === code) return ticket;
  }
  return undefined;
}

// ── Ticket number counter ─────────────────────────────────────────────────────
// Scoped per project — each project's visible IDs (MBA-1, CSP-1, …) run their
// own sequence, driven by whatever Project Code is set in Project Settings →
// General (see getTicketDisplayKey in mock-tickets.ts). Never hardcode a prefix here.

const counters = new Map<string, number>();

function maxTicketNumberForProject(projectSlug: string): number {
  return Math.max(
    0,
    ...tickets.filter((t) => t.projectSlug === projectSlug).map((t) => t.ticketNumber)
  );
}

export function nextTicketNumber(projectSlug: string): number {
  const current = counters.get(projectSlug) ?? maxTicketNumberForProject(projectSlug);
  const next = current + 1;
  counters.set(projectSlug, next);
  return next;
}

// ── ID from title ─────────────────────────────────────────────────────────────

export function titleToTicketId(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-5);
  return slug ? `${slug}-${suffix}` : `ticket-${suffix}`;
}
