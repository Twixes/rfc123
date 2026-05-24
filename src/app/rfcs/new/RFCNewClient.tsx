"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Checkbox from "@/components/Checkbox";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import RepoSelector from "@/components/RepoSelector";
import ReviewerPicker, { type Reviewer } from "@/components/ReviewerPicker";
import RFCsTopBar from "@/components/RFCsTopBar";
import type { RepoOption } from "@/lib/github";
import {
  defaultRfcConfig,
  type RfcConfig,
  rfcFilePath,
  todayYmd,
} from "@/lib/rfc-config";

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
  reviewers: Reviewer[];
  draft: boolean;
  /** owner/name of the repo the author picked. */
  selectedRepoFullName?: string;
  /** Per-repo team selection for `layout: multi-directory` repos. */
  team?: string;
}

export default function RFCNewClient({ session }: RFCNewClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetOwner = searchParams.get("owner");
  const presetRepo = searchParams.get("repo");

  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(DEFAULT_RFC_TEMPLATE);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [isDraft, setIsDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftLoadedRef = useRef(false);

  // Per-repo `.rfc123.json`; null while loading. Falls back to a synthetic
  // single-layout config for repos without one (matches the server's
  // loadRfcConfig fallback so the preview matches what we'll actually commit).
  const [repoConfig, setRepoConfig] = useState<RepoConfigResponse | null>(null);
  const [team, setTeam] = useState<string>("");

  const userLogin = session?.user?.name ?? undefined;

  // Load any in-progress draft from localStorage on mount. Runs once, before
  // repos finish loading – so even typing made before picking a repo is kept.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PersistedDraft;
        if (parsed.title) setTitle(parsed.title);
        if (parsed.body) setBody(parsed.body);
        if (parsed.reviewers) setReviewers(parsed.reviewers);
        if (typeof parsed.draft === "boolean") setIsDraft(parsed.draft);
        if (typeof parsed.team === "string") setTeam(parsed.team);
      }
    } catch {}
    draftLoadedRef.current = true;
  }, []);

  // Pick the initial selected repo from URL params or the saved draft. We
  // synthesize a `RepoOption` from those identifiers rather than waiting for
  // a repo list to confirm – the config + create endpoints will surface any
  // real access issue when the user submits.
  useEffect(() => {
    if (selectedRepo) return;
    if (presetOwner && presetRepo) {
      setSelectedRepo({
        owner: presetOwner,
        name: presetRepo,
        fullName: `${presetOwner}/${presetRepo}`,
        canPush: true,
      });
      return;
    }
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as PersistedDraft;
      if (!parsed.selectedRepoFullName) return;
      const [owner, name] = parsed.selectedRepoFullName.split("/");
      if (owner && name) {
        setSelectedRepo({
          owner,
          name,
          fullName: parsed.selectedRepoFullName,
          canPush: true,
        });
      }
    } catch {}
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

  // Persist the in-progress draft on every change. No repo gating – drafting
  // before picking a repo is the most common entry path.
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const handle = setTimeout(() => {
      const draftPayload: PersistedDraft = {
        title,
        body,
        reviewers,
        draft: isDraft,
        selectedRepoFullName: selectedRepo?.fullName,
        team,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
    }, 200);
    return () => clearTimeout(handle);
  }, [selectedRepo, title, body, reviewers, isDraft, team]);

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
    !submitting;

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedRepo) return;
    setSubmitting(true);
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
          reviewers: reviewers.map((r) => r.login),
          draft: isDraft,
          team:
            repoConfig?.layout === "multi-directory" ? trimmedTeam : undefined,
        }),
      });

      if (!createRes.ok) {
        const errBody = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? "Failed to create RFC");
        setSubmitting(false);
        return;
      }

      const created = (await createRes.json()) as {
        number: number;
        owner: string;
        repo: string;
        slug: string;
      };

      // Clear draft on success.
      localStorage.removeItem(DRAFT_STORAGE_KEY);

      router.push(
        `/rfcs/${created.owner}/${created.repo}/${created.number}/${created.slug}`,
      );
    } catch (e) {
      console.error(e);
      setError((e as Error).message || "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-240 px-4 sm:px-8 py-6 sm:py-12">
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
          </div>

          {/* Team (only for `layout: multi-directory` repos) */}
          {selectedRepo && repoConfig?.layout === "multi-directory" && (
            <div>
              <label
                htmlFor="rfc-team"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Team
              </label>
              <input
                id="rfc-team"
                type="text"
                list="rfc-team-options"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="e.g. engineering"
                className="w-full border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
              />
              <datalist id="rfc-team-options">
                {repoConfig.teams.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <p className="mt-1.5 text-xs text-gray-50">
                Pick an existing team or type a new one to create a new
                directory.
              </p>
            </div>
          )}

          {/* Title + Body – one unified card. Title is a large serif heading
              input; tabs in the right of the title row swap the lower half
              between the raw textarea and a rendered preview. */}
          <div>
            <div className="border border-gray-20 rounded-md bg-surface overflow-hidden focus-within:border-gray-30 transition-colors">
              <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 sm:pt-6 pb-3 border-b border-gray-20">
                <input
                  id="rfc-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  aria-label="Title"
                  // biome-ignore lint/a11y/noAutofocus: the page exists only to author an RFC; landing on the title is the expected first action
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent font-serif text-3xl sm:text-4xl leading-tight tracking-tight text-foreground placeholder-gray-40 focus:outline-none"
                />
                <div className="flex border border-gray-20 rounded-sm overflow-hidden text-xs shrink-0 mt-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("write")}
                    className={`px-3 py-1 cursor-pointer transition-colors ${
                      activeTab === "write"
                        ? "bg-foreground text-surface"
                        : "bg-surface text-gray-70 hover:bg-gray-5"
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={`px-3 py-1 cursor-pointer transition-colors border-l border-gray-20 ${
                      activeTab === "preview"
                        ? "bg-foreground text-surface"
                        : "bg-surface text-gray-70 hover:bg-gray-5"
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
              {activeTab === "write" ? (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={24}
                  spellCheck
                  placeholder="Write your RFC in Markdown…"
                  className="block w-full bg-transparent px-5 sm:px-6 py-4 text-sm text-foreground placeholder-gray-50 focus:outline-none font-mono resize-y"
                />
              ) : (
                <div className="px-5 sm:px-6 py-4 min-h-[24rem]">
                  {body.trim() ? (
                    <MarkdownRenderer content={body} />
                  ) : (
                    <p className="text-sm text-gray-50">
                      Nothing to preview yet.
                    </p>
                  )}
                </div>
              )}
            </div>
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

          {/* Reviewers */}
          <div>
            <span className="block text-sm font-medium text-foreground mb-1.5">
              Reviewers
            </span>
            <ReviewerPicker
              reviewers={reviewers}
              onChange={setReviewers}
              authorLogin={userLogin}
            />
            <p className="mt-1.5 text-xs text-gray-50">
              Search GitHub usernames. Reviewers will be requested on the PR.
            </p>
          </div>

          {/* Draft toggle */}
          <Checkbox
            checked={isDraft}
            onChange={setIsDraft}
            label="Open as draft"
            description="Won't notify reviewers till marked ready for review."
          />

          {error && (
            <div className="border border-magenta bg-magenta-light text-foreground rounded-sm px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center pt-4 border-t border-gray-20">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
            >
              {submitting
                ? "Opening PR…"
                : isDraft
                  ? "Open RFC as draft"
                  : "Open RFC for review"}
            </button>
            <Link
              href="/rfcs"
              className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 self-start sm:self-auto"
            >
              Cancel
            </Link>
            <span className="text-xs text-gray-50 sm:ml-auto">
              Saved locally as you type.
            </span>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
