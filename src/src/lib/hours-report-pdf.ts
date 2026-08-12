// Real, generated Hours Report PDF (Summary only) — a genuine PDF document
// built with jsPDF + jspdf-autotable, not a "print the web page" trick (the
// existing Reports → Export PDF uses window.print() over a printable HTML
// view; this one deliberately doesn't, per this feature's own spec for a
// "clean client-facing report"). Reuses the exact same HoursReportData the
// live preview and the .xlsx export already read from (see hours-report.ts)
// — this module only turns that data into PDF drawing calls, never a
// second aggregation.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RowInput } from "jspdf-autotable";
import type { HoursReportData } from "@/lib/hours-report";
import { formatCurrencyAmount } from "@/lib/hours-report";

// ── Branding ──────────────────────────────────────────────────────────────────
// The one place the header's logo is named. Swapping the PDF header to
// LendingPoint's logo later is a one-line change to this constant (and, if
// its aspect ratio differs, its width/height) — nothing in buildHoursReportPdf
// below reads a brand asset path directly.
export interface HoursReportPdfBranding {
  logoUrl: string;
  logoWidthPx: number;
  logoHeightPx: number;
}

export const HOURS_REPORT_PDF_BRANDING: HoursReportPdfBranding = {
  logoUrl: "/img/jirita-logo.png",
  logoWidthPx: 217,
  logoHeightPx: 47,
};

// The report's own fixed title — independent of the logo above, so
// swapping the brand's logo never touches this text.
const REPORT_TITLE = "HOURS REPORT";

const PAGE_MARGIN = 40;
const BOTTOM_MARGIN = 40;
const HOURS_COL_WIDTH = 55;
const AMOUNT_COL_WIDTH = 65;
const TICKET_COL_WIDTH = 75;

// Rough minimum vertical space (heading + repeated table header + at least
// one data row + its "Project Total" row) a project group needs before it's
// worth starting on the current page — otherwise the heading/header ends up
// stranded alone at the bottom with all its real rows pushed to the next
// page. Not exact row-height math (autotable's own `rowPageBreak: "avoid"`
// covers the exact case of a single row splitting mid-draw); this is only
// the coarser "don't start a group you can't make any real progress on"
// check.
const MIN_GROUP_SPACE = 95;

const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_800: [number, number, number] = [30, 41, 59];
const SLATE_700: [number, number, number] = [51, 65, 85];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_300: [number, number, number] = [203, 213, 225];
const SLATE_200: [number, number, number] = [226, 232, 240];
const SLATE_100: [number, number, number] = [241, 245, 249];
const BRAND_500: [number, number, number] = [102, 85, 238];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// An em dash for a `null` (Internal-category) amount instead of a
// currency-formatted `0` — Internal hours are never billable, so they must
// never read as "billed at $0." Only ever called once `data.includesFinancials`
// has already gated whether the `$` column exists at all — see below —
// so `amount` here is really just `number | null`.
function formatAmount(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? "—" : formatCurrencyAmount(round2(amount));
}

async function loadLogoDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read logo image"));
    reader.readAsDataURL(blob);
  });
}

// jspdf-autotable assigns `doc.lastAutoTable` as a side effect of every
// autoTable() call (see its own source — not part of the public .d.ts, but
// a stable, documented convention carried over from its v2/v3 plugin API),
// which is the only way to learn where a table actually finished drawing.
function lastAutoTableFinalY(doc: jsPDF, fallback: number): number {
  const withLastTable = doc as unknown as { lastAutoTable?: { finalY?: number } };
  return withLastTable.lastAutoTable?.finalY ?? fallback;
}

// Real Summary-only PDF — same grouping/subtotal/total shape as the Excel
// Summary sheet and the on-screen preview (buildHoursReportData), just
// rendered as a real, generated document instead of worksheet rows or an
// HTML table. Never includes per-entry Details, per the task's own scope.
export async function buildHoursReportPdf(
  data: HoursReportData,
  periodLabel: string,
  branding: HoursReportPdfBranding = HOURS_REPORT_PDF_BRANDING
): Promise<Uint8Array> {
  // The one place this PDF decides whether a `$` column exists at all —
  // reads `data.includesFinancials` (set once, by buildHoursReportData's
  // own authorization parameter) rather than re-deriving a role/permission
  // check here. A Project Lead without financial_access gets a PDF with no
  // `$` column whatsoever — never a dash, never a $0 — Hours/Ticket/
  // Summary/grouping/Project Total/TOTAL HOURS are otherwise identical.
  const includeFinancials = data.includesFinancials;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = pageWidth - PAGE_MARGIN * 2;
  const amountColRight = pageWidth - PAGE_MARGIN;
  const amountColLeft = amountColRight - AMOUNT_COL_WIDTH;
  const hoursColRight = includeFinancials ? amountColLeft : pageWidth - PAGE_MARGIN;
  const hoursColLeft = hoursColRight - HOURS_COL_WIDTH;

  // A logo that fails to fetch (offline, asset moved) degrades to a
  // text-only header rather than failing the whole export — the report
  // itself never depends on the image loading.
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogoDataUrl(branding.logoUrl);
  } catch {
    logoDataUrl = null;
  }

  let cursorY = 44;
  if (logoDataUrl) {
    const logoHeightPt = 26;
    const logoWidthPt = logoHeightPt * (branding.logoWidthPx / branding.logoHeightPx);
    doc.addImage(logoDataUrl, "PNG", PAGE_MARGIN, cursorY, logoWidthPt, logoHeightPt);
    cursorY += logoHeightPt + 20;
  } else {
    cursorY += 10;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...SLATE_900);
  doc.text(REPORT_TITLE, PAGE_MARGIN, cursorY);
  cursorY += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SLATE_500);
  doc.text(`Period: ${periodLabel}`, PAGE_MARGIN, cursorY);
  cursorY += 14;

  doc.setDrawColor(...BRAND_500);
  doc.setLineWidth(1.2);
  doc.line(PAGE_MARGIN, cursorY, pageWidth - PAGE_MARGIN, cursorY);
  cursorY += 24;

  for (const group of data.projectGroups) {
    if (cursorY + MIN_GROUP_SPACE > pageHeight - BOTTOM_MARGIN) {
      doc.addPage();
      cursorY = 44;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...SLATE_800);
    doc.text(group.projectName, PAGE_MARGIN, cursorY);
    if (group.isInternal) {
      const nameWidth = doc.getTextWidth(group.projectName);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...SLATE_400);
      doc.text("Internal", PAGE_MARGIN + nameWidth + 8, cursorY);
    }
    cursorY += 10;

    const body: RowInput[] = group.tickets.map((ticket) => {
      const row: RowInput = [ticket.ticketKey, ticket.summary, round2(ticket.hours).toFixed(2)];
      if (includeFinancials) row.push(formatAmount(ticket.amount));
      return row;
    });
    const totalRow: RowInput = [
      "",
      { content: "Project Total", styles: { fontStyle: "bold", halign: "right" } },
      { content: round2(group.totalHours).toFixed(2), styles: { fontStyle: "bold", halign: "right" } },
    ];
    if (includeFinancials) totalRow.push({ content: formatAmount(group.totalAmount), styles: { fontStyle: "bold", halign: "right" } });
    body.push(totalRow);

    const summaryColWidth = includeFinancials
      ? tableWidth - TICKET_COL_WIDTH - HOURS_COL_WIDTH - AMOUNT_COL_WIDTH
      : tableWidth - TICKET_COL_WIDTH - HOURS_COL_WIDTH;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: BOTTOM_MARGIN, top: PAGE_MARGIN },
      tableWidth,
      head: [includeFinancials ? ["Ticket", "Summary", "Hours", "$"] : ["Ticket", "Summary", "Hours"]],
      body,
      showHead: "everyPage",
      rowPageBreak: "avoid",
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        textColor: SLATE_700,
        lineColor: SLATE_200,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: SLATE_100,
        textColor: SLATE_500,
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: includeFinancials
        ? {
            0: { cellWidth: TICKET_COL_WIDTH },
            1: { cellWidth: summaryColWidth },
            2: { cellWidth: HOURS_COL_WIDTH, halign: "right" },
            3: { cellWidth: AMOUNT_COL_WIDTH, halign: "right" },
          }
        : {
            0: { cellWidth: TICKET_COL_WIDTH },
            1: { cellWidth: summaryColWidth },
            2: { cellWidth: HOURS_COL_WIDTH, halign: "right" },
          },
    });

    cursorY = lastAutoTableFinalY(doc, cursorY) + 22;
  }

  if (cursorY + 30 > pageHeight - BOTTOM_MARGIN) {
    doc.addPage();
    cursorY = 44;
  }

  doc.setDrawColor(...SLATE_300);
  doc.setLineWidth(0.75);
  doc.line(PAGE_MARGIN, cursorY, pageWidth - PAGE_MARGIN, cursorY);
  cursorY += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...SLATE_900);
  doc.text("TOTAL HOURS", hoursColLeft - 8, cursorY, { align: "right" });
  doc.text(round2(data.grandTotalHours).toFixed(2), hoursColRight, cursorY, { align: "right" });
  if (includeFinancials) {
    doc.text(formatCurrencyAmount(round2(data.grandTotalAmount ?? 0)), amountColRight, cursorY, { align: "right" });
  }

  // Footer page numbers — added last, once the real page count is known,
  // rather than guessed while drawing (this report's own length isn't known
  // in advance, since project groups can push it to any number of pages).
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_400);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 20, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
