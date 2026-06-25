export type ProjectStatus = "active" | "on-track" | "at-risk" | "on-hold" | "archived";

export interface ProjectSummary {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  status: ProjectStatus;
  owner: { name: string; avatar: string };
  updatedAt: string;
  activeMilestones: number;
  openTickets: number;
  progress: number;
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const projects: ProjectSummary[] = [
  {
    slug: "mobile-banking-app",
    name: "Mobile Banking App",
    shortName: "MB",
    description: "iOS and Android banking experience for Meridian Bank.",
    status: "active",
    owner: { name: "Sarah Chen", avatar: avatar(47) },
    updatedAt: "Just now",
    activeMilestones: 3,
    openTickets: 29,
    progress: 42,
  },
  {
    slug: "client-website-redesign",
    name: "Client Website Redesign",
    shortName: "CW",
    description: "Full marketing site rebuild for a long-standing retail client.",
    status: "on-hold",
    owner: { name: "Elena Rossi", avatar: avatar(5) },
    updatedAt: "1 week ago",
    activeMilestones: 1,
    openTickets: 6,
    progress: 35,
  },
  {
    slug: "internal-platform-migration",
    name: "Internal Platform Migration",
    shortName: "IP",
    description: "Moving internal tooling off the legacy monolith onto the new platform.",
    status: "on-track",
    owner: { name: "Marcus Lee", avatar: avatar(12) },
    updatedAt: "2 hours ago",
    activeMilestones: 2,
    openTickets: 14,
    progress: 68,
  },
  {
    slug: "customer-support-portal",
    name: "Customer Support Portal",
    shortName: "CS",
    description: "Self-service help center and ticketing for end customers.",
    status: "active",
    owner: { name: "David Kim", avatar: avatar(22) },
    updatedAt: "3 hours ago",
    activeMilestones: 2,
    openTickets: 18,
    progress: 54,
  },
  {
    slug: "data-warehouse-revamp",
    name: "Data Warehouse Revamp",
    shortName: "DW",
    description: "Consolidating analytics pipelines onto a single warehouse schema.",
    status: "on-track",
    owner: { name: "Priya Patel", avatar: avatar(33) },
    updatedAt: "Yesterday",
    activeMilestones: 1,
    openTickets: 9,
    progress: 71,
  },
  {
    slug: "marketing-site-relaunch",
    name: "Marketing Site Relaunch",
    shortName: "MS",
    description: "New brand system and CMS migration ahead of the product launch.",
    status: "at-risk",
    owner: { name: "Elena Rossi", avatar: avatar(5) },
    updatedAt: "2 days ago",
    activeMilestones: 2,
    openTickets: 21,
    progress: 24,
  },
  {
    slug: "partner-api-integration",
    name: "Partner API Integration",
    shortName: "PA",
    description: "Two-way sync with a banking partner's settlement API.",
    status: "on-hold",
    owner: { name: "David Kim", avatar: avatar(22) },
    updatedAt: "2 weeks ago",
    activeMilestones: 0,
    openTickets: 4,
    progress: 50,
  },
  {
    slug: "employee-onboarding-tool",
    name: "Employee Onboarding Tool",
    shortName: "EO",
    description: "Internal HR tool for new-hire provisioning and training tracks.",
    status: "archived",
    owner: { name: "Marcus Lee", avatar: avatar(12) },
    updatedAt: "3 months ago",
    activeMilestones: 0,
    openTickets: 0,
    progress: 100,
  },
  {
    slug: "vendor-security-review",
    name: "Vendor Security Review",
    shortName: "VS",
    description: "Annual third-party vendor security and compliance audit.",
    status: "archived",
    owner: { name: "Priya Patel", avatar: avatar(33) },
    updatedAt: "5 months ago",
    activeMilestones: 0,
    openTickets: 0,
    progress: 100,
  },
];

export function getProjectBySlug(slug: string): ProjectSummary | undefined {
  return projects.find((project) => project.slug === slug);
}
