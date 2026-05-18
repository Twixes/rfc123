import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import { PostHogProvider } from "@/providers/PostHogProvider";
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
  title: {
    template: "%s - RFC123",
    default: "RFC123",
  },
  description: "The agent-native RFC platform for teams: 1. draft, 2. discuss, 3. decide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${lSerif.variable} antialiased`}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
