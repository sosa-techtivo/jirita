// Shared absolute-date formatters for ticket-related timestamps — replaces
// relative text ("2 months ago") and incomplete dates ("Jun 1", no year)
// with full, traceable dates. Never reinterprets timezones: real timestamps
// are parsed as real instants (`new Date(iso)`); date-only values are parsed
// at local midnight (`${iso}T00:00:00`) so timezones behind UTC never show
// the previous day.

// For real timestamps (has both date and time, e.g. created_at/updated_at
// columns) — "MMM D, YYYY at h:mm A", e.g. "Jul 30, 2026 at 7:42 AM".
export function formatAbsoluteDateTime(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} at ${timePart}`;
}

// For calendar-only values (a `date` column like due_date, "YYYY-MM-DD" with
// no time component) — "MMM D, YYYY", e.g. "Jun 1, 2026".
export function formatAbsoluteDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
