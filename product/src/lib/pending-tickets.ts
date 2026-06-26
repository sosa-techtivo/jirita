import type { Ticket } from "./mock-tickets";
import { tickets } from "./mock-tickets";

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

// ── Issue key counter ─────────────────────────────────────────────────────────

let _counter: number | null = null;

function getCounter(): number {
  if (_counter === null) {
    _counter = Math.max(
      0,
      ...tickets.map((t) => {
        const n = parseInt(t.issueKey.split("-")[1] ?? "0", 10);
        return isNaN(n) ? 0 : n;
      })
    );
  }
  return _counter;
}

export function nextIssueKey(): string {
  _counter = getCounter() + 1;
  return `MBA-${_counter}`;
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
