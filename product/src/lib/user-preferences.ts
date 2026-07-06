// Editable Preferences from the Profile page that aren't already covered by
// next-themes (Theme) or the per-project session state (tickets-screen.tsx's
// own view/filter/scroll memory). Persisted directly to localStorage since
// there's no backend yet.

export type DefaultTicketView = "board" | "list";

const DEFAULT_TICKET_VIEW_KEY = "jirita:pref-default-ticket-view";

export function getDefaultTicketView(): DefaultTicketView {
  if (typeof window === "undefined") return "board";
  return window.localStorage.getItem(DEFAULT_TICKET_VIEW_KEY) === "list" ? "list" : "board";
}

export function setDefaultTicketView(view: DefaultTicketView): void {
  window.localStorage.setItem(DEFAULT_TICKET_VIEW_KEY, view);
}
