import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/Tooltip";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const lSerif = localFont({
  src: [
    {
      path: "./fonts/L-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/L-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-l-serif",
  display: "swap",
});

export const metadata: Metadata = {
  // metadataBase lets file-based `opengraph-image.png` and any per-route
  // overrides resolve to absolute URLs. NEXTAUTH_URL is the single source
  // of truth for the externally-visible app URL (see CLAUDE.md).
  metadataBase: process.env.NEXTAUTH_URL
    ? new URL(process.env.NEXTAUTH_URL)
    : undefined,
  title: {
    template: "%s - RFC123",
    default: "RFC123",
  },
  description:
    "The agent-native RFC platform for teams: 1. draft, 2. discuss, 3. decide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${lSerif.variable} antialiased`}>
        <ThemeProvider>
          <PostHogProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
