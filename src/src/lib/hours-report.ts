// Pure data-shaping for the Admin-only Hours Report (Reports → Hours
// Report). Takes the same real tickets/projects/members the rest of
// Reports already loads, plus a fresh OrganizationTimeEntry[] fetched for
// the report's own selected date range (see loadOrganizationLoggedTimeForRange
// in lib/tickets.ts — filtered by the entry's own real work_date, never
// ticket creation or time-entry created_at). No Supabase calls live here;
// the caller (reports-screen.tsx) owns the fetch, this module only turns
// the result into the Summary/Details shape the workbook needs.

import { getTicketDisplayKey } from "@/lib/mock-tickets";
import type { Ticket } from "@/lib/mock-tickets";
import type { OrganizationTimeEntry } from "@/lib/tickets";
import type { XlsxSheet } from "@/lib/xlsx-writer";

export interface HoursReportTicketRow {
  ticketKey: string;
  summary: string;
  hours: number;
}

export interface HoursReportProjectGroup {
  projectName: string;
  tickets: HoursReportTicketRow[];
  totalHours: number;
}

export interface HoursReportDetailRow {
  projectName: string;
  ticketKey: string;
  summary: string;
  memberName: string;
  workDate: string;
  description: string;
  hours: number;
}

export interface HoursReportData {
  projectGroups: HoursReportProjectGroup[];
  grandTotalHours: number;
  detailRows: HoursReportDetailRow[];
}

// Real per-ticket, per-project consolidation for the Summary sheet, and a
// flat per-entry list for the Details sheet — both built from the exact
// same `timeEntries` input, so the two sheets can never disagree with each
// other. A ticket/project only appears when it has at least one real entry
// in `timeEntries` (the caller has already scoped that array to the
// selected From/To range by work_date), so a project or ticket with zero
// hours in range is simply absent — never a zero-hours row.
export function buildHoursReportData(
  tickets: Ticket[],
  projects: { slug: string; name: string }[],
  members: { id: string; name: string }[],
  timeEntries: OrganizationTimeEntry[]
): HoursReportData {
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const projectBySlug = new Map(projects.map((p) => [p.slug, p]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const minutesByTicketId = new Map<string, number>();
  for (const entry of timeEntries) {
    minutesByTicketId.set(entry.ticketId, (minutesByTicketId.get(entry.ticketId) ?? 0) + entry.minutes);
  }

  const ticketIdsByProjectSlug = new Map<string, Set<string>>();
  for (const ticketId of minutesByTicketId.keys()) {
    const ticket = ticketById.get(ticketId);
    if (!ticket) continue;
    const set = ticketIdsByProjectSlug.get(ticket.projectSlug) ?? new Set<string>();
    set.add(ticketId);
    ticketIdsByProjectSlug.set(ticket.projectSlug, set);
  }

  const projectGroups: HoursReportProjectGroup[] = [];
  for (const [slug, ticketIds] of ticketIdsByProjectSlug) {
    const project = projectBySlug.get(slug);
    if (!project) continue; // no real project left to attribute these hours to

    const ticketRows = Array.from(ticketIds)
      .map((id) => {
        const ticket = ticketById.get(id)!;
        return {
          ticketNumber: ticket.ticketNumber,
          ticketKey: getTicketDisplayKey(ticket),
          summary: ticket.title,
          hours: (minutesByTicketId.get(id) ?? 0) / 60,
        };
      })
      .sort((a, b) => a.ticketNumber - b.ticketNumber)
      .map(({ ticketKey, summary, hours }) => ({ ticketKey, summary, hours }));

    const totalHours = ticketRows.reduce((sum, row) => sum + row.hours, 0);
    projectGroups.push({ projectName: project.name, tickets: ticketRows, totalHours });
  }
  projectGroups.sort((a, b) => a.projectName.localeCompare(b.projectName));

  const grandTotalHours = projectGroups.reduce((sum, group) => sum + group.totalHours, 0);

  const detailRows: (HoursReportDetailRow & { ticketNumber: number })[] = [];
  for (const entry of timeEntries) {
    const ticket = ticketById.get(entry.ticketId);
    if (!ticket) continue;
    const project = projectBySlug.get(ticket.projectSlug);
    if (!project) continue;
    const member = entry.loggedBy ? memberById.get(entry.loggedBy) : undefined;

    detailRows.push({
      projectName: project.name,
      ticketKey: getTicketDisplayKey(ticket),
      summary: ticket.title,
      memberName: member?.name ?? "Unknown Member",
      workDate: entry.workDate,
      description: entry.comment ?? "",
      hours: entry.minutes / 60,
      ticketNumber: ticket.ticketNumber,
    });
  }
  detailRows.sort((a, b) => {
    if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName);
    if (a.ticketNumber !== b.ticketNumber) return a.ticketNumber - b.ticketNumber;
    return a.workDate.localeCompare(b.workDate);
  });

  return {
    projectGroups,
    grandTotalHours,
    detailRows: detailRows.map((row) => ({
      projectName: row.projectName,
      ticketKey: row.ticketKey,
      summary: row.summary,
      memberName: row.memberName,
      workDate: row.workDate,
      description: row.description,
      hours: row.hours,
    })),
  };
}

// Turns HoursReportData into the two real worksheets the workbook needs.
// Summary groups tickets under their project with a bold "Project Total"
// row and ends with a bold overall "TOTAL HOURS" row; Details lists every
// individual entry. Both read from the exact same `data`, so they can never
// disagree with each other or with the on-screen totals.
export function buildHoursReportWorkbookSheets(data: HoursReportData, fromISO: string, toISO: string): XlsxSheet[] {
  const summaryRows: XlsxSheet["rows"] = [
    [{ value: "Jirita — Hours Report", bold: true }],
    [{ value: `Period: ${fromISO} to ${toISO}` }],
    [],
    [{ value: "Ticket", bold: true }, { value: "Summary", bold: true }, { value: "Hours", bold: true }],
  ];

  for (const group of data.projectGroups) {
    summaryRows.push([{ value: group.projectName, bold: true }]);
    for (const ticket of group.tickets) {
      summaryRows.push([{ value: ticket.ticketKey }, { value: ticket.summary }, { value: ticket.hours, decimal: true }]);
    }
    summaryRows.push([
      { value: "" },
      { value: "Project Total", bold: true },
      { value: group.totalHours, bold: true, decimal: true },
    ]);
    summaryRows.push([]);
  }

  summaryRows.push([
    { value: "" },
    { value: "TOTAL HOURS", bold: true },
    { value: data.grandTotalHours, bold: true, decimal: true },
  ]);

  const detailRows: XlsxSheet["rows"] = [
    [{ value: "Jirita — Hours Report (Details)", bold: true }],
    [{ value: `Period: ${fromISO} to ${toISO}` }],
    [],
    [
      { value: "Project", bold: true },
      { value: "Ticket", bold: true },
      { value: "Summary", bold: true },
      { value: "Member", bold: true },
      { value: "Work Date", bold: true },
      { value: "Time Entry Description", bold: true },
      { value: "Hours", bold: true },
    ],
    ...data.detailRows.map((row): XlsxSheet["rows"][number] => [
      { value: row.projectName },
      { value: row.ticketKey },
      { value: row.summary },
      { value: row.memberName },
      { value: row.workDate },
      { value: row.description },
      { value: row.hours, decimal: true },
    ]),
  ];

  return [
    { name: "Summary", rows: summaryRows, columnWidths: [14, 50, 12] },
    { name: "Details", rows: detailRows, columnWidths: [22, 12, 40, 20, 12, 40, 12] },
  ];
}
