"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

function formatAbsolute(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface RelativeTimeProps {
  date: string;
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const parsed = new Date(date);
  const absolute = formatAbsolute(parsed);
  const [relative, setRelative] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setRelative(getRelativeTime(new Date(date)));
  }, [date]);

  function showTooltip() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 6,
    });
  }

  function hideTooltip() {
    setTooltipPos(null);
  }

  return (
    <>
      {/* biome-ignore lint: mouse enter/leave are purely decorative for tooltip */}
      <span
        ref={ref}
        className={`inline-block cursor-default ${className ?? ""}`}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        <time dateTime={date}>{relative ?? absolute}</time>
      </span>
      {tooltipPos &&
        createPortal(
          <span
            className="pointer-events-none fixed z-9999 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-gray-20 bg-surface px-2 py-1 text-xs text-foreground shadow-sm"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            {absolute}
          </span>,
          document.body,
        )}
    </>
  );
}
