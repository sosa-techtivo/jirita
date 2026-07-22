// Single, shared definition of "which days count as a working day" for an
// organization — reused by both Admin/Member and Project Lead Time
// Tracking's own expected-hours/Hours Missing calculations
// (time-tracking-screen.tsx's expectedHoursForPeriod and
// project-lead-time-tracking-screen.tsx, which imports it verbatim), so
// neither screen can define this differently. The only source of truth is
// organizations.active_days (ISO weekday numbers, 1 = Monday .. 7 = Sunday
// — see 20260815000000_add_organization_settings_defaults.sql), passed in
// by the caller — never a hardcoded Monday–Friday/weekend assumption here.
//
// Deliberately has no opinion on weekly capacity itself
// (organization_memberships.weekly_capacity stays the one real source for
// that, per lib/projects.ts's own "capacity belongs to the member"
// precedent) — this module only ever answers "how many of the days in this
// range/is this one day an active one," which the caller then divides/
// multiplies its own real weeklyCapacity by.

// Native Date.getDay() returns 0 = Sunday .. 6 = Saturday; ISO weekday
// numbers (1 = Monday .. 7 = Sunday) are what organizations.active_days
// actually stores/validates — this is the one place the two conventions
// are reconciled.
function toIsoWeekday(date: Date): number {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// `dateISO`/`fromISO`/`toISO` below are all plain `yyyy-mm-dd` (native
// `<input type="date">` format) — parsed into local-time Date objects
// (never `new Date(iso)` directly, which UTC-parses a bare date and can
// shift a day near a timezone boundary) so a day's own real weekday is
// never off by one.
function parseISODate(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isActiveDay(dateISO: string, activeDays: number[]): boolean {
  return activeDays.includes(toIsoWeekday(parseISODate(dateISO)));
}

// Counts real calendar days within [fromISO, toISO] (inclusive) whose ISO
// weekday is one of the organization's own configured active days — never
// assumes Saturday/Sunday are inactive, never assumes Monday–Friday are
// active.
export function countActiveDaysInRange(fromISO: string, toISO: string, activeDays: number[]): number {
  const end = parseISODate(toISO);
  let cur = parseISODate(fromISO);
  let count = 0;
  while (cur <= end) {
    if (activeDays.includes(toIsoWeekday(cur))) count++;
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return count;
}
