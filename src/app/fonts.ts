import { Geist } from "next/font/google";
import localFont from "next/font/local";

// Shared between the app layout and Storybook's preview decorator, so scene
// stories render with the exact production typography.
export const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const lSerif = localFont({
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
