"use client";

import type { RfcLayout } from "@/lib/github";
import { StepCard, StepHeading } from "./OnboardingPrimitives";

export default function CreatingStep({
  ownerLogin,
  name,
  layout,
  teamsCount,
  error,
  onBack,
}: {
  ownerLogin: string;
  name: string;
  layout: RfcLayout;
  teamsCount: number;
  error: string | null;
  onBack: () => void;
}) {
  if (error) {
    return (
      <StepCard>
        <StepHeading title="Something went wrong" />
        <div className="border border-magenta bg-magenta-light text-foreground rounded-sm px-3 py-2 text-sm">
          {error}
          <div className="mt-2">
            <button
              type="button"
              onClick={onBack}
              className="text-magenta underline hover:no-underline text-xs"
            >
              Back and try again
            </button>
          </div>
        </div>
      </StepCard>
    );
  }

  return (
    <StepCard>
      <StepHeading title="We're almost there…" />
      <div className="flex items-start gap-3">
        <Spinner />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            Creating{" "}
            <code className="font-mono">
              {ownerLogin}/{name}
            </code>{" "}
            on GitHub…
          </p>
          <p className="mt-1 text-xs text-gray-50">
            Seeding a README and <code className="font-mono">.rfc123.json</code>
            {layout === "multi-directory"
              ? `, scaffolding ${teamsCount} team ${teamsCount === 1 ? "directory" : "directories"}`
              : ""}
            .
          </p>
        </div>
      </div>
    </StepCard>
  );
}

function Spinner() {
  return (
    <svg
      className="w-7 h-7 animate-spin text-cyan shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Loading"
    >
      <title>Loading</title>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />
      <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}
