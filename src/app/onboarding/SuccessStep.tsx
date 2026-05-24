"use client";

import type { RfcLayout } from "@/lib/github";
import {
  PrimaryButton,
  StepActions,
  StepCard,
  StepHeading,
} from "./OnboardingPrimitives";

interface CreatedRepo {
  owner: string;
  name: string;
  htmlUrl: string;
}

export default function SuccessStep({
  createdRepo,
  visibility,
  layout,
  teamsCount,
  onStartFirstRfc,
}: {
  createdRepo: CreatedRepo;
  visibility: "private" | "public";
  layout: RfcLayout;
  teamsCount: number;
  onStartFirstRfc: () => void;
}) {
  return (
    <StepCard>
      <StepHeading title="It's synergy time" />
      <div className="flex items-start gap-3">
        <SuccessCheck />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-foreground">
            Your RFCs repo is ready
          </h3>
          <p className="mt-1 text-sm text-gray-70">
            <code className="font-mono">
              {createdRepo.owner}/{createdRepo.name}
            </code>{" "}
            · {visibility}
            {layout === "multi-directory"
              ? ` · ${teamsCount} team ${teamsCount === 1 ? "directory" : "directories"}`
              : " · flat layout"}
          </p>
        </div>
      </div>
      <StepActions>
        <PrimaryButton onClick={onStartFirstRfc}>
          Start your first RFC
        </PrimaryButton>
        <a
          href={createdRepo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-50 hover:text-foreground underline decoration-cyan underline-offset-2 transition-colors"
        >
          View on GitHub →
        </a>
      </StepActions>
    </StepCard>
  );
}

function SuccessCheck() {
  return (
    <svg
      className="w-7 h-7 text-cyan shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      role="img"
      aria-label="Success"
    >
      <title>Success</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
