import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { CurrentUserProvider } from "@/components/current-user-provider";
import { MemberProfileProvider } from "@/components/member-profile";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jirita — Project Overview",
  description: "Project Overview prototype for Jirita, a simple project management platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <CurrentUserProvider>
            <MemberProfileProvider>{children}</MemberProfileProvider>
          </CurrentUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
