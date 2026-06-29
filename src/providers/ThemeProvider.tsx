"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Wraps next-themes. `attribute="class"` toggles `class="dark"` on <html>,
 *  which is what the dark palette in globals.css keys off. `defaultTheme`
 *  is "system" so a first-time visitor follows their OS preference. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
