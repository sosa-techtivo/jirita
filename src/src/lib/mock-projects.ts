// Lifecycle phase only — risk/health assessment lives entirely in
// ProjectHealth now, so "at risk" is expressed as health: "critical" on an
// otherwise "active" project rather than as a status of its own.
export type ProjectStatus = "planning" | "active" | "on-hold" | "completed" | "archived";
export type ProjectHealth = "healthy" | "needs-attention" | "critical";

// Client Project: has a billing Client and requires a rate; its time
// entries are Billable by default and it's included in Billing/Finance
// reports. Internal Project: no client/rate; time entries are Non-Billable
// by default and it's excluded from Billing/Finance (still shows up in Time
// Tracking, Capacity, and Delivery reports). Set in Project Settings → Billing.
export type ProjectCategory = "client" | "internal";

// Placeholder for a future Clients entity/module — for now just the roster
// of named clients already referenced across Reports/Time Tracking, exposed
// here so Project Settings' Client selector has one source of truth instead
// of a hardcoded list of its own.
export const CLIENT_NAMES = ["Meridian Bank", "RetailCo", "Partner A"] as const;
export type ClientName = (typeof CLIENT_NAMES)[number];

export interface ProjectSummary {
  slug: string;
  name: string;
  shortName: string;
  /** Unique prefix used to build visible ticket IDs (e.g. "MBA" → MBA-123). Set in Project Settings → General. */
  projectCode: string;
  description: string;
  status: ProjectStatus;
  health: ProjectHealth;
  owner: { name: string; avatar: string };
  /** Real Project Lead — a project_memberships row with project_role = 'lead',
   *  the same authoritative signal Team/the Dashboards already use (see
   *  loadLeadProjects' own comment in lib/projects.ts for why this is a
   *  different, separate field from `owner` above). null when the project
   *  has no lead staffed yet; undefined for mock/dev-fallback projects that
   *  never populate this field. */
  lead?: { id: string; name: string; avatar: string } | null;
  updatedAt: string;
  targetDate: string;
  activeMilestones: number;
  openTickets: number;
  blockedTickets: number;
  overdueTickets: number;
  awaitingReviewTickets: number;
  dueThisWeekTickets: number;
  progress: number;
  category: ProjectCategory;
  /** Only meaningful when category is "client". */
  client?: ClientName;
  /** Only meaningful when category is "client". */
  defaultHourlyRate?: number;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const projects: ProjectSummary[] = [
  {
    slug: "mobile-banking-app",
    name: "Mobile Banking App",
    shortName: "MB",
    projectCode: "MBA",
    description: "iOS and Android banking experience for Meridian Bank.",
    status: "active",
    health: "needs-attention",
    owner: { name: "Sarah Chen", avatar: avatar(47) },
    updatedAt: "Just now",
    targetDate: "Sep 15",
    activeMilestones: 3,
    openTickets: 29,
    blockedTickets: 4,
    overdueTickets: 2,
    awaitingReviewTickets: 3,
    dueThisWeekTickets: 5,
    progress: 42,
    category: "client",
    client: "Meridian Bank",
    defaultHourlyRate: 145,
  },
  {
    slug: "client-website-redesign",
    name: "Client Website Redesign",
    shortName: "CW",
    projectCode: "CWD",
    description: "Full marketing site rebuild for a long-standing retail client.",
    status: "on-hold",
    health: "critical",
    owner: { name: "Elena Rossi", avatar: avatar(5) },
    updatedAt: "1 week ago",
    targetDate: "Oct 1",
    activeMilestones: 1,
    openTickets: 6,
    blockedTickets: 1,
    overdueTickets: 3,
    awaitingReviewTickets: 1,
    dueThisWeekTickets: 2,
    progress: 35,
    category: "client",
    client: "RetailCo",
    defaultHourlyRate: 110,
  },
  {
    slug: "internal-platform-migration",
    name: "Internal Platform Migration",
    shortName: "IP",
    projectCode: "IPM",
    description: "Moving internal tooling off the legacy monolith onto the new platform.",
    status: "active",
    health: "needs-attention",
    owner: { name: "Marcus Lee", avatar: avatar(12) },
    updatedAt: "2 hours ago",
    targetDate: "Aug 30",
    activeMilestones: 2,
    openTickets: 14,
    blockedTickets: 2,
    overdueTickets: 0,
    awaitingReviewTickets: 2,
    dueThisWeekTickets: 3,
    progress: 68,
    category: "internal",
  },
  {
    slug: "customer-support-portal",
    name: "Customer Support Portal",
    shortName: "CS",
    projectCode: "CSP",
    description: "Self-service help center and ticketing for end customers.",
    status: "active",
    health: "healthy",
    owner: { name: "David Kim", avatar: avatar(22) },
    updatedAt: "3 hours ago",
    targetDate: "Aug 20",
    activeMilestones: 2,
    openTickets: 18,
    blockedTickets: 3,
    overdueTickets: 1,
    awaitingReviewTickets: 2,
    dueThisWeekTickets: 4,
    progress: 54,
    category: "internal",
  },
  {
    slug: "data-warehouse-revamp",
    name: "Data Warehouse Revamp",
    shortName: "DW",
    projectCode: "DWR",
    description: "Consolidating analytics pipelines onto a single warehouse schema.",
    status: "active",
    health: "healthy",
    owner: { name: "Alejo Cadavid", avatar: avatar(33) },
    updatedAt: "Yesterday",
    targetDate: "Jul 31",
    activeMilestones: 1,
    openTickets: 9,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 1,
    progress: 71,
    category: "internal",
  },
  {
    slug: "marketing-site-relaunch",
    name: "Marketing Site Relaunch",
    shortName: "MS",
    projectCode: "MSR",
    description: "New brand system and CMS migration ahead of the product launch.",
    status: "active",
    health: "critical",
    owner: { name: "Elena Rossi", avatar: avatar(5) },
    updatedAt: "2 days ago",
    targetDate: "Jul 18",
    activeMilestones: 2,
    openTickets: 21,
    blockedTickets: 6,
    overdueTickets: 5,
    awaitingReviewTickets: 4,
    dueThisWeekTickets: 6,
    progress: 24,
    category: "internal",
  },
  {
    slug: "partner-api-integration",
    name: "Partner API Integration",
    shortName: "PA",
    projectCode: "PAI",
    description: "Two-way sync with a banking partner's settlement API.",
    status: "on-hold",
    health: "needs-attention",
    owner: { name: "David Kim", avatar: avatar(22) },
    updatedAt: "2 weeks ago",
    targetDate: "Nov 1",
    activeMilestones: 0,
    openTickets: 4,
    blockedTickets: 1,
    overdueTickets: 2,
    awaitingReviewTickets: 1,
    dueThisWeekTickets: 1,
    progress: 50,
    category: "client",
    client: "Partner A",
    defaultHourlyRate: 125,
  },
  {
    slug: "employee-onboarding-tool",
    name: "Employee Onboarding Tool",
    shortName: "EO",
    projectCode: "EOT",
    description: "Internal HR tool for new-hire provisioning and training tracks.",
    status: "archived",
    health: "healthy",
    owner: { name: "Marcus Lee", avatar: avatar(12) },
    updatedAt: "3 months ago",
    targetDate: "Mar 1",
    activeMilestones: 0,
    openTickets: 0,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 0,
    progress: 100,
    category: "internal",
  },
  {
    slug: "vendor-security-review",
    name: "Vendor Security Review",
    shortName: "VS",
    projectCode: "VSR",
    description: "Annual third-party vendor security and compliance audit.",
    status: "completed",
    health: "healthy",
    owner: { name: "Alejo Cadavid", avatar: avatar(33) },
    updatedAt: "5 months ago",
    targetDate: "Jan 15",
    activeMilestones: 0,
    openTickets: 0,
    blockedTickets: 0,
    overdueTickets: 0,
    awaitingReviewTickets: 0,
    dueThisWeekTickets: 0,
    progress: 100,
    category: "internal",
  },
];

export function getProjectBySlug(slug: string): ProjectSummary | undefined {
  return projects.find((project) => project.slug === slug);
}
