// The Hours Report's one real logo asset — shared by both real generated
// outputs that need it (the PDF header and the Excel Summary sheet header),
// so there is exactly one place naming it rather than two independent
// declarations that could drift. Swapping the report's branding later
// (e.g. to LendingPoint's logo) is a one-line edit here.

export interface HoursReportBranding {
  logoUrl: string;
  logoWidthPx: number;
  logoHeightPx: number;
}

export const HOURS_REPORT_BRANDING: HoursReportBranding = {
  logoUrl: "/img/jirita-logo.png",
  logoWidthPx: 217,
  logoHeightPx: 47,
};
