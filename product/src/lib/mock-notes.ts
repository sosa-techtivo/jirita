export interface ProjectNote {
  id: string;
  projectSlug: string;
  title: string;
  body: string;
  tag?: string;
  updatedAt: string;
  author: { name: string; avatar: string };
}

const avatar = (id: number) => `https://i.pravatar.cc/64?img=${id}`;

export const notes: ProjectNote[] = [
  {
    id: "note-onboarding-decision",
    projectSlug: "mobile-banking-app",
    title: "Onboarding flow — final decision",
    body:
      "We're going with a 3-step onboarding instead of the original 5-step flow. Biometric setup is now optional and can be completed later from Settings. This should cut drop-off significantly based on the usability test results from last week.",
    tag: "Decision",
    updatedAt: "2 hours ago",
    author: { name: "Sarah Chen", avatar: avatar(47) },
  },
  {
    id: "note-kyc-vendor",
    projectSlug: "mobile-banking-app",
    title: "KYC vendor outage — context",
    body:
      "Third-party KYC vendor has had intermittent outages for the past week. Their status page: status.kycvendor.example. We've raised a P1 ticket with them. Fallback plan: queue verifications and retry every 15 minutes.",
    tag: "Meeting Notes",
    updatedAt: "Yesterday",
    author: { name: "David Kim", avatar: avatar(22) },
  },
  {
    id: "note-design-links",
    projectSlug: "mobile-banking-app",
    title: "Design references",
    body:
      "Figma — Mobile Banking App (latest): figma.com/file/mobile-banking-app. Component library and tokens live in the shared Techtivo design system file. Ping Elena before editing the auth flow frames directly.",
    tag: "Links",
    updatedAt: "3 days ago",
    author: { name: "Elena Rossi", avatar: avatar(5) },
  },
  {
    id: "note-pci-scope",
    projectSlug: "mobile-banking-app",
    title: "PCI compliance scope",
    body:
      "Card storage must stay tokenized end-to-end — no raw PAN ever touches our database. Compliance team confirmed scope reduction is possible if we route storage entirely through the processor's vault API.",
    tag: "Compliance",
    updatedAt: "1 week ago",
    author: { name: "Priya Patel", avatar: avatar(33) },
  },
  {
    id: "note-platform-migration-plan",
    projectSlug: "internal-platform-migration",
    title: "Migration cutover plan",
    body:
      "Cutover is staged by team: internal tools first, then customer-facing admin panels. Each stage gets a 48-hour bake period on the new platform before we route production traffic. Rollback plan documented in the runbook.",
    tag: "Decision",
    updatedAt: "2 days ago",
    author: { name: "Marcus Lee", avatar: avatar(12) },
  },
  {
    id: "note-platform-migration-standup",
    projectSlug: "internal-platform-migration",
    title: "Weekly sync — Jun 24",
    body:
      "Legacy monolith database export is progressing on schedule. Blocked on infra team provisioning the new read replicas. Marcus to follow up with infra by Wednesday.",
    tag: "Meeting Notes",
    updatedAt: "1 week ago",
    author: { name: "Marcus Lee", avatar: avatar(12) },
  },
];

export function getNotesByProjectSlug(slug: string): ProjectNote[] {
  return notes.filter((note) => note.projectSlug === slug);
}
