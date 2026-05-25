"use client";

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReviewerItem } from "@/components/EditableReviewers";
import { RelativeTime } from "@/components/RelativeTime";
import RepoSelector from "@/components/RepoSelector";
import ReviewerPicker from "@/components/ReviewerPicker";
import { RFCBodyEditor } from "@/components/RFCBodyEditor";
import RFCsTopBar from "@/components/RFCsTopBar";
import Tooltip from "@/components/Tooltip";
import type { RepoOption } from "@/lib/github";
import {
  defaultRfcConfig,
  RFC_CONFIG_PATH,
  type RfcConfig,
  rfcFilePath,
  todayYmd,
} from "@/lib/rfc-config";
import { useRfcDraft } from "@/lib/use-rfc-draft";

/** Shape returned by `/api/repos/[owner]/[repo]/config` – the loaded config
 *  plus the team-directory list, which `.rfc123.json` doesn't store. */
type RepoConfigResponse = RfcConfig & { teams: string[] };

import { DEFAULT_RFC_TEMPLATE } from "@/lib/rfc-template";
import { slugify } from "@/lib/slugify";

interface RFCNewClientProps {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
}

const DRAFT_STORAGE_KEY = "rfc123:draft";

interface PersistedDraft {
  title: string;
  body: string;
  reviewers: ReviewerItem[];
  /** owner/name of the repo the author picked. */
  selectedRepoFullName?: string;
  /** Per-repo team selection for `layout: multi-directory` repos. */
  team?: string;
  /** ISO timestamp of the last save. Used to render the restore banner. */
  lastEditedAt?: string;
}

/** True when the persisted draft has anything worth restoring. Skips the banner
 *  for the no-op state (empty title, untouched template body, no reviewers). */
function hasRestorableContent(d: PersistedDraft): boolean {
  return (
    d.title.trim().length > 0 ||
    (d.body.trim().length > 0 && d.body !== DEFAULT_RFC_TEMPLATE) ||
    d.reviewers.length > 0
  );
}

export default function RFCNewClient({ session }: RFCNewClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetOwner = searchParams.get("owner");
  const presetRepo = searchParams.get("repo");

  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(DEFAULT_RFC_TEMPLATE);
  const [reviewers, setReviewers] = useState<ReviewerItem[]>([]);
  const [submittingMode, setSubmittingMode] = useState<
    "review" | "draft" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Per-repo `.rfc123.json`; null while loading. Falls back to a synthetic
  // single-layout config for repos without one (matches the server's
  // loadRfcConfig fallback so the preview matches what we'll actually commit).
  const [repoConfig, setRepoConfig] = useState<RepoConfigResponse | null>(null);
  const [team, setTeam] = useState<string>("");

  const userLogin = session?.user?.name ?? undefined;

  const draftSnapshot: PersistedDraft = useMemo(
    () => ({
      title,
      body,
      reviewers,
      selectedRepoFullName: selectedRepo?.fullName,
      team,
      lastEditedAt: new Date().toISOString(),
    }),
    [title, body, reviewers, selectedRepo?.fullName, team],
  );

  const { pendingDraft, acceptDraft, discardDraft, clearDraft } =
    useRfcDraft<PersistedDraft>({
      storageKey: DRAFT_STORAGE_KEY,
      hasRestorableContent,
      current: draftSnapshot,
    });

  // Pick the initial selected repo from URL params only. The saved-draft repo
  // is restored alongside the rest of the draft from the banner – auto-picking
  // it here would partially restore the draft before the user opted in.
  useEffect(() => {
    if (selectedRepo) return;
    if (presetOwner && presetRepo) {
      setSelectedRepo({
        owner: presetOwner,
        name: presetRepo,
        fullName: `${presetOwner}/${presetRepo}`,
        canPush: true,
      });
    }
  }, [presetOwner, presetRepo, selectedRepo]);

  // Mirror the picked repo into the URL so the page is shareable/bookmarkable.
  // Uses history.replaceState directly to avoid a Next.js re-render.
  useEffect(() => {
    if (!selectedRepo) return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("owner") === selectedRepo.owner &&
      params.get("repo") === selectedRepo.name
    ) {
      return;
    }
    params.set("owner", selectedRepo.owner);
    params.set("repo", selectedRepo.name);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [selectedRepo]);

  // Load the picked repo's `.rfc123.json` so we know layout/team list and can
  // render an accurate path preview. Falls back to the default config when the
  // endpoint errors – matches the server's legacy-repo fallback.
  useEffect(() => {
    if (!selectedRepo) {
      setRepoConfig(null);
      return;
    }
    const controller = new AbortController();
    setRepoConfig(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/repos/${encodeURIComponent(selectedRepo.owner)}/${encodeURIComponent(selectedRepo.name)}/config`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error("config fetch failed");
        const data: RepoConfigResponse = await res.json();
        if (controller.signal.aborted) return;
        setRepoConfig(data);
        if (data.layout === "multi-directory" && data.teams.length > 0) {
          setTeam((prev) => prev || data.teams[0]);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        if ((e as Error).name === "AbortError") return;
        setRepoConfig({ ...defaultRfcConfig(), teams: [] });
      }
    })();
    return () => controller.abort();
  }, [selectedRepo]);

  const slug = useMemo(() => slugify(title), [title]);
  const trimmedTeam = team.trim();
  const teamRequired = repoConfig?.layout === "multi-directory";
  const teamValid = !teamRequired || trimmedTeam.length > 0;
  const canSubmit =
    !!selectedRepo &&
    selectedRepo.canPush &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    slug.length > 0 &&
    teamValid &&
    submittingMode === null;

  // Live preview of where this RFC will land. Mirrors server-side `rfcFilePath`.
  // Date is recomputed inside the memo so we don't carry a stale closure value
  // if the wizard sits open across midnight.
  const previewPath = useMemo(() => {
    if (!selectedRepo || !slug) return null;
    const cfg = repoConfig ?? defaultRfcConfig();
    return rfcFilePath(cfg, {
      team: cfg.layout === "multi-directory" ? trimmedTeam || null : null,
      slug,
      date: todayYmd(),
    });
  }, [selectedRepo, slug, repoConfig, trimmedTeam]);

  function restoreDraft() {
    if (!pendingDraft) return;
    setTitle(pendingDraft.title ?? "");
    if (pendingDraft.body) setBody(pendingDraft.body);
    setReviewers(pendingDraft.reviewers ?? []);
    if (typeof pendingDraft.team === "string") setTeam(pendingDraft.team);
    if (!selectedRepo && pendingDraft.selectedRepoFullName) {
      const [owner, name] = pendingDraft.selectedRepoFullName.split("/");
      if (owner && name) {
        setSelectedRepo({
          owner,
          name,
          fullName: pendingDraft.selectedRepoFullName,
          canPush: true,
        });
      }
    }
    acceptDraft();
  }

  async function submit(draft: boolean) {
    if (!canSubmit || !selectedRepo) return;
    setSubmittingMode(draft ? "draft" : "review");
    setError(null);
    try {
      // Step 1: generate the PR body summary (does not need the final URL yet –
      // we splice it in client-side from the response, but we send a placeholder
      // here. Server returns body with placeholder if no URL passed.).
      const summaryRes = await fetch("/api/rfc-body-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), rfcBody: body }),
      });
      const summaryJson = (await summaryRes.json()) as {
        body?: string;
        error?: string;
      };
      const prBody = summaryJson.body ?? "";

      // Step 2: create the RFC (branch + file + PR + reviewers).
      const createRes = await fetch("/api/rfcs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.name,
          title: title.trim(),
          rfcBody: body,
          prBody,
          users: reviewers
            .filter((r) => r.kind === "user")
            .map((r) => r.handle),
          teams: reviewers
            .filter((r) => r.kind === "team")
            .map((r) => r.handle),
          draft,
          team:
            repoConfig?.layout === "multi-directory" ? trimmedTeam : undefined,
        }),
      });

      if (!createRes.ok) {
        const errBody = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? "Failed to create RFC");
        setSubmittingMode(null);
        return;
      }

      const created = (await createRes.json()) as {
        number: number;
        owner: string;
        repo: string;
        slug: string;
      };

      // Clear draft on success.
      clearDraft();

      router.push(
        `/rfcs/${created.owner}/${created.repo}/${created.number}/${created.slug}`,
      );
    } catch (e) {
      console.error(e);
      setError((e as Error).message || "Something went wrong");
      setSubmittingMode(null);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-216 px-4 sm:px-8 py-6 sm:py-12">
      <RFCsTopBar user={session?.user ?? null} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h2 className="text-3xl sm:text-4xl font-serif font-normal text-foreground mb-2">
          New RFC
        </h2>
        <p className="text-sm text-gray-70 mb-8">
          Drop your idea into Markdown. We'll open a PR, request reviewers, and
          write a summary for the PR description.
        </p>

        {pendingDraft && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-yellow bg-yellow-light px-4 py-3">
            <div className="flex-1 text-sm text-foreground">
              <span className="font-medium">
                You have an unsaved draft from{" "}
                {pendingDraft.lastEditedAt ? (
                  <RelativeTime date={pendingDraft.lastEditedAt} />
                ) : (
                  "recently"
                )}
                .
              </span>{" "}
              Want to restore it?
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={restoreDraft}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-80 cursor-pointer"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="space-y-4"
        >
          {/* Repository */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground">
                Repository
              </span>
              <Link
                href="/onboarding"
                className="text-xs text-gray-50 hover:text-foreground underline decoration-cyan underline-offset-2 transition-colors"
              >
                Set up a new dedicated RFCs repo →
              </Link>
            </div>
            <RepoSelector
              fullWidth
              currentRepo={selectedRepo}
              onSelect={setSelectedRepo}
              onRepoAdopted={setSelectedRepo}
            />
            {selectedRepo && repoConfig?.layout === "multi-directory" && (
              <p className="mt-1.5 text-xs text-gray-50">
                This is a multi-directory repo per its{" "}
                <a
                  href={`https://github.com/${selectedRepo.owner}/${selectedRepo.name}/blob/HEAD/${RFC_CONFIG_PATH}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] underline decoration-gray-20 underline-offset-2 transition-colors hover:text-foreground"
                >
                  {RFC_CONFIG_PATH}
                </a>
                . Pick a directory below.
              </p>
            )}
          </div>

          {/* Directory (only for `layout: multi-directory` repos) */}
          {selectedRepo && repoConfig?.layout === "multi-directory" && (
            <div>
              <span className="block text-sm font-medium text-foreground mb-1.5">
                Directory
              </span>
              <DirectoryPicker
                value={team}
                onChange={setTeam}
                options={repoConfig.teams}
              />
            </div>
          )}

          {/* Title + Body – one unified card. Title is a large serif heading
              input rendered into the editor's header row; tabs to its right
              swap the lower half between the raw textarea and a preview. */}
          <div>
            <RFCBodyEditor
              body={body}
              onBodyChange={setBody}
              headerSlot={
                <input
                  id="rfc-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  aria-label="Title"
                  // biome-ignore lint/a11y/noAutofocus: the page exists only to author an RFC; landing on the title is the expected first action
                  autoFocus
                  className="w-full bg-transparent font-serif text-3xl sm:text-4xl leading-tight tracking-tight text-foreground placeholder-gray-40 focus:outline-none"
                />
              }
            />
            {previewPath && (
              <p className="mt-2 text-xs text-gray-50">
                <code className="bg-gray-5 border border-gray-20 rounded-sm px-1 font-mono text-[11px]">
                  {previewPath}
                </code>
                {userLogin && (
                  <>
                    {" on branch "}
                    <code className="bg-gray-5 border border-gray-20 rounded-sm px-1 font-mono text-[11px]">
                      rfc/{slugify(userLogin)}/{slug}
                    </code>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Reviewers – needs a repo so the picker can scope its search to
              the right org. */}
          {selectedRepo && (
            <div>
              <span className="block text-sm font-medium text-foreground mb-1.5">
                Reviewers
              </span>
              <ReviewerPicker
                reviewers={reviewers}
                onChange={setReviewers}
                org={selectedRepo.owner}
                authorLogin={userLogin}
              />
              <p className="mt-1.5 text-xs text-gray-50">
                These folks will see this RFC in their inbox when you mark it
                ready for review.
              </p>
            </div>
          )}

          {error && (
            <div className="border border-magenta bg-magenta-light text-foreground rounded-sm px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center pt-4 border-t border-gray-20">
            <Tooltip content="Opens a PR as ready to review. Reviewers will be notified right away.">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
              >
                {submittingMode === "review"
                  ? "Opening PR…"
                  : "Open RFC for review"}
              </button>
            </Tooltip>
            <Tooltip content="Opens a draft PR. Reviewers won't be notified until you mark this ready for review.">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => submit(true)}
                className="rounded-md border border-gray-20 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
              >
                {submittingMode === "draft" ? "Saving…" : "Save as draft"}
              </button>
            </Tooltip>
            <span className="text-xs text-gray-50 sm:ml-auto">
              Saved locally as you type.
            </span>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function DirectoryPicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const lowered = trimmedQuery.toLowerCase();
  const filtered = trimmedQuery
    ? options.filter((o) => o.toLowerCase().includes(lowered))
    : options;
  const exactMatch = options.some((o) => o.toLowerCase() === lowered);
  const showCreateOption = trimmedQuery.length > 0 && !exactMatch;

  return (
    <Combobox
      value={value}
      onChange={(v: string | null) => {
        onChange(v ?? "");
        setQuery("");
      }}
      immediate
    >
      <div className="relative">
        <ComboboxInput
          aria-label="Directory"
          displayValue={(v: string) => v}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="e.g. engineering"
          className="w-full border border-gray-30 rounded-sm bg-surface pl-3 pr-9 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
        />
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-50 hover:text-foreground cursor-pointer">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <title>Toggle directory list</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </ComboboxButton>
      </div>
      <ComboboxOptions
        anchor={{ to: "bottom start", gap: 4 }}
        className="w-[var(--input-width)] flex flex-col border border-gray-20 rounded-md bg-surface shadow-sm z-50 focus:outline-none overflow-clip"
      >
        <div className="flex-1 min-h-0 overflow-auto overscroll-contain py-1">
          {filtered.map((opt) => (
            <ComboboxOption
              key={opt}
              value={opt}
              className="px-3 py-1.5 text-sm cursor-pointer text-foreground data-[focus]:bg-yellow-light data-[selected]:font-medium"
            >
              {opt}
            </ComboboxOption>
          ))}
          {showCreateOption && (
            <ComboboxOption
              value={trimmedQuery}
              className="px-3 py-2 text-sm cursor-pointer text-foreground border-t border-gray-20 bg-gray-5 data-[focus]:bg-yellow-light flex items-center gap-1.5"
            >
              <span aria-hidden className="text-base leading-none text-gray-50">
                +
              </span>
              <span>
                Add new directory{" "}
                <span className="font-mono text-xs">{trimmedQuery}</span> -
                it'll be created when you open the RFC
              </span>
            </ComboboxOption>
          )}
        </div>
        {!showCreateOption && (
          <div className="px-3 py-2 text-xs text-gray-50 border-t border-gray-20 bg-gray-5">
            {filtered.length === 0
              ? "No directories yet. Type a name above to add one."
              : "Type a new name above to add a directory."}
          </div>
        )}
      </ComboboxOptions>
    </Combobox>
  );
}
