"use client";

import { useMemo, useState } from "react";
import Checkbox from "@/components/Checkbox";
import type { AvailableOwner, RfcLayout } from "@/lib/github";
import { VALID_RFC_TEAM_NAME } from "@/lib/rfc-config";
import {
  ArrowRightIcon,
  PrimaryButton,
  StepActions,
  StepCard,
  StepHeading,
} from "./OnboardingPrimitives";
import OwnerPicker from "./OwnerPicker";

export interface OnboardingFormState {
  selectedOwner: AvailableOwner | null;
  name: string;
  visibility: "private" | "public";
  layout: RfcLayout;
  teams: string[];
}

export type NameStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid";

export default function ConfigureStep({
  owners,
  formState,
  setFormState,
  nameStatus,
  onCreate,
}: {
  owners: AvailableOwner[] | null;
  formState: OnboardingFormState;
  setFormState: React.Dispatch<React.SetStateAction<OnboardingFormState>>;
  nameStatus: NameStatus;
  onCreate: () => void;
}) {
  const { selectedOwner, name, visibility, layout, teams } = formState;
  const [teamDraft, setTeamDraft] = useState("");

  function addTeamFromDraft() {
    // Accept comma-separated paste; drop empties + names GitHub won't accept,
    // dedupe against what's already added.
    const parts = teamDraft
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && VALID_RFC_TEAM_NAME.test(p));
    if (parts.length === 0) return;
    setFormState((prev) => {
      const seen = new Set(prev.teams);
      const next = [...prev.teams];
      for (const p of parts) {
        if (!seen.has(p)) {
          seen.add(p);
          next.push(p);
        }
      }
      return { ...prev, teams: next };
    });
    setTeamDraft("");
  }

  const canCreate = useMemo(() => {
    if (!selectedOwner) return false;
    if (nameStatus !== "available") return false;
    if (layout === "multi-directory" && teams.length === 0) return false;
    return true;
  }, [selectedOwner, nameStatus, layout, teams.length]);

  return (
    <StepCard>
      <StepHeading
        title="Let's set you up for RFCs"
        subtext="Once the repo's up, you'll be drafting your first RFC."
      />
      <Field label="Where should your RFCs live in GitHub?">
        <OwnerPicker
          owners={owners}
          selected={selectedOwner}
          onSelect={(o) =>
            setFormState((prev) => ({ ...prev, selectedOwner: o }))
          }
        />
      </Field>

      <Field
        label="Repo name"
        hint={
          selectedOwner ? (
            <span className="font-mono text-[11px]">
              {selectedOwner.login}/{name || "…"}
            </span>
          ) : undefined
        }
      >
        <input
          type="text"
          value={name}
          onChange={(e) =>
            setFormState((prev) => ({ ...prev, name: e.target.value }))
          }
          className="w-full border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
        />
        <NameStatusLine status={nameStatus} />
      </Field>

      <Field label="Visibility">
        <Checkbox
          checked={visibility === "public"}
          onChange={(checked) =>
            setFormState((prev) => ({
              ...prev,
              visibility: checked ? "public" : "private",
            }))
          }
          label="Make this repo public"
          description="Default is private. Be careful with sensitive details (customer data, internal architecture, secrets) in public RFCs."
        />
      </Field>

      <Field label="Layout">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <LayoutOption
            selected={layout === "flat"}
            onClick={() =>
              setFormState((prev) => ({ ...prev, layout: "flat" }))
            }
            title="Flat"
            hint="Recommended for small teams."
            example="2026-05-24-payments.md"
          />
          <LayoutOption
            selected={layout === "multi-directory"}
            onClick={() =>
              setFormState((prev) => ({ ...prev, layout: "multi-directory" }))
            }
            title="Multi-directory"
            hint="Recommended for larger organizations."
            example="engineering/2026-05-24-…md"
          />
        </div>
      </Field>

      {layout === "multi-directory" && (
        <Field
          label="Starter directories"
          hint="You can add more directories (or merge existing ones) later too."
        >
          <div className="flex flex-wrap gap-1.5 mb-2">
            {teams.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setFormState((prev) => ({
                    ...prev,
                    teams: prev.teams.filter((x) => x !== t),
                  }))
                }
                aria-label={`Remove ${t}`}
                className="inline-flex items-center gap-1 border border-gray-30 bg-gray-5 rounded-sm px-2 py-0.5 text-xs text-foreground cursor-pointer hover:bg-gray-10 transition-colors"
              >
                {t}
                <span className="text-gray-50" aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={teamDraft}
              onChange={(e) => setTeamDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTeamFromDraft();
                }
              }}
              placeholder="e.g. engineering, billing, fde"
              className="flex-1 border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
            />
            <button
              type="button"
              onClick={addTeamFromDraft}
              disabled={!teamDraft.trim()}
              className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Add
            </button>
          </div>
        </Field>
      )}

      <StepActions>
        <PrimaryButton onClick={onCreate} disabled={!canCreate}>
          {selectedOwner
            ? `Create RFCs repo for ${selectedOwner.login}`
            : "Create RFCs repo"}
          <ArrowRightIcon />
        </PrimaryButton>
      </StepActions>
    </StepCard>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-gray-50">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function NameStatusLine({ status }: { status: NameStatus }) {
  if (status === "idle") return null;
  if (status === "checking") {
    return (
      <p className="mt-1.5 text-xs text-gray-50">Checking availability…</p>
    );
  }
  if (status === "available") {
    return <p className="mt-1.5 text-xs text-cyan">✓ Available</p>;
  }
  if (status === "taken") {
    return (
      <p className="mt-1.5 text-xs text-magenta">
        A repo with that name already exists here. Pick a different name.
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-xs text-magenta">
      Use letters, numbers, dots, dashes, or underscores (max 100 chars).
    </p>
  );
}

function LayoutOption({
  selected,
  onClick,
  title,
  hint,
  example,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  example: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border rounded-sm px-3 py-3 text-sm transition-all cursor-pointer ${
        selected
          ? "border-foreground bg-gray-5"
          : "border-gray-20 hover:bg-gray-5"
      }`}
    >
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-xs text-gray-50 mt-0.5">{hint}</div>
      <code className="block mt-2 font-mono text-[11px] text-gray-70 bg-gray-5 border border-gray-20 rounded-sm px-1.5 py-0.5">
        {example}
      </code>
    </button>
  );
}
