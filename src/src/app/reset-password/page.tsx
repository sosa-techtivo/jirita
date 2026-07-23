import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/components/reset-password-screen";

const title = "Reset your JIRITA password";
const description =
  "Open this secure link to create a new password and recover access to your JIRITA account.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />;
}
