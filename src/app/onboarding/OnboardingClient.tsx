"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import type { AvailableOwner } from "@/lib/github";
import { VALID_GITHUB_REPO_NAME } from "@/lib/rfc-config";
import ConfigureStep, {
  type NameStatus,
  type OnboardingFormState,
} from "./ConfigureStep";
import CreatingStep from "./CreatingStep";
import SuccessStep from "./SuccessStep";

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

function fireConfetti(): () => void {
  const duration = 1000;
  const end = Date.now() + duration;
  const shared = { ticks: 200, gravity: 0.9, colors: CONFETTI_COLORS } as const;
  let rafHandle: number | null = null;
  function frame() {
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
    if (Date.now() < end) rafHandle = requestAnimationFrame(frame);
  }
  rafHandle = requestAnimationFrame(frame);
  return () => {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
  };
}

export default function OnboardingClient() {
  const router = useRouter();
  const createAbortRef = useRef<AbortController | null>(null);
  const confettiCancelRef = useRef<(() => void) | null>(null);

  // Cancel any in-flight create + ongoing confetti loop on unmount so
  // navigating away mid-create doesn't leave background work running.
  useEffect(() => {
    return () => {
      createAbortRef.current?.abort();
      confettiCancelRef.current?.();
    };
  }, []);

  const [step, setStep] = useState<Step>("configure");

  const [owners, setOwners] = useState<AvailableOwner[] | null>(null);
  const [formState, setFormState] = useState<OnboardingFormState>({
    selectedOwner: null,
    name: DEFAULT_REPO_NAME,
    visibility: "private",
    layout: "flat",
    teams: [],
  });
  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");

  const [createdRepo, setCreatedRepo] = useState<CreatedRepo | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const { selectedOwner, name, visibility, layout, teams } = formState;

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
        if (personal) {
          setFormState((prev) => ({ ...prev, selectedOwner: personal }));
        }
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
        if (controller.signal.aborted) return;
        const data = (await res.json()) as {
          available?: boolean;
          reason?: string;
        };
        if (controller.signal.aborted) return;
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

  async function handleCreate() {
    if (!selectedOwner) return;
    setStep("creating");
    setCreateError(null);
    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;
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
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
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
      if (controller.signal.aborted) return;
      setCreatedRepo({
        owner: data.owner,
        name: data.name,
        htmlUrl: data.htmlUrl,
      });
      posthog.capture("onboarding_completed", {
        layout,
        visibility,
        owner: selectedOwner?.login,
      });
      setStep("success");
      confettiCancelRef.current = fireConfetti();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
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
          <ConfigureStep
            key="configure"
            owners={owners}
            formState={formState}
            setFormState={setFormState}
            nameStatus={nameStatus}
            onCreate={handleCreate}
          />
        )}

        {step === "creating" && selectedOwner && (
          <CreatingStep
            key={createError ? "creating-error" : "creating"}
            ownerLogin={selectedOwner.login}
            name={name.trim()}
            layout={layout}
            teamsCount={teams.length}
            error={createError}
            onBack={() => setStep("configure")}
          />
        )}

        {step === "success" && createdRepo && (
          <SuccessStep
            key="success"
            createdRepo={createdRepo}
            visibility={visibility}
            layout={layout}
            teamsCount={teams.length}
            onStartFirstRfc={handleStartFirstRfc}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
