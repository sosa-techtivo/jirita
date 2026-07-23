import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { CurrentUserProvider } from "@/components/current-user-provider";
import { OrganizationProjectsProvider } from "@/components/organization-projects-provider";
import { MemberProfileProvider } from "@/components/member-profile";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jirita.techtivo.com"),
  title: "Jirita — Project Overview",
  description:
    "Jirita is Techtivo's project management platform for tracking projects, milestones, tickets, and team collaboration.",
  openGraph: {
    siteName: "Jirita",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <CurrentUserProvider>
            <OrganizationProjectsProvider>
              <MemberProfileProvider>{children}</MemberProfileProvider>
            </OrganizationProjectsProvider>
          </CurrentUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
