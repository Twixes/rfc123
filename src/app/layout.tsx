import type { Metadata } from "next";
import { TooltipProvider } from "@/components/Tooltip";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { appBodyClassName } from "./fonts";
import "./globals.css";

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
    <html lang="en">
      <body className={appBodyClassName}>
        <PostHogProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
