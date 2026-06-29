"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ICON_CLASS = "h-3.5 w-3.5";

function SunIcon() {
  return (
    <svg
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Light</title>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Dark</title>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>System</title>
      <rect x="2" y="4" width="20" height="13" rx="1" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const OPTIONS = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
] as const;

/** Three-way light / system / dark switch. Renders inert (no active pill)
 *  until mounted, since the resolved theme is unknown during SSR – this is
 *  what keeps hydration consistent. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of theme buttons, not a form fieldset
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex items-center gap-0.5 rounded-md border border-gray-20 bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
              active
                ? "bg-gray-10 text-foreground"
                : "text-gray-50 hover:text-foreground"
            }`}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
