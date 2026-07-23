import type { Metadata } from "next";
import { AcceptInviteScreen } from "@/components/accept-invite-screen";

const title = "You’re invited to JIRITA";
const description =
  "Accept your invitation, create your password, and join your Techtivo workspace in JIRITA.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function AcceptInvitePage() {
  return <AcceptInviteScreen />;
}
