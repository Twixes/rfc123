"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Checkbox from "@/components/Checkbox";
import type { AvailableOwner, RfcLayout } from "@/lib/github";
import { VALID_GITHUB_REPO_NAME, VALID_RFC_TEAM_NAME } from "@/lib/rfc-config";

type Step = "configure" | "creating" | "success";

interface CreatedRepo {
  owner: string;
  name: string;
  htmlUrl: string;
}

const DEFAULT_REPO_NAME = "rfcs";

// Matches the cyan / magenta / yellow accents from the landing page so the
// burst feels like part of the app, not a stock effect.
const CONFETTI_COLORS = ["#0ad0c4", "#f160a0", "#f7d34d", "#ffffff"];

function fireConfetti() {
  const duration = 1000;
  const end = Date.now() + duration;
  const shared = { ticks: 200, gravity: 0.9, colors: CONFETTI_COLORS } as const;
  (function frame() {
    confetti({
      ...shared,
      particleCount: 5,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
    });
    confetti({
      ...shared,
      particleCount: 5,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export default function OnboardingClient() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("configure");

  const [owners, setOwners] = useState<AvailableOwner[] | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<AvailableOwner | null>(
    null,
  );

  const [name, setName] = useState(DEFAULT_REPO_NAME);
  const [nameStatus, setNameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [layout, setLayout] = useState<RfcLayout>("flat");
  const [teamDraft, setTeamDraft] = useState("");
  const [teams, setTeams] = useState<string[]>([]);

  const [createdRepo, setCreatedRepo] = useState<CreatedRepo | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/owners");
        if (!res.ok) return;
        const data: AvailableOwner[] = await res.json();
        if (cancelled) return;
        setOwners(data);
        const personal = data.find((o) => o.type === "User");
        if (personal) setSelectedOwner(personal);
      } catch (e) {
        console.error("Failed to load owners", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "configure" || !selectedOwner) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameStatus("idle");
      return;
    }
    if (!VALID_GITHUB_REPO_NAME.test(trimmed)) {
      setNameStatus("invalid");
      return;
    }
    setNameStatus("checking");
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          owner: selectedOwner.login,
          name: trimmed,
        });
        const res = await fetch(`/api/onboarding/check-name?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          available?: boolean;
          reason?: string;
        };
        if (data.reason === "invalid_name") {
          setNameStatus("invalid");
        } else {
          setNameStatus(data.available ? "available" : "taken");
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setNameStatus("idle");
      }
    }, 300);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [step, selectedOwner, name]);

  function addTeamFromDraft() {
    // Accept comma-separated paste; drop empties + names GitHub won't accept,
    // dedupe against what's already added.
    const parts = teamDraft
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && VALID_RFC_TEAM_NAME.test(p));
    if (parts.length === 0) return;
    setTeams((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const p of parts) {
        if (!seen.has(p)) {
          seen.add(p);
          next.push(p);
        }
      }
      return next;
    });
    setTeamDraft("");
  }

  const canCreate = useMemo(() => {
    if (!selectedOwner) return false;
    if (nameStatus !== "available") return false;
    if (layout === "multi-directory" && teams.length === 0) return false;
    return true;
  }, [selectedOwner, nameStatus, layout, teams.length]);

  async function handleCreate() {
    if (!selectedOwner || !canCreate) return;
    setStep("creating");
    setCreateError(null);
    try {
      const res = await fetch("/api/onboarding/create-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: selectedOwner.login,
          isOrg: selectedOwner.type === "Organization",
          name: name.trim(),
          visibility,
          layout,
          teams: layout === "multi-directory" ? teams : [],
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          approvalUrl?: string;
        };
        setCreateError(data.error ?? "Failed to create repo");
        return;
      }
      const data = (await res.json()) as {
        owner: string;
        name: string;
        htmlUrl: string;
      };
      setCreatedRepo({
        owner: data.owner,
        name: data.name,
        htmlUrl: data.htmlUrl,
      });
      setStep("success");
      fireConfetti();
    } catch (e) {
      console.error(e);
      setCreateError((e as Error).message || "Something went wrong");
    }
  }

  function handleStartFirstRfc() {
    if (!createdRepo) return;
    const params = new URLSearchParams({
      owner: createdRepo.owner,
      repo: createdRepo.name,
    });
    router.push(`/rfcs/new?${params}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="border border-gray-20 rounded-md bg-surface p-6 sm:p-8"
    >
      <AnimatePresence mode="wait">
        {step === "configure" && (
          <StepCard key="configure">
            <StepHeading
              title="Let's set you up for RFCs"
              subtext="Once the repo's up, you'll be drafting your first RFC — Markdown in, PR + reviewers requested out."
            />
            <Field label="Where should your RFCs live in GitHub?">
              <OwnerPicker
                owners={owners}
                selected={selectedOwner}
                onSelect={setSelectedOwner}
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
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
              />
              <NameStatusLine status={nameStatus} />
            </Field>

            <Field label="Visibility">
              <Checkbox
                checked={visibility === "public"}
                onChange={(checked) =>
                  setVisibility(checked ? "public" : "private")
                }
                label="Make this repo public"
                description="Default is private. Be careful with sensitive details (customer data, internal architecture, secrets) in public RFCs."
              />
            </Field>

            <Field label="Layout">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <LayoutOption
                  selected={layout === "flat"}
                  onClick={() => setLayout("flat")}
                  title="Flat"
                  hint="Recommended for small teams."
                  example="2026-05-24-payments.md"
                />
                <LayoutOption
                  selected={layout === "multi-directory"}
                  onClick={() => setLayout("multi-directory")}
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
                        setTeams((prev) => prev.filter((x) => x !== t))
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
              <PrimaryButton onClick={handleCreate} disabled={!canCreate}>
                {selectedOwner
                  ? `Create RFCs repo for ${selectedOwner.login}`
                  : "Create RFCs repo"}
                <ArrowRightIcon />
              </PrimaryButton>
            </StepActions>
          </StepCard>
        )}

        {step === "creating" &&
          (createError ? (
            <StepCard key="creating-error">
              <StepHeading title="Something went wrong" />
              <div className="border border-magenta bg-magenta-light text-foreground rounded-sm px-3 py-2 text-sm">
                {createError}
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setStep("configure")}
                    className="text-magenta underline hover:no-underline text-xs"
                  >
                    Back and try again
                  </button>
                </div>
              </div>
            </StepCard>
          ) : (
            <StepCard key="creating">
              <StepHeading title="We're almost there…" />
              <div className="flex items-start gap-3">
                <Spinner />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    Creating{" "}
                    <code className="font-mono">
                      {selectedOwner?.login}/{name.trim()}
                    </code>{" "}
                    on GitHub…
                  </p>
                  <p className="mt-1 text-xs text-gray-50">
                    Seeding a README and{" "}
                    <code className="font-mono">.rfc123.json</code>
                    {layout === "multi-directory"
                      ? `, scaffolding ${teams.length} team ${teams.length === 1 ? "directory" : "directories"}`
                      : ""}
                    .
                  </p>
                </div>
              </div>
            </StepCard>
          ))}

        {step === "success" && createdRepo && (
          <StepCard key="success">
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
                    ? ` · ${teams.length} team ${teams.length === 1 ? "directory" : "directories"}`
                    : " · flat layout"}
                </p>
              </div>
            </div>
            <StepActions>
              <PrimaryButton onClick={handleStartFirstRfc}>
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
        )}
      </AnimatePresence>
    </motion.div>
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

function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="space-y-5"
    >
      {children}
    </motion.div>
  );
}

function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-5 border-t border-gray-20">
      {children}
    </div>
  );
}

function StepHeading({ title, subtext }: { title: string; subtext?: string }) {
  return (
    <div>
      <h2 className="text-3xl sm:text-4xl font-serif font-normal text-foreground">
        {title}
      </h2>
      {subtext && <p className="mt-2 text-gray-70">{subtext}</p>}
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
    >
      {children}
    </button>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Arrow right</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 5l7 7m0 0l-7 7m7-7H3"
      />
    </svg>
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

function NameStatusLine({
  status,
}: {
  status: "idle" | "checking" | "available" | "taken" | "invalid";
}) {
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

function OwnerPicker({
  owners,
  selected,
  onSelect,
}: {
  owners: AvailableOwner[] | null;
  selected: AvailableOwner | null;
  onSelect: (o: AvailableOwner) => void;
}) {
  if (owners === null) {
    return (
      <div className="border border-gray-20 rounded-sm p-4 text-sm text-gray-50">
        Loading accounts…
      </div>
    );
  }
  if (owners.length === 0) {
    return (
      <div className="border border-gray-20 rounded-sm p-4 text-sm text-gray-50">
        No accounts found. Check your GitHub OAuth permissions.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {owners.map((owner) => {
        const isSelected = selected?.login === owner.login;
        return (
          <button
            key={owner.login}
            type="button"
            onClick={() => onSelect(owner)}
            className={`w-full text-left border rounded-sm px-3 py-2.5 text-sm transition-all cursor-pointer flex items-center gap-3 ${
              isSelected
                ? "border-foreground bg-gray-5"
                : "border-gray-20 hover:bg-gray-5"
            }`}
          >
            {owner.avatarUrl && (
              <img
                src={owner.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-sm border border-gray-20"
              />
            )}
            <span className="flex-1">
              <span className="font-medium text-foreground">{owner.login}</span>
              <span className="ml-2 text-xs text-gray-50">
                {owner.type === "User" ? "personal account" : "organization"}
              </span>
            </span>
            {isSelected && (
              <span className="text-cyan text-base" aria-hidden>
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
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
