import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { PostHogProvider } from "@/providers/PostHogProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s - RFC123",
    default: "RFC123",
  },
  description: "The RFC platform for teams: 1. draft, 2. discuss, 3. decide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${instrumentSerif.variable} antialiased`}
      >
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
